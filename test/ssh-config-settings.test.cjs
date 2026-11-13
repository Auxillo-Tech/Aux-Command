'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { expandProxyCommand, expandTokens, sshConfigSettings } = require('../src/main/lib/ssh-config-settings.cjs');
const { connectionSignature } = require('../src/main/lib/sftp-utils.cjs');
const { identitiesOnlyAgent } = require('../src/main/lib/ssh-auth.cjs');
const { defaultKnownHostsFiles } = require('../src/main/lib/openssh-known-hosts.cjs');
const { KnownHostService } = require('../src/main/services/known-host-service.cjs');
const { SftpService } = require('../src/main/services/sftp-service.cjs');
const { normalizeProfile } = require('../src/main/lib/validation.cjs');

const context = { home: '/home/op', localUser: 'op', uid: 1000, localHost: 'desk.example.net', env: { SSH_AUTH_SOCK: '/run/agent.sock', OTHER_SOCK: '/run/other.sock' } };
const profile = (extra = {}) => normalizeProfile({ id: 'p', name: 'p', protocol: 'ssh', host: 'web', sshAlias: 'web', useSshConfig: true, ...extra }, 'p');
// The shape resolveSshConfig() returns for `ssh -G`.
const resolved = (extra = {}) => ({
  hostname: ['10.9.8.7'], port: ['2200'], user: ['deploy'],
  identityfile: ['~/.ssh/id_work', '/keys/%r@%h', 'relative_key'],
  userknownhostsfile: ['/home/op/.ssh/known_hosts /home/op/.ssh/known_hosts2'],
  globalknownhostsfile: ['/etc/ssh/ssh_known_hosts /etc/ssh/ssh_known_hosts2'],
  identitiesonly: ['no'],
  ...extra
});

test('takes the destination, login and key files from the resolved configuration', () => {
  const settings = sshConfigSettings(profile(), resolved(), context);
  assert.equal(settings.host, '10.9.8.7');
  assert.equal(settings.port, 2200);
  assert.equal(settings.username, 'deploy');
  assert.equal(settings.originalHost, 'web');
  assert.deepEqual(settings.identityFiles, ['/home/op/.ssh/id_work', '/keys/deploy@10.9.8.7', '/home/op/relative_key']);
  assert.equal(settings.identitiesOnly, false);
  assert.equal(settings.agent, '/run/agent.sock');
  assert.equal(settings.proxyJump, '');
  assert.equal(settings.proxyCommand, '');
  assert.equal(settings.hostKeyAlias, '');
  assert.deepEqual(settings.knownHostsFiles, [
    '/home/op/.ssh/known_hosts', '/home/op/.ssh/known_hosts2', '/etc/ssh/ssh_known_hosts', '/etc/ssh/ssh_known_hosts2'
  ]);
});

test('fields set on the profile win, as the options passed to ssh do', () => {
  const settings = sshConfigSettings(profile({
    port: 2222, username: 'root', identityFile: '/keys/explicit', knownHostsFile: '/keys/known', proxyJump: 'bastion'
  }), resolved({ proxycommand: ['nc %h %p'], identityfile: ['/keys/explicit', '~/.ssh/id_work'] }), context);
  assert.equal(settings.port, 2222);
  assert.equal(settings.username, 'root');
  assert.equal(settings.host, '10.9.8.7', 'HostName always comes from the configuration');
  assert.deepEqual(settings.identityFiles, ['/home/op/.ssh/id_work'], 'the profile key is tried first and not repeated');
  assert.deepEqual(settings.knownHostsFiles, ['/keys/known', '/etc/ssh/ssh_known_hosts', '/etc/ssh/ssh_known_hosts2']);
  assert.equal(settings.proxyJump, 'bastion');
  assert.equal(settings.proxyCommand, '', 'a jump host on the profile displaces the configured ProxyCommand');
});

test('port 22 on the profile does not override the configured port', () => {
  assert.equal(sshConfigSettings(profile({ port: 22 }), resolved(), context).port, 2200);
});

test('the user falls back to the local account when OpenSSH reports none', () => {
  assert.equal(sshConfigSettings(profile(), resolved({ user: undefined }), context).username, 'op');
});

