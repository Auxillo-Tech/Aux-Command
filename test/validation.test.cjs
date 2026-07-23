'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeProfile,
  normalizeRemotePath,
  normalizeTunnel
} = require('../src/main/lib/validation.cjs');

test('normalizes a standard SSH profile', () => {
  const profile = normalizeProfile({
    id: 'prod',
    name: 'Production',
    protocol: 'SSH',
    host: 'server.example.com',
    port: '2222',
    username: ' deploy ',
    tags: ['prod', 'prod', 'linux'],
    sshAlias: 'prod-alias'
  }, 'prod');
  assert.equal(profile.protocol, 'ssh');
  assert.equal(profile.port, 2222);
  assert.equal(profile.username, 'deploy');
  assert.equal(profile.sshAlias, 'prod-alias');
  assert.deepEqual(profile.tags, ['prod', 'linux']);
  assert.equal(profile.credentialKind, 'password');
});

test('local profiles do not retain a network endpoint', () => {
  const profile = normalizeProfile({ name: 'Shell', protocol: 'local', host: 'ignored', port: 22 });
  assert.equal(profile.host, '');
  assert.equal(profile.port, 0);
});

test('serial profiles require a device', () => {
  assert.throws(() => normalizeProfile({ name: 'Serial', protocol: 'serial' }), /device is required/u);
  const profile = normalizeProfile({ name: 'Console', protocol: 'serial', device: '/dev/ttyUSB0', baudRate: 9600 });
  assert.equal(profile.baudRate, 9600);
});

test('rejects unsupported protocols and invalid ports', () => {
  assert.throws(() => normalizeProfile({ name: 'Bad', protocol: 'ftp', host: 'host' }), /unsupported protocol/u);
  assert.throws(() => normalizeProfile({ name: 'Bad', protocol: 'ssh', host: 'host', port: 70000 }), /between 1 and 65535/u);
});

test('preserves supplied timestamps while stores can explicitly update them', () => {
  const timestamp = '2026-01-02T03:04:05.000Z';
  const profile = normalizeProfile({ name: 'Host', protocol: 'ssh', host: 'host', updatedAt: timestamp });
  assert.equal(profile.updatedAt, timestamp);
});

test('normalizes remote paths without escaping root', () => {
  assert.equal(normalizeRemotePath('/var/log/../tmp'), '/var/tmp');
  assert.equal(normalizeRemotePath('../../etc'), '/etc');
  assert.equal(normalizeRemotePath('home/user'), '/home/user');
});

test('normalizes dynamic and local tunnels', () => {
  const dynamic = normalizeTunnel({ profileId: 'ssh-1', type: 'dynamic', bindPort: 1080 });
  assert.equal(dynamic.targetPort, 0);
  const local = normalizeTunnel({ profileId: 'ssh-1', type: 'local', bindPort: 8080, targetHost: 'db', targetPort: 5432 });
  assert.equal(local.targetHost, 'db');
  assert.equal(local.targetPort, 5432);
});

test('rejects option-like connection targets and relative serial devices', () => {
  assert.throws(
    () => normalizeProfile({ name: 'Bad host', protocol: 'ssh', host: '-oProxyCommand=bad' }),
    /host cannot start with a hyphen/u
  );
  assert.throws(
    () => normalizeProfile({ name: 'Bad alias', protocol: 'ssh', host: 'server', sshAlias: '-bad' }),
    /sshAlias cannot start with a hyphen/u
  );
  assert.throws(
    () => normalizeProfile({ name: 'Bad jump', protocol: 'ssh', host: 'server', proxyJump: 'jump host' }),
    /proxyJump cannot contain whitespace/u
  );
  assert.throws(
    () => normalizeProfile({ name: 'Serial', protocol: 'serial', device: 'ttyUSB0' }),
    /serial device must be an absolute path/u
  );
});


test('separates account passwords from private-key passphrases', () => {
  const keyed = normalizeProfile({ name: 'Keyed', protocol: 'ssh', host: 'host', identityFile: '~/.ssh/id_ed25519' });
  assert.equal(keyed.credentialKind, 'passphrase');
  assert.equal(
    normalizeProfile({ name: 'Password', protocol: 'ssh', host: 'host', identityFile: '~/.ssh/id_ed25519', credentialKind: 'password' }).credentialKind,
    'password'
  );
  assert.throws(
    () => normalizeProfile({ name: 'Bad', protocol: 'ssh', host: 'host', credentialKind: 'both' }),
    /unsupported credential kind/u
  );
});
