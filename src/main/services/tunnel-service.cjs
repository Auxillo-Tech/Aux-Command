'use strict';

const { spawn } = require('node:child_process');
const { buildTunnelCommand, resolveHelper } = require('../lib/command-builder.cjs');
const { findExecutable } = require('../lib/executable-finder.cjs');
const { normalizeTunnel } = require('../lib/validation.cjs');
const { createAskpassSession, supportsForcedAskpass, supportsSavedCredentialAnswers } = require('../lib/ssh-askpass.cjs');

// OpenSSH prints "Local forwarding listening" per address before it has
// tried every bind, and with ExitOnForwardFailure a failed bind exits right
// after. A tunnel is reported ready only when no failure follows quickly.
const READY_SETTLE_MS = 1200;
// A rejected password is followed by another sign-in attempt; that line is
// not a forwarding failure.
const SIGN_IN_RETRY = /^Permission denied, please try again\.\r?$/gmu;
const FORWARD_FAILURE = /cannot listen|Address already in use|Permission denied|Could not request (local|remote) forwarding|remote port forwarding failed|forwarding failed|bind \[?[^\]]*\]?:\d+:/i;

// The verbose log is kept for diagnostics, but the visible error is the last
// few non-debug lines, which carry the actual cause.
function summarizeSshError(text) {
  const lines = String(text || '').split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !/^debug\d:/u.test(line));
  return lines.slice(-3).join(' · ').slice(0, 400);
}

class TunnelService {
  // With a prompt broker, OpenSSH's sign-in prompts are answered from the
  // profile's saved credential or shown as dialogs. Without one nobody could
  // answer, so the tunnel runs in BatchMode and fails instead of waiting.
  constructor(profileStore, getWindow, options = {}) {
    this.profileStore = profileStore;
    this.getWindow = getWindow;
    this.vaultService = options.vaultService || null;
    this.promptBroker = options.promptBroker || null;
    this.tunnels = new Map();
  }

  start(input) {
    const tunnel = normalizeTunnel(input);
    if (this.tunnels.has(tunnel.id)) throw new Error('Tunnel is already running');
    const profile = this.profileStore.get(tunnel.profileId);
    if (!profile) throw new Error('SSH profile not found');
    const ssh = findExecutable(['ssh']);
    const interactive = Boolean(this.promptBroker) && supportsForcedAskpass(ssh);
    const spec = buildTunnelCommand(tunnel, profile, { interactive });
    const python = findExecutable(['python3']);
    const executable = findExecutable([spec.command], spec.env.PATH);
    if (!python) throw new Error('Python 3 is required for guarded tunnels');
    if (!executable) throw new Error(`${spec.command} is required for tunnels`);
    const guard = resolveHelper('process_guard.py');
    const guardArgs = [guard, '--parent-pid', String(process.pid), '--ready-fd', '3', '--', executable, ...spec.args];
    const hooks = {};
    const askpass = interactive ? createAskpassSession({
      profile,
      vaultService: this.vaultService,
      promptBroker: this.promptBroker,
      mode: 'dialog',
      useVault: supportsSavedCredentialAnswers(ssh),
      onAbort: (reason) => hooks.abort?.(reason)
    }) : null;
    let child;
    try {
      child = spawn(python, guardArgs, {
        stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
        shell: false,
        env: askpass ? { ...spec.env, ...askpass.env } : spec.env
      });
    } catch (error) {
      askpass?.close();
      throw error;
    }
    askpass?.trackProcess(child.pid);
    child.stdio[3].resume();
    const state = {
      ...tunnel,
      pid: child.pid,
      status: 'starting',
      startedAt: new Date().toISOString(),
      lastError: ''
    };
    const entry = { state, child, askpass, settled: false, stopRequested: false, signInError: '' };
    this.tunnels.set(tunnel.id, entry);
    this.#emit(state);
    // A cancelled sign-in or a refused host key ends the tunnel at once.
    hooks.abort = (reason) => {
      if (entry.settled) return;
      entry.signInError = reason;
      this.#terminate(tunnel.id, entry);
    };

    let errorBuffer = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      errorBuffer = `${errorBuffer}${chunk}`.slice(-8192);
      if (FORWARD_FAILURE.test(errorBuffer.replace(SIGN_IN_RETRY, ''))) {
        entry.forwardFailed = true;
        clearTimeout(entry.readyTimer);
        return;
      }
      if (!entry.readyTimer && /Local forwarding listening|remote forward success|Entering interactive session|pledge: network/i.test(errorBuffer)) {
        entry.readyTimer = setTimeout(() => { if (!entry.forwardFailed) this.#markRunning(tunnel.id, entry); }, READY_SETTLE_MS);
        entry.readyTimer.unref?.();
      }
    });
    child.once('spawn', () => {
      state.pid = child.pid;
    });
    child.once('error', (error) => {
      if (entry.settled) return;
      entry.settled = true;
      askpass?.close();
      state.status = 'failed';
      state.lastError = error.message;
      if (this.tunnels.get(tunnel.id) === entry) this.tunnels.delete(tunnel.id);
      this.#emit(state);
    });
    child.once('exit', (code, signal) => {
      if (entry.settled) return;
      entry.settled = true;
      askpass?.close();
      const signInFailed = Boolean(entry.signInError) && !entry.stopRequested;
      // The process guard exits with a plain 128+signum code after forwarding
      // SIGTERM, so an operator-requested stop must not be reported as failed.
      const stopped = !signInFailed && (entry.stopRequested || code === 0 || Boolean(signal));
      state.status = stopped ? 'stopped' : 'failed';
      clearTimeout(entry.readyTimer);
      if (signInFailed) state.lastError = entry.signInError;
      else state.lastError = !stopped && code && errorBuffer.trim() ? (summarizeSshError(errorBuffer) || `ssh exited with code ${code}`) : state.lastError;
      if (this.tunnels.get(tunnel.id) === entry) this.tunnels.delete(tunnel.id);
      this.#emit(state);
    });
    return structuredClone(state);
  }

  stop(id) {
    const entry = this.tunnels.get(id);
    if (!entry) return false;
    entry.stopRequested = true;
    entry.state.status = 'stopping';
    this.#emit(entry.state);
    this.#terminate(id, entry);
    return true;
  }

  #terminate(id, entry) {
    entry.child.kill('SIGTERM');
    const timer = setTimeout(() => {
      if (this.tunnels.get(id) === entry && !entry.settled) entry.child.kill('SIGKILL');
    }, 3000);
    timer.unref();
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
    // Signed in: nothing further may be asked on this connection's behalf.
    entry.askpass?.close();
    this.#emit(entry.state);
  }

  #emit(state) {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('tunnel:status', structuredClone(state));
  }
}

module.exports = { TunnelService, summarizeSshError };
