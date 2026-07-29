'use strict';

const net = require('node:net');
const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');

function validateVncTarget(profile) {
  if (profile?.protocol !== 'vnc') throw new Error('VNC bridge requires a VNC profile');
  const host = String(profile.host || '').trim();
  const port = Number(profile.port || 5900);
  if (!host || host.length > 253 || /[\s\u0000]/u.test(host)) throw new Error('VNC host is invalid');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('VNC port is invalid');
  return { host, port };
}

class VncBridgeService {
  constructor() {
    this.sessions = new Map();
  }

  async start(profile) {
    const { host, port } = validateVncTarget(profile);
    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    let session;
    const wss = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
      perMessageDeflate: false,
      maxPayload: 16 * 1024 * 1024,
      verifyClient: (info, accept) => {
        const origin = String(info.origin || info.req.headers.origin || '');
        const allowedOrigin = origin === 'file://' || origin === 'null';
        let supplied = '';
        try { supplied = new URL(info.req.url, 'ws://127.0.0.1').searchParams.get('token') || ''; }
        catch { /* rejected below */ }
        const expected = Buffer.from(token);
        const candidate = Buffer.from(supplied);
        const validToken = candidate.length === expected.length && timingSafeEqual(candidate, expected);
        if (!allowedOrigin || !validToken || session?.claimed) {
          accept(false, 403, 'Forbidden');
          return;
        }
        session.claimed = true;
        accept(true);
      }
    });
    const wsPort = await new Promise((resolve, reject) => {
      wss.once('listening', () => resolve(wss.address().port));
      wss.once('error', reject);
    });
    session = { id, profile: structuredClone(profile), wss, wsPort, host, port, sockets: new Set(), claimed: false };
    this.sessions.set(id, session);

    wss.on('connection', (ws) => this.#bridgeClient(session, ws));
    wss.on('error', () => this.stop(id));
    return { id, wsPort, host, port, url: `ws://127.0.0.1:${wsPort}/vnc?token=${token}` };
  }

  #bridgeClient(session, ws) {
    const tcp = net.createConnection({ host: session.host, port: session.port });
    session.sockets.add(tcp);
    tcp.setTimeout(10_000, () => tcp.destroy(new Error('VNC target connection timed out')));
    tcp.once('connect', () => tcp.setTimeout(0));
    tcp.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data, { binary: true });
    });
    tcp.once('error', () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try { ws.close(1011, 'VNC target connection failed'); } catch { ws.terminate(); }
      }
    });
    tcp.once('close', () => {
      session.sockets.delete(tcp);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });

    ws.on('message', (data) => {
      if (!tcp.destroyed) tcp.write(data);
    });
    ws.once('close', () => tcp.destroy());
    ws.once('error', () => tcp.destroy());
  }

  stop(id) {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.sessions.delete(id);
    for (const client of session.wss.clients) {
      try { client.close(1001, 'VNC bridge stopped'); } catch { client.terminate(); }
      const timer = setTimeout(() => { try { client.terminate(); } catch { /* already closed */ } }, 250);
      timer.unref();
    }
    for (const socket of session.sockets) {
      try { socket.destroy(); } catch { /* already closed */ }
    }
    session.sockets.clear();
    try { session.wss.close(); } catch { /* already closed */ }
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
      wsPort: session.wsPort,
      clients: session.wss.clients.size
    }));
  }
}

module.exports = { VncBridgeService, validateVncTarget };
