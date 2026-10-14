'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, createHmac, randomBytes } = require('node:crypto');
const { checkOpenSshKnownHosts } = require('../src/main/lib/openssh-known-hosts.cjs');
const { KnownHostService } = require('../src/main/services/known-host-service.cjs');

function keyBlob(type = 'ssh-ed25519', seed = randomBytes(32)) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(name.length);
  const keyLength = Buffer.alloc(4); keyLength.writeUInt32BE(seed.length);
  return Buffer.concat([length, name, keyLength, seed]);
}

function hashed(token) {
  const salt = randomBytes(20);
  return `|1|${salt.toString('base64')}|${createHmac('sha1', salt).update(token).digest('base64')}`;
}

test('reads plain, hashed, bracketed-port, wildcard and revoked known_hosts entries', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-known-hosts-'));
  try {
    const good = keyBlob(); const other = keyBlob(); const revoked = keyBlob();
    const file = path.join(directory, 'known_hosts');
    fs.writeFileSync(file, [
      '# comment',
      `server.example,10.0.0.5 ssh-ed25519 ${good.toString('base64')}`,
      `${hashed('[hashed.example]:2222')} ssh-ed25519 ${good.toString('base64')}`,
      `*.lab.example,!bad.lab.example ssh-ed25519 ${good.toString('base64')}`,
      `changed.example ssh-ed25519 ${other.toString('base64')}`,
      `@revoked * ssh-ed25519 ${revoked.toString('base64')}`,
      `@cert-authority * ssh-ed25519 ${good.toString('base64')}`
    ].join('\n'));
    const check = (host, port, blob) => checkOpenSshKnownHosts(host, port, blob, [file, path.join(directory, 'missing')]);
    assert.equal(check('server.example', 22, good).trusted, true);
    assert.equal(check('10.0.0.5', 22, good).trusted, true);
    assert.equal(check('server.example', 2200, good).trusted, false, 'a different port is a different host');
    assert.equal(check('hashed.example', 2222, good).trusted, true);
    assert.equal(check('db.lab.example', 22, good).trusted, true);
    assert.equal(check('bad.lab.example', 22, good).trusted, false);
    const changed = check('changed.example', 22, good);
    assert.equal(changed.trusted, false);
    assert.deepEqual(changed.conflicts, [createHash('sha256').update(other).digest('hex')]);
    assert.equal(check('anything.example', 22, revoked).revoked, true);
    assert.equal(check('unknown.example', 22, good).trusted, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('SFTP trusts keys OpenSSH already trusts and warns about OpenSSH conflicts', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-known-hosts-'));
  try {
    const good = keyBlob(); const changedKey = keyBlob();
    const file = path.join(directory, 'known_hosts');
    fs.writeFileSync(file, `server.example ssh-ed25519 ${good.toString('base64')}\n`);
    const prompts = [];
    const service = new KnownHostService(directory, { request: async (_kind, payload) => { prompts.push(payload); return { accept: false }; } }, { knownHostsFiles: () => [file] });
    const profile = { id: 'p', name: 'Server', host: 'server.example', port: 22 };
    const hex = (blob) => createHash('sha256').update(blob).digest('hex');
    assert.equal(await service.verify(profile, hex(good), good), true);
    assert.equal(prompts.length, 0, 'no second trust prompt for a host OpenSSH knows');
    assert.equal(await service.verify(profile, hex(changedKey), changedKey), false);
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].changed, true, 'a key that differs from OpenSSH known_hosts is flagged as changed');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
