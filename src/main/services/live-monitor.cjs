'use strict';

const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { normalizeProfile } = require('../lib/validation.cjs');
const { resolveHelper, sshBaseArgs } = require('../lib/command-builder.cjs');
const { findExecutable } = require('../lib/executable-finder.cjs');

const MAX_OUTPUT_BYTES = 5_000_000;
const SNAPSHOT_COMMAND = [
  "echo '===UPTIME==='; uptime",
  "echo '===MEMORY==='; free -h",
  "echo '===DISK==='; df -h --output=source,size,used,avail,pcent,target -x tmpfs -x devtmpfs",
  "echo '===LOAD==='; cat /proc/loadavg",
  "echo '===PROCESSES==='; ps -eo pid,user,comm,%cpu,%mem --sort=-%cpu | head -16",
  "echo '===NETWORK==='; (ss -tulnp 2>/dev/null || netstat -tulnp 2>/dev/null) | head -30"
].join('; ');

class LiveMonitorService {
  constructor(options = {}) {
    this.sshExecutable = options.sshExecutable || findExecutable(['ssh']) || 'ssh';
    this.useGuard = options.useGuard !== false;
    this.timeout = Math.max(1000, Number(options.timeout) || 30_000);
    this.active = new Map();
  }

  snapshot(profileInput) {
    const profile = normalizeProfile(profileInput, profileInput?.id);
    if (profile.protocol !== 'ssh') return Promise.reject(new Error('Live monitoring requires an SSH profile'));
    const id = randomUUID();
    const target = profile.useSshConfig && profile.sshAlias ? profile.sshAlias : profile.host;
    const args = [...sshBaseArgs(profile, { batchMode: true, connectTimeout: 10 }), target, SNAPSHOT_COMMAND];

    return new Promise((resolve, reject) => {
      const launch = this.#guardedCommand(args);
      const child = spawn(launch.command, launch.args, {
        stdio: this.useGuard ? ['ignore', 'pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
        shell: false
      });
      if (this.useGuard) child.stdio[3].resume();
      const entry = { child, cancelled: false, timedOut: false, killTimer: null };
      this.active.set(id, entry);
      let stdout = '';
      let stderr = '';
      let settled = false;
      const append = (current, chunk) => {
        const combined = current + chunk;
        return combined.length > MAX_OUTPUT_BYTES ? combined.slice(-MAX_OUTPUT_BYTES) : combined;
      };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (entry.killTimer) clearTimeout(entry.killTimer);
        this.active.delete(id);
        if (error) reject(error);
        else resolve(result);
      };
      const timer = setTimeout(() => {
        entry.timedOut = true;
        this.#terminate(entry);
      }, this.timeout);
      timer.unref();
      child.once('error', (error) => finish(error));
      child.once('exit', (code, signal) => {
        if (entry.cancelled) return finish(new Error('Monitor snapshot was cancelled'));
        if (entry.timedOut) return finish(new Error('Monitor snapshot timed out'));
        if (code !== 0) {
          const error = new Error(stderr.trim() || `Remote monitor exited with code ${code}${signal ? ` (${signal})` : ''}`);
          error.code = code;
          finish(error);
          return;
        }
        const sections = this.#parseSnapshot(stdout);
        finish(null, { id, exitCode: code, signal: signal || null, capturedAt: new Date().toISOString(), sections, ...sections });
      });
    });
  }

  cancel(id) {
    const entry = this.active.get(id);
    if (!entry) return false;
    entry.cancelled = true;
    this.#terminate(entry);
    return true;
  }

  cancelAll() {
    let cancelled = 0;
    for (const id of [...this.active.keys()]) cancelled += this.cancel(id) ? 1 : 0;
    return cancelled;
  }

  #guardedCommand(args) {
    if (!this.useGuard) return { command: this.sshExecutable, args };
    const python = findExecutable(['python3', 'python']);
    if (!python) throw new Error('Python 3 is required to own monitor process lifecycles');
    return {
      command: python,
      args: [resolveHelper('process_guard.py'), '--parent-pid', String(process.pid), '--ready-fd', '3', '--', this.sshExecutable, ...args]
    };
  }

  #terminate(entry) {
    try { entry.child.kill('SIGTERM'); } catch { return; }
    entry.killTimer ||= setTimeout(() => { try { entry.child.kill('SIGKILL'); } catch { /* already exited */ } }, 3000);
    entry.killTimer.unref();
  }

  #parseSnapshot(output) {
    const sections = {};
    let current = null;
    for (const line of String(output || '').split('\n')) {
      const marker = line.match(/^===([A-Z_]+)===$/u);
      if (marker) {
        current = marker[1].toLowerCase();
        sections[current] = '';
      } else if (current) {
        sections[current] += `${line}\n`;
      }
    }
    for (const key of Object.keys(sections)) sections[key] = sections[key].trim();
    return sections;
  }
}

module.exports = { LiveMonitorService, SNAPSHOT_COMMAND };
