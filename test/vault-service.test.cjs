'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { VaultService, validateCredentialId } = require('../src/main/services/vault-service.cjs');

function encryptedStorage(backend = 'gnome_libsecret') {
  return {
    getSelectedStorageBackend: () => backend,
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value) => value.toString('utf8').replace(/^encrypted:/u, '')
  };
}

test('stores and retrieves encrypted persistent credentials', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-vault-'));
  try {
    const vault = new VaultService(directory, encryptedStorage());
    const result = await vault.set('credential-1', 'secret', true);
    assert.equal(result.persistent, true);
    assert.equal(vault.has('credential-1'), true);
    assert.equal(await vault.get('credential-1'), 'secret');
    assert.equal(vault.delete('credential-1'), true);
    assert.equal(vault.has('credential-1'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('memory-only credential replacement clears stale persistent secret', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-vault-'));
  try {
    const vault = new VaultService(directory, encryptedStorage());
    await vault.set('credential-1', 'old-persistent-secret', true);

    const result = await vault.set('credential-1', 'new-memory-secret', false);
    assert.deepEqual(result, { persistent: false, backend: 'gnome_libsecret' });
    assert.equal(await vault.get('credential-1'), 'new-memory-secret');

    const reopened = new VaultService(directory, encryptedStorage());
    assert.equal(reopened.has('credential-1'), false);
    assert.equal(await reopened.get('credential-1'), '');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects basic_text persistence and prototype-like credential IDs', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-vault-'));
  try {
    const vault = new VaultService(directory, encryptedStorage('basic_text'));
    const result = await vault.set('credential-2', 'memory secret', true);
    assert.equal(result.persistent, false);
    assert.equal(await vault.get('credential-2'), 'memory secret');
    assert.equal(vault.has('toString'), false);
    assert.throws(() => validateCredentialId('__proto__'), /Invalid credential identifier/u);
    await assert.rejects(() => vault.set('__proto__', 'bad', true), /Invalid credential identifier/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
