'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProfileStore } = require('../src/main/lib/profile-store.cjs');

test('creates, updates, exports and deletes profiles without exporting credentials', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-profiles-'));
  try {
    const store = new ProfileStore(directory);
    const created = store.save({
      name: 'Server', protocol: 'ssh', host: 'server.example.com', credentialId: 'secret-1'
    });
    assert.ok(created.id);
    assert.equal(store.get(created.id).host, 'server.example.com');
    const updated = store.save({ ...created, name: 'Updated Server' });
    assert.equal(updated.id, created.id);
    assert.equal(store.get(created.id).name, 'Updated Server');
    const exported = store.exportSafe();
    assert.equal(exported.format, 'aux-command-profiles');
    assert.equal(exported.profiles.find((profile) => profile.id === created.id).credentialId, '');

    const profileFile = path.join(directory, 'profiles.json');
    const raw = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
    const stored = raw.profiles.find((profile) => profile.id === created.id);
    stored.password = 'legacy-password';
    stored.passphrase = 'legacy-passphrase';
    stored.apiToken = 'legacy-token';
    stored.nestedSecret = { token: 'nested-token' };
    fs.writeFileSync(profileFile, JSON.stringify(raw));
    const hardenedExport = new ProfileStore(directory).exportSafe();
    const serialized = JSON.stringify(hardenedExport);
    assert.doesNotMatch(serialized, /legacy-password|legacy-passphrase|legacy-token|nested-token/u);
    assert.equal(store.delete(created.id), true);
    assert.equal(store.get(created.id), null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('protects the default local shell profile', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-profiles-'));
  try {
    const store = new ProfileStore(directory);
    assert.throws(() => store.delete('local-shell'), /cannot be deleted/u);
    assert.throws(
      () => store.save({ ...store.get('local-shell'), protocol: 'ssh', host: 'example.invalid' }),
      /must remain a local profile/u
    );
    assert.equal(store.get('local-shell').protocol, 'local');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects invalid save input through normal validation', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-profiles-'));
  try {
    const store = new ProfileStore(directory);
    assert.throws(() => store.save(null), /name is required/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('assigns unique IDs to colliding imported profiles', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-profiles-'));
  try {
    const store = new ProfileStore(directory);
    const payload = {
      format: 'aux-command-profiles',
      profiles: [
        { id: 'duplicate', name: 'One', protocol: 'ssh', host: 'one.example' },
        { id: 'duplicate', name: 'Two', protocol: 'ssh', host: 'two.example' }
      ]
    };
    const result = store.importSafe(payload);
    const imported = result.profiles.filter((profile) => ['One', 'Two'].includes(profile.name));
    assert.equal(imported.length, 2);
    assert.equal(new Set(imported.map((profile) => profile.id)).size, 2);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('creates, updates and deletes command snippets without storing control characters', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-profiles-'));
  try {
    const store = new ProfileStore(directory);
    const created = store.saveSnippet({ name: 'Disk usage', command: 'df -h' });
    assert.ok(created.id);
    assert.equal(created.name, 'Disk usage');
    assert.equal(store.snippets().some((snippet) => snippet.id === created.id), true);

    const updated = store.saveSnippet({ ...created, name: 'Disk and uptime', command: 'df -h; uptime' });
    assert.equal(updated.id, created.id);
    assert.equal(store.snippets().find((snippet) => snippet.id === created.id).command, 'df -h; uptime');

    assert.throws(() => store.saveSnippet({ name: 'Bad', command: 'printf "bad\u0000"' }), /control characters/u);
    assert.equal(store.deleteSnippet(created.id), true);
    assert.equal(store.snippets().some((snippet) => snippet.id === created.id), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('migrates old stores without injecting vendor infrastructure or deleting custom profiles', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-profiles-migrate-'));
  const filename = path.join(directory, 'profiles.json');
  try {
    fs.writeFileSync(filename, JSON.stringify({
      version: 1,
      profiles: [
        { id: 'local-shell', name: 'Local', protocol: 'local', group: 'Local' },
        {
          id: 'custom-lab', name: 'Custom lab', protocol: 'ssh', group: 'Custom', host: 'lab.example.test', port: 2200
        }
      ],
      snippets: [{ id: 'custom-snippet', name: 'Custom', command: 'true' }]
    }), { mode: 0o600 });

    const store = new ProfileStore(directory);
    assert.equal(store.get('custom-lab').port, 2200, 'custom profiles must survive migration unchanged');
    assert.equal(store.list().some((profile) => profile.id.startsWith('infra-')), false);
    assert.ok(store.snippets().some((snippet) => snippet.id === 'custom-snippet'));

    const persisted = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert.equal(persisted.version, 2);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
