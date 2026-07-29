'use strict';

const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { normalizeProfile } = require('../lib/validation.cjs');
const { buildExternalCommand, resolveHelper, sshBaseArgs } = require('../lib/command-builder.cjs');
const { findExecutable } = require('../lib/executable-finder.cjs');
const { validateHost } = require('./network-tools.cjs');

class RemoteDesktopGateway {
  constructor(options = {}) {
    this.getWindow = options.getWindow || (() => null);
    this.sshExecutable = options.sshExecutable || null;
    this.clientExecutable = options.clientExecutable || null;
    this.useGuard = options.useGuard !== false;
    this.connectTimeout = Math.max(1000, Number(options.connectTimeout) || 20_000);
    this.sessions = new Map();
  }

  async connect(spec = {}) {
    const gatewayProfile = normalizeProfile(spec.gatewayProfile, spec.gatewayProfile?.id);
    if (gatewayProfile.protocol !== 'ssh') throw new Error('Remote desktop gateway requires an SSH gateway profile');
    const protocol = String(spec.protocol || '').toLowerCase();
    if (!['rdp', 'vnc'].includes(protocol)) throw new Error('Gateway protocol must be RDP or VNC');
    let targetHost;
    try { targetHost = validateHost(spec.targetHost, 'target host'); } catch { throw new Error('Remote desktop target host is invalid'); }
    const targetPort = Number(spec.targetPort || (protocol === 'rdp' ? 3389 : 5900));
    if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) throw new Error('Remote desktop target port is invalid');
    const localPort = spec.localPort ? Number(spec.localPort) : await this.#freePort();
    if (!Number.isInteger(localPort) || localPort < 1024 || localPort > 65535) throw new Error('Gateway local port must be between 1024 and 65535');

    const localProfile = normalizeProfile({
      id: `gateway-client-${randomUUID()}`,
      name: `${protocol.toUpperCase()} via ${gatewayProfile.name}`,
      protocol,
      host: '127.0.0.1',
      port: localPort,
      username: String(spec.username || '').trim(),
      rdpDomain: String(spec.rdpDomain || '').trim()
    });
    const clientSpec = buildExternalCommand(localProfile);
    const clientExecutable = this.#resolveClient(clientSpec.candidates);
    const sshExecutable = this.sshExecutable || findExecutable(['ssh']);
    if (!sshExecutable) throw new Error('OpenSSH is required for a remote desktop gateway');

    const id = randomUUID();
    const target = gatewayProfile.useSshConfig && gatewayProfile.sshAlias ? gatewayProfile.sshAlias : gatewayProfile.host;
    const sshArgs = [
      ...sshBaseArgs(gatewayProfile, { batchMode: true, exitOnForwardFailure: true }),
      '-v', '-N', '-L', `127.0.0.1:${localPort}:${targetHost}:${targetPort}`, target
    ];
    const launch = this.#guardedCommand(sshExecutable, sshArgs);
    const tunnel = spawn(launch.command, launch.args, {
      stdio: this.useGuard ? ['ignore', 'ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'pipe'],
      shell: false
    });
    if (this.useGuard) tunnel.stdio[3].resume();
    const session = {
      id,
      protocol,
      gatewayProfileId: gatewayProfile.id,
      gatewayName: gatewayProfile.name,
      targetHost,
      targetPort,
      localPort,
      status: 'connecting',
      startedAt: new Date().toISOString(),
      tunnel,
      client: null,
      stopping: false,
      lastError: ''
    };
    this.sessions.set(id, session);
    this.#emit(session);

    return new Promise((resolve, reject) => {
      let settled = false;
      let stderr = '';
      const finishError = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        session.lastError = error.message;
        this.disconnect(id);
        reject(error);
      };
      const launchClient = () => {
        if (settled || session.stopping || session.client) return;
        const clientLaunch = this.#guardedCommand(clientExecutable, clientSpec.args);
        const client = spawn(clientLaunch.command, clientLaunch.args, {
          stdio: this.useGuard ? ['ignore', 'ignore', 'ignore', 'pipe'] : 'ignore',
          shell: false
        });
        if (this.useGuard) client.stdio[3].resume();
        session.client = client;
        client.once('error', (error) => finishError(new Error(`Could not start native client: ${error.message}`)));
        client.once('spawn', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          session.status = 'connected';
          this.#emit(session);
          resolve(this.#public(session));
        });
        client.once('exit', () => this.disconnect(id));
      };

      tunnel.stderr.setEncoding('utf8');
      tunnel.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-16_384);
        if (/Local forwarding listening on .* port \d+/iu.test(stderr)) launchClient();
      });
      tunnel.once('error', (error) => finishError(error));
      tunnel.once('exit', (code, signal) => {
        if (session.stopping) return;
        const detail = stderr.trim().split('\n').slice(-4).join('\n');
        finishError(new Error(detail || `SSH gateway exited with code ${code}${signal ? ` (${signal})` : ''}`));
      });
      const timer = setTimeout(() => finishError(new Error('SSH gateway did not confirm forwarding readiness')), this.connectTimeout);
      timer.unref();
    });
  }

  disconnect(id) {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.stopping = true;
    session.status = 'stopped';
    this.sessions.delete(id);
    this.#terminate(session.client);
    this.#terminate(session.tunnel);
    this.#emit(session);
    return true;
  }

  disconnectAll() {
    for (const id of [...this.sessions.keys()]) this.disconnect(id);
  }

  list() {
    return [...this.sessions.values()].map((session) => this.#public(session));
  }

  #resolveClient(candidates) {
    if (this.clientExecutable) {
      try { fs.accessSync(this.clientExecutable, fs.constants.X_OK); return this.clientExecutable; } catch { throw new Error('The configured native client is not executable'); }
    }
    const executable = findExecutable(candidates);
    if (!executable) throw new Error(`No supported native client found. Install one of: ${candidates.join(', ')}`);
    return executable;
  }

  #guardedCommand(executable, args) {
    if (!this.useGuard) return { command: executable, args };
    const python = findExecutable(['python3']);
    if (!python) throw new Error('Python 3 is required for guarded gateways');
    return {
      command: python,
      args: [resolveHelper('process_guard.py'), '--parent-pid', String(process.pid), '--ready-fd', '3', '--', executable, ...args]
    };
  }

  #freePort() {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        server.close((error) => error ? reject(error) : resolve(port));
      });
    });
  }

  #terminate(child) {
    if (!child || child.killed) return;
    try { child.kill('SIGTERM'); } catch { return; }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already exited */ } }, 2000);
    timer.unref();
  }

  #public(session) {
    return {
      id: session.id,
      protocol: session.protocol,
      gatewayProfileId: session.gatewayProfileId,
      gatewayName: session.gatewayName,
      targetHost: session.targetHost,
      targetPort: session.targetPort,
      localPort: session.localPort,
      status: session.status,
      startedAt: session.startedAt,
      lastError: session.lastError
    };
  }

  #emit(session) {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('gateway:status', this.#public(session));
  }
}

module.exports = { RemoteDesktopGateway };
