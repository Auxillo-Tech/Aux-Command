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
