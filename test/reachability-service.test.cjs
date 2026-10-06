'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { ReachabilityService } = require('../src/main/services/reachability-service.cjs');

test('reports reachable and unreachable TCP endpoints', async () => {
  const server = net.createServer((socket) => socket.end());
  const listening = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(true))).catch(() => false);
  if (!listening) { return; }
  const port = server.address().port;
  try {
    const service = new ReachabilityService({ timeout: 800 });
    const results = await service.check([
      { id: 'open', host: '127.0.0.1', port },
      { id: 'closed', host: '127.0.0.1', port: 1 },
      { id: 'invalid', host: '', port: 22 }
    ]);
    const byId = new Map(results.map((r) => [r.id, r]));
    assert.equal(byId.get('open').reachable, true);
    assert.ok(byId.get('open').latencyMs >= 0);
    assert.equal(byId.get('closed').reachable, false);
    assert.equal(byId.get('closed').latencyMs, null);
    assert.ok(byId.get('open').checkedAt);
    // Malformed targets are filtered out entirely.
    assert.equal(byId.has('invalid'), false);
  } finally {
    server.close();
  }
});

test('handles an empty or non-array target list', async () => {
  const service = new ReachabilityService();
  assert.deepEqual(await service.check([]), []);
  assert.deepEqual(await service.check(null), []);
  assert.deepEqual(await service.check(undefined), []);
});

test('unreachable hosts resolve to a false result rather than throwing', async () => {
  const service = new ReachabilityService({ timeout: 700 });
  const results = await service.check([{ id: 'blackhole', host: '10.255.255.1', port: 9 }]);
  assert.equal(results.length, 1);
  assert.equal(results[0].reachable, false);
  assert.ok(results[0].error);
});


test('proxy routes and resolution errors are unknown, never direct offline results', async () => {
  let resolutions = 0;
  const service = new ReachabilityService({ resolveSsh: async (profile) => {
    resolutions += 1;
    if (profile.id === 'bad') throw new Error('invalid config');
    return { hostname: ['127.0.0.1'], port: ['1'], proxycommand: ['relay %h %p'] };
  } });
  const results = await service.check([
    { id: 'jump', protocol: 'ssh', host: '127.0.0.1', port: 1, proxyJump: 'bastion' },
    { id: 'command', protocol: 'ssh', host: '127.0.0.1', port: 1, sshAlias: 'relay' },
    { id: 'bad', protocol: 'ssh', host: '127.0.0.1', port: 1, sshAlias: 'bad' }
  ]);
  assert.equal(resolutions, 2);
  for (const result of results) {
    assert.equal(result.reachable, null);
    assert.equal(result.latencyMs, null);
    assert.ok(result.error);
  }
});

test('direct SSH aliases probe the effective hostname and port', async () => {
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new ReachabilityService({ resolveSsh: async () => ({ hostname: ['127.0.0.1'], port: [String(server.address().port)] }) });
    const [result] = await service.check([{ id: 'alias', protocol: 'ssh', host: 'outdated.invalid', port: 1, sshAlias: 'current' }]);
    assert.equal(result.reachable, true);
  } finally { server.close(); }
});
