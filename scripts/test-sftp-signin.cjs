'use strict';
// SFTP sign-in and host-key checks against a disposable loopback OpenSSH
// server: a passphrase-protected key (asked for and stored), the standard
// ~/.ssh key fallback, an unusable key, and a server known to OpenSSH under a
// different key type.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSshdFixture } = require('./ssh-test-fixture.cjs');
const { SftpService } = require('../src/main/services/sftp-service.cjs');
const { KnownHostService } = require('../src/main/services/known-host-service.cjs');

const PASSPHRASE = 'fixture passphrase';

async function main() {
  // The checks are about key files, so no agent may answer for them.
  delete process.env.SSH_AUTH_SOCK;
  const fixture = await createSshdFixture();
  const prompts = [];
  let passphraseAnswers = [];
  let hostKeyAnswer = { accept: true, remember: false };
  const promptBroker = {
    request: async (kind, payload) => {
      prompts.push({ kind, payload });
      if (kind === 'host-key') return hostKeyAnswer;
      return { answers: passphraseAnswers.length ? [passphraseAnswers.shift()] : [] };
    }
  };
  const secrets = new Map();
  const vaultService = { has: (id) => secrets.has(id), get: async (id) => secrets.get(id) };
  const hostKey = fs.readFileSync(path.join(fixture.directory, 'host_key.pub'), 'utf8').trim().split(/\s+/u).slice(0, 2).join(' ');
  const knownHosts = path.join(fixture.directory, 'aux_known_hosts');
  fs.writeFileSync(knownHosts, `[127.0.0.1]:${fixture.port} ${hostKey}\n`);
  const knownHostService = new KnownHostService(path.join(fixture.directory, 'aux-data'), promptBroker, { knownHostsFiles: () => [knownHosts] });
  const service = new SftpService(vaultService, knownHostService, promptBroker, () => null);
  service.defaultKeyFiles = () => [];
  const base = { name: 'Fixture', protocol: 'ssh', host: '127.0.0.1', port: fixture.port, username: fixture.user, useSshConfig: false };
  const lists = async (profile) => { const entries = await service.list(profile, fixture.rootDir); service.disconnect(profile.id); return Array.isArray(entries); };
  const promptsOf = (kind) => prompts.filter((prompt) => prompt.kind === kind);

  const lockedKey = path.join(fixture.directory, 'locked_key');
  fs.copyFileSync(fixture.clientKey, lockedKey); fs.chmodSync(lockedKey, 0o600);
  assert.equal(spawnSync('ssh-keygen', ['-q', '-p', '-N', PASSPHRASE, '-f', lockedKey], { encoding: 'utf8' }).status, 0);

  try {
    // 1. Passphrase-protected key, nothing stored: asked for, wrong then right.
    passphraseAnswers = ['not it', PASSPHRASE];
    assert.equal(await lists({ ...base, id: 'locked', identityFile: lockedKey }), true);
    const asked = promptsOf('keyboard-interactive');
    assert.equal(asked.length, 2);
    assert.deepEqual(asked[0].payload.prompts, [{ prompt: 'Passphrase for locked_key', echo: false }]);
    assert.equal(promptsOf('host-key').length, 0, 'a host OpenSSH already trusts is not asked about');
    console.log('SFTP_PASSPHRASE_KEY_PROMPT_PASSED');

    // 2. The same key with its passphrase stored: no prompt.
    prompts.length = 0;
    secrets.set('stored', PASSPHRASE);
    assert.equal(await lists({ ...base, id: 'stored', identityFile: lockedKey, credentialId: 'stored', credentialKind: 'passphrase' }), true);
    assert.equal(prompts.length, 0);
    console.log('SFTP_STORED_PASSPHRASE_PASSED');

    // 3. Cancelling the passphrase ends cleanly instead of crashing the connection setup.
    await assert.rejects(() => lists({ ...base, id: 'cancelled', identityFile: lockedKey }), /authentication methods failed/iu);
    console.log('SFTP_PASSPHRASE_CANCEL_PASSED');

    // 4. No key in the profile: the standard key files are used, as OpenSSH does.
    prompts.length = 0;
    await assert.rejects(() => lists({ ...base, id: 'no-key' }), /authentication methods failed/iu);
    service.defaultKeyFiles = () => [{ filename: fixture.clientKey, data: fs.readFileSync(fixture.clientKey) }];
    assert.equal(await lists({ ...base, id: 'default-key' }), true);
    assert.equal(prompts.length, 0);
    console.log('SFTP_DEFAULT_KEY_FALLBACK_PASSED');

    // 5. A file that is not a key is skipped; the connection reports a sign-in failure.
    const garbage = path.join(fixture.directory, 'garbage_key');
    fs.writeFileSync(garbage, 'this is not a private key\n', { mode: 0o600 });
    service.defaultKeyFiles = () => [];
    await assert.rejects(() => lists({ ...base, id: 'garbage', identityFile: garbage }), /authentication methods failed/iu);
    console.log('SFTP_UNUSABLE_KEY_SKIPPED_PASSED');

    // 6. OpenSSH knows this server under another key type only: the key that
    // is presented must be reported as a changed identity, not a new host.
    prompts.length = 0;
    const otherType = path.join(fixture.directory, 'other_host_key');
    assert.equal(spawnSync('ssh-keygen', ['-q', '-t', 'ecdsa', '-N', '', '-f', otherType], { encoding: 'utf8' }).status, 0);
    const other = fs.readFileSync(`${otherType}.pub`, 'utf8').trim().split(/\s+/u).slice(0, 2).join(' ');
    fs.writeFileSync(knownHosts, `[127.0.0.1]:${fixture.port} ${other}\n`);
    hostKeyAnswer = { accept: false };
    await assert.rejects(() => lists({ ...base, id: 'changed', identityFile: fixture.clientKey }));
    assert.equal(promptsOf('host-key').length, 1);
    assert.equal(promptsOf('host-key')[0].payload.changed, true);
    assert.match(promptsOf('host-key')[0].payload.previousFingerprint, /^SHA256:/u);
    console.log('SFTP_OTHER_KEY_TYPE_REPORTED_AS_CHANGED_PASSED');

    // 7. With both types on record the server is asked for the recorded one and trusted silently.
    prompts.length = 0;
    fs.writeFileSync(knownHosts, `[127.0.0.1]:${fixture.port} ${other}\n[127.0.0.1]:${fixture.port} ${hostKey}\n`);
    assert.equal(await lists({ ...base, id: 'both', identityFile: fixture.clientKey }), true);
    assert.equal(prompts.length, 0);
    console.log('SFTP_RECORDED_KEY_TYPE_TRUSTED_PASSED');
  } finally {
    service.disconnectAll();
    fixture.close();
  }
}
main().then(() => process.exit(process.exitCode || 0), (error) => { console.error(error); process.exit(1); });
