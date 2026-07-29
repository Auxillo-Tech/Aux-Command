'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { SshKeyService } = require('../src/main/services/ssh-key-service.cjs');
const serviceSource = fs.readFileSync(path.join(__dirname, '../src/main/services/ssh-key-service.cjs'), 'utf8');

function withService(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-sshkeys-'));
  try {
    return run(new SshKeyService(directory), directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('SshKeyService generates, fingerprints, lists, reads and deletes a key in its configured directory', () => {
  withService((service, directory) => {
    const generated = service.generateKey('operator-key', 'ed25519');
    assert.equal(generated.name, 'operator-key');
    assert.match(generated.fingerprint, /^SHA256:/u);
    assert.equal(generated.path, path.join(directory, 'operator-key'));
    assert.equal(fs.statSync(generated.path).mode & 0o777, 0o600);

    const publicKey = service.getPublicKey('operator-key');
    assert.match(publicKey, /^ssh-ed25519\s/u);
    assert.match(service.getFingerprint('operator-key'), /SHA256:/u);

    const listed = service.listKeys();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'operator-key');
    assert.match(listed[0].fingerprint, /^SHA256:/u);
    assert.notEqual(listed[0].fingerprint, listed[0].comment, 'fingerprint must not be the public-key comment');

    assert.equal(service.deleteKey('operator-key'), true);
    assert.equal(service.deleteKey('operator-key'), false);
  });
});

test('SshKeyService rejects path traversal, unsupported algorithms and overwrite attempts', () => {
  withService((service, directory) => {
    for (const name of ['../escape', '../../tmp/key', '/tmp/key', '.', '..', 'bad/name']) {
      assert.throws(() => service.generateKey(name, 'ed25519'), /key name/u);
      assert.throws(() => service.getPublicKey(name), /key name/u);
      assert.throws(() => service.deleteKey(name), /key name/u);
    }
    assert.throws(() => service.generateKey('weak-key', 'dsa'), /key type/u);
    service.generateKey('existing', 'ed25519');
    assert.throws(() => service.generateKey('existing', 'ed25519'), /already exists/u);
    assert.equal(fs.existsSync(path.join(directory, 'existing')), true);
  });
});

test('SshKeyService keeps non-empty passphrases out of process arguments', () => {
  assert.doesNotMatch(serviceSource, /'-N',\s*passphrase/u);
  assert.match(serviceSource, /SSH_ASKPASS_REQUIRE/u);
  withService((service, directory) => {
    service.generateKey('protected-key', 'ed25519', 'correct horse battery staple');
    const check = require('node:child_process').spawnSync('ssh-keygen', [
      '-y', '-P', 'correct horse battery staple', '-f', path.join(directory, 'protected-key')
    ], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /^ssh-ed25519\s/u);
  });
});
