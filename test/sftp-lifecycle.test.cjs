'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { compileFunction } = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const servicePath = path.resolve(__dirname, '../src/main/services/sftp-service.cjs');
const realRequire = createRequire(servicePath);
const source = fs.readFileSync(servicePath, 'utf8');
const turn = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function observe(promise) {
  const result = { state: 'pending' };
  // Attach rejection handling immediately, including when the test fails early.
  result.done = promise.then(
    (value) => { result.state = 'fulfilled'; result.value = value; },
    (error) => { result.state = 'rejected'; result.error = error; }
  );
  return result;
}
function rejected(result) {
  assert.equal(result.state, 'rejected', 'disconnect must reject without waiting for external setup completion');
  assert.ok(result.error instanceof Error);
}
function channel() {
  return { closed: false, end() { this.closed = true; }, destroy() { this.closed = true; } };
}

function fixture(t, options = {}) {
  const clients = [], children = [], timers = new Map(), events = [];
  class Client extends EventEmitter {
    constructor() {
      super();
      this.connectCalls = 0;
      this.sftpCalls = 0;
      this.closed = false;
      clients.push(this);
    }
    connect(config) { this.connectCalls += 1; this.config = config; return this; }
    sftp(callback) { this.sftpCalls += 1; this.sftpCallback = callback; }
    // Closing a transport need not synchronously emit 'close'. Cancellation
    // must invalidate the holder itself, not depend on that later notification.
    end() { this.closed = true; }
    destroy() { this.closed = true; }
  }
  function spawn() {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => { child.killed = true; return true; };
    children.push(child);
    return child;
  }
  // Execute the unchanged production CommonJS source with local dependency and
  // clock injection. No global mocks, require-cache changes, real SSH or timers.
  const module = { exports: {} };
  const load = compileFunction(source, [
    'require', 'module', 'exports', '__filename', '__dirname', 'setTimeout', 'clearTimeout'
  ], { filename: servicePath });
  load((name) => {
    if (name === 'ssh2') return { Client };
    if (name === 'node:child_process') return { ...realRequire(name), spawn };
    if (name === '../lib/executable-finder.cjs') return { findExecutable: (names) => `/mock/${names[0]}` };
    return realRequire(name);
  }, module, module.exports, servicePath, path.dirname(servicePath), (callback, delay) => {
    const timer = { unref() {} };
    timers.set(timer, { callback, delay });
    return timer;
  }, (timer) => timers.delete(timer));
  const service = new module.exports.SftpService(
    options.vault || { has: () => false },
    { verify: options.verify || (async () => true) },
    { request: options.request || (async () => ({ answers: ['answer'] })) },
    () => ({ isDestroyed: () => false, webContents: { send: (...args) => events.push(args) } })
  );
  const profile = {
    id: 'sftp-lifecycle', name: 'Lifecycle', protocol: 'ssh', host: 'server.example',
    port: 22, username: 'tester', ...options.profile
  };
  t.after(() => {
    service.disconnectAll();
    for (const client of clients) { client.destroy(); client.removeAllListeners(); }
    for (const child of children) {
      child.kill();
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      child.removeAllListeners();
    }
    timers.clear();
  });
  return { service, profile, clients, children, timers, events };
}
async function ready(client) {
  client.emit('ready');
  await turn();
  assert.equal(client.sftpCalls, 1);
  const sftp = channel();
  client.sftpCallback(null, sftp);
  await turn();
  return sftp;
}
async function replacement(f, profile = f.profile) {
  const operation = observe(f.service.connect(profile));
  await turn();
  const client = f.clients.at(-1);
  const sftp = await ready(client);
  assert.equal(operation.state, 'fulfilled');
  assert.equal(operation.value.sftp, sftp);
  return { holder: operation.value, client, sftp };
}
function remainsUsable(f, current) {
  assert.equal(f.service.connections.get(f.profile.id), current.holder);
  assert.equal(current.holder.ready, true);
  assert.equal(current.client.closed, false);
  assert.equal(current.sftp.closed, false);
}

