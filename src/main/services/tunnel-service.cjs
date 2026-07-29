'use strict';

const { spawn } = require('node:child_process');
const { buildTunnelCommand, resolveHelper } = require('../lib/command-builder.cjs');
const { findExecutable } = require('../lib/executable-finder.cjs');
const { normalizeTunnel } = require('../lib/validation.cjs');

class TunnelService {
  constructor(profileStore, getWindow) {
    this.profileStore = profileStore;
    this.getWindow = getWindow;
    this.tunnels = new Map();
  }

  start(input) {
    const tunnel = normalizeTunnel(input);
    if (this.tunnels.has(tunnel.id)) throw new Error('Tunnel is already running');
    const profile = this.profileStore.get(tunnel.profileId);
    if (!profile) throw new Error('SSH profile not found');
    const spec = buildTunnelCommand(tunnel, profile);
    const python = findExecutable(['python3']);
    const executable = findExecutable([spec.command], spec.env.PATH);
    if (!python) throw new Error('Python 3 is required for guarded tunnels');
    if (!executable) throw new Error(`${spec.command} is required for tunnels`);
    const guard = resolveHelper('process_guard.py');
    const guardArgs = [guard, '--parent-pid', String(process.pid), '--ready-fd', '3', '--', executable, ...spec.args];
    const child = spawn(python, guardArgs, {
      stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
      shell: false,
      env: spec.env
    });
    child.stdio[3].resume();
    const state = {
      ...tunnel,
      pid: child.pid,
      status: 'starting',
      startedAt: new Date().toISOString(),
      lastError: ''
    };
    const entry = { state, child, settled: false };
    this.tunnels.set(tunnel.id, entry);
    this.#emit(state);

    let errorBuffer = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      errorBuffer = `${errorBuffer}${chunk}`.slice(-8192);
      if (/Local forwarding listening|remote forward success|Entering interactive session|pledge: network/i.test(errorBuffer)) {
        this.#markRunning(tunnel.id, entry);
      }
    });
    child.once('spawn', () => {
      state.pid = child.pid;
    });
    child.once('error', (error) => {
      if (entry.settled) return;
      entry.settled = true;
      state.status = 'failed';
      state.lastError = error.message;
      if (this.tunnels.get(tunnel.id) === entry) this.tunnels.delete(tunnel.id);
      this.#emit(state);
    });
    child.once('exit', (code, signal) => {
      if (entry.settled) return;
      entry.settled = true;
      state.status = code === 0 || signal ? 'stopped' : 'failed';
      state.lastError = code && errorBuffer.trim() ? errorBuffer.trim() : state.lastError;
      if (this.tunnels.get(tunnel.id) === entry) this.tunnels.delete(tunnel.id);
      this.#emit(state);
    });
    return structuredClone(state);
  }

  stop(id) {
    const entry = this.tunnels.get(id);
    if (!entry) return false;
    entry.state.status = 'stopping';
    this.#emit(entry.state);
    entry.child.kill('SIGTERM');
    const timer = setTimeout(() => {
      if (this.tunnels.get(id) === entry && !entry.settled) entry.child.kill('SIGKILL');
    }, 3000);
    timer.unref();
    return true;
  }

  stopAll() {
    for (const id of [...this.tunnels.keys()]) this.stop(id);
  }

  list() {
    return [...this.tunnels.values()].map(({ state }) => structuredClone(state));
  }

  #markRunning(id, entry) {
    if (entry.settled || this.tunnels.get(id) !== entry || entry.state.status !== 'starting') return;
    entry.state.status = 'running';
    this.#emit(entry.state);
  }

  #emit(state) {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('tunnel:status', structuredClone(state));
  }
}

module.exports = { TunnelService };
