'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ftp = require('basic-ftp');
const { FtpService } = require('../src/main/services/ftp-service.cjs');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, protocol, vault = { has: () => false }) {
  const service = new FtpService(vault, () => null);
  const clients = new Set(), gates = [];
  const originalClose = ftp.Client.prototype.close;
  t.mock.method(ftp.Client.prototype, 'access', async function () { clients.add(this); });
  t.after(async () => {
    service.disconnectAll();
    for (const gate of gates) gate.resolve('password');
    await flush();
    service.disconnectAll();
    for (const client of clients) originalClose.call(client);
  });
  return { service, clients, gate() { const gate = deferred(); gates.push(gate); return gate; },
    profile: { id: 'test', protocol, name: 'Test', host: 'localhost', username: 'tester' } };
}

for (const protocol of ['ftp', 'ftps']) {
  test(`${protocol}: access cancellation settles all connect callers before access resolves`, async t => {
    const f = fixture(t, protocol);
    const access = f.gate();
    t.mock.method(ftp.Client.prototype, 'access', function () { f.clients.add(this); return access.promise; });
    const statuses = [];
    const observe = promise => promise.then(() => statuses.push('fulfilled'), () => statuses.push('rejected'));
    const first = observe(f.service.connect(f.profile));
    const shared = observe(f.service.connect(f.profile));
    await flush();
    const holder = f.service.connections.get(f.profile.id);
    f.service.disconnect(f.profile.id);
    await flush();
    assert.deepEqual(statuses, ['rejected', 'rejected']);
    assert.equal(holder.ready, false);
    access.resolve();
    await Promise.all([first, shared]);
    await flush();
    assert.equal(holder.ready, false);
    assert.equal(holder.client.closed, true);
  });

  test(`${protocol}: late vault failure cannot invalidate a replacement`, async t => {
    let password;
    const f = fixture(t, protocol, { has: () => true, get: () => password.promise });
    password = f.gate();
    const old = assert.rejects(f.service.connect({ ...f.profile, credentialId: 'secret' }), /disconnected/);
    const holder = f.service.connections.get(f.profile.id);
    f.service.disconnect(f.profile.id);
    const replacement = await f.service.connect(f.profile);
    password.reject(new Error('late vault failure'));
    await old;
    await flush();
    assert.equal(holder.ready, false);
    assert.equal(holder.client.closed, true);
    assert.equal(f.service.connections.get(f.profile.id), replacement);
    assert.equal(replacement.ready, true);
  });

  test(`${protocol}: old aborted transfer failure does not disconnect the replacement`, async t => {
    const f = fixture(t, protocol);
    const data = f.gate();
    t.mock.method(ftp.Client.prototype, 'size', async () => 0);
    t.mock.method(ftp.Client.prototype, 'downloadTo', () => data.promise);
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ftp-cancel-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const abort = new AbortController();
    const transfer = assert.rejects(f.service.download(f.profile, '/file', path.join(directory, 'file'),
      { signal: abort.signal }), { name: 'AbortError' });
    await flush();
    f.service.disconnect(f.profile.id);
    const replacement = await f.service.connect(f.profile);
    abort.abort();
    data.reject(new Error('old data transport closed'));
    await transfer;
    assert.equal(f.service.connections.get(f.profile.id), replacement);
    assert.equal(replacement.ready, true);
  });
}
