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
