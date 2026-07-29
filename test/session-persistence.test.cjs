'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('settings store saves and retrieves sessions', () => {
  const { SettingsStore } = require('../src/main/lib/settings-store.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-settings-test-'));
  try {
    const store = new SettingsStore(directory);

    // Default: no sessions
    assert.deepEqual(store.getSessions(), []);

    // Save sessions
    const sessions = [
      { profileId: 'local-shell', protocol: 'local', title: 'jd@localhost', startedAt: new Date().toISOString() },
      { profileId: 'server-one', protocol: 'ssh', title: 'Example server', startedAt: new Date().toISOString() }
    ];
    store.saveSessions(sessions);

    // Retrieve
    const retrieved = store.getSessions();
    assert.equal(retrieved.length, 2);
    assert.equal(retrieved[0].profileId, 'local-shell');
    assert.equal(retrieved[1].profileId, 'server-one');

    // Save fewer sessions (simulating closing tabs)
    store.saveSessions([sessions[0]]);
    const afterClose = store.getSessions();
    assert.equal(afterClose.length, 1);
    assert.equal(afterClose[0].profileId, 'local-shell');

    // Clear all sessions
    store.saveSessions([]);
    assert.deepEqual(store.getSessions(), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('settings store rejects invalid session entries', () => {
  const { SettingsStore } = require('../src/main/lib/settings-store.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-settings-test-'));
  try {
    const store = new SettingsStore(directory);

    // Empty/null entries should be filtered
    store.saveSessions([
      { profileId: 'valid', protocol: 'ssh', title: 'test', startedAt: '2024-01-01' },
      { profileId: '', protocol: 'ssh', title: 'bad', startedAt: '2024-01-01' },
      null,
      { },
      { profileId: 'also-valid', protocol: 'local', title: 'test2', startedAt: '2024-01-01' }
    ]);

    const retrieved = store.getSessions();
    assert.equal(retrieved.length, 2);
    assert.equal(retrieved[0].profileId, 'valid');
    assert.equal(retrieved[1].profileId, 'also-valid');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('settings store caps saved sessions at 32', () => {
  const { SettingsStore } = require('../src/main/lib/settings-store.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-settings-test-'));
  try {
    const store = new SettingsStore(directory);
    const many = Array.from({ length: 100 }, (_, i) => ({
      profileId: `profile-${i}`, protocol: 'ssh', title: `Session ${i}`, startedAt: new Date().toISOString()
    }));
    store.saveSessions(many);
    const retrieved = store.getSessions();
    assert.ok(retrieved.length <= 32, `capped at 32, got ${retrieved.length}`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('settings store persists sessions across instances', () => {
  const { SettingsStore } = require('../src/main/lib/settings-store.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-settings-test-'));
  try {
    // Write sessions with one instance
    const store1 = new SettingsStore(directory);
    store1.saveSessions([{ profileId: 'persist-test', protocol: 'local', title: 'persist', startedAt: '2024-06-01' }]);

    // Read with another instance (simulating restart)
    const store2 = new SettingsStore(directory);
    const sessions = store2.getSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].profileId, 'persist-test');
    assert.equal(sessions[0].protocol, 'local');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
