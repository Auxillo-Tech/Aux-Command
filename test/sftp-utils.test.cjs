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
const { replaceRemoteFile } = require('../src/main/services/sftp-service.cjs');

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
  assert.throws(() => parseProxyJump('one,two'), /single hop/u);
  assert.throws(() => parseProxyJump('host:70000'), /Invalid ProxyJump target/u);
});

test('remote replacement restores the original if installing the partial file fails', async () => {
  const calls = [];
  let backupPath = '';
  const sftp = {
    rename(from, to, callback) {
      calls.push(['rename', from, to]);
      if (from === '/file.part' && to === '/file.txt') {
        const error = new Error(calls.length === 1 ? 'destination exists' : 'replacement failed');
        error.code = calls.length === 1 ? 4 : 5;
        callback(error);
        return;
      }
      if (from === '/file.txt') backupPath = to;
      callback(null);
    },
    unlink(target, callback) { calls.push(['unlink', target]); callback(null); }
  };
  await assert.rejects(() => replaceRemoteFile(sftp, '/file.part', '/file.txt'), /replacement failed/u);
  assert.match(backupPath, /^\/file\.txt\.aux-backup-/u);
  assert.deepEqual(calls.at(-1), ['rename', backupPath, '/file.txt']);
  assert.equal(calls.some(([method, target]) => method === 'unlink' && target === '/file.txt'), false);
});

test('remote replacement removes only the backup after a successful install', async () => {
  const calls = [];
  let first = true;
  const sftp = {
    rename(from, to, callback) {
      calls.push(['rename', from, to]);
      if (first) { first = false; callback(Object.assign(new Error('destination exists'), { code: 4 })); }
      else callback(null);
    },
    unlink(target, callback) { calls.push(['unlink', target]); callback(null); }
  };
  await replaceRemoteFile(sftp, '/file.part', '/file.txt');
  const backupPath = calls[1][2];
  assert.deepEqual(calls.at(-1), ['unlink', backupPath]);
  assert.equal(calls.some(([method, target]) => method === 'unlink' && target === '/file.txt'), false);
});

test('parses multi-hop ProxyJump chains and formats hops back for -J', () => {
  const { parseProxyJumpChain, formatProxyJumpHop } = require('../src/main/lib/sftp-utils.cjs');
  const hops = parseProxyJumpChain('bastion.example, ops@inner.example:2222 ,[2001:db8::1]:2200');
  assert.equal(hops.length, 3);
  assert.deepEqual(hops.map((hop) => hop.host), ['bastion.example', 'inner.example', '2001:db8::1']);
  assert.deepEqual(hops.map((hop) => hop.port), [22, 2222, 2200]);
  assert.deepEqual(hops.map(formatProxyJumpHop), ['bastion.example', 'ops@inner.example:2222', '[2001:db8::1]:2200']);
  assert.deepEqual(parseProxyJumpChain(''), []);
  assert.throws(() => parseProxyJumpChain('a,,b'), /Invalid ProxyJump chain/u);
  assert.throws(() => parseProxyJumpChain(Array.from({ length: 9 }, (_, i) => `hop${i}`).join(',')), /at most 8 hops/u);
});
