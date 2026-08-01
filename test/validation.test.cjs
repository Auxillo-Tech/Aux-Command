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
  assert.throws(() => normalizeProfile({ name: 'Bad', protocol: 'smtp', host: 'mail' }), /unsupported protocol/u);
  assert.throws(() => normalizeProfile({ name: 'Bad', protocol: 'ssh', host: 'host', port: 70000 }), /between 1 and 65535/u);
});

test('normalizes FTP and FTPS file-transfer profiles', () => {
  const ftp = normalizeProfile({ name: 'FTP', protocol: 'ftp', host: 'ftp.example' });
  const ftps = normalizeProfile({ name: 'FTPS', protocol: 'ftps', host: 'secure.example' });
  assert.equal(ftp.port, 21);
  assert.equal(ftps.port, 990);
  assert.equal(ftp.sftpRoot, '/');
  assert.equal(ftps.sftpRoot, '/');
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

test('normalizes per-profile terminal appearance settings', () => {
  const profile = normalizeProfile({
    name: 'Styled host',
    protocol: 'ssh',
    host: 'host',
    terminalTheme: 'light',
    terminalFontFamily: 'Iosevka Term, monospace',
    terminalFontSize: 18,
    terminalCursorStyle: 'underline',
    terminalCursorBlink: false,
    terminalScrollback: 50000
  });
  assert.equal(profile.terminalTheme, 'light');
  assert.equal(profile.terminalFontFamily, 'Iosevka Term, monospace');
  assert.equal(profile.terminalFontSize, 18);
  assert.equal(profile.terminalCursorStyle, 'underline');
  assert.equal(profile.terminalCursorBlink, false);
  assert.equal(profile.terminalScrollback, 50000);

  const defaults = normalizeProfile({ name: 'Default host', protocol: 'ssh', host: 'host' });
  assert.equal(defaults.terminalTheme, 'aux-dark');
  assert.equal(defaults.terminalFontSize, 13);
  assert.equal(defaults.terminalCursorStyle, 'block');
  assert.equal(defaults.terminalCursorBlink, true);
  assert.equal(defaults.terminalScrollback, 20000);

  assert.throws(
    () => normalizeProfile({ name: 'Bad theme', protocol: 'ssh', host: 'host', terminalTheme: 'neon' }),
    /unsupported terminal theme/u
  );
  assert.throws(
    () => normalizeProfile({ name: 'Bad cursor', protocol: 'ssh', host: 'host', terminalCursorStyle: 'triangle' }),
    /unsupported terminal cursor style/u
  );
});

test('preserves optional OpenSSH known-hosts file overrides', () => {
  const profile = normalizeProfile({ name: 'Lab SSH', protocol: 'ssh', host: '127.0.0.1', knownHostsFile: '/tmp/aux-command-known-hosts' });
  assert.equal(profile.knownHostsFile, '/tmp/aux-command-known-hosts');
  assert.throws(
    () => normalizeProfile({ name: 'Bad known hosts', protocol: 'ssh', host: '127.0.0.1', knownHostsFile: '-oProxyCommand=bad' }),
    /knownHostsFile cannot start with a hyphen/u
  );
});

test('normalizes explicit SSH transfer modes for legacy servers', () => {
  const sftp = normalizeProfile({ name: 'Modern SSH', protocol: 'ssh', host: 'host' });
  assert.equal(sftp.transferMode, 'sftp');
  const scp = normalizeProfile({ name: 'Legacy SSH', protocol: 'ssh', host: 'host', transferMode: 'scp' });
  assert.equal(scp.transferMode, 'scp');
  assert.throws(
    () => normalizeProfile({ name: 'Bad transfer', protocol: 'ssh', host: 'host', transferMode: 'rsync' }),
    /unsupported transfer mode/u
  );
});

test('accepts every terminal theme offered by the profile editor', () => {
  const themes = [
    'aux-dark', 'light', 'high-contrast', 'nord', 'dracula', 'solarized-dark', 'solarized-light',
    'one-dark', 'catppuccin-mocha', 'tokyo-night', 'gruvbox-dark', 'monokai', 'oceanic-next', 'material'
  ];
  for (const theme of themes) {
    const profile = normalizeProfile({ name: `Theme ${theme}`, protocol: 'ssh', host: 'host', terminalTheme: theme });
    assert.equal(profile.terminalTheme, theme);
  }
  assert.throws(
    () => normalizeProfile({ name: 'Bad theme', protocol: 'ssh', host: 'host', terminalTheme: 'hotdog-stand' }),
    /unsupported terminal theme/u
  );
});
