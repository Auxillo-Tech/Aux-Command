'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildExternalCommand,
  buildTerminalCommand,
  buildTunnelCommand
} = require('../src/main/lib/command-builder.cjs');

const sshProfile = {
  id: 'ssh-1',
  name: 'Production',
  protocol: 'ssh',
  host: '10.0.0.5',
  sshAlias: 'prod',
  port: 2222,
  username: 'deploy',
  identityFile: '~/.ssh/id_ed25519',
  proxyJump: 'bastion',
  keepAliveSeconds: 30,
  compression: true,
  agentForwarding: true,
  x11Forwarding: true,
  useSshConfig: true
};

test('builds OpenSSH terminal arguments without a shell', () => {
  const spec = buildTerminalCommand(sshProfile);
  assert.equal(spec.command, 'ssh');
  assert.ok(spec.args.includes('-tt'));
  assert.ok(spec.args.includes('-J'));
  assert.ok(spec.args.includes('bastion'));
  assert.ok(spec.args.includes('prod'));
  assert.ok(spec.args.includes('2222'));
  assert.equal(spec.args.at(-1), 'prod');
});

test('uses literal startup commands as a single OpenSSH argument', () => {
  const spec = buildTerminalCommand({ ...sshProfile, startupCommand: 'printf "%s" "a;b"' });
  assert.equal(spec.args.at(-1), 'printf "%s" "a;b"');
});

test('builds local, mosh, telnet and serial sessions', () => {
  assert.ok(buildTerminalCommand({ name: 'Local', protocol: 'local' }).command.includes('sh'));
  assert.equal(buildTerminalCommand({ name: 'Mosh', protocol: 'mosh', host: 'host' }).command, 'mosh');
  const telnet = buildTerminalCommand({ name: 'Telnet', protocol: 'telnet', host: 'host', port: 23 });
  assert.equal(telnet.command, 'python3');
  assert.match(telnet.args[0], /telnet_bridge\.py$/u);
  assert.deepEqual(telnet.args.slice(1), ['host', '23']);
  const serial = buildTerminalCommand({ name: 'Serial', protocol: 'serial', device: '/dev/ttyS0', baudRate: 115200 });
  assert.equal(serial.command, 'python3');
  assert.match(serial.args[0], /serial_bridge\.py$/u);
  assert.deepEqual(serial.args.slice(1), ['--baud', '115200', '/dev/ttyS0']);
});

test('builds local and dynamic OpenSSH tunnels', () => {
  const local = buildTunnelCommand({
    id: 't1', name: 'DB', type: 'local', profileId: 'ssh-1', bindHost: '127.0.0.1', bindPort: 15432, targetHost: 'db', targetPort: 5432
  }, sshProfile);
  assert.ok(local.args.includes('-L'));
  assert.ok(local.args.includes('127.0.0.1:15432:db:5432'));
  assert.ok(local.args.includes('BatchMode=yes'));
  assert.ok(local.args.includes('-v'));

  const dynamic = buildTunnelCommand({
    id: 't2', name: 'SOCKS', type: 'dynamic', profileId: 'ssh-1', bindHost: '127.0.0.1', bindPort: 1080
  }, sshProfile);
  assert.ok(dynamic.args.includes('-D'));
  assert.ok(dynamic.args.includes('127.0.0.1:1080'));
});

test('builds native remote desktop launcher arguments', () => {
  const rdp = buildExternalCommand({ name: 'Desktop', protocol: 'rdp', host: 'desktop', port: 3389, username: 'jd', rdpDomain: 'AUX' });
  assert.deepEqual(rdp.candidates, ['xfreerdp3', 'xfreerdp']);
  assert.ok(rdp.args.includes('/u:jd'));
  assert.ok(rdp.args.includes('/d:AUX'));
  const vnc = buildExternalCommand({ name: 'VNC', protocol: 'vnc', host: 'desktop', port: 5901 });
  assert.deepEqual(vnc.args, ['desktop::5901']);
});

test('builds local startup commands before returning to an interactive login shell', () => {
  const spec = buildTerminalCommand({ name: 'Local', protocol: 'local', startupCommand: 'printf AUX_LOCAL_START' });
  assert.equal(spec.command, process.env.SHELL || '/bin/bash');
  assert.equal(spec.args[0], '-lc');
  assert.match(spec.args[1], /^printf AUX_LOCAL_START\nexec /u);
  assert.match(spec.args[1], / -l$/u);
});

test('builds Mosh destinations with usernames and safely quoted SSH options', () => {
  const spec = buildTerminalCommand({
    ...sshProfile,
    protocol: 'mosh',
    identityFile: "/home/jd/.ssh/key with 'quote'",
    proxyJump: 'jump-host'
  });
  assert.equal(spec.command, 'mosh');
  assert.equal(spec.args[1], 'deploy@prod');
  assert.match(spec.args[0], /^--ssh='ssh' /u);
  assert.equal(spec.args[0], "--ssh='ssh' '-p' '2222' '-i' '/home/jd/.ssh/key with '\\''quote'\\''' '-J' 'jump-host' '-C' '-A' '-X' '-o' 'ServerAliveInterval=30' '-o' 'ServerAliveCountMax=3'");
  assert.ok(spec.args[0].includes("'jump-host'"));
  assert.ok(spec.args[0].includes("'-A'"));
  assert.ok(spec.args[0].includes("'-X'"));
});
