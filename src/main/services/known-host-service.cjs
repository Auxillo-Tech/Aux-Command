'use strict';

const path = require('node:path');
const { JsonStore } = require('../lib/json-store.cjs');
const { checkOpenSshKnownHosts, defaultKnownHostsFiles } = require('../lib/openssh-known-hosts.cjs');

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

function displayCertificateFingerprint(hex) {
  return `SHA-256 ${normalizeFingerprintHex(hex).toUpperCase().match(/../gu).join(':')}`;
}

class KnownHostService {
  constructor(dataDir, promptBroker, options = {}) {
    this.store = new JsonStore(path.join(dataDir, 'known-hosts.json'), { version: 1, hosts: {} });
    this.promptBroker = promptBroker;
    this.knownHostsFiles = options.knownHostsFiles || defaultKnownHostsFiles;
    this.pendingVerifications = new Map();
  }

  key(profile) {
    return `${profile.host}:${profile.port}`;
  }

  // `keyBlob` is the raw host key; with it, OpenSSH known_hosts entries are
  // honoured so a host already trusted by ssh is not prompted for again.
  async verify(profile, fingerprintValue, keyBlob = null) {
    const fingerprintHex = normalizeFingerprintHex(fingerprintValue);
    const key = this.key(profile);
    const hosts = this.store.get().hosts;
    const known = hosts && typeof hosts === 'object' && !Array.isArray(hosts)
      && Object.prototype.hasOwnProperty.call(hosts, key)
      ? hosts[key]
      : undefined;
    const openssh = keyBlob ? checkOpenSshKnownHosts(profile.host, profile.port, keyBlob, this.knownHostsFiles(profile)) : { trusted: false, revoked: false, conflicts: [] };
    if (openssh.revoked) throw new Error('This host key is marked @revoked in OpenSSH known_hosts');
    if (known?.fingerprintHex === fingerprintHex) return true;
    if (openssh.trusted && !known) return true;
    const previousHex = known?.fingerprintHex || openssh.conflicts[0] || '';

    // Concurrent connection attempts to the same host share one trust prompt
    // instead of stacking one modal per attempt.
    const pendingKey = `${key}|${fingerprintHex}`;
    const pending = this.pendingVerifications.get(pendingKey);
    if (pending) return pending;
    const decision = this.#promptAndRemember(profile, key, known, fingerprintHex, previousHex)
      .finally(() => this.pendingVerifications.delete(pendingKey));
    this.pendingVerifications.set(pendingKey, decision);
    return decision;
  }

  // RDP server certificates use the same trust store under their own key and
  // the same prompt, which shows the certificate's SHA-256 fingerprint in the
  // colon-separated form Windows and browsers display.
  async verifyRdpCertificate(target, certificate) {
    const fingerprintHex = normalizeFingerprintHex(certificate?.fingerprintHex);
    const key = `rdp:${target.host}:${target.port}`;
    const hosts = this.store.get().hosts;
    const known = hosts && typeof hosts === 'object' && !Array.isArray(hosts)
      && Object.prototype.hasOwnProperty.call(hosts, key)
      ? hosts[key]
      : undefined;
    if (known?.fingerprintHex === fingerprintHex) return true;
    const pendingKey = `${key}|${fingerprintHex}`;
    const pending = this.pendingVerifications.get(pendingKey);
    if (pending) return pending;
    const decision = this.#promptAndRemember(target, key, known, fingerprintHex, known?.fingerprintHex || '', {
      kind: 'rdp',
      display: displayCertificateFingerprint,
      subject: String(certificate.subject || '').slice(0, 200),
      issuer: String(certificate.issuer || '').slice(0, 200),
      validTo: String(certificate.validTo || '').slice(0, 64)
    }).finally(() => this.pendingVerifications.delete(pendingKey));
    this.pendingVerifications.set(pendingKey, decision);
    return decision;
  }

  async #promptAndRemember(profile, key, known, fingerprintHex, previousHex = known?.fingerprintHex || '', extra = {}) {
    const { display = displayFingerprint, ...details } = extra;
    const response = await this.promptBroker.request('host-key', {
      ...details,
      host: profile.host,
      port: profile.port,
      profileName: profile.name,
      fingerprint: display(fingerprintHex),
      changed: Boolean(previousHex),
      previousFingerprint: previousHex ? display(previousHex) : ''
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

module.exports = { KnownHostService, displayCertificateFingerprint, displayFingerprint, normalizeFingerprintHex };
