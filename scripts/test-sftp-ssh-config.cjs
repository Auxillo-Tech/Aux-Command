'use strict';
// The SFTP file panel must follow ~/.ssh/config the way the OpenSSH terminal
// does. Checked against a disposable loopback OpenSSH server and a temporary
// configuration file (the real ~/.ssh/config is never read): an alias that
// exists only in the configuration, ProxyCommand, HostKeyAlias with its own
// known-hosts file, profile fields overriding the configuration, IdentityAgent
// with IdentitiesOnly, and reconnecting when the configuration changes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createSshdFixture } = require('./ssh-test-fixture.cjs');
const { SftpService } = require('../src/main/services/sftp-service.cjs');
const { KnownHostService } = require('../src/main/services/known-host-service.cjs');
const { resolveSshConfig } = require('../src/main/lib/ssh-config-resolver.cjs');
const { SshConfigError } = require('../src/main/lib/ssh-config-settings.cjs');
const { findExecutable } = require('../src/main/lib/executable-finder.cjs');

const publicKey = (file) => fs.readFileSync(file, 'utf8').trim().split(/\s+/u).slice(0, 2).join(' ');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function main() {
  // Nothing from the developer's own session may answer for the fixture.
  delete process.env.SSH_AUTH_SOCK;
  const fixture = await createSshdFixture();
  const dir = fixture.directory;
  const { port, user, clientKey } = fixture;
  const hostKey = publicKey(path.join(dir, 'host_key.pub'));
  const configFile = path.join(dir, 'ssh_config');
  const trusted = path.join(dir, 'config_known_hosts');
  const aliasKnownHosts = path.join(dir, 'alias_known_hosts');
  const emptyKnownHosts = path.join(dir, 'empty_known_hosts');
  const marker = path.join(dir, 'proxy_marker');
  const slowMarker = path.join(dir, 'slow_marker');
  const agentSocket = path.join(dir, 'agent.sock');
  const decoyKey = path.join(dir, 'decoy_key');
  const publicOnly = path.join(dir, 'public_only');
  const socat = findExecutable(['socat']);
  fs.writeFileSync(trusted, `[127.0.0.1]:${port} ${hostKey}\n[localhost]:${port} ${hostKey}\n`);
  fs.writeFileSync(aliasKnownHosts, `fixture-alias ${hostKey}\n`);
  fs.writeFileSync(emptyKnownHosts, '');
  assert.equal(spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', decoyKey]).status, 0);
  // A key whose private half exists only inside the agent.
  fs.mkdirSync(publicOnly);
  fs.copyFileSync(`${clientKey}.pub`, path.join(publicOnly, 'client_key.pub'));

  const host = (alias, lines) => [`Host ${alias}`, '  HostName 127.0.0.1', ...lines.map((line) => `  ${line}`)];
  const reachable = [`Port ${port}`, `User ${user}`, `IdentityFile ${clientKey}`];
  const writeConfig = (extra = []) => fs.writeFileSync(configFile, [
    ...host('aux-direct.invalid', reachable),
    ...host('aux-ssh-proxy.invalid', [...reachable, `ProxyCommand ssh -F ${configFile} -W %h:%p aux-direct.invalid`]),
    ...host('aux-socat-proxy.invalid', [...reachable, `ProxyCommand sh -c 'echo "%h %p %r %n" > ${marker}; exec socat - TCP:%h:%p'`]),
    // A configuration whose lookup is slow: the Match exec clause adds the
    // ProxyCommand (through the fixture server) only after a pause.
    ...host('aux-slow.invalid', reachable),
    'Match originalhost aux-slow.invalid exec "sleep 4"',
    `  ProxyCommand sh -c 'echo used > ${slowMarker}; exec ssh -F ${configFile} -W %h:%p aux-direct.invalid'`,
    ...host('aux-pinned.invalid', [...reachable, 'HostKeyAlias fixture-alias', `UserKnownHostsFile ${aliasKnownHosts}`]),
    ...host('aux-wrong.invalid', ['Port 1', 'User aux-no-such-user', `IdentityFile ${path.join(dir, 'missing_key')}`, `UserKnownHostsFile ${emptyKnownHosts}`, 'ProxyCommand false']),
    ...host('aux-agent-open.invalid', [`Port ${port}`, `User ${user}`, `IdentityFile ${decoyKey}`, `IdentityAgent ${agentSocket}`]),
    ...host('aux-agent-only.invalid', [`Port ${port}`, `User ${user}`, `IdentityFile ${decoyKey}`, `IdentityAgent ${agentSocket}`, 'IdentitiesOnly yes']),
    ...host('aux-agent-match.invalid', [`Port ${port}`, `User ${user}`, `IdentityFile ${path.join(publicOnly, 'client_key')}`, `IdentityAgent ${agentSocket}`, 'IdentitiesOnly yes']),
    ...host('aux-agent-none.invalid', [`Port ${port}`, `User ${user}`, `IdentityFile ${decoyKey}`, 'IdentityAgent none']),
    ...host('aux-changing.invalid', [...reachable, ...extra]),
    // The jump host used by the override check (the same server under another
    // name: OpenSSH refuses to jump through the destination itself), and
    // defaults for every host.
    'Host localhost', '  HostName 127.0.0.1', `  IdentityFile ${clientKey}`,
    'Host *', `  UserKnownHostsFile ${trusted}`, '  GlobalKnownHostsFile /dev/null', '  StrictHostKeyChecking yes', ''
  ].join('\n'));
  writeConfig();

  const prompts = [];
  let hostKeyAnswer = { accept: false };
  const promptBroker = {
    request: async (kind, payload) => {
      prompts.push({ kind, payload });
      return kind === 'host-key' ? hostKeyAnswer : { answers: [] };
    }
  };
  const vaultService = { has: () => false, get: async () => '' };
  // The default known-hosts lookup, so the files come from the configuration.
  const knownHostService = new KnownHostService(path.join(dir, 'aux-data'), promptBroker);
  const service = new SftpService(vaultService, knownHostService, promptBroker, () => null, {
    resolveSshConfig, sshConfigFile: configFile, sshConfigReuseMs: 0
  });
  service.defaultKeyFiles = () => [];
  const profileFor = (alias, extra = {}) => ({ id: alias, name: alias, protocol: 'ssh', host: alias, sshAlias: alias, useSshConfig: true, ...extra });
  const lists = async (profile) => {
    const entries = await service.list(profile, fixture.rootDir);
    service.disconnect(profile.id);
    return Array.isArray(entries);
  };
  const openSsh = (alias) => spawnSync('ssh', ['-F', configFile, '-o', 'BatchMode=yes', alias, 'true'], { encoding: 'utf8', timeout: 15_000 });
  let agent = null;

  try {
    // 1. An alias that exists only in the configuration: HostName, Port, User,
    // IdentityFile and UserKnownHostsFile all come from it.
    assert.equal(await lists(profileFor('aux-direct.invalid')), true);
    assert.equal(prompts.length, 0, 'the host is trusted through the configured known-hosts file');
    // Without the lookup the same profile cannot connect (today's behaviour).
    const plain = new SftpService(vaultService, knownHostService, promptBroker, () => null);
    plain.defaultKeyFiles = () => [];
    await assert.rejects(() => plain.list(profileFor('aux-direct.invalid'), fixture.rootDir));
    plain.disconnectAll();
    // Only a missing OpenSSH falls back to the profile's own fields.
    const direct = { id: 'fallback', name: 'fallback', protocol: 'ssh', host: '127.0.0.1', port, username: user, identityFile: clientKey, knownHostsFile: trusted, useSshConfig: true };
    const withResolver = (resolver) => {
      const sftp = new SftpService(vaultService, knownHostService, promptBroker, () => null, { resolveSshConfig: resolver });
      sftp.defaultKeyFiles = () => [];
      return sftp;
    };
    const missing = withResolver(async () => { throw Object.assign(new Error('OpenSSH is not installed'), { code: 'ssh-missing' }); });
    assert.equal(Array.isArray(await missing.list(direct, fixture.rootDir)), true);
    missing.disconnectAll();
    // Every other failure refuses: the profile's own fields would skip what
    // the configuration requires (a ProxyCommand, a jump host, known hosts).
    for (const [label, failure, code] of [
      ['non-zero exit', new Error('ssh -G failed'), 'failed'],
      ['timeout', new SshConfigError('timeout'), 'timeout'],
      ['incomplete output', new SshConfigError('incomplete'), 'incomplete']
    ]) {
      const refusing = withResolver(async () => { throw failure; });
      await assert.rejects(() => refusing.list(direct, fixture.rootDir), (error) => error.name === 'SshConfigError' && error.code === code, label);
      refusing.disconnectAll();
    }
    console.log('SFTP_SSH_CONFIG_REFUSES_PASSED');

    // A slow lookup must not turn into a connection that ignores the
    // configuration. The profile carries its own, reachable host and port: the
    // old fallback used them and listed the directory with no ProxyCommand.
    const slowProfile = { ...profileFor('aux-slow.invalid'), host: '127.0.0.1', port, username: user, identityFile: clientKey, knownHostsFile: trusted };
    fs.rmSync(slowMarker, { force: true });
    // Within the timeout the lookup finishes and ProxyCommand carries the connection.
    assert.equal(await lists(slowProfile), true, 'a lookup that takes 4 s (longer than the old 3 s limit) still applies the configuration');
    assert.equal(fs.existsSync(slowMarker), true, 'the ProxyCommand from the slow Match block ran');
    // Past the timeout the panel refuses; it does not connect directly.
    const impatient = withResolver((profile, options) => resolveSshConfig(profile, { ...options, timeoutMs: 1000 }));
    impatient.sshConfigFile = configFile;
    fs.rmSync(slowMarker, { force: true });
    await assert.rejects(() => impatient.list(slowProfile, fixture.rootDir), (error) => error.name === 'SshConfigError' && error.code === 'timeout');
    assert.equal(fs.existsSync(slowMarker), false, 'no ProxyCommand ran and no direct connection was made');
    // The same refusal on a second try: a failure is not remembered as an answer.
    await assert.rejects(() => impatient.list(slowProfile, fixture.rootDir), (error) => error.code === 'timeout');
    impatient.disconnectAll();
    console.log('SFTP_SSH_CONFIG_SLOW_LOOKUP_PASSED');
    console.log('SFTP_SSH_CONFIG_ALIAS_PASSED');

    // 2. ProxyCommand is the transport, and ends with the connection.
    const proxied = await service.connect(profileFor('aux-ssh-proxy.invalid'));
    const proxyPid = proxied.proxy?.child?.pid;
    assert.ok(proxyPid, 'the connection runs over the ProxyCommand process');
    assert.equal(Array.isArray(await service.list(profileFor('aux-ssh-proxy.invalid'), fixture.rootDir)), true);
    service.disconnect('aux-ssh-proxy.invalid');
    for (let attempt = 0; attempt < 50 && processAlive(proxyPid); attempt += 1) await sleep(100);
    assert.equal(processAlive(proxyPid), false, 'the ProxyCommand process ends with the connection');
    if (socat) {
      assert.equal(await lists(profileFor('aux-socat-proxy.invalid')), true);
      assert.equal(fs.readFileSync(marker, 'utf8').trim(), `127.0.0.1 ${port} ${user} aux-socat-proxy.invalid`, 'tokens are expanded as OpenSSH expands them');
    }
    assert.equal(prompts.length, 0);
    console.log(`SFTP_SSH_CONFIG_PROXY_COMMAND_PASSED${socat ? '' : ' (socat not installed: ssh -W only)'}`);

    // 3. HostKeyAlias with its own UserKnownHostsFile: trusted with no prompt,
    // under the same name OpenSSH itself accepts.
    assert.equal(openSsh('aux-pinned.invalid').status, 0, 'OpenSSH trusts the host under its HostKeyAlias');
    assert.equal(await lists(profileFor('aux-pinned.invalid')), true);
    assert.equal(prompts.length, 0);
    // A different key under that alias is a changed identity, for both.
    fs.writeFileSync(aliasKnownHosts, `fixture-alias ${publicKey(`${decoyKey}.pub`)}\n`);
    assert.match(openSsh('aux-pinned.invalid').stderr, /REMOTE HOST IDENTIFICATION HAS CHANGED/u);
    await assert.rejects(() => lists(profileFor('aux-pinned.invalid')));
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].kind, 'host-key');
    assert.equal(prompts[0].payload.changed, true);
    assert.match(prompts[0].payload.previousFingerprint, /^SHA256:/u);
    // The address itself being trusted elsewhere does not excuse the alias.
    fs.writeFileSync(aliasKnownHosts, `[127.0.0.1]:${port} ${hostKey}\n`);
    prompts.length = 0;
    await assert.rejects(() => lists(profileFor('aux-pinned.invalid')));
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].payload.changed, false);
    fs.writeFileSync(aliasKnownHosts, `fixture-alias ${hostKey}\n`);
    prompts.length = 0;
    console.log('SFTP_SSH_CONFIG_HOST_KEY_ALIAS_PASSED');

    // 4. Fields set on the profile win over the configuration, as the options
    // the terminal passes to ssh do: port, user, identity file, known-hosts
    // file, and ProxyJump (which also displaces the configured ProxyCommand).
    await assert.rejects(() => lists(profileFor('aux-wrong.invalid')));
    assert.equal(await lists(profileFor('aux-wrong.invalid', {
      id: 'aux-wrong-overridden', port, username: user, identityFile: clientKey, knownHostsFile: trusted, proxyJump: `${user}@localhost:${port}`
    })), true);
    assert.equal(prompts.length, 0);
    console.log('SFTP_SSH_CONFIG_PROFILE_OVERRIDES_PASSED');

    // 5. IdentityAgent and IdentitiesOnly. The agent holds the authorized key
    // and a decoy; the configured IdentityFile decides what it may offer.
    agent = spawn('ssh-agent', ['-D', '-a', agentSocket], { stdio: 'ignore' });
    for (let attempt = 0; attempt < 50 && !fs.existsSync(agentSocket); attempt += 1) await sleep(100);
    assert.equal(spawnSync('ssh-add', ['-q', clientKey, decoyKey], { env: { ...process.env, SSH_AUTH_SOCK: agentSocket } }).status, 0);
    assert.equal(await lists(profileFor('aux-agent-open.invalid')), true, 'the configured agent signs in');
    await assert.rejects(() => lists(profileFor('aux-agent-none.invalid')), /authentication methods failed/iu);
    await assert.rejects(() => lists(profileFor('aux-agent-only.invalid')), /authentication methods failed/iu);
    assert.equal(await lists(profileFor('aux-agent-match.invalid')), true, 'IdentitiesOnly still allows the configured key from the agent');
    console.log('SFTP_SSH_CONFIG_IDENTITY_AGENT_PASSED');

    // 6. A connection is reused until the resolved settings change.
    const changing = profileFor('aux-changing.invalid');
    const first = await service.connect(changing);
    assert.equal(await service.connect(changing), first);
    writeConfig(['HostKeyAlias fixture-alias', `UserKnownHostsFile ${aliasKnownHosts}`]);
    const second = await service.connect(changing);
    assert.notEqual(second, first);
    assert.equal(first.cancelled, true, 'the connection made with the old settings is closed');
    assert.equal(second.settings.hostKeyAlias, 'fixture-alias');
    service.disconnect(changing.id);
    assert.equal(prompts.length, 0);
    console.log('SFTP_SSH_CONFIG_CHANGE_RECONNECTS_PASSED');
  } finally {
    service.disconnectAll();
    agent?.kill('SIGTERM');
    fixture.close();
  }
}
main().then(() => process.exit(process.exitCode || 0), (error) => { console.error(error); process.exit(1); });
