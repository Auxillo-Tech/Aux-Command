'use strict';

const { ConnectionTimeline } = require('../lib/connection-timeline.cjs');
const { TerminalDirectoryTracker } = require('../lib/terminal-directory.cjs');
const { diagnoseConnection } = require('../lib/connection-diagnostics.cjs');

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PythonPty } = require('../lib/python-pty.cjs');
const { buildTerminalCommand } = require('../lib/command-builder.cjs');
const { normalizeTerminalRequest } = require('../lib/validation.cjs');
const { createAskpassSession, hasStoredCredential, supportsSavedCredentialAnswers } = require('../lib/ssh-askpass.cjs');
const { findExecutable } = require('../lib/executable-finder.cjs');

const MAX_TRANSCRIPT_BYTES = 1_048_576;
const TRANSCRIPT_TRIM_SLACK = 262_144;
const MAX_RECORDING_CHUNKS = 5000;
const MAX_RECORDING_BYTES = 2_000_000;

// Timing-aware output recording for replay. Bounded from the front so a
// long-lived session keeps its most recent activity.
function appendRecordingChunk(recording, data, offsetMs) {
  const text = typeof data === 'string' ? data : String(data || '');
  if (!text) return recording;
  recording.chunks.push({ t: Math.max(0, Math.round(offsetMs)), data: text });
  recording.bytes += Buffer.byteLength(text, 'utf8');
  while (recording.chunks.length > MAX_RECORDING_CHUNKS || recording.bytes > MAX_RECORDING_BYTES) {
    const dropped = recording.chunks.shift();
    if (!dropped) break;
    recording.bytes -= Buffer.byteLength(dropped.data, 'utf8');
    recording.truncated = true;
  }
  return recording;
}

// The transcript keeps the most recent MAX_TRANSCRIPT_BYTES of output. Its
// size is tracked incrementally and it is trimmed only after it has grown
// TRANSCRIPT_TRIM_SLACK past the limit, so busy sessions do not re-encode the
// whole megabyte for every chunk of output.
function trimTranscript(session) {
  const bytes = Buffer.from(session.transcript, 'utf8');
  if (bytes.length > MAX_TRANSCRIPT_BYTES) {
    let offset = bytes.length - MAX_TRANSCRIPT_BYTES;
    while ((bytes[offset] & 0xc0) === 0x80) offset += 1;
    session.transcript = bytes.subarray(offset).toString('utf8');
    session.transcriptBytes = bytes.length - offset;
    session.transcriptTruncated = true;
  } else {
    session.transcriptBytes = bytes.length;
  }
}

// Readers get the bounded transcript; any slack is trimmed on demand.
function transcriptText(session) {
  if (Number.isFinite(session.transcriptBytes) && session.transcriptBytes > MAX_TRANSCRIPT_BYTES) trimTranscript(session);
  return session.transcript || '';
}

function appendTranscript(session, data) {
  const text = typeof data === 'string' ? data : String(data || '');
  if (!text) return;
  if (!Number.isFinite(session.transcriptBytes)) session.transcriptBytes = Buffer.byteLength(session.transcript || '', 'utf8');
  session.transcript = `${session.transcript || ''}${text}`;
  session.transcriptBytes += Buffer.byteLength(text, 'utf8');
  if (session.transcriptBytes > MAX_TRANSCRIPT_BYTES + TRANSCRIPT_TRIM_SLACK) trimTranscript(session);
  if (session.logging?.stream && !session.logging.stream.destroyed) {
    // Bound queued log data if the destination disk cannot keep up.
    if (session.logging.stream.writableLength > 4 * MAX_TRANSCRIPT_BYTES) {
      session.logging.stream.destroy(new Error('Logging stopped because the destination is too slow'));
    } else session.logging.stream.write(text);
  }
}

function safeLogPath(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Terminal log path must be absolute');
  return filePath;
}

const MAX_RETAINED_TRANSCRIPTS = 20;
// Mosh signs in through an ordinary ssh process before it switches to UDP.
const ASKPASS_PROTOCOLS = new Set(['ssh', 'mosh']);

