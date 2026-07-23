'use strict';

const path = require('node:path');
const { JsonStore } = require('../lib/json-store.cjs');


function validateCredentialId(id, { allowEmpty = false } = {}) {
  if (allowEmpty && !id) return '';
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id)) {
    throw new Error('Invalid credential identifier');
  }
  if (['__proto__', 'prototype', 'constructor'].includes(id)) {
    throw new Error('Invalid credential identifier');
  }
  return id;
}

class VaultService {
  constructor(dataDir, safeStorage) {
    this.safeStorage = safeStorage;
    this.store = new JsonStore(path.join(dataDir, 'vault.json'), { version: 1, entries: {} });
    this.memory = new Map();
  }

  #selectedBackend() {
    try { return this.safeStorage?.getSelectedStorageBackend?.() || 'unknown'; }
    catch { return 'unknown'; }
  }

  #persistentAvailable() {
    const backend = this.#selectedBackend();
    return Boolean(this.safeStorage?.isEncryptionAvailable?.()) && backend !== 'basic_text';
  }

  status() {
    const selectedBackend = this.#selectedBackend();
    return {
      persistentEncryptionAvailable: this.#persistentAvailable(),
      selectedBackend,
      backend: process.platform === 'linux'
        ? selectedBackend === 'basic_text'
          ? 'insecure basic_text backend rejected; credentials remain memory-only'
          : `desktop secret service through Electron safeStorage (${selectedBackend})`
        : 'operating-system credential encryption'
    };
  }

  has(id) {
    const key = validateCredentialId(id, { allowEmpty: true });
    if (!key) return false;
    const entries = this.store.get().entries;
    return this.memory.has(key) || Object.prototype.hasOwnProperty.call(entries, key);
  }

  async set(id, secret, persistent = true) {
    const key = validateCredentialId(id);
    if (typeof secret !== 'string' || secret.length > 32_768) throw new Error('Invalid secret');
    if (!secret) return this.delete(id);

    if (!persistent || !this.#persistentAvailable()) {
      this.memory.set(key, secret);
      this.store.update((data) => {
        delete data.entries[key];
        return data;
      });
      return { persistent: false, backend: this.#selectedBackend() };
    }

    const encrypted = this.safeStorage.encryptStringAsync
      ? await this.safeStorage.encryptStringAsync(secret)
      : this.safeStorage.encryptString(secret);
    this.store.update((data) => {
      data.entries[key] = Buffer.from(encrypted).toString('base64');
      return data;
    });
    this.memory.delete(key);
    return { persistent: true, backend: this.#selectedBackend() };
  }

  async get(id) {
    const key = validateCredentialId(id, { allowEmpty: true });
    if (!key) return '';
    if (this.memory.has(key)) return this.memory.get(key);
    const entries = this.store.get().entries;
    const encoded = Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : '';
    if (!encoded) return '';
    if (!this.#persistentAvailable()) {
      throw new Error('Persistent credential encryption is unavailable on this desktop session');
    }
    const encrypted = Buffer.from(encoded, 'base64');
    return this.safeStorage.decryptStringAsync
      ? this.safeStorage.decryptStringAsync(encrypted)
      : this.safeStorage.decryptString(encrypted);
  }

  delete(id) {
    const key = validateCredentialId(id);
    this.memory.delete(key);
    this.store.update((data) => {
      delete data.entries[key];
      return data;
    });
    return true;
  }

  clearMemory() {
    this.memory.clear();
  }
}

module.exports = { VaultService, validateCredentialId };
