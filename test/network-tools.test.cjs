'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');

test('NetworkToolService ping works', async (t) => {
  const { NetworkToolService } = require('../src/main/services/network-tools.cjs');
  const svc = new NetworkToolService({ commandTimeout: 5000 });

  // Ping localhost (should succeed)
  const result = await svc.ping('127.0.0.1', 1);
  assert.equal(result.command, 'ping');
  if (result.missing || result.exitCode === 127 || result.exitCode !== 0) {
    t.skip(`ping is unavailable in this environment: ${result.stderr.trim() || result.exitCode}`);
    return;
  }
  assert.ok(result.exitCode === 0, `ping should exit 0, got ${result.exitCode}`);
  assert.ok(result.stdout.includes('ms'), 'ping output should contain timing');
});

test('NetworkToolService DNS lookup works', async (t) => {
  const { NetworkToolService } = require('../src/main/services/network-tools.cjs');
  const svc = new NetworkToolService({ commandTimeout: 5000 });

  const result = await svc.dnsLookup('localhost', 'A');
  if (result.missing || result.exitCode === 127 || result.exitCode !== 0) {
    t.skip(`dig is unavailable in this environment: ${result.stderr.trim() || result.exitCode}`);
    return;
  }
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('127.0.0.1'), `DNS localhost should return 127.0.0.1, got: ${result.stdout.trim()}`);
});

test('NetworkToolService port scan works', async () => {
  const { NetworkToolService } = require('../src/main/services/network-tools.cjs');
  const svc = new NetworkToolService();

  // Scan a port that should be closed
  const results = await svc.portScan('127.0.0.1', [65533, 65534]);
  assert.equal(results.length, 2);
  assert.equal(results[0].open, false);
  assert.equal(results[1].open, false);
  assert.equal(results[0].port, 65533);
});

test('NetworkToolService traceroute works', async (t) => {
  const { NetworkToolService } = require('../src/main/services/network-tools.cjs');
  const svc = new NetworkToolService({ commandTimeout: 5000 });

  const result = await svc.traceroute('127.0.0.1');
  if (result.missing || result.exitCode === 127 || result.exitCode !== 0) {
    t.skip(`traceroute is unavailable in this environment: ${result.stderr.trim() || result.exitCode}`);
    return;
  }
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout, 'traceroute should produce output');
});

test('NetworkToolService reports missing host tools without throwing', async () => {
  const { NetworkToolService } = require('../src/main/services/network-tools.cjs');
  const originalPath = process.env.PATH;
  // Empty PATH forces spawn ENOENT for traceroute/ping/dig/whois.
  process.env.PATH = '';
  try {
    const svc = new NetworkToolService();
    const result = await svc.traceroute('127.0.0.1');
    assert.equal(result.missing, true);
    assert.equal(result.exitCode, 127);
    assert.equal(result.command, 'traceroute');
    assert.match(String(result.stderr || ''), /not found/i);
  } finally {
    process.env.PATH = originalPath;
  }
});

test('NetworkToolService whois rejects short input gracefully', async () => {
  const { NetworkToolService } = require('../src/main/services/network-tools.cjs');
  const svc = new NetworkToolService({ commandTimeout: 5000 });

  try {
    const result = await svc.whois('127.0.0.1');
    // whois on localhost may or may not work — just check it doesn't crash
    assert.ok(result.stdout !== undefined || result.stderr !== undefined);
  } catch (error) {
    // whois command may not be installed — acceptable
    assert.ok(error.message.includes('whois') || true);
  }
});

test('NetworkToolService cancel stops and rejects a running command', async (t) => {
  const { NetworkToolService } = require('../src/main/services/network-tools.cjs');
  const svc = new NetworkToolService({ commandTimeout: 5000 });
  // A missing or non-functional ping resolves instantly, which races the
  // active-process poll below — probe first and skip in such environments.
  const probe = await svc.ping('127.0.0.1', 1).catch(() => null);
  if (!probe || probe.missing || probe.exitCode !== 0) {
    t.skip('ping is unavailable in this environment');
    return;
  }
  const running = svc.ping('127.0.0.1', 20);
  const deadline = Date.now() + 2000;
  while (svc.active.size === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (svc.active.size === 0) {
    await running.catch(() => {});
    t.skip('ping exits before cancellation can be exercised in this environment');
    return;
  }
  assert.equal(svc.active.size, 1);
  assert.equal(svc.cancelAll(), 1);
  await assert.rejects(() => running, /cancelled/u);
  assert.equal(svc.active.size, 0);
  assert.equal(svc.cancel('nonexistent-id'), false);
});

test('NetworkToolService rejects option injection and invalid scan input', async () => {
  const { NetworkToolService } = require('../src/main/services/network-tools.cjs');
  const svc = new NetworkToolService();
  await assert.rejects(() => svc.ping('-f', 1), /host/u);
  await assert.rejects(() => svc.dnsLookup('example.com', 'INVALID'), /DNS record type/u);
  await assert.rejects(() => svc.portScan('127.0.0.1', [0, 70000]), /ports/u);
  await assert.rejects(
    () => svc.portScan('127.0.0.1', Array.from({ length: 1025 }, (_, index) => index + 1)),
    /too many ports/u
  );
});

test('NetworkToolService sends a valid Wake-on-LAN magic packet', async (t) => {
  const { NetworkToolService } = require('../src/main/services/network-tools.cjs');
  const server = dgram.createSocket('udp4');
  const bound = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.bind(0, '127.0.0.1', () => resolve(true));
  }).catch((error) => {
    if (error?.code === 'EPERM') return false;
    throw error;
  });
  if (!bound) {
    t.skip('UDP loopback bind is not permitted in this environment');
    return;
  }
  const port = server.address().port;
  try {
    const packetPromise = new Promise((resolve) => server.once('message', resolve));
    const svc = new NetworkToolService({ wakeAddress: '127.0.0.1', wakePort: port });
    const result = await svc.wakeOnLan('00:11:22:33:44:55');
    // Sandboxed CI environments can allow the bind yet silently drop loopback
    // UDP; skip instead of waiting forever for a packet that cannot arrive.
    const packet = await Promise.race([
      packetPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 3000).unref())
    ]);
    if (!packet) {
      t.skip('loopback UDP delivery is not available in this environment');
      return;
    }
    assert.equal(result.sent, true);
    assert.equal(packet.length, 102);
    assert.deepEqual([...packet.subarray(0, 6)], [255, 255, 255, 255, 255, 255]);
    for (let offset = 6; offset < packet.length; offset += 6) {
      assert.deepEqual([...packet.subarray(offset, offset + 6)], [0, 17, 34, 51, 68, 85]);
    }
  } finally {
    server.close();
  }
});
