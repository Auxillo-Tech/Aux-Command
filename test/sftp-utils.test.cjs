'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  connectionSignature,
  formatHostPort,
  isDirectory,
  modeToString,
  parseProxyJump,
  safeTimestampToIso
} = require('../src/main/lib/sftp-utils.cjs');

test('formats SFTP modes and safely handles timestamps', () => {
  assert.equal(modeToString(0o040750), 'drwxr-x---');
  assert.equal(modeToString(0o100640), '-rw-r-----');
  assert.equal(isDirectory({ mode: 0o040755 }), true);
  assert.equal(isDirectory({ isDirectory: () => false, mode: 0o040755 }), false);
  assert.equal(safeTimestampToIso(1), '1970-01-01T00:00:01.000Z');
  assert.equal(safeTimestampToIso(Number.MAX_VALUE), '');
  assert.equal(safeTimestampToIso('bad'), '');
});

test('changes the SFTP connection signature when authentication or transport settings change', () => {
  const profile = {
    host: 'server', port: 22, username: 'jd', identityFile: '', proxyJump: '',
    credentialId: 'credential-1', credentialKind: 'password', keepAliveSeconds: 30, compression: false
  };
  const first = connectionSignature(profile);
  assert.equal(connectionSignature({ ...profile }), first);
  assert.notEqual(connectionSignature({ ...profile, host: 'other' }), first);
  assert.notEqual(connectionSignature({ ...profile, credentialId: 'credential-2' }), first);
  assert.notEqual(connectionSignature({ ...profile, credentialKind: 'passphrase' }), first);
  assert.notEqual(connectionSignature({ ...profile, compression: true }), first);
});

test('parses one ProxyJump hop including usernames, ports and IPv6', () => {
  assert.deepEqual(parseProxyJump('bastion'), {
    host: 'bastion', port: 22, username: '', destination: 'bastion'
  });
  assert.deepEqual(parseProxyJump('ops@bastion.example:2222'), {
    host: 'bastion.example', port: 2222, username: 'ops', destination: 'ops@bastion.example'
  });
  assert.deepEqual(parseProxyJump('ops@[2001:db8::10]:2200'), {
    host: '2001:db8::10', port: 2200, username: 'ops', destination: 'ops@2001:db8::10'
  });
  assert.equal(formatHostPort('2001:db8::20', 22), '[2001:db8::20]:22');
  assert.throws(() => parseProxyJump('one,two'), /one explicit ProxyJump hop/u);
  assert.throws(() => parseProxyJump('host:70000'), /Invalid ProxyJump target/u);
});
