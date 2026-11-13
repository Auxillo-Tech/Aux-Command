'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProfileStore } = require('../src/main/lib/profile-store.cjs');
const { ProfileSync } = require('../src/main/services/profile-sync.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-sync-normalization-'));
  const userInfo = t.mock.method(os, 'userInfo', () => ({
    username: 'sync-test', homedir: directory, shell: '/bin/sh', uid: 65532, gid: 65532
  }));
  let sync;
  t.after(() => {
    sync?.stop();
    userInfo.mock.restore();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const dataDir = path.join(directory, 'data');
  const store = new ProfileStore(dataDir);
  const source = path.join(directory, 'remote.json');
  sync = new ProfileSync(store, () => null);
  sync.configure({ type: 'file', path: source });
  return {
    store, sync,
    source,
    rows: (rows) => fs.writeFileSync(source, JSON.stringify(rows)),
    reopen: () => new ProfileStore(dataDir),
    bytes: () => fs.readFileSync(path.join(dataDir, 'profiles.json'))
  };
}

test('ProfileSync coalesces default names, ports and normalized groups independently of remote metadata', async (t) => {
  const f = fixture(t);
  f.rows([
    { host: ' example.test ', group: ' Team/Hosts ', id: 'remote-one', createdAt: 'remote-time-one', password: 'secret-one' },
    { host: 'example.test', name: 'example.test', protocol: 'SSH', port: '22', group: 'Team / Hosts', id: 'remote-two', createdAt: 'remote-time-two', password: 'secret-two' }
  ]);
  assert.deepEqual(await f.sync.syncNow(), { added: 1, updated: 0, total: 2 });
  const profiles = f.reopen().list().filter((p) => p.host === 'example.test');
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, 'example.test');
  assert.equal(profiles[0].group, 'Team / Hosts');
  assert.notEqual(profiles[0].id, 'remote-one');
  assert.notEqual(profiles[0].id, 'remote-two');
  assert.ok(!f.bytes().toString().includes('remote-time'));
  assert.ok(!f.bytes().toString().includes('secret-'));
  assert.deepEqual(await f.sync.syncNow(), { added: 0, updated: 1, total: 2 });
  assert.equal(f.reopen().get(profiles[0].id).id, profiles[0].id);
});

test('ProfileSync compares partial updates against the original persisted settings', async (t) => {
  const f = fixture(t);
  const existing = f.store.save({ name: 'Serial', protocol: 'serial', device: '/dev/ttyUSB0', port: 2222, notes: 'Keep me', credentialId: 'local-key' });
  const row = { name: 'Serial', protocol: ' SERIAL ', port: '2222' };
  f.rows([row, { ...row, notes: ' Keep me ', createdAt: 'remote-time' }]);
  assert.deepEqual(await f.sync.syncNow(), { added: 0, updated: 1, total: 2 });
  const saved = f.reopen().get(existing.id);
  assert.equal(saved.device, existing.device);
  assert.equal(saved.createdAt, existing.createdAt);
  assert.equal(saved.credentialId, existing.credentialId);
  assert.equal(saved.notes, existing.notes);

  // The omitted field must not inherit the earlier staged row's conflicting
  // change: both rows are interpreted against the same persisted snapshot.
  const before = f.bytes();
  const saves = t.mock.method(f.store, 'save');
  f.rows([{ ...row, notes: 'Change me' }, row]);
  await assert.rejects(f.sync.syncNow(), /conflict/i);
  assert.equal(saves.mock.callCount(), 0);
  assert.deepEqual(f.bytes(), before);
});

test('ProfileSync rejects case-normalized local shells before saving earlier valid rows', async (t) => {
  const f = fixture(t);
  f.store.save({ name: 'Existing', host: 'existing.test' });
  const before = f.bytes();
  const saves = t.mock.method(f.store, 'save');
  f.rows([{ name: 'Valid', host: 'valid.test' }, { name: 'Local', protocol: ' LOCAL ' }]);
  await assert.rejects(f.sync.syncNow(), /local shells are never synchronized/);
  assert.equal(saves.mock.callCount(), 0);
  assert.deepEqual(f.bytes(), before);
});

