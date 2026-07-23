'use strict';

const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { PythonPty } = require('../lib/python-pty.cjs');
const { buildTerminalCommand } = require('../lib/command-builder.cjs');
const { normalizeTerminalRequest } = require('../lib/validation.cjs');

class TerminalService {
  constructor(getWindow) {
    this.getWindow = getWindow;
    this.sessions = new Map();
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
      startedAt: new Date().toISOString()
    };
    this.sessions.set(id, session);

    terminal.onData((data) => this.#send('terminal:data', { id, data }));
    terminal.onExit(({ exitCode, signal }) => {
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

  close(id) {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.sessions.delete(id);
    try { session.terminal.kill(); } catch { /* process already exited */ }
    return true;
  }

  closeAll() {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }

  list() {
    return [...this.sessions.values()].map(({ terminal, ...metadata }) => metadata);
  }

  #send(channel, payload) {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

module.exports = { TerminalService };
