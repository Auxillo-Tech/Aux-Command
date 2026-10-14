'use strict';

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { vncViewerUrl } = require('../lib/app-protocol.cjs');
const { normalizeProfile } = require('../lib/validation.cjs');
const { resolveHelper } = require('../lib/command-builder.cjs');
const { findExecutable } = require('../lib/executable-finder.cjs');
const { trustedCertificateArgs } = require('../lib/rdp-certificate.cjs');

const XVFB_SETTLE_TIMEOUT = 8000;
const X11VNC_SETTLE_TIMEOUT = 10_000;
const DISPLAY_SEARCH_START = 90;
const DISPLAY_SEARCH_END = 999;

// Toolchain that turns an RDP target into an in-app VNC surface:
//   xfreerdp renders into a headless Xvfb display, x11vnc exports that display,
//   and the existing noVNC bridge streams it into a tab. When any component is
//   missing the renderer falls back to the external FreeRDP launcher.
const REQUIRED_TOOLS = {
  xvfb: ['Xvfb'],
  x11vnc: ['x11vnc'],
  xfreerdp: ['xfreerdp3', 'xfreerdp']
};

// An Xauthority file holding one MIT-MAGIC-COOKIE-1 for any address
// (FamilyWild), so only processes given this file can open the display.
function xauthorityEntry(display, cookie) {
  const field = (value) => {
    const length = Buffer.alloc(2);
    length.writeUInt16BE(value.length);
    return Buffer.concat([length, value]);
  };
  const family = Buffer.alloc(2);
  family.writeUInt16BE(0xffff);
  return Buffer.concat([family, field(Buffer.alloc(0)), field(Buffer.from(String(display))), field(Buffer.from('MIT-MAGIC-COOKIE-1')), field(cookie)]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateRdpTarget(profile) {
  if (profile?.protocol !== 'rdp') throw new Error('Embedded RDP requires an RDP profile');
  const host = String(profile.host || '').trim();
  const port = Number(profile.port || 3389);
  if (!host || host.length > 253 || /[\s\u0000]/u.test(host)) throw new Error('RDP host is invalid');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RDP port is invalid');
  return { host, port };
}

class RdpEmbedService {
  constructor(options = {}) {
    this.vaultService = options.vaultService || null;
    this.vncBridge = options.vncBridge || null;
    this.useGuard = options.useGuard !== false;
    this.knownHostService = options.knownHostService || null;
    this.rdpCertificateArgs = options.rdpCertificateArgs
      || ((target, executable) => trustedCertificateArgs(target, this.knownHostService, executable));
    this.sessions = new Map();
  }

  // Report which parts of the embedded pipeline are installed; the renderer and
  // diagnostics use this to decide between embedded and external RDP.
  capabilities() {
    const tools = {};
    for (const [key, candidates] of Object.entries(REQUIRED_TOOLS)) {
      tools[key] = Boolean(findExecutable(candidates));
    }
    return { available: Object.values(tools).every(Boolean), tools };
  }

  async start(profileInput) {
    if (!this.vncBridge) throw new Error('Embedded RDP requires the VNC bridge service');
    const profile = normalizeProfile(profileInput, profileInput?.id);
    const { host, port } = validateRdpTarget(profile);

    const capability = this.capabilities();
    if (!capability.available) {
      const missing = Object.entries(capability.tools).filter(([, ok]) => !ok).map(([name]) => name);
      throw new Error(`Embedded RDP needs ${missing.join(', ')} installed (Xvfb, x11vnc, and FreeRDP).`);
    }

    const xvfbBin = findExecutable(REQUIRED_TOOLS.xvfb);
    const x11vncBin = findExecutable(REQUIRED_TOOLS.x11vnc);
    const rdpBin = findExecutable(REQUIRED_TOOLS.xfreerdp);
    // Confirm the server certificate before starting anything, so the trust
    // prompt can wait for the user without display timeouts running.
    const certificateArgs = await this.rdpCertificateArgs({ probeHost: host, probePort: port, name: profile.name }, rdpBin);

    const id = randomUUID();
    const session = {
      id,
      profile: structuredClone(profile),
      host,
      port,
      display: null,
      width: Math.max(800,Math.min(3840,Math.round(Number(profile.rdpWidth)||1600))),
      height: Math.max(600,Math.min(2160,Math.round(Number(profile.rdpHeight)||900))),
      xvfb: null,
      xfreerdp: null,
      x11vnc: null,
      x11vncSocket: null,
      xauthority: null,
      bridgeId: null,
      workDir: fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-rdp-')),
      stopping: false,
      startedAt: new Date().toISOString()
    };
    this.sessions.set(id, session);

    try {
      await this.#startXvfb(session, xvfbBin);
      await this.#startXfreerdp(session, rdpBin, profile, certificateArgs);
      await this.#startX11vnc(session, x11vncBin);
      if (session.stopping) throw new Error('RDP connection closed before its display was ready');
      const bridge = await this.vncBridge.start({ protocol: 'vnc', host: '127.0.0.1', port: 5900 }, { socketPath: session.x11vncSocket });
      session.bridgeId = bridge.id;
      return {
        id,
        bridgeId: bridge.id,
        host,
        port,
        vncUrl: vncViewerUrl(`url=${encodeURIComponent(bridge.url)}&host=${encodeURIComponent(host)}&port=${port}`)
      };
    } catch (error) {
      this.stop(id);
      throw error;
    }
  }

  async #startXvfb(session, xvfbBin) {
    const display = await this.#reserveDisplay();
    session.display = display;
    // The display is shared through /tmp/.X11-unix, which every local user
    // can reach, so it requires a cookie kept in the private work directory.
    session.xauthority = path.join(session.workDir, 'Xauthority');
    fs.writeFileSync(session.xauthority, xauthorityEntry(display, randomBytes(16)), { mode: 0o600, flag: 'wx' });
    const args = [`:${display}`, '-screen', '0', `${session.width}x${session.height}x24`, '-nolisten', 'tcp', '-noreset', '-auth', session.xauthority];
    session.xvfb = this.#spawnGuarded(xvfbBin, args, session);
    session.xvfb.once('exit', () => { if (!session.stopping) this.stop(session.id); });

    const socket = `/tmp/.X11-unix/X${display}`;
    const deadline = Date.now() + XVFB_SETTLE_TIMEOUT;
    while (Date.now() < deadline) {
      if (session.stopping) throw new Error('RDP connection closed before its display was ready');
      if (fs.existsSync(socket)) return;
      if (session.xvfb.exitCode !== null) throw new Error('Xvfb exited before the display was ready');
      await delay(100);
    }
    throw new Error('Xvfb did not create its display in time');
  }

  async #startXfreerdp(session, rdpBin, profile, certificateArgs) {
    const args = [
      `/v:${session.host}:${session.port}`,
      `/size:${session.width}x${session.height}`,
      ...certificateArgs,
      '+clipboard',
      '+auto-reconnect',
      '-grab-keyboard',
      '/log-level:WARN'
    ];
    if (profile.username) args.push(`/u:${profile.username}`);
    if (profile.rdpDomain) args.push(`/d:${profile.rdpDomain}`);
    if (profile.rdpAudio) args.push('/sound');
    if (this.vaultService && profile.credentialId && this.vaultService.has(profile.credentialId)) {
      const secret = await this.vaultService.get(profile.credentialId);
      // FreeRDP reads the password from standard input so it never
      // appears in the process argument list.
      session.xfreerdp = this.#spawnGuarded(rdpBin, [...args, '/from-stdin'], session, {
        DISPLAY: `:${session.display}`,
        XAUTHORITY: session.xauthority,
        FREERDP_ASKPASS: '0'
      });
      try { session.xfreerdp.stdin.write(`${secret}\n`); session.xfreerdp.stdin.end(); }
      catch { /* xfreerdp reads credentials interactively if stdin is unavailable */ }
    } else {
      session.xfreerdp = this.#spawnGuarded(rdpBin, args, session, { DISPLAY: `:${session.display}`, XAUTHORITY: session.xauthority });
    }
    session.xfreerdp.once('exit', () => { if (!session.stopping) this.stop(session.id); });
  }

  async #startX11vnc(session, x11vncBin) {
    // No VNC password and no network port: x11vnc listens only on a Unix
    // socket inside the 0700 work directory, so other local users cannot
    // reach it. The noVNC bridge connects to that socket and enforces its own
    // single-use token and viewer origin.
    session.x11vncSocket = path.join(session.workDir, 'vnc.sock');
    const args = [
      '-display', `:${session.display}`,
      '-auth', session.xauthority,
      '-rfbport', '0',
      '-rfbportv6', '-1',
      '-unixsock', session.x11vncSocket,
      '-forever',
      '-shared',
      '-noxdamage',
      '-nopw',
      '-quiet'
    ];
    session.x11vnc = this.#spawnGuarded(x11vncBin, args, session, { DISPLAY: `:${session.display}`, XAUTHORITY: session.xauthority });
    session.x11vnc.once('exit', () => { if (!session.stopping) this.stop(session.id); });

    const deadline = Date.now() + X11VNC_SETTLE_TIMEOUT;
    while (Date.now() < deadline) {
      if (session.stopping) throw new Error('RDP connection closed before its display was ready');
      if (session.x11vnc.exitCode !== null && session.x11vnc.exitCode !== 0) {
        throw new Error('x11vnc exited before it could serve the RDP display');
      }
      if (await this.#socketAccepting(session.x11vncSocket)) return;
      await delay(150);
    }
    throw new Error('x11vnc did not start serving the RDP display in time');
  }

  #socketAccepting(socketPath) {
    if (!fs.existsSync(socketPath)) return Promise.resolve(false);
    return new Promise((resolve) => {
      const socket = net.createConnection({ path: socketPath });
      const done = (ok) => { socket.destroy(); resolve(ok); };
      socket.setTimeout(600);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });
  }

  async #reserveDisplay() {
    for (let display = DISPLAY_SEARCH_START; display <= DISPLAY_SEARCH_END; display += 1) {
      const socket = `/tmp/.X11-unix/X${display}`;
      const lock = `/tmp/.X${display}-lock`;
      if (!fs.existsSync(socket) && !fs.existsSync(lock) && !this.#displayInUse(display)) {
        return display;
      }
    }
    throw new Error('No free X display number is available for embedded RDP');
  }

  #displayInUse(display) {
    for (const session of this.sessions.values()) {
      if (session.display === display) return true;
    }
    return false;
  }

  #spawnGuarded(executable, args, session, extraEnv = {}) {
    const env = { ...process.env, ...extraEnv };
    if (!this.useGuard) return spawn(executable, args, { stdio: ['pipe', 'ignore', 'ignore'], env, shell: false });
    const python = findExecutable(['python3']);
    if (!python) throw new Error('Python 3 is required for guarded embedded RDP processes');
    const child = spawn(python, [
      resolveHelper('process_guard.py'),
      '--parent-pid', String(process.pid),
      '--ready-fd', '3',
      '--', executable, ...args
    ], { stdio: ['pipe', 'ignore', 'ignore', 'pipe'], env, shell: false });
    child.stdio[3]?.resume();
    return child;
  }

  stop(id) {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.stopping = true;
    this.sessions.delete(id);
    if (session.bridgeId) { try { this.vncBridge.stop(session.bridgeId); } catch { /* already stopped */ } }
    for (const child of [session.x11vnc, session.xfreerdp, session.xvfb]) this.#terminate(child);
    try { fs.rmSync(session.workDir, { recursive: true, force: true }); } catch { /* best effort */ }
    return true;
  }

  stopAll() {
    for (const id of [...this.sessions.keys()]) this.stop(id);
  }

  list() {
    return [...this.sessions.values()].map((session) => ({
      id: session.id,
      host: session.host,
      port: session.port,
      display: session.display,
      x11vncSocket: session.x11vncSocket,
      startedAt: session.startedAt
    }));
  }

  #terminate(child) {
    if (!child || child.killed) return;
    try { child.kill('SIGTERM'); } catch { return; }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already exited */ } }, 2000);
    timer.unref();
  }
}

module.exports = { RdpEmbedService, validateRdpTarget };
