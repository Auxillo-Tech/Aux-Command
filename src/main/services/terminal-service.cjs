'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PythonPty } = require('../lib/python-pty.cjs');
const { buildTerminalCommand } = require('../lib/command-builder.cjs');
const { normalizeTerminalRequest } = require('../lib/validation.cjs');

const MAX_TRANSCRIPT_BYTES = 1_048_576;

function appendTranscript(session, data) {
  const text = typeof data === 'string' ? data : String(data || '');
  if (!text) return;
  session.transcript = `${session.transcript}${text}`;
  if (Buffer.byteLength(session.transcript, 'utf8') > MAX_TRANSCRIPT_BYTES) {
    session.transcript = session.transcript.slice(-MAX_TRANSCRIPT_BYTES);
    session.transcriptTruncated = true;
  }
  if (session.logging?.stream) session.logging.stream.write(text);
}

function safeLogPath(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Terminal log path must be absolute');
  return filePath;
}

class TerminalService {
  constructor(getWindow) {
    this.getWindow = getWindow;
    this.sessions = new Map();
    this.closedTranscripts = new Map();
  }

  create(input) {
    const request = normalizeTerminalRequest(input);
    const spec = buildTerminalCommand(request.profile);
    const id = randomUUID();
    const terminal = new PythonPty({
      command: spec.command,
      args: spec.args,
      cols: request.cols,
      rows: request.rows,
      cwd: request.cwd || os.homedir(),
      env: spec.env
    });

    const session = {
      id,
      profileId: request.profile.id,
      title: spec.title,
      protocol: request.profile.protocol,
      terminal,
      startedAt: new Date().toISOString(),
      transcript: '',
      transcriptTruncated: false,
      logging: null
    };
    this.sessions.set(id, session);

    terminal.onData((data) => {
      appendTranscript(session, data);
      this.#send('terminal:data', { id, data });
    });
    terminal.onExit(({ exitCode, signal }) => {
      this.closedTranscripts.set(id, {
        id: session.id,
        title: session.title,
        protocol: session.protocol,
        profileId: session.profileId,
        startedAt: session.startedAt,
        transcript: session.transcript,
        transcriptTruncated: session.transcriptTruncated,
        logging: session.logging ? { filePath: session.logging.filePath, active: false } : null
      });
      this.#closeLogStream(session);
      this.sessions.delete(id);
      this.#send('terminal:exit', { id, exitCode, signal });
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

  exportTranscript(id) {
    const session = this.sessions.get(id) || this.closedTranscripts.get(id);
    if (!session) throw new Error('Terminal session not found');
    return {
      id: session.id,
      title: session.title,
      protocol: session.protocol,
      profileId: session.profileId,
      startedAt: session.startedAt,
      exportedAt: new Date().toISOString(),
      truncated: Boolean(session.transcriptTruncated),
      text: session.transcript
    };
  }

  startLogging(id, filePath) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Terminal session not found');
    const target = safeLogPath(filePath);
    if (session.logging?.stream) this.#closeLogStream(session);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, session.transcript || '', { mode: 0o600 });
    const stream = fs.createWriteStream(target, { flags: 'a', mode: 0o600 });
    session.logging = { filePath: target, stream };
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
    this.sessions.delete(id);
    this.closedTranscripts.delete(id);
    this.#closeLogStream(session);
    try { session.terminal.kill(); } catch { /* process already exited */ }
    return true;
  }

  closeAll() {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }

  list() {
    return [...this.sessions.values()].map(({ terminal, transcript, logging, ...metadata }) => ({
      ...metadata,
      logging: logging ? { filePath: logging.filePath, active: true } : null
    }));
  }

  #closeLogStream(session) {
    if (!session?.logging?.stream) return;
    const filePath = session.logging.filePath;
    try { session.logging.stream.end(); } catch { /* best-effort log close */ }
    session.logging = { filePath, active: false };
  }

  #send(channel, payload) {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

module.exports = { TerminalService };
