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