for (const proxyJump of ['', 'jump.example']) {
  test(`disconnect rejects deferred vault setup promptly (proxy: ${Boolean(proxyJump)})`, async (t) => {
    const vault = deferred();
    const f = fixture(t, {
      vault: { has: () => true, get: () => vault.promise },
      profile: { credentialId: 'secret', proxyJump }
    });
    const operation = observe(f.service.connect(f.profile));
    await turn();
    const holder = f.service.connections.get(f.profile.id);
    assert.ok(holder);
    assert.equal(operation.state, 'pending');
    assert.equal(f.service.disconnect(f.profile.id), true);
    await turn();
    rejected(operation);
    assert.equal(holder.ready, false);
    assert.equal(f.service.connections.size, 0);
    assert.equal(f.clients[0].closed, true);
    assert.equal(f.timers.size, 0);
    if (proxyJump) {
      assert.equal(holder.proxy.socket.destroyed, true);
      assert.equal(f.children[0].killed, true);
    }
  });

  test(`late vault resolution cannot open a disconnected transport (proxy: ${Boolean(proxyJump)})`, async (t) => {
    const vault = deferred();
    const f = fixture(t, {
      vault: { has: () => true, get: () => vault.promise },
      profile: { credentialId: 'secret', proxyJump }
    });
    const operation = observe(f.service.connect(f.profile));
    await turn();
    const holder = f.service.connections.get(f.profile.id);
    f.service.disconnect(f.profile.id);
    vault.resolve('password');
    await turn();
    assert.equal(f.clients.reduce((sum, client) => sum + client.connectCalls, 0), 0);
    rejected(operation);
    assert.equal(holder.ready, false);
    assert.ok(!holder.sftp, 'cancelled holder must not own a live SFTP channel');
    assert.equal(f.service.connections.size, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.clients[0].closed, true);
    if (proxyJump) {
      assert.equal(holder.proxy.socket.destroyed, true);
      assert.equal(f.children[0].killed, true);
    }
  });
}

test('late vault rejection cannot remove a same-ID replacement', async (t) => {
  const vault = deferred();
  const f = fixture(t, { vault: { has: () => true, get: () => vault.promise } });
  const old = observe(f.service.connect({ ...f.profile, credentialId: 'secret' }));
  await turn();
  f.service.disconnect(f.profile.id);
  const current = await replacement(f);
  vault.reject(new Error('late vault failure'));
  await turn();
  rejected(old);
  remainsUsable(f, current);
  assert.equal(await f.service.connect(f.profile), current.holder);
});

test('handshake cancellation clears setup and ignores late ready/error/close after replacement', async (t) => {
  const f = fixture(t);
  const old = observe(f.service.connect(f.profile));
  await turn();
  const oldHolder = f.service.connections.get(f.profile.id);
  const client = f.clients[0];
  assert.equal(client.connectCalls, 1);
  assert.ok(f.timers.size > 0, 'fixture reached the handshake');
  f.service.disconnect(f.profile.id);
  await turn();
  rejected(old);
  assert.equal(f.timers.size, 0);
  assert.equal(client.listenerCount('ready'), 0);
  assert.equal(client.listenerCount('keyboard-interactive'), 0);
  assert.equal(client.closed, true);
  const current = await replacement(f);
  client.emit('ready');
  client.emit('error', new Error('late handshake error'));
  client.emit('close');
  await turn();
  assert.equal(client.sftpCalls, 0);
  assert.equal(oldHolder.ready, false);
  remainsUsable(f, current);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.events, []);
});