class TerminalService {
  constructor(getWindow, options = {}) {
    this.getWindow = getWindow;
    this.vaultService = options.vaultService || null;
    this.sessions = new Map();
    this.closedTranscripts = new Map();
  }

  #retainTranscript(id, record) {
    this.closedTranscripts.set(id, record);
    // Transcripts exist so an exited session can still be exported while its
    // tab is open; retention is bounded so they cannot accumulate for the
    // whole app lifetime.
    while (this.closedTranscripts.size > MAX_RETAINED_TRANSCRIPTS) {
      const oldest = this.closedTranscripts.keys().next().value;
      this.closedTranscripts.delete(oldest);
    }
  }

  create(input) {
    const request = normalizeTerminalRequest(input);
    const spec = buildTerminalCommand(request.profile, { remoteCwd: request.remoteCwd });
    const id = randomUUID();
    // Only a profile with a saved credential gets the askpass variables: its
    // password or passphrase prompt is then answered from the vault, and
    // every other prompt is handed back to this terminal. Without a saved
    // credential, or with an OpenSSH too old for the saved credential to be
    // released safely, the session starts exactly as it always has.
    const askpass = ASKPASS_PROTOCOLS.has(request.profile.protocol) && hasStoredCredential(request.profile, this.vaultService)
      && supportsSavedCredentialAnswers(findExecutable(['ssh'], spec.env.PATH || ''))
      ? createAskpassSession({ profile: request.profile, vaultService: this.vaultService, mode: 'terminal' })
      : null;
    let terminal;
    try {
      terminal = new PythonPty({
        command: spec.command,
        args: spec.args,
        cols: request.cols,
        rows: request.rows,
        cwd: request.cwd || os.homedir(),
        env: askpass ? { ...spec.env, ...askpass.env } : spec.env
      });
    } catch (error) {
      askpass?.close();
      throw error;
    }

    askpass?.trackProcess(terminal.child?.pid);
    const session = {
      id,
      profileId: request.profile.id,
      title: spec.title,
      protocol: request.profile.protocol,
      cwd: request.profile.protocol === 'local' ? request.cwd : request.remoteCwd,
      terminal,
      askpass,
      startedAt: new Date().toISOString(),
      cwdTracker: new TerminalDirectoryTracker(),
      outputSequence: 0,
      timeline: new ConnectionTimeline(request.profile.protocol),
      transcript: '',
      transcriptTruncated: false,
      logging: null,
      recording: { startedAtMs: Date.now(), chunks: [], bytes: 0, truncated: false }
    };
    this.sessions.set(id, session);

    terminal.onData((data) => {
      session.timeline.feed(data);
      const cwd = session.cwdTracker.feed(data);
      if(cwd)session.timeline.directory();
      if (cwd && session.cwd !== cwd) { session.cwd = cwd; this.#send('terminal:directory', { id, cwd }); }
      appendTranscript(session, data);
      appendRecordingChunk(session.recording, data, Date.now() - session.recording.startedAtMs);
      this.#send('terminal:data', { id, data, sequence: ++session.outputSequence });
    });
    terminal.onExit(({ exitCode, signal }) => {
      askpass?.close();
      session.timeline.exit(exitCode);
      // A user-initiated close already discarded this session; re-adding the
      // transcript here would leak it until app quit.
      if (!session.userClosed) {
        this.#retainTranscript(id, {
          id: session.id,
          title: session.title,
          protocol: session.protocol,
          profileId: session.profileId,
          startedAt: session.startedAt,
          transcript: transcriptText(session),
          timeline: session.timeline,
          transcriptTruncated: session.transcriptTruncated,
          logging: session.logging ? { filePath: session.logging.filePath, active: false } : null,
          recording: session.recording
        });
      }
      this.#closeLogStream(session);
      this.sessions.delete(id);
      this.#send('terminal:exit', { id, exitCode, signal, diagnosis: exitCode !== 0 && !session.userClosed ? diagnoseConnection(session.protocol, transcriptText(session)) : null });
    });

    return { id, title: session.title, protocol: session.protocol, profileId: session.profileId };
  }

  write(id, data) {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (typeof data !== 'string' || data.length > 1_048_576) throw new Error('Invalid terminal input');
    session.terminal.write(data);
    return true;
  }

  resize(id, cols, rows) {
    const session = this.sessions.get(id);
    if (!session) return false;
    const safeCols = Math.min(500, Math.max(20, Number(cols) || 80));
    const safeRows = Math.min(300, Math.max(5, Number(rows) || 24));
    session.terminal.resize(safeCols, safeRows);
    return true;
  }

  connectionTimeline(id) {
    const session=this.sessions.get(id)||this.closedTranscripts.get(id);
    if(!session)throw new Error('Terminal session not found');
    return structuredClone(session.timeline?.events || []);
  }

  exportTranscript(id) {
    const session = this.sessions.get(id) || this.closedTranscripts.get(id);
    if (!session) throw new Error('Terminal session not found');
    const text = transcriptText(session);
    return {
      id: session.id,
      title: session.title,
      protocol: session.protocol,
      profileId: session.profileId,
      startedAt: session.startedAt,
      exportedAt: new Date().toISOString(),
      truncated: Boolean(session.transcriptTruncated),
      sequence: session.outputSequence || 0,
      text
    };
  }

  exportRecording(id) {
    const session = this.sessions.get(id) || this.closedTranscripts.get(id);
    if (!session) throw new Error('Terminal session not found');
    const recording = session.recording || { chunks: [], truncated: false };
    return {
      id: session.id,
      title: session.title,
      protocol: session.protocol,
      startedAt: session.startedAt,
      truncated: Boolean(recording.truncated),
      chunks: recording.chunks
    };
  }

  startLogging(id, filePath) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Terminal session not found');
    const target = safeLogPath(filePath);
    if (session.logging?.stream) this.#closeLogStream(session);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, transcriptText(session), { mode: 0o600 });
    const stream = fs.createWriteStream(target, { flags: 'a', mode: 0o600 });
    session.logging = { filePath: target, stream };
    stream.on('error', (error) => {
      if (session.logging?.stream === stream) session.logging = { filePath: target, active: false };
      this.#send('terminal:log-error', { id, filePath: target, message: error.message });
    });
    return { id, filePath: target, active: true };
  }

  stopLogging(id) {
    const session = this.sessions.get(id);
    if (!session) {
      const closed = this.closedTranscripts.get(id);
      if (!closed?.logging) return { id, active: false };
      const filePath = closed.logging.filePath;
      closed.logging = { filePath, active: false };
      return { id, filePath, active: false };
    }
    const filePath = session.logging?.filePath;
    this.#closeLogStream(session);
    return { id, filePath, active: false };
  }

  close(id) {
    const session = this.sessions.get(id);
    if (!session) {
      return this.closedTranscripts.delete(id);
    }
    session.userClosed = true;
    this.sessions.delete(id);
    this.closedTranscripts.delete(id);
    this.#closeLogStream(session);
    session.askpass?.close();
    try { session.terminal.kill(); } catch { /* process already exited */ }
    return true;
  }

  closeAll() {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }

  list() {
    return [...this.sessions.values()].map(({ terminal, askpass, transcript, logging, recording, cwdTracker, timeline, ...metadata }) => ({
      ...metadata,
      cwd: metadata.protocol === 'local' ? (terminal.currentDirectory?.() || metadata.cwd) : metadata.cwd,
      logging: logging ? { filePath: logging.filePath, active: Boolean(logging.stream && !logging.stream.destroyed) } : null
    }));
  }

  #closeLogStream(session) {
    if (!session?.logging?.stream) return;
    const filePath = session.logging.filePath;
    try { session.logging.stream.end(); } catch { /* best-effort log close */ }
    session.logging = { filePath, active: false };
  }

  #send(channel, payload) {
    this.onEvent?.(channel, payload);
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

module.exports = { TerminalService, appendRecordingChunk, appendTranscript, transcriptText };