test('ProxyJump and ProxyCommand come from the configuration, "none" disables them', () => {
  assert.equal(sshConfigSettings(profile(), resolved({ proxyjump: ['ops@[10.0.0.1]:2201,inner'] }), context).proxyJump, 'ops@[10.0.0.1]:2201,inner');
  assert.equal(sshConfigSettings(profile(), resolved({ proxyjump: ['none'], proxycommand: ['nc %h %p'] }), context).proxyCommand, 'nc %h %p');
  assert.equal(sshConfigSettings(profile(), resolved({ proxycommand: ['none'] }), context).proxyCommand, '');
  const both = sshConfigSettings(profile(), resolved({ proxyjump: ['bastion'], proxycommand: ['nc %h %p'] }), context);
  assert.deepEqual([both.proxyJump, both.proxyCommand], ['bastion', '']);
});

test('expands ProxyCommand tokens the way OpenSSH does, and passes an already expanded command through', () => {
  const settings = sshConfigSettings(profile(), resolved({ proxycommand: ['corkscrew proxy 8080 %h %p --as %r@%n via %u:%i %d %L %l %k 100%%'], hostkeyalias: ['web-key'] }), context);
  assert.equal(expandProxyCommand(settings, context), 'corkscrew proxy 8080 10.9.8.7 2200 --as deploy@web via op:1000 /home/op desk desk.example.net web-key 100%');
  const expanded = sshConfigSettings(profile(), resolved({ proxycommand: ['nc 10.9.8.7 2200'] }), context);
  assert.equal(expandProxyCommand(expanded, context), 'nc 10.9.8.7 2200');
});

test('refuses a ProxyCommand token it cannot compute instead of running a wrong command', () => {
  const settings = sshConfigSettings(profile(), resolved({ proxycommand: ['connect %C'] }), context);
  assert.throws(() => expandProxyCommand(settings, context), /ProxyCommand uses the token %C/u);
  assert.throws(() => expandTokens('trailing %', {}, 'ProxyCommand'), /token %/u);
});

test('an identity file with an unknown token is left out; "none" means no key files', () => {
  assert.deepEqual(sshConfigSettings(profile(), resolved({ identityfile: ['/keys/%C', '/keys/ok'] }), context).identityFiles, ['/keys/ok']);
  assert.deepEqual(sshConfigSettings(profile(), resolved({ identityfile: ['none'] }), context).identityFiles, []);
});

test('IdentityAgent: a socket path, SSH_AUTH_SOCK, an environment variable or none', () => {
  const agent = (value) => sshConfigSettings(profile(), resolved({ identityagent: value === undefined ? undefined : [value] }), context).agent;
  assert.equal(agent(undefined), '/run/agent.sock');
  assert.equal(agent('SSH_AUTH_SOCK'), '/run/agent.sock');
  assert.equal(agent('$OTHER_SOCK'), '/run/other.sock');
  assert.equal(agent('$MISSING'), '');
  assert.equal(agent('none'), '');
  assert.equal(agent('~/.1password/agent.sock'), '/home/op/.1password/agent.sock');
  assert.equal(agent('/run/user/1000/keyring/ssh'), '/run/user/1000/keyring/ssh');
});

test('IdentitiesOnly and HostKeyAlias are reported; known-hosts "none" entries are dropped', () => {
  const settings = sshConfigSettings(profile(), resolved({
    identitiesonly: ['yes'], hostkeyalias: ['cluster-key'], userknownhostsfile: ['~/custom_known none'], globalknownhostsfile: ['none']
  }), context);
  assert.equal(settings.identitiesOnly, true);
  assert.equal(settings.hostKeyAlias, 'cluster-key');
  assert.deepEqual(settings.knownHostsFiles, ['/home/op/custom_known']);
});

test('incomplete OpenSSH output is rejected', () => {
  assert.throws(() => sshConfigSettings(profile(), { port: ['22'] }, context), /incomplete/u);
  assert.throws(() => sshConfigSettings(profile(), { hostname: ['h'], port: ['0'] }, context), /incomplete/u);
});

