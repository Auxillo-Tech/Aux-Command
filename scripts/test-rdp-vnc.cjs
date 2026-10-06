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
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-rdp-integration-'));
  process.env.XDG_CONFIG_HOME = directory;
  const listener = net.createServer(); await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  const shadow = spawn('freerdp-shadow-cli', [`/port:${port}`, '/bind-address:127.0.0.1', '-auth', '/sec:tls']);
  let shadowLog = ''; for (const pipe of [shadow.stdout, shadow.stderr]) pipe.on('data', (chunk) => { shadowLog = (shadowLog + chunk).slice(-8000); });
  const bridge = new VncBridgeService();
  const service = new RdpEmbedService({ vncBridge: bridge, vaultService: { has: () => true, get: async () => 'test-only-password' } });
  let ws;
  try {
    await delay(1500);
    assert.equal(shadow.exitCode, null, shadowLog);
    const session = await service.start({ id: 'fixture', name: 'Fixture RDP', protocol: 'rdp', host: '127.0.0.1', port, username: 'fixture', credentialId: 'test' });
    await delay(2000);
    assert.equal(service.list().length, 1, `RDP client exited: ${shadowLog}`);
    const desktop = service.list()[0];
    const windows = spawnSync('xwininfo', ['-display', `:${desktop.display}`, '-root', '-tree'], { encoding: 'utf8' });
    assert.match(windows.stdout, /FreeRDP/, 'RDP must have a rendered client window');
    ws = new WebSocket(new URLSearchParams(session.vncUrl.split('?')[1]).get('url'), { origin: 'file://' });
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
    assert.equal(init.readUInt16BE(0), 1600); assert.equal(init.readUInt16BE(2), 900);
    ws.send(Buffer.from([3, 0, 0, 0, 0, 0, 0, 16, 0, 16]));
    const frame = await read(4); assert.equal(frame[0], 0); assert.ok(frame.readUInt16BE(2) > 0);
    console.log('RDP_TLS_CONNECTION_AND_VNC_FRAMEBUFFER_PASSED');
    ws.close(); service.stop(session.id);
    assert.equal(service.list().length, 0); assert.equal(bridge.list().length, 0);
    console.log('RDP_VNC_CLEANUP_PASSED');
    const findTrust = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? findTrust(path.join(dir, entry.name)) : entry.name === 'known_hosts2' ? [path.join(dir, entry.name)] : []);
    const trust = findTrust(directory); assert.equal(trust.length, 1, 'TOFU should persist the accepted certificate');
    const original = fs.readFileSync(trust[0], 'utf8');
    const changed = original.replace(/(?:[0-9a-f]{2}:){19,31}[0-9a-f]{2}/gi, (value) => value.replace(/[0-9a-f]/gi, '0'));
    assert.notEqual(changed, original); fs.writeFileSync(trust[0], changed);
    try { await service.start({ id: 'changed', name: 'Changed certificate', protocol: 'rdp', host: '127.0.0.1', port, username: 'fixture', credentialId: 'test' }); }
    catch (error) { assert.match(error.message, /closed|exited/); }
    await delay(2000);
    assert.equal(service.list().length, 0, 'A changed certificate must not leave a connected RDP session');
    console.log('RDP_CHANGED_CERTIFICATE_REJECTED');
  } finally {
    ws?.terminate(); service.stopAll(); bridge.stopAll(); shadow.kill('SIGTERM');
    await delay(1000); fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
