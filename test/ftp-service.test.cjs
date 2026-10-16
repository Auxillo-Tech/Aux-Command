'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ftp = require('basic-ftp');
const { FtpService, replaceFtpRemoteFile } = require('../src/main/services/ftp-service.cjs');

for (const rollbackFails of [false, true]) test(`FTP replacement preserves original when replacement fails (rollback failure: ${rollbackFails})`, async () => {
  const files = new Map([['target', 'original'], ['partial', 'replacement']]);
  const client = {
    async rename(from, to) {
      if (from === 'partial' || (rollbackFails && from.includes('aux-backup'))) throw new Error('Server refused rename');
      files.set(to, files.get(from)); files.delete(from);
    },
    async remove(name) { files.delete(name); }
  };
  await assert.rejects(() => replaceFtpRemoteFile(client, 'partial', 'target'), rollbackFails ? /Original file is preserved at target.aux-backup/ : /refused rename/);
  assert.equal([...files.values()].includes('original'), true);
  if (!rollbackFails) assert.equal(files.get('target'), 'original');
});

test('FTP servers that reject overwrite can replace through a recoverable backup', async () => {
  const files = new Map([['target', 'original'], ['partial', 'replacement']]);
  const client = {
    async rename(from, to) {
      if (files.has(to)) throw new Error('Target exists');
      files.set(to, files.get(from)); files.delete(from);
    },
    async remove(name) { files.delete(name); }
  };
  await replaceFtpRemoteFile(client, 'partial', 'target');
  assert.deepEqual([...files], [['target', 'replacement']]);
});

function fixture(t) {
  t.mock.method(ftp.Client.prototype, 'access', async () => {});
  const service = new FtpService({ has: () => false }, () => null);
  t.after(() => service.disconnectAll());
  const profile = { id: 'ftp-test', name: 'FTP test', protocol: 'ftp', host: '127.0.0.1', port: 21 };
  return { service, profile };
}

test('FTP partial downloads are private before data arrives and truncate stale resume bytes', async (t) => {
  const { service, profile } = fixture(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ftp-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'download');
  const partial = `${target}.aux-command-test.part`;
  fs.writeFileSync(partial, 'abcdefghi', { mode: 0o644 });
  t.mock.method(ftp.Client.prototype, 'size', async () => 3);
  t.mock.method(ftp.Client.prototype, 'downloadTo', async (file, remote, offset) => {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(file).size, 3);
    assert.equal(offset, 3);
  });
  await service.download(profile, '/file', target, { transferId: 'test', offset: 9 });
  assert.equal(fs.readFileSync(target, 'utf8'), 'abc');
});

test('FTP editor stops receiving once its byte limit is exceeded', async (t) => {
  const { service, profile } = fixture(t);
  t.mock.method(ftp.Client.prototype, 'downloadTo', async (sink) => {
    assert.equal(typeof sink.write, 'function');
    sink.on('error', () => {});
    await new Promise((resolve, reject) => sink.write(Buffer.alloc(17), (error) => error ? reject(error) : resolve()));
  });
  await assert.rejects(() => service.readText(profile, '/file', 16), /too large/);
});

