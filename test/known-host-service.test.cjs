'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { KnownHostService, displayFingerprint, normalizeFingerprintHex } = require('../src/main/services/known-host-service.cjs');

const profile = { id: 'server-1', name: 'Server', host: 'server.example', port: 22 };

test('formats SHA-256 host fingerprints for display', () => {
  assert.equal(
    displayFingerprint('00ff10'.padEnd(64, '0')),
    `SHA256:${Buffer.from('00ff10'.padEnd(64, '0'), 'hex').toString('base64').replace(/=+$/u, '')}`
  );
});

test('remembers accepted host keys and flags changed keys', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-known-host-'));
  const prompts = [];
  const promptBroker = {
    request: async (kind, payload) => {
      prompts.push({ kind, payload });
      return { accept: true, remember: true };
    }
  };
  try {
    const service = new KnownHostService(directory, promptBroker);
    assert.equal(await service.verify(profile, '11'.repeat(32)), true);
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].payload.changed, false);

    assert.equal(await service.verify(profile, '11'.repeat(32)), true);
    assert.equal(prompts.length, 1);

    assert.equal(await service.verify(profile, '22'.repeat(32)), true);
    assert.equal(prompts.length, 2);
    assert.equal(prompts[1].payload.changed, true);
    assert.match(prompts[1].payload.previousFingerprint, /^SHA256:/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects an unaccepted host key without persisting it', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-known-host-'));
  let promptCount = 0;
  const promptBroker = {
    request: async () => {
      promptCount += 1;
      return { accept: false, remember: false };
    }
  };
  try {
    const service = new KnownHostService(directory, promptBroker);
    assert.equal(await service.verify(profile, '33'.repeat(32)), false);
    assert.equal(await service.verify(profile, '33'.repeat(32)), false);
    assert.equal(promptCount, 2);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test('rejects malformed fingerprints and safely stores prototype-like host names', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-known-host-'));
  const promptBroker = { request: async () => ({ accept: true, remember: true }) };
  try {
    const service = new KnownHostService(directory, promptBroker);
    assert.throws(() => normalizeFingerprintHex('not-a-fingerprint'), /Invalid SHA-256/u);
    const unusualProfile = { ...profile, host: 'constructor' };
    assert.equal(await service.verify(unusualProfile, 'AA'.repeat(32)), true);
    assert.equal(await service.verify(unusualProfile, 'aa'.repeat(32)), true);
    const persisted = JSON.parse(fs.readFileSync(path.join(directory, 'known-hosts.json'), 'utf8'));
    assert.equal(Object.prototype.hasOwnProperty.call(persisted.hosts, 'constructor:22'), true);
    assert.equal(persisted.hosts['constructor:22'].fingerprintHex, 'aa'.repeat(32));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