test('the connection signature changes with the resolved settings and is unchanged without them', () => {
  const base = profile();
  const settings = sshConfigSettings(base, resolved(), context);
  const signature = connectionSignature(base, settings);
  assert.equal(connectionSignature(base, sshConfigSettings(base, resolved(), context)), signature);
  assert.equal(connectionSignature(base, null), connectionSignature(base));
  assert.notEqual(signature, connectionSignature(base));
  for (const change of [{ hostname: ['10.9.8.8'] }, { port: ['2201'] }, { user: ['other'] }, { identityfile: ['/keys/new'] }, { proxycommand: ['nc %h %p'] },
    { proxyjump: ['bastion'] }, { hostkeyalias: ['alias'] }, { userknownhostsfile: ['/elsewhere'] }, { identitiesonly: ['yes'] }, { identityagent: ['none'] }]) {
    assert.notEqual(connectionSignature(base, sshConfigSettings(base, resolved(change), context)), signature, JSON.stringify(change));
  }
});

test('known-hosts lookups use the resolved files and record a HostKeyAlias under its own name', async (t) => {
  assert.deepEqual(defaultKnownHostsFiles({ knownHostsFile: '/ignored', knownHostsFiles: ['/a', '/b'] }), ['/a', '/b']);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-alias-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  // Two throwaway host key blobs (type name plus key bytes).
  const blob = (fill) => Buffer.concat([Buffer.from([0, 0, 0, 11]), Buffer.from('ssh-ed25519'), Buffer.from([0, 0, 0, 32]), Buffer.alloc(32, fill)]);
  const fingerprint = (key) => require('node:crypto').createHash('sha256').update(key).digest('hex');
  const knownHosts = path.join(directory, 'known_hosts');
  fs.writeFileSync(knownHosts, `cluster-key ssh-ed25519 ${blob(1).toString('base64')}\n`);
  const prompts = [];
  const service = new KnownHostService(directory, { request: async (kind, payload) => { prompts.push(payload); return { accept: true, remember: true }; } });
  const target = { name: 'p', host: '10.9.8.7', port: 2200, hostKeyAlias: 'cluster-key', knownHostsFiles: [knownHosts] };
  assert.equal(service.key(target), 'alias:cluster-key');
  assert.equal(service.key({ host: '10.9.8.7', port: 2200 }), '10.9.8.7:2200');
  assert.deepEqual(service.preferredHostKeyAlgorithms(target).slice(0, 1), ['ssh-ed25519']);
  assert.equal(await service.verify(target, fingerprint(blob(1)), blob(1)), true);
  assert.equal(prompts.length, 0, 'the alias entry is found although the port is not 22');
  assert.equal(await service.verify(target, fingerprint(blob(2)), blob(2)), true);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].changed, true);
  // Without the alias the same file has no entry for the address.
  assert.equal(await service.verify({ ...target, hostKeyAlias: '' }, fingerprint(blob(1)), blob(1)), true);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[1].changed, false);
});

test('IdentitiesOnly limits the agent to the configured keys', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-agent-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const key = (name) => ({ name, getPublicSSH: () => Buffer.from(name) });
  fs.writeFileSync(path.join(directory, 'with_pub.pub'), 'A');
  fs.writeFileSync(path.join(directory, 'with_pub'), 'locked');
  fs.writeFileSync(path.join(directory, 'private_only'), 'B');
  const fakeSsh2 = {
    utils: { parseKey: (data) => (String(data) === 'locked' ? new Error('Encrypted private key detected, but no passphrase given') : key(String(data))) },
    OpenSSHAgent: class {
      constructor(socketPath) { this.socketPath = socketPath; }
      getIdentities(callback) { callback(null, [key('A'), key('B'), key('C')]); }
    }
  };
  const files = [path.join(directory, 'with_pub'), path.join(directory, 'private_only'), path.join(directory, 'absent')];
  const agent = identitiesOnlyAgent('/run/agent.sock', files, fakeSsh2);
  assert.equal(agent.socketPath, '/run/agent.sock');
  const offered = await new Promise((resolve, reject) => agent.getIdentities((error, keys) => (error ? reject(error) : resolve(keys))));
  assert.deepEqual(offered.map((entry) => entry.name), ['A', 'B']);
  assert.equal(identitiesOnlyAgent('/run/agent.sock', [path.join(directory, 'absent')], fakeSsh2), '', 'no identifiable key: the agent is not used');
  assert.equal(identitiesOnlyAgent('', files, fakeSsh2), '');
  assert.equal(identitiesOnlyAgent('/run/agent.sock', files, { utils: fakeSsh2.utils }), '');
});