for (const lateError of [false, true]) {
  test(`SFTP callback after disconnect cannot revive or evict a replacement (error: ${lateError})`, async (t) => {
    const f = fixture(t);
    const old = observe(f.service.connect(f.profile));
    await turn();
    const oldHolder = f.service.connections.get(f.profile.id);
    const client = f.clients[0];
    client.emit('ready');
    await turn();
    assert.equal(client.sftpCalls, 1);
    f.service.disconnect(f.profile.id);
    await turn();
    rejected(old);
    const current = await replacement(f);
    const lateChannel = channel();
    client.sftpCallback(lateError ? new Error('late SFTP failure') : null, lateError ? undefined : lateChannel);
    client.emit('error', new Error('late transport error'));
    client.emit('close');
    await turn();
    if (!lateError) assert.equal(lateChannel.closed, true, 'late owned channel must be closed');
    assert.equal(oldHolder.ready, false);
    rejected(old);
    remainsUsable(f, current);
    assert.equal(await f.service.connect(f.profile), current.holder);
    assert.equal(f.timers.size, 0);
    assert.deepEqual(f.events, []);
  });
}

for (const kind of ['host-key', 'keyboard-interactive']) {
  test(`late ${kind} prompt completion cannot answer or rearm cancelled setup`, async (t) => {
    const prompt = deferred();
    const f = fixture(t, { verify: () => prompt.promise, request: () => prompt.promise });
    const old = observe(f.service.connect(f.profile));
    await turn();
    const client = f.clients[0];
    const answers = [];
    if (kind === 'host-key') client.config.hostVerifier('fingerprint', (answer) => answers.push(answer));
    else client.emit('keyboard-interactive', 'name', '', '', [{ prompt: 'Password:', echo: false }], (answer) => answers.push(answer));
    assert.equal(f.timers.size, 0, 'handshake deadline is paused during prompt');
    f.service.disconnect(f.profile.id);
    await turn();
    rejected(old);
    const current = await replacement(f);
    prompt.resolve(kind === 'host-key' ? true : { answers: ['password'] });
    await turn();
    assert.deepEqual(answers, [], 'cancelled SSH callbacks must not receive late answers');
    assert.equal(f.timers.size, 0, 'prompt finally must not rearm a cancelled handshake');
    assert.equal(client.listenerCount('keyboard-interactive'), 0);
    remainsUsable(f, current);
  });
}

test('identical pending connections share vault setup, transport and ready holder', async (t) => {
  const vault = deferred();
  let reads = 0;
  const f = fixture(t, {
    vault: { has: () => true, get: () => { reads += 1; return vault.promise; } },
    profile: { credentialId: 'secret' }
  });
  const first = observe(f.service.connect(f.profile));
  const second = observe(f.service.connect({ ...f.profile }));
  await turn();
  assert.equal(reads, 1);
  assert.equal(f.clients.length, 1);
  vault.resolve('password');
  await turn();
  const third = observe(f.service.connect(f.profile));
  assert.equal(f.clients[0].connectCalls, 1);
  const sftp = await ready(f.clients[0]);
  for (const operation of [first, second, third]) {
    assert.equal(operation.state, 'fulfilled');
    assert.equal(operation.value, first.value);
  }
  assert.equal(await f.service.connect(f.profile), first.value);
  assert.equal(f.timers.size, 0);
  f.service.disconnectAll();
  assert.equal(sftp.closed, true);
  assert.equal(f.clients[0].closed, true);
  assert.equal(f.service.connections.size, 0);
});

for (const pending of [true, false]) {
  test(`changed profile replaces ${pending ? 'pending' : 'ready'} transport and remains usable`, async (t) => {
    const f = fixture(t);
    const old = observe(f.service.connect(f.profile));
    await turn();
    const client = f.clients[0];
    const oldChannel = pending ? null : await ready(client);
    const changed = { ...f.profile, host: 'replacement.example' };
    const current = await replacement(f, changed);
    if (pending) rejected(old);
    else assert.equal(oldChannel.closed, true);
    assert.equal(client.closed, true);
    client.emit('ready');
    client.emit('error', new Error('old profile transport error'));
    client.emit('close');
    await turn();
    remainsUsable(f, current);
    assert.equal(current.client.config.host, changed.host);
    assert.equal(await f.service.connect(changed), current.holder);
    assert.equal(f.clients.length, 2);
    assert.equal(f.timers.size, 0);
  });
}

