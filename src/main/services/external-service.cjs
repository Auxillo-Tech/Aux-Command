'use strict';

const { spawn } = require('node:child_process');
const { buildExternalCommand, resolveHelper } = require('../lib/command-builder.cjs');
const { findExecutable } = require('../lib/executable-finder.cjs');

class ExternalService {
  constructor(options = {}) {
    this.useGuard = options.useGuard !== false;
    this.children = new Map();
  }

  async launch(profile) {
    const spec = buildExternalCommand(profile);
    const executable = findExecutable(spec.candidates);
    if (!executable) throw new Error(`No supported client found. Install one of: ${spec.candidates.join(', ')}`);
    const launch = this.#guardedCommand(executable, spec.args);
    return new Promise((resolve, reject) => {
      const child = spawn(launch.command, launch.args, {
        stdio: this.useGuard ? ['ignore', 'ignore', 'ignore', 'pipe'] : 'ignore',
        shell: false,
        env: process.env
      });
      if (this.useGuard) child.stdio[3].resume();
      const cleanup = () => this.children.delete(child.pid);
      child.once('error', (error) => { cleanup(); reject(error); });
      child.once('exit', cleanup);
      child.once('spawn', () => {
        this.children.set(child.pid, child);
        resolve({ pid: child.pid, executable });
      });
    });
  }

  stop(pid) {
    const child = this.children.get(Number(pid));
    if (!child) return false;
    this.#terminate(child);
    return true;
  }

  stopAll() {
    for (const child of this.children.values()) this.#terminate(child);
  }

  #guardedCommand(executable, args) {
    if (!this.useGuard) return { command: executable, args };
    const python = findExecutable(['python3', 'python']);
    if (!python) throw new Error('Python 3 is required to own native client lifecycles');
    return {
      command: python,
      args: [resolveHelper('process_guard.py'), '--parent-pid', String(process.pid), '--ready-fd', '3', '--', executable, ...args]
    };
  }

  #terminate(child) {
    if (!child || child.killed) return;
    try { child.kill('SIGTERM'); } catch { return; }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already exited */ } }, 2000);
    timer.unref();
  }
}

module.exports = { ExternalService, findExecutable };
