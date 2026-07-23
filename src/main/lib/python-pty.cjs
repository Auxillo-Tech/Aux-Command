'use strict';

const path = require('node:path');
const { EventEmitter } = require('node:events');
const { StringDecoder } = require('node:string_decoder');
const { spawn } = require('node:child_process');
const { findExecutable } = require('./executable-finder.cjs');

const MAX_SPEC_BYTES = 1_000_000;

function resolvePtyHelper(baseDirectory = __dirname) {
  const helper = path.join(baseDirectory, '../helpers/pty_bridge.py');
  const asarSegment = `${path.sep}app.asar${path.sep}`;
  return helper.includes(asarSegment)
    ? helper.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`)
    : helper;
}

function resolveProcessGuard(baseDirectory = __dirname) {
  const helper = path.join(baseDirectory, '../helpers/process_guard.py');
  const asarSegment = `${path.sep}app.asar${path.sep}`;
  return helper.includes(asarSegment)
    ? helper.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`)
    : helper;
}

function serializeSpec(spec) {
  const payload = JSON.stringify(spec);
  if (Buffer.byteLength(payload) > MAX_SPEC_BYTES) throw new Error('PTY specification is too large');
  return payload;
}

class PythonPty {
  constructor(spec) {
    if (!spec || typeof spec !== 'object') throw new TypeError('PTY specification must be an object');
    const python = findExecutable(['python3']);
    if (!python) throw new Error('Python 3 is required for terminal sessions');
    const executable = findExecutable([spec.command], spec.env?.PATH || process.env.PATH || '');
    if (!executable) throw new Error(`${spec.command} is required for terminal sessions`);

    const helper = resolvePtyHelper();
    const guard = resolveProcessGuard();
    const payload = serializeSpec({
      command: executable,
      args: Array.isArray(spec.args) ? spec.args : [],
      cwd: spec.cwd,
      env: spec.env,
      cols: spec.cols,
      rows: spec.rows
    });

    this.events = new EventEmitter();
    this.pendingData = '';
    this.pendingExit = null;
    this.exited = false;
    this.killTimer = null;
    this.forceKillTimer = null;
    this.stdoutDecoder = new StringDecoder('utf8');
    this.stderrDecoder = new StringDecoder('utf8');
    const guardArgs = [guard, '--parent-pid', String(process.pid), '--ready-fd', '6', '--', python, helper];
    this.child = spawn(python, guardArgs, {
      cwd: spec.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    this.control = this.child.stdio[3];
    this.specPipe = this.child.stdio[4];
    this.input = this.child.stdio[5];
    this.guardReady = this.child.stdio[6];
    this.guardReady.resume();
    this.input.on('error', () => { /* process exit handling reports the failure */ });
    this.control.on('error', () => { /* process exit handling reports the failure */ });
    this.specPipe.on('error', () => { /* child process error handling reports the failure */ });
    this.specPipe.end(payload);

    this.child.stdout.on('data', (chunk) => {
      const data = this.stdoutDecoder.write(chunk);
      if (data) this.#emitData(data);
    });
    this.child.stderr.on('data', (chunk) => {
      const data = this.stderrDecoder.write(chunk);
      if (data) this.#emitData(data.replace(/(?<!\r)\n/gu, '\r\n'));
    });
    this.child.once('error', (error) => {
      this.#emitData(`\r\nAux Command PTY error: ${error.message}\r\n`);
    });
    this.child.once('close', (code, signal) => {
      if (this.exited) return;
      this.exited = true;
      if (this.killTimer) clearTimeout(this.killTimer);
      if (this.forceKillTimer) clearTimeout(this.forceKillTimer);
      const stdoutTail = this.stdoutDecoder.end();
      const stderrTail = this.stderrDecoder.end();
      if (stdoutTail) this.#emitData(stdoutTail);
      if (stderrTail) this.#emitData(stderrTail.replace(/(?<!\r)\n/gu, '\r\n'));
      const result = { exitCode: Number.isInteger(code) ? code : 1, signal: signal || null };
      if (this.events.listenerCount('exit')) this.events.emit('exit', result);
      else this.pendingExit = result;
    });
  }

  #emitData(data) {
    if (this.events.listenerCount('data')) {
      this.events.emit('data', data);
      return;
    }
    this.pendingData = `${this.pendingData}${data}`.slice(-1_048_576);
  }

  onData(handler) {
    this.events.on('data', handler);
    if (this.pendingData) {
      const buffered = this.pendingData;
      this.pendingData = '';
      handler(buffered);
    }
    return { dispose: () => this.events.off('data', handler) };
  }

  onExit(handler) {
    this.events.on('exit', handler);
    if (this.pendingExit) {
      const result = this.pendingExit;
      this.pendingExit = null;
      handler(result);
    }
    return { dispose: () => this.events.off('exit', handler) };
  }

  write(data) {
    if (this.exited || !this.input || this.input.destroyed) return;
    this.input.write(data);
  }

  resize(cols, rows) {
    if (this.exited || !this.control || this.control.destroyed) return;
    try { this.control.write(`${JSON.stringify({ type: 'resize', cols, rows })}\n`); } catch { /* process is closing */ }
  }

  kill(signal = 'SIGTERM') {
    if (this.exited) return;
    if (this.control && !this.control.destroyed) {
      try { this.control.write(`${JSON.stringify({ type: 'signal', signal })}\n`); } catch { /* process is closing */ }
    }
    try { this.child.kill(signal); } catch { /* process already exited */ }
    this.killTimer = setTimeout(() => {
      if (this.exited) return;
      if (this.control && !this.control.destroyed) {
        try { this.control.write(`${JSON.stringify({ type: 'signal', signal: 'SIGKILL' })}\n`); } catch { /* process is closing */ }
        this.forceKillTimer = setTimeout(() => {
          if (!this.exited) this.child.kill('SIGKILL');
        }, 250);
        this.forceKillTimer.unref();
      } else {
        this.child.kill('SIGKILL');
      }
    }, 1_500);
    this.killTimer.unref();
  }
}

module.exports = { PythonPty, resolveProcessGuard, resolvePtyHelper, serializeSpec };