// 'ready' settles a promise synchronously, but its continuation runs later.
// Disconnect in that gap must prevent acquiring an SFTP channel altogether.
test('disconnect between ready and its continuation prevents SFTP setup', async (t) => {
  const f = fixture(t);
  const old = observe(f.service.connect(f.profile));
  await turn();
  const holder = f.service.connections.get(f.profile.id);
  const client = f.clients[0];
  client.emit('ready');
  f.service.disconnect(f.profile.id);
  await turn();
  rejected(old);
  assert.equal(client.sftpCalls, 0);
  assert.equal(holder.ready, false);
  assert.equal(f.service.connections.size, 0);
  assert.equal(f.timers.size, 0);
});

// SFTP success also settles a promise before its continuation can publish the
// channel. A callback-only cancellation check misses disconnect in this gap.
for (const reconnect of [false, true]) {
  test(`disconnect between SFTP callback and its continuation cancels the acquired channel (replacement: ${reconnect})`, async (t) => {
    const f = fixture(t, { profile: { proxyJump: 'jump.example' } });
    const old = observe(f.service.connect(f.profile));
    await turn();
    const holder = f.service.connections.get(f.profile.id);
    const client = f.clients[0];
    client.emit('ready');
    await turn();
    assert.equal(client.sftpCalls, 1);
    assert.equal(old.state, 'pending');
    assert.equal(holder.ready, false);
    const acquiredChannel = channel();
    // Also close the test-owned channel when the unfixed implementation leaks it.
    t.after(() => acquiredChannel.destroy());

    client.sftpCallback(null, acquiredChannel);
    // Deliberately no await: cancel after callback success, before its continuation.
    assert.equal(f.service.disconnect(f.profile.id), true);
    assert.equal(f.service.connections.size, 0);
    // Install the replacement before yielding too, so old settlement/cleanup
    // cannot silently remove a newer same-ID holder.
    const next = reconnect ? observe(f.service.connect(f.profile)) : null;
    const nextHolder = f.service.connections.get(f.profile.id);
    if (reconnect) assert.ok(nextHolder && nextHolder !== holder);
    await turn();

    rejected(old);
    assert.equal(holder.ready, false);
    assert.equal(acquiredChannel.closed, true, 'channel acquired before cancellation must be closed');
    assert.equal(client.closed, true);
    assert.equal(holder.proxy.socket.destroyed, true);
    assert.equal(f.children[0].killed, true);
    assert.equal(client.listenerCount('ready'), 0);
    assert.equal(client.listenerCount('keyboard-interactive'), 0);
    let current;
    if (reconnect) {
      assert.equal(f.service.connections.get(f.profile.id), nextHolder);
      const nextClient = f.clients[1];
      const nextChannel = await ready(nextClient);
      assert.equal(next.state, 'fulfilled');
      assert.equal(next.value, nextHolder);
      current = { holder: nextHolder, client: nextClient, sftp: nextChannel };
      remainsUsable(f, current);
    }
    client.emit('ready');
    client.emit('error', new Error('old transport error after SFTP success'));
    client.emit('close');
    await turn();
    rejected(old);
    assert.equal(holder.ready, false);
    assert.equal(client.sftpCalls, 1, 'late ready must not acquire another channel');
    if (reconnect) {
      remainsUsable(f, current);
      assert.equal(await f.service.connect(f.profile), current.holder);
    } else {
      assert.equal(f.service.connections.size, 0);
    }
    assert.equal(f.timers.size, 0);
    assert.deepEqual(f.events, []);
  });
}

test('disconnect rejects every caller sharing deferred setup', async (t) => {
  const vault = deferred();
  const f = fixture(t, {
    vault: { has: () => true, get: () => vault.promise },
    profile: { credentialId: 'secret' }
  });
  const first = observe(f.service.connect(f.profile));
  const second = observe(f.service.connect({ ...f.profile }));
  await turn();
  assert.equal(f.clients.length, 1);
  f.service.disconnect(f.profile.id);
  await turn();
  rejected(first);
  rejected(second);
  vault.resolve('password');
  await turn();
  assert.equal(f.clients[0].connectCalls, 0);
  assert.equal(f.service.connections.size, 0);
  assert.equal(f.timers.size, 0);
});