test('FTP transfer cancelled while queued does not issue a data command', async (t) => {
  const { service, profile } = fixture(t);
  t.mock.method(ftp.Client.prototype, 'size', async () => assert.fail('cancelled download should not start'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => service.download(profile, '/file', '/tmp/unused-aux-test', { signal: controller.signal }), { name: 'AbortError' });
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Observe rejection immediately, including in intentionally red regressions.
function observe(promise) {
  const result = { status: 'pending' };
  promise.then(value => Object.assign(result, { status: 'fulfilled', value }),
    error => Object.assign(result, { status: 'rejected', error }));
  return result;
}

async function flushAsyncWork() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

function cancellationFixture(t, protocol) {
  const gates = [], accesses = [], commands = [], vaultRequests = [];
  const accessGates = [], listGates = [];
  const clients = new Set(), openClients = new Set(), passwords = new Map();
  const originalClose = ftp.Client.prototype.close;
  const gate = () => { const value = deferred(); gates.push(value); return value; };
  t.mock.getter(ftp.Client.prototype, 'closed', function () { return !openClients.has(this); });
  t.mock.method(ftp.Client.prototype, 'close', function () {
    clients.add(this);
    openClients.delete(this);
    originalClose.call(this);
  });
  t.mock.method(ftp.Client.prototype, 'access', async function (config) {
    clients.add(this);
    accesses.push({ client: this, config });
    const pending = accessGates.shift();
    if (pending) await pending.promise;
    // Model access reopening a closed basic-ftp client: an earlier close
    // cannot prevent this late continuation from opening the transport.
    openClients.add(this);
  });
  t.mock.method(ftp.Client.prototype, 'list', async function (remotePath) {
    commands.push({ client: this, remotePath });
    const pending = listGates.shift();
    if (pending) await pending.promise;
    return [];
  });
  const service = new FtpService({
    has: id => passwords.has(id),
    get: id => { vaultRequests.push(id); return passwords.get(id).promise; }
  }, () => null);
  const profile = { id: `${protocol}-cancel`, name: 'Cancellation test', protocol,
    host: '127.0.0.1', port: protocol === 'ftps' ? 990 : 21, username: 'tester' };
  t.after(async () => {
    // Drain continuations before node:test restores prototype mocks, even
    // when an assertion fails against the pre-fix implementation.
    service.disconnectAll();
    for (const pending of gates) pending.resolve('test-password');
    await flushAsyncWork();
    service.disconnectAll();
    for (const client of clients) originalClose.call(client);
    openClients.clear();
  });
  return { service, profile, gate, passwords, vaultRequests, accesses, commands,
    accessGates, listGates, openClients };
}

for (const protocol of ['ftp', 'ftps']) {
  test(`${protocol}: disconnect rejects pending vault connect before credentials resolve and never accesses`, async (t) => {
    const f = cancellationFixture(t, protocol);
    const password = f.gate();
    f.passwords.set('credential', password);
    const profile = { ...f.profile, credentialId: 'credential' };
    const first = observe(f.service.connect(profile));
    const shared = observe(f.service.connect(profile));
    const waitingList = observe(f.service.list(profile, '/waiting'));
    await flushAsyncWork();
    assert.deepEqual(f.vaultRequests, ['credential']);
    assert.equal(f.service.disconnect(profile.id), true);
    await flushAsyncWork();
    const promptlySettled = [first.status, shared.status, waitingList.status];
    password.resolve('test-password');
    await flushAsyncWork();
    assert.equal(f.accesses.length, 0, 'late credentials must not reopen a disconnected client');
    assert.deepEqual(promptlySettled, ['rejected', 'rejected', 'rejected'], 'all waiters reject without waiting for vault.get');
    assert.equal(f.commands.length, 0);
    assert.equal(f.openClients.size, 0);
    assert.equal(f.service.connections.size, 0);
  });

  test(`${protocol}: disconnect during access cannot fulfill with a ready orphan`, async (t) => {
    const f = cancellationFixture(t, protocol);
    const access = f.gate();
    f.accessGates.push(access);
    const connecting = observe(f.service.connect(f.profile));
    await flushAsyncWork();
    assert.equal(f.accesses.length, 1);
    f.service.disconnect(f.profile.id);
    access.resolve();
    await flushAsyncWork();
    assert.equal(connecting.status, 'rejected');
    assert.equal(f.openClients.size, 0, 'late access completion must close its transport');
    assert.equal(f.service.connections.size, 0);
  });

  for (const failure of [false, true]) {
    test(`${protocol}: old access ${failure ? 'failure' : 'completion'} preserves the replacement holder`, async (t) => {
      const f = cancellationFixture(t, protocol);
      const access = f.gate();
      f.accessGates.push(access);
      const old = observe(f.service.connect(f.profile));
      await flushAsyncWork();
      // Changed settings replace an in-flight holder with the same ID.
      const updated = { ...f.profile, host: 'localhost' };
      const replacement = await f.service.connect(updated);
      assert.equal(f.accesses.length, 2);
      if (failure) access.reject(new Error('late old access failure'));
      else access.resolve();
      await flushAsyncWork();
      assert.equal(f.service.connections.get(updated.id), replacement);
      assert.equal(await f.service.connect(updated), replacement);
      assert.equal(replacement.ready, true);
      assert.equal(replacement.client.closed, false);
      assert.deepEqual(await f.service.list(updated, '/replacement'), []);
      assert.equal(f.commands[0].client, replacement.client);
      assert.equal(f.accesses.length, 2, 'replacement must remain reusable');
      assert.equal(old.status, 'rejected');
      assert.equal(f.accesses[0].client.closed, true);
    });
  }

  test(`${protocol}: disconnectAll cancels every vault- and access-pending holder`, async (t) => {
    const f = cancellationFixture(t, protocol);
    const password = f.gate(), access = f.gate();
    f.passwords.set('credential', password);
    f.accessGates.push(access);
    const vaultConnect = observe(f.service.connect({ ...f.profile, credentialId: 'credential' }));
    const accessConnect = observe(f.service.connect({ ...f.profile, id: `${protocol}-other` }));
    await flushAsyncWork();
    assert.equal(f.accesses.length, 1);
    assert.equal(f.service.connections.size, 2);
    f.service.disconnectAll();
    await flushAsyncWork();
    const vaultStatusBeforeResolution = vaultConnect.status;
    password.resolve('test-password');
    access.resolve();
    await flushAsyncWork();
    assert.equal(f.accesses.length, 1, 'disconnectAll must prevent the vault-pending access');
    assert.equal(vaultStatusBeforeResolution, 'rejected');
    assert.equal(vaultConnect.status, 'rejected');
    assert.equal(accessConnect.status, 'rejected');
    assert.equal(f.service.connections.size, 0);
    assert.equal(f.openClients.size, 0);
  });

  test(`${protocol}: disconnect cancels commands already queued behind an active command`, async (t) => {
    const f = cancellationFixture(t, protocol);
    await f.service.connect(f.profile);
    const listing = f.gate();
    f.listGates.push(listing);
    const active = observe(f.service.list(f.profile, '/active'));
    await flushAsyncWork();
    const queued = [observe(f.service.list(f.profile, '/cancelled-1')),
      observe(f.service.list(f.profile, '/cancelled-2'))];
    await flushAsyncWork();
    assert.deepEqual(f.commands.map(command => command.remotePath), ['/active']);
    f.service.disconnect(f.profile.id);
    const replacement = await f.service.connect(f.profile);
    listing.resolve();
    await flushAsyncWork();
    assert.deepEqual(f.commands.map(command => command.remotePath), ['/active'], 'cancelled queued work must never reach the transport');
    assert.deepEqual(queued.map(result => result.status), ['rejected', 'rejected']);
    assert.notEqual(active.status, 'pending');
    assert.equal(f.service.connections.get(f.profile.id), replacement);
    await f.service.list(f.profile, '/new');
    assert.equal(f.commands.at(-1).client, replacement.client);
  });

  test(`${protocol}: uncancelled deferred connect retains credentials, TLS verification and serialized operations`, async (t) => {
    const f = cancellationFixture(t, protocol);
    const password = f.gate(), access = f.gate();
    f.passwords.set('credential', password);
    f.accessGates.push(access);
    const profile = { ...f.profile, credentialId: 'credential' };
    const connecting = f.service.connect(profile);
    const shared = f.service.connect(profile);
    await flushAsyncWork();
    assert.equal(f.accesses.length, 0);
    password.resolve('test-password');
    await flushAsyncWork();
    assert.equal(f.accesses.length, 1);
    assert.deepEqual(f.accesses[0].config, {
      host: profile.host, port: profile.port, user: 'tester', password: 'test-password',
      secure: protocol === 'ftps' ? 'implicit' : false,
      secureOptions: { rejectUnauthorized: true }
    });
    access.resolve();
    const holder = await connecting;
    assert.equal(await shared, holder);
    assert.equal(holder.ready, true);
    const listing = f.gate();
    f.listGates.push(listing);
    const first = f.service.list(profile, '/first');
    await flushAsyncWork();
    const second = f.service.list(profile, '/second');
    const third = f.service.list(profile, '/third');
    await flushAsyncWork();
    assert.deepEqual(f.commands.map(command => command.remotePath), ['/first']);
    listing.resolve();
    assert.deepEqual(await Promise.all([first, second, third]), [[], [], []]);
    assert.deepEqual(f.commands.map(command => command.remotePath), ['/first', '/second', '/third']);
    // A command failure must not poison the serialization queue.
    const failing = f.gate();
    f.listGates.push(failing);
    const failed = assert.rejects(f.service.list(profile, '/failure'), /list failed/);
    await flushAsyncWork();
    const recovered = f.service.list(profile, '/recovered');
    failing.reject(new Error('list failed'));
    await failed;
    assert.deepEqual(await recovered, []);
    assert.equal(f.commands.at(-1).remotePath, '/recovered');
    assert.equal(f.accesses.length, 1);
    assert.equal(f.commands.every(command => command.client === holder.client), true);
  });
}
