'use strict';

const os = require('node:os');
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
      transcriptTruncated: false
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
        transcriptTruncated: session.transcriptTruncated
      });
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

  close(id) {
    const session = this.sessions.get(id);
    if (!session) {
      return this.closedTranscripts.delete(id);
    }
    this.sessions.delete(id);
    this.closedTranscripts.delete(id);
    try { session.terminal.kill(); } catch { /* process already exited */ }
    return true;
  }

  closeAll() {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }

  list() {
    return [...this.sessions.values()].map(({ terminal, transcript, ...metadata }) => metadata);
  }

  #send(channel, payload) {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

module.exports = { TerminalService };
