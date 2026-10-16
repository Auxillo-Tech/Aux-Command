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
// External setup can synchronously call back into the service too. The holder
// and its shared rejection path must exist before vault.get starts.
test('disconnect re-entered from vault setup cancels the registered holder', async (t) => {
  const vault = deferred();
  let disconnected;
  const f = fixture(t, {
    vault: {
      has: () => true,
      get: () => {
        disconnected = f.service.disconnect(f.profile.id);
        return vault.promise;
      }
    },
    profile: { credentialId: 'secret', proxyJump: 'jump.example' }
  });
  const operation = observe(f.service.connect(f.profile));
  await turn();
  assert.equal(disconnected, true);
  rejected(operation);
  vault.resolve('password');
  await turn();
  assert.equal(f.clients[0].connectCalls, 0);
  assert.equal(f.clients[0].closed, true);
  assert.equal(f.children[0].killed, true);
  assert.equal(f.service.connections.size, 0);
  assert.equal(f.timers.size, 0);
});

for (const phase of ['vault', 'handshake', 'sftp']) {
  for (const event of ['error', 'close']) {
    test(`${event} during ${phase} settles setup and releases its resources`, async (t) => {
      const vault = deferred();
      const f = fixture(t, {
        vault: { has: () => true, get: () => vault.promise },
        profile: { credentialId: 'secret', proxyJump: 'jump.example' }
      });
      const operation = observe(f.service.connect(f.profile));
      await turn();
      const holder = f.service.connections.get(f.profile.id);
      const client = f.clients[0];
      if (phase !== 'vault') { vault.resolve('password'); await turn(); }
      if (phase === 'sftp') { client.emit('ready'); await turn(); }
      client.emit(event, event === 'error' ? new Error('transport failed') : undefined);
      await turn();
      rejected(operation);
      assert.equal(holder.ready, false);
      assert.equal(client.closed, true);
      assert.equal(holder.proxy.socket.destroyed, true);
      assert.equal(f.children[0].killed, true);
      assert.equal(f.timers.size, 0);
      assert.equal(client.listenerCount('ready'), 0);
      assert.equal(client.listenerCount('keyboard-interactive'), 0);
      vault.resolve('late password');
      if (phase === 'sftp') {
        const late = channel();
        client.sftpCallback(null, late);
        assert.equal(late.closed, true);
      }
      client.emit('ready');
      client.emit('error', new Error('late transport failure'));
      await turn();
      assert.equal(client.connectCalls, phase === 'vault' ? 0 : 1);
      assert.equal(f.service.connections.size, 0);
      assert.deepEqual(f.events, []);
    });
  }
}

test('handshake timeout rejects all waiters and ignores a late ready', async (t) => {
  const f = fixture(t, { profile: { proxyJump: 'jump.example' } });
  const first = observe(f.service.connect(f.profile));
  const second = observe(f.service.connect(f.profile));
  await turn();
  const holder = f.service.connections.get(f.profile.id);
  assert.equal(f.timers.size, 1);
  const [{ callback }] = f.timers.values();
  callback();
  await turn();
  rejected(first);
  rejected(second);
  assert.match(first.error.message, /timed out.*handshake/i);
  assert.equal(first.error, second.error);
  assert.equal(f.clients[0].closed, true);
  assert.equal(holder.proxy.socket.destroyed, true);
  assert.equal(f.children[0].killed, true);
  f.clients[0].emit('ready');
  await turn();
  assert.equal(f.clients[0].sftpCalls, 0);
  assert.equal(f.clients[0].listenerCount('keyboard-interactive'), 0);
  assert.equal(f.service.connections.size, 0);
  assert.equal(f.timers.size, 0);
});

for (const kind of ['host-key', 'keyboard-interactive']) {
  for (const fails of [false, true]) {
    test(`${kind} prompt ${fails ? 'failure' : 'success'} resumes the uncancelled handshake timer`, async (t) => {
      const prompt = deferred();
      const f = fixture(t, { verify: () => prompt.promise, request: () => prompt.promise });
      const operation = observe(f.service.connect(f.profile));
      await turn();
      const client = f.clients[0];
      const answers = [];
      if (kind === 'host-key') client.config.hostVerifier('fingerprint', (answer) => answers.push(answer));
      else client.emit('keyboard-interactive', 'name', '', '', [{ prompt: 'Password:', echo: false }], (answer) => answers.push(answer));
      assert.equal(f.timers.size, 0);
      if (fails) prompt.reject(new Error('prompt failed'));
      else prompt.resolve(kind === 'host-key' ? true : { answers: ['password'] });
      await turn();
      assert.deepEqual(answers, kind === 'host-key' ? [!fails] : [fails ? [] : ['password']]);
      assert.equal(f.timers.size, 1);
      // The fake server allows retrying authentication after a rejected prompt.
      await ready(client);
      assert.equal(operation.state, 'fulfilled');
      assert.equal(f.timers.size, 0);
      assert.equal(client.listenerCount('keyboard-interactive'), 0);
    });

    test(`cancelled ${kind} prompt ${fails ? 'rejection' : 'resolution'} cannot rearm setup`, async (t) => {
      const prompt = deferred();
      const f = fixture(t, { verify: () => prompt.promise, request: () => prompt.promise });
      const operation = observe(f.service.connect(f.profile));
      await turn();
      const client = f.clients[0];
      const answers = [];
      if (kind === 'host-key') client.config.hostVerifier('fingerprint', (answer) => answers.push(answer));
      else client.emit('keyboard-interactive', 'name', '', '', [{ prompt: 'Password:', echo: false }], (answer) => answers.push(answer));
      f.service.disconnectAll();
      if (fails) prompt.reject(new Error('late prompt failure'));
      else prompt.resolve(kind === 'host-key' ? true : { answers: ['password'] });
      await turn();
      rejected(operation);
      assert.deepEqual(answers, []);
      assert.equal(f.timers.size, 0);
      assert.equal(client.listenerCount('ready'), 0);
      assert.equal(client.listenerCount('keyboard-interactive'), 0);
      assert.equal(f.service.connections.size, 0);
    });
  }
}

test('disconnect before the final connect continuation rejects its callers', async (t) => {
  const f = fixture(t);
  const first = observe(f.service.connect(f.profile));
  const second = observe(f.service.connect(f.profile));
  await turn();
  const client = f.clients[0];
  client.emit('ready');
  await turn();
  const sftp = channel();
  client.sftpCallback(null, sftp);
  // Let setup finish and settle the shared promise, but disconnect before the
  // async connect wrappers resume. They must recheck cancellation as well.
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(first.state, 'pending');
  assert.equal(second.state, 'pending');
  f.service.disconnect(f.profile.id);
  await turn();
  rejected(first);
  rejected(second);
  assert.equal(sftp.closed, true);
  assert.equal(client.closed, true);
  assert.equal(f.service.connections.size, 0);
});