test('ProfileSync rejects an ssh profile whose user or host holds shell syntax and saves nothing', async (t) => {
  const f = fixture(t);
  const hosts = () => f.reopen().list().map((p) => p.host).sort();
  const before = hosts();
  f.rows([
    { name: 'fine', host: 'fine.example', protocol: 'ssh', username: 'deploy' },
    { name: 'evil', host: 'evil.example', protocol: 'ssh', username: 'x$IFS-oProxyCommand=touch\\ /tmp/p1f-pwned' }
  ]);
  await assert.rejects(f.sync.syncNow(), /Sync profile entry 2 \(evil\) is invalid: Username cannot contain/);
  assert.deepEqual(hosts(), before, 'no earlier valid row was saved either');
  f.rows([{ name: 'evil', host: 'a;b', protocol: 'ssh' }]);
  await assert.rejects(f.sync.syncNow(), /Sync profile entry 1 \(evil\) is invalid: Host cannot contain/);
});

test('ProfileSync lists every refused remote entry with its reason and saves nothing', async (t) => {
  const f = fixture(t);
  f.store.save({ name: 'Existing', host: 'existing.test' });
  const before = f.bytes();
  f.rows([
    { name: 'Good', host: 'good.example', username: 'ops' },
    { name: 'Corp', host: 'corp.example', username: 'CORP\\jd' },
    { name: 'Spaced', host: 'space.example', username: 'first last' },
    { name: 'Glob', host: '{touch,/tmp/f}' },
    'not an object'
  ]);
  await assert.rejects(f.sync.syncNow(), (error) => {
    const lines = error.message.split('\n');
    assert.equal(lines.length, 4, error.message);
    assert.match(lines[0], /^Sync profile entry 2 \(Corp\) is invalid: Username cannot contain a backslash: use user@domain/);
    assert.match(lines[1], /^Sync profile entry 3 \(Spaced\) is invalid: Username /);
    assert.match(lines[2], /^Sync profile entry 4 \(Glob\) is invalid: Host /);
    assert.match(lines[3], /^Sync profile entry 5 is invalid: it must be an object/);
    return true;
  });
  assert.deepEqual(f.bytes(), before);
  const status = f.sync.getStatus();
  assert.deepEqual(status.skipped.map((s) => s.name), ['Corp', 'Spaced', 'Glob', '']);
  assert.deepEqual(status.skipped.map((s) => s.field), ['username', 'username', 'host', '']);
  assert.ok(status.lastError.includes('Sync profile entry 4'));
  f.rows([{ name: 'Good', host: 'good.example', username: 'ops' }]);
  await f.sync.syncNow();
  assert.deepEqual(f.sync.getStatus().skipped, []);
});

test('ProfileSync keeps legacy-invalid stored rows byte for byte', async (t) => {
  const f = fixture(t);
  f.store.save({ name: 'Existing', host: 'existing.test' });
  const raw = JSON.parse(f.bytes().toString());
  raw.profiles.push({ id: 'legacy-corp', name: 'Corp box', protocol: 'ssh', host: 'corp.example', username: 'CORP\\jd', extra: [1, { a: 2 }] });
  fs.writeFileSync(path.join(path.dirname(f.reopen().store.filename), 'profiles.json'), JSON.stringify(raw));
  const store = f.reopen();
  const sync = new ProfileSync(store, () => null);
  sync.configure({ type: 'file', path: f.source });
  fs.writeFileSync(f.source, JSON.stringify([{ name: 'Good', host: 'good.example', username: 'ops' }]));
  await sync.syncNow();
  const after = JSON.parse(fs.readFileSync(store.store.filename, 'utf8')).profiles.find((p) => p.id === 'legacy-corp');
  assert.deepEqual(after, raw.profiles.find((p) => p.id === 'legacy-corp'));
  sync.stop();
});