test('callers waiting for the configuration lookup share it, and disconnect cancels them', async () => {
  let lookups = 0;
  let finish;
  const service = new SftpService({ has: () => false }, {}, {}, () => null, {
    resolveSshConfig: () => { lookups += 1; return new Promise((resolve) => { finish = resolve; }); }
  });
  const waiting = [service.connect(profile()), service.connect(profile())].map((promise) => promise.then(() => 'connected', (error) => error.message));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lookups, 1);
  assert.equal(service.connections.size, 0);
  assert.equal(service.disconnect('p'), true);
  finish(resolved());
  assert.deepEqual(await Promise.all(waiting), ['SFTP connection cancelled', 'SFTP connection cancelled']);
  assert.equal(service.connections.size, 0, 'no connection is opened after the cancellation');
  assert.equal(service.disconnect('p'), false);
});

test('a profile that does not use ~/.ssh/config is never looked up', async () => {
  let lookups = 0;
  const service = new SftpService({ has: () => false }, {}, {}, () => null, { resolveSshConfig: async () => { lookups += 1; return resolved(); } });
  // SCP mode is refused before any connection, after the profile is read.
  await assert.rejects(() => service.connect(profile({ useSshConfig: false, transferMode: 'scp' })), /SCP transfer mode/u);
  const pending = service.connect(profile({ useSshConfig: false, host: '127.0.0.1', port: 1 })).catch(() => {});
  assert.equal(service.connections.size, 1, 'the connection is registered before connect() first yields');
  service.disconnectAll();
  await pending;
  assert.equal(lookups, 0);
});

test('a ProxyCommand token is only filled with a plain name: shell syntax in %r, %h, %n or %k is refused whole', () => {
  const hostile = ['x$IFS-oProxyCommand=touch\\ /tmp/p1f-pwned', 'a;id', 'a b', 'a`id`', 'a$(id)', "a'b", 'a"b', 'a*', 'a\\b', 'a|b', 'a&b', 'a<b', 'a>b', 'a(b)', 'a\nb', ''];
  const cases = [['%r', 'user'], ['%h', 'hostname'], ['%n', 'host'], ['%k', 'hostkeyalias']];
  for (const [token, field] of cases) {
    for (const bad of hostile) {
      if (field === 'hostkeyalias' && bad === '') continue; // an empty alias means "use the host"
      const base = sshConfigSettings(profile(), resolved({ proxycommand: [`nc ${token} %p`] }), context);
      const settings = { ...base, username: base.username, host: base.host, originalHost: base.originalHost, hostKeyAlias: 'key' };
      if (field === 'user') settings.username = bad;
      if (field === 'hostname') settings.host = bad;
      if (field === 'host') settings.originalHost = bad;
      if (field === 'hostkeyalias') settings.hostKeyAlias = bad;
      assert.throws(() => expandProxyCommand(settings, context), (error) => error.name === 'SshConfigError' && error.code === 'unsafe', `${token} ${JSON.stringify(bad)}`);
    }
  }
  // The profile's own username is checked when it is saved, but the value that
  // reaches the command may also come from ssh -G (Match blocks), so the check
  // does not depend on the profile.
  const viaConfig = sshConfigSettings(profile(), resolved({ user: ['x$IFS-oProxyCommand=touch\\ /tmp/f'], proxycommand: ['nc %h %p --as %r'] }), context);
  assert.throws(() => expandProxyCommand(viaConfig, context), (error) => error.code === 'unsafe');
  // A name that holds no shell syntax passes, and a token that is not used is not checked.
  const fine = sshConfigSettings(profile(), resolved({ user: ['svc+ops@corp.example'], proxycommand: ['nc %h %p --as %r'] }), context);
  assert.equal(expandProxyCommand(fine, context), 'nc 10.9.8.7 2200 --as svc+ops@corp.example');
  const unused = sshConfigSettings(profile(), resolved({ user: ['bad name'], proxycommand: ['nc %h %p'] }), context);
  assert.equal(expandProxyCommand(unused, context), 'nc 10.9.8.7 2200');
});
