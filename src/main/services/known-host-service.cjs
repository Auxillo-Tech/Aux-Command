'use strict';

const path = require('node:path');
const { JsonStore } = require('../lib/json-store.cjs');

function normalizeFingerprintHex(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/iu.test(value)) {
    throw new Error('Invalid SHA-256 host fingerprint');
  }
  return value.toLowerCase();
}

function displayFingerprint(hex) {
  const normalized = normalizeFingerprintHex(hex);
  const raw = Buffer.from(normalized, 'hex').toString('base64').replace(/=+$/u, '');
  return `SHA256:${raw}`;
}

class KnownHostService {
  constructor(dataDir, promptBroker) {
    this.store = new JsonStore(path.join(dataDir, 'known-hosts.json'), { version: 1, hosts: {} });
    this.promptBroker = promptBroker;
  }

  key(profile) {
    return `${profile.host}:${profile.port}`;
  }

  async verify(profile, fingerprintValue) {
    const fingerprintHex = normalizeFingerprintHex(fingerprintValue);
    const key = this.key(profile);
    const hosts = this.store.get().hosts;
    const known = hosts && typeof hosts === 'object' && !Array.isArray(hosts)
      && Object.prototype.hasOwnProperty.call(hosts, key)
      ? hosts[key]
      : undefined;
    if (known?.fingerprintHex === fingerprintHex) return true;

    const response = await this.promptBroker.request('host-key', {
      host: profile.host,
      port: profile.port,
      profileName: profile.name,
      fingerprint: displayFingerprint(fingerprintHex),
      changed: Boolean(known?.fingerprintHex),
      previousFingerprint: known?.fingerprintHex ? displayFingerprint(known.fingerprintHex) : ''
    });

    if (!response?.accept) return false;
    if (response.remember) {
      this.store.update((data) => {
        if (!data.hosts || typeof data.hosts !== 'object' || Array.isArray(data.hosts)) data.hosts = {};
        Object.defineProperty(data.hosts, key, {
          value: {
            fingerprintHex,
            firstSeenAt: known?.firstSeenAt || new Date().toISOString(),
            lastVerifiedAt: new Date().toISOString()
          },
          enumerable: true,
          configurable: true,
          writable: true
        });
        return data;
      });
    }
    return true;
  }
}

module.exports = { KnownHostService, displayFingerprint, normalizeFingerprintHex };
