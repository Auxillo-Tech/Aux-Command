'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const WebSocket = require('ws');

async function requireLoopbackListen(t) {
  const server = net.createServer();
  const allowed = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(true));
  }).catch((error) => {
    if (error?.code === 'EPERM') return false;
    throw error;
  });
  if (!allowed) {
    t.skip('Loopback listening is not permitted in this environment');
    return false;
  }
  await new Promise((resolve) => server.close(resolve));
  return true;
}

test('VncBridgeService starts and stops VNC sessions with WebSocket ports', { timeout: 3000 }, async (t) => {
  if (!await requireLoopbackListen(t)) return;
  const { VncBridgeService } = require('../src/main/services/vnc-bridge.cjs');
  const bridge = new VncBridgeService();

  const result = await bridge.start({
    id: 'test-vnc', protocol: 'vnc', host: '127.0.0.1', port: 5901, name: 'Test VNC'
  });

  assert.ok(result.id, 'should have an id');
  assert.ok(result.wsPort > 0, `should have a WebSocket port, got ${result.wsPort}`);
  assert.equal(result.host, '127.0.0.1');
  assert.equal(result.port, 5901);
  assert.ok(result.url.startsWith('ws://127.0.0.1:'), `url should be ws://, got ${result.url}`);

  const list = bridge.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, result.id);

  const stopped = bridge.stop(result.id);
  assert.equal(stopped, true);
  assert.equal(bridge.list().length, 0);
});

test('VncBridgeService handles concurrent VNC sessions', { timeout: 3000 }, async (t) => {
  if (!await requireLoopbackListen(t)) return;
  const { VncBridgeService } = require('../src/main/services/vnc-bridge.cjs');
  const bridge = new VncBridgeService();

  const s1 = await bridge.start({ protocol: 'vnc', host: '10.0.0.1', port: 5900, name: 'VNC1' });
  const s2 = await bridge.start({ protocol: 'vnc', host: '10.0.0.2', port: 5902, name: 'VNC2' });

  assert.notEqual(s1.wsPort, s2.wsPort, 'each VNC session gets a unique port');
  assert.equal(bridge.list().length, 2);

  bridge.stop(s1.id);
  bridge.stop(s2.id);
  assert.equal(bridge.list().length, 0);
});

test('VncBridgeService stopAll cleans up all sessions', { timeout: 3000 }, async (t) => {
  if (!await requireLoopbackListen(t)) return;
  const { VncBridgeService } = require('../src/main/services/vnc-bridge.cjs');
  const bridge = new VncBridgeService();

  await bridge.start({ protocol: 'vnc', host: '127.0.0.1', port: 5903, name: 'T1' });
  await bridge.start({ protocol: 'vnc', host: '127.0.0.1', port: 5904, name: 'T2' });

  assert.equal(bridge.list().length, 2);
  bridge.stopAll();
  assert.equal(bridge.list().length, 0);
});

test('VncBridgeService rejects non-VNC profiles', async () => {
  const { VncBridgeService } = require('../src/main/services/vnc-bridge.cjs');
  const bridge = new VncBridgeService();

  await assert.rejects(
    () => bridge.start({ protocol: 'ssh', host: 'example.com', port: 22 }),
    /VNC bridge requires a VNC profile/
  );
});

test('VncBridgeService bridges binary data and closes connected clients on stop', { timeout: 3000 }, async (t) => {
  if (!await requireLoopbackListen(t)) return;
  const { VncBridgeService } = require('../src/main/services/vnc-bridge.cjs');
  const tcpServer = net.createServer((socket) => socket.on('data', (data) => socket.write(Buffer.concat([Buffer.from('echo:'), data]))));
  await new Promise((resolve) => tcpServer.listen(0, '127.0.0.1', resolve));
  const bridge = new VncBridgeService();
  let ws;
  try {
    const session = await bridge.start({ protocol: 'vnc', host: '127.0.0.1', port: tcpServer.address().port, name: 'Fixture' });
    ws = new WebSocket(session.url, { origin: 'file://' });
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const response = new Promise((resolve, reject) => { ws.once('message', resolve); ws.once('error', reject); });
    ws.send(Buffer.from('hello'));
    assert.equal((await response).toString(), 'echo:hello');
    const closed = new Promise((resolve) => ws.once('close', resolve));
    assert.equal(bridge.stop(session.id), true);
    await closed;
    assert.equal(bridge.list().length, 0);
  } finally {
    try { ws?.terminate(); } catch { /* already closed */ }
    bridge.stopAll();
    await new Promise((resolve) => tcpServer.close(resolve));
  }
});

test('VncBridgeService validates target host and port', async () => {
  const { VncBridgeService } = require('../src/main/services/vnc-bridge.cjs');
  const bridge = new VncBridgeService();
  await assert.rejects(() => bridge.start({ protocol: 'vnc', host: '', port: 5900 }), /host/u);
  await assert.rejects(() => bridge.start({ protocol: 'vnc', host: '127.0.0.1', port: 70000 }), /port/u);
});

test('VncBridgeService rejects cross-origin, missing-token and reused clients', { timeout: 3000 }, async (t) => {
  if (!await requireLoopbackListen(t)) return;
  const { VncBridgeService } = require('../src/main/services/vnc-bridge.cjs');
  const tcpServer = net.createServer((socket) => socket.on('data', (data) => socket.write(data)));
  await new Promise((resolve) => tcpServer.listen(0, '127.0.0.1', resolve));
  const bridge = new VncBridgeService();
  const expectRejected = (url, origin) => new Promise((resolve, reject) => {
    const client = new WebSocket(url, { origin });
    client.once('open', () => reject(new Error('unexpected WebSocket acceptance')));
    client.once('error', () => resolve());
  });
  let accepted;
  try {
    const session = await bridge.start({ protocol: 'vnc', host: '127.0.0.1', port: tcpServer.address().port, name: 'Protected' });
    const withoutToken = new URL(session.url);
    withoutToken.search = '';
    await expectRejected(withoutToken.toString(), 'file://');
    await expectRejected(session.url, 'https://evil.example');

    accepted = new WebSocket(session.url, { origin: 'file://' });
    await new Promise((resolve, reject) => { accepted.once('open', resolve); accepted.once('error', reject); });
    await expectRejected(session.url, 'file://');
  } finally {
    try { accepted?.terminate(); } catch { /* already closed */ }
    bridge.stopAll();
    await new Promise((resolve) => tcpServer.close(resolve));
  }
});
