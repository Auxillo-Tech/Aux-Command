'use strict';
// Run under xvfb-run. Server binds only to loopback and uses an isolated
// FreeRDP configuration directory and disposable virtual desktop.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const WebSocket = require('ws');
const { VncBridgeService } = require('../src/main/services/vnc-bridge.cjs');
const { RdpEmbedService } = require('../src/main/services/rdp-embed.cjs');
const { KnownHostService } = require('../src/main/services/known-host-service.cjs');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-rdp-integration-'));
  process.env.XDG_CONFIG_HOME = directory;
  const listener = net.createServer(); await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  const shadow = spawn('freerdp-shadow-cli', [`/port:${port}`, '/bind-address:127.0.0.1', '-auth', '/sec:tls']);
  let shadowLog = ''; for (const pipe of [shadow.stdout, shadow.stderr]) pipe.on('data', (chunk) => { shadowLog = (shadowLog + chunk).slice(-8000); });
  const bridge = new VncBridgeService();
  const prompts = [];
  let answer = { accept: true, remember: true };
  const knownHostService = new KnownHostService(directory, { request: async (kind, payload) => { prompts.push({ kind, payload }); return answer; } });
  const service = new RdpEmbedService({ vncBridge: bridge, knownHostService, vaultService: { has: () => true, get: async () => 'test-only-password' } });
  let ws;
  try {
    await delay(1500);
    assert.equal(shadow.exitCode, null, shadowLog);
    const session = await service.start({ id: 'fixture', name: 'Fixture RDP', protocol: 'rdp', host: '127.0.0.1', port, username: 'fixture', credentialId: 'test', rdpWidth: 1280, rdpHeight: 720, rdpAudio: true });
    await delay(2000);
    assert.equal(service.list().length, 1, `RDP client exited: ${shadowLog}`);
    const desktop = service.list()[0];
    // The display needs the session cookie: other local users are refused.
    const xauthority = service.sessions.get(session.id).xauthority;
    const anonymous = spawnSync('xwininfo', ['-display', `:${desktop.display}`, '-root'], { encoding: 'utf8', env: { ...process.env, XAUTHORITY: '/dev/null' } });
    assert.notEqual(anonymous.status, 0, 'RDP display must refuse clients without its cookie');
    assert.equal(desktop.x11vncSocket.startsWith(service.sessions.get(session.id).workDir), true, 'x11vnc must listen only inside the private work directory');
    const windows = spawnSync('xwininfo', ['-display', `:${desktop.display}`, '-root', '-tree'], { encoding: 'utf8', env: { ...process.env, XAUTHORITY: xauthority } });
    assert.match(windows.stdout, /FreeRDP/, 'RDP must have a rendered client window');
    ws = new WebSocket(new URLSearchParams(session.vncUrl.split('?')[1]).get('url'), { origin: 'aux-vnc://viewer' });
    let buffer = Buffer.alloc(0), failure = null;
    ws.on('message', (chunk) => { buffer = Buffer.concat([buffer, chunk]); }); ws.on('error', (error) => { failure = error; });
    const read = async (n) => {
      for (let i = 0; buffer.length < n && i < 100 && !failure; i++) await delay(50);
      if (failure) throw failure;
      assert.ok(buffer.length >= n, `Timed out reading ${n} VNC bytes`);
      const result = buffer.subarray(0, n); buffer = buffer.subarray(n); return result;
    };
    assert.match((await read(12)).toString(), /^RFB 003/);
    ws.send('RFB 003.008\n');
    const securityCount = (await read(1))[0]; assert.ok((await read(securityCount)).includes(1));
    ws.send(Buffer.from([1])); assert.equal((await read(4)).readUInt32BE(), 0);
    ws.send(Buffer.from([1])); const init = await read(24); await read(init.readUInt32BE(20));
    assert.equal(init.readUInt16BE(0), 1280); assert.equal(init.readUInt16BE(2), 720);
    ws.send(Buffer.from([3, 0, 0, 0, 0, 0, 0, 16, 0, 16]));
    const frame = await read(4); assert.equal(frame[0], 0); assert.ok(frame.readUInt16BE(2) > 0);
    console.log('RDP_TLS_CUSTOM_RESOLUTION_AUDIO_OPTION_AND_VNC_FRAMEBUFFER_PASSED');
    ws.close(); service.stop(session.id);
    assert.equal(service.list().length, 0); assert.equal(bridge.list().length, 0);
    console.log('RDP_VNC_CLEANUP_PASSED');
    // The first connection asked the user to confirm the certificate.
    assert.equal(prompts.length, 1); assert.equal(prompts[0].payload.kind, 'rdp'); assert.equal(prompts[0].payload.changed, false);
    console.log('RDP_FIRST_CONNECTION_CERTIFICATE_CONFIRMED');
    // A remembered certificate connects without asking again.
    const again = await service.start({ id: 'again', name: 'Fixture RDP', protocol: 'rdp', host: '127.0.0.1', port, username: 'fixture', credentialId: 'test' });
    assert.equal(prompts.length, 1); service.stop(again.id);
    // Pretend a different certificate was trusted before: the user is warned
    // that it changed, and rejecting it starts nothing.
    knownHostService.store.update((data) => { data.hosts[`rdp:127.0.0.1:${port}`].fingerprintHex = '00'.repeat(32); return data; });
    answer = { accept: false };
    await assert.rejects(() => service.start({ id: 'changed', name: 'Changed certificate', protocol: 'rdp', host: '127.0.0.1', port, username: 'fixture', credentialId: 'test' }), /not trusted/u);
    assert.equal(prompts.length, 2); assert.equal(prompts[1].payload.changed, true);
    assert.equal(service.list().length, 0, 'A changed certificate must not leave a connected RDP session');
    // FreeRDP itself is pinned: a fingerprint other than the server's is refused.
    service.rdpCertificateArgs = async () => ['/cert:deny,fingerprint:sha256:' + Array(32).fill('00').join(':'), '-sec-rdp'];
    try { await service.start({ id: 'pinned', name: 'Pinned', protocol: 'rdp', host: '127.0.0.1', port, username: 'fixture', credentialId: 'test' }); }
    catch (error) { assert.match(error.message, /closed|exited/); }
    await delay(2000);
    assert.equal(service.list().length, 0, 'FreeRDP must refuse a certificate that does not match the pin');
    console.log('RDP_CHANGED_CERTIFICATE_REJECTED');
  } finally {
    ws?.terminate(); service.stopAll(); bridge.stopAll(); shadow.kill('SIGTERM');
    await delay(1000); fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
