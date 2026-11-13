'use strict';
// Saved SSH credentials against a disposable loopback OpenSSH server, with a
// passphrase-protected client key and no SSH agent. The passphrase lives only
// in a stand-in vault; real OpenSSH processes obtain it through the askpass
// broker. Tunnels, the live monitor, the remote-desktop gateway, terminal
// sessions and Mosh are each checked, together with a wrong saved passphrase,
// an unknown host key, a cancelled sign-in and a profile with nothing saved.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSshdFixture, freePort } = require('./ssh-test-fixture.cjs');
const { TerminalService } = require('../src/main/services/terminal-service.cjs');
const { TunnelService } = require('../src/main/services/tunnel-service.cjs');
const { LiveMonitorService } = require('../src/main/services/live-monitor.cjs');
const { RemoteDesktopGateway } = require('../src/main/services/rdp-gateway.cjs');

const PASSPHRASE = 'fixture saved passphrase 7Q';
const WRONG_PASSPHRASE = 'not the passphrase 3Z';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await delay(50);
  }
}

function descendants(rootPid) {
  const children = new Map();
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/u.test(entry)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8');
      const parent = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(Number(entry));
    } catch { /* process ended */ }
  }
  const found = [];
  const pending = [rootPid];
  while (pending.length) {
    const pid = pending.pop();
    found.push(pid);
    pending.push(...(children.get(pid) || []));
  }
  return found;
}

// The environment and argument list of the ssh process below `rootPid`.
async function sshProcess(rootPid) {
  return until(() => {
    for (const pid of descendants(rootPid)) {
      try {
        const argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
        if (path.basename(argv[0] || '') !== 'ssh') continue;
        return { pid, argv, environ: fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0') };
      } catch { /* process ended */ }
    }
    return null;
  }, 'the ssh process');
}

function assertNoSecret(text, label) {
  for (const secret of [PASSPHRASE, WRONG_PASSPHRASE]) assert.equal(String(text).includes(secret), false, `${label} must not contain a secret`);
}

function assertProcessHoldsNoSecret(processInfo, label) {
  assertNoSecret(processInfo.argv.join('\n'), `${label} arguments`);
  assertNoSecret(processInfo.environ.join('\n'), `${label} environment`);
}

async function echoThrough(port) {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  socket.setTimeout(5000, () => socket.destroy(new Error('Tunnel fixture timed out')));
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    const reply = new Promise((resolve, reject) => { socket.once('data', resolve); socket.once('error', reject); });
    socket.write('AUX_SAVED_CREDENTIAL_OK');
    return (await reply).toString();
  } finally { socket.destroy(); }
}

async function main() {
  // Nothing but the saved credential may unlock the key.
  delete process.env.SSH_AUTH_SOCK;
  for (const name of ['SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE']) delete process.env[name];
  const fixture = await createSshdFixture();
  const lockedKey = path.join(fixture.directory, 'locked_key');
  fs.copyFileSync(fixture.clientKey, lockedKey); fs.chmodSync(lockedKey, 0o600);
  assert.equal(spawnSync('ssh-keygen', ['-q', '-p', '-N', PASSPHRASE, '-f', lockedKey], { encoding: 'utf8' }).status, 0);
  const knownHosts = path.join(fixture.directory, 'known_hosts');
  const hostFingerprint = spawnSync('ssh-keygen', ['-lf', path.join(fixture.directory, 'host_key.pub')], { encoding: 'utf8' }).stdout.split(/\s+/u)[1];
  assert.match(hostFingerprint, /^SHA256:/u);

  const secrets = new Map([['saved', PASSPHRASE], ['wrong', WRONG_PASSPHRASE]]);
  const vaultService = { has: (id) => secrets.has(id), get: async (id) => secrets.get(id) };
  const prompts = [];
  let answer = () => ({ answers: [] });
  const promptBroker = { request: async (kind, payload) => { prompts.push({ kind, payload }); return answer(payload); } };

  const base = { name: 'Fixture', protocol: 'ssh', host: '127.0.0.1', port: fixture.port, username: fixture.user, identityFile: lockedKey, knownHostsFile: knownHosts, useSshConfig: false };
  const saved = { ...base, id: 'saved', credentialId: 'saved', credentialKind: 'passphrase' };
  const wrong = { ...base, id: 'wrong', credentialId: 'wrong', credentialKind: 'passphrase' };
  const nothingSaved = { ...base, id: 'nothing-saved' };

  const echo = net.createServer((socket) => socket.on('data', (chunk) => socket.write(chunk)));
  await new Promise((resolve) => echo.listen(0, '127.0.0.1', resolve));
  const echoPort = echo.address().port;

  const profiles = new Map([saved, wrong, nothingSaved].map((profile) => [profile.id, profile]));
  const tunnelEvents = [];
  const tunnelWindow = { isDestroyed: () => false, webContents: { send: (channel, state) => { if (channel === 'tunnel:status') tunnelEvents.push(state); } } };
  const tunnels = new TunnelService({ get: (id) => profiles.get(id) }, () => tunnelWindow, { vaultService, promptBroker });
  const tunnelStatus = (id, statuses) => until(() => tunnelEvents.findLast((event) => event.id === id && statuses.includes(event.status)), `tunnel ${id} to be ${statuses.join('/')}`);
  const startTunnel = async (id, profileId) => {
    const port = await freePort();
    tunnels.start({ id, name: id, type: 'local', profileId, bindHost: '127.0.0.1', bindPort: port, targetHost: '127.0.0.1', targetPort: echoPort });
    return port;
  };

  const outputs = new Map();
  const exits = new Map();
  const terminalWindow = { isDestroyed: () => false, webContents: { send: (channel, value) => {
    if (channel === 'terminal:data') outputs.set(value.id, `${outputs.get(value.id) || ''}${value.data}`);
    if (channel === 'terminal:exit') exits.set(value.id, value);
  } } };
  const terminals = new TerminalService(() => terminalWindow, { vaultService });
  const output = (id) => outputs.get(id) || '';
  // Runs a command in the remote shell and waits for output only the shell
  // can have produced (the typed text contains the unevaluated expression).
  const reachShell = async (id) => {
    let last = Date.now();
    let seen = 0;
    await until(() => {
      if (output(id).includes('AUX_42_SHELL')) return true;
      if (exits.has(id)) throw new Error(`Terminal exited early: ${output(id)}`);
      if (output(id).length !== seen) { seen = output(id).length; last = Date.now(); }
      else if (seen && Date.now() - last > 400) { terminals.write(id, 'echo AUX_$((40+2))_SHELL\r'); last = Date.now() + 2000; }
      return false;
    }, 'a remote shell', 20_000);
  };

  const monitor = new LiveMonitorService({ vaultService, promptBroker });
  // Stands in for the native desktop client; it only has to stay running.
  const desktopClient = path.join(fixture.directory, 'desktop-client');
  fs.writeFileSync(desktopClient, '#!/bin/sh\nexec sleep 30\n', { mode: 0o700 });
  const gateway = new RemoteDesktopGateway({ vaultService, promptBroker, clientExecutable: desktopClient, connectTimeout: 15_000 });

  try {
    // 1. A tunnel signs in with the saved passphrase and carries data.
    const tunnelPort = await startTunnel('t-saved', 'saved');
    const tunnelProcess = await sshProcess(tunnels.tunnels.get('t-saved').child.pid);
    assert.equal(tunnelProcess.argv.includes('BatchMode=yes'), false);
    assert.ok(tunnelProcess.argv.includes('ExitOnForwardFailure=yes'));
    assert.ok(tunnelProcess.environ.includes('SSH_ASKPASS_REQUIRE=force'));
    assertProcessHoldsNoSecret(tunnelProcess, 'tunnel ssh');
    await tunnelStatus('t-saved', ['running', 'failed']);
    assert.equal(tunnels.list().find((item) => item.id === 't-saved')?.status, 'running', JSON.stringify(tunnelEvents.at(-1)));
    assert.equal(await echoThrough(tunnelPort), 'AUX_SAVED_CREDENTIAL_OK');
    assert.equal(tunnels.tunnels.get('t-saved').askpass.closed, true, 'the broker closes once the tunnel has signed in');
    tunnels.stop('t-saved');
    await tunnelStatus('t-saved', ['stopped']);
    assert.equal(prompts.length, 0, 'nothing is asked when the saved passphrase works');
    console.log('SAVED_CREDENTIAL_TUNNEL_PASSED');

    // 2. The live monitor signs in the same way.
    const snapshot = await monitor.snapshot(saved);
    assert.match(snapshot.sections.uptime, /load average/u);
    assert.equal(prompts.length, 0);
    console.log('SAVED_CREDENTIAL_MONITOR_PASSED');

    // 3. A terminal session reaches the shell without the passphrase being
    // typed, and the passphrase is nowhere in what the session recorded.
    const session = terminals.create({ profile: saved, cols: 120, rows: 30 });
    const terminalProcess = await sshProcess(terminals.sessions.get(session.id).terminal.child.pid);
    assert.ok(terminalProcess.environ.includes('SSH_ASKPASS_REQUIRE=force'));
    assert.ok(terminalProcess.environ.some((entry) => entry.startsWith('AUX_COMMAND_ASKPASS_SOCKET=')));
    assertProcessHoldsNoSecret(terminalProcess, 'terminal ssh');
    await reachShell(session.id);
    assert.doesNotMatch(output(session.id), /Enter passphrase/u, 'the passphrase prompt never reaches the terminal');
    assertNoSecret(output(session.id), 'terminal output');
    assertNoSecret(terminals.exportTranscript(session.id).text, 'transcript');
    assertNoSecret(JSON.stringify(terminals.exportRecording(session.id).chunks), 'recording');
    const brokerDirectory = terminals.sessions.get(session.id).askpass.directory;
    assert.equal(fs.statSync(brokerDirectory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(brokerDirectory, 's')).mode & 0o777, 0o600);
    terminals.close(session.id);
    assert.equal(fs.existsSync(brokerDirectory), false, 'the broker is removed with its session');
    assert.equal(prompts.length, 0);
    console.log('SAVED_CREDENTIAL_TERMINAL_PASSED');

    // 4. A wrong saved passphrase is tried once; the user is then asked once
    // and the connection succeeds. In a terminal the question appears in the
    // terminal, as it always did.
    answer = () => ({ answers: [PASSPHRASE] });
    const afterWrong = await monitor.snapshot(wrong);
    assert.match(afterWrong.sections.uptime, /load average/u);
    assert.equal(prompts.length, 1, 'one dialog, not a loop');
    assert.equal(prompts[0].kind, 'keyboard-interactive');
    assert.deepEqual(prompts[0].payload.prompts, [{ prompt: 'Passphrase for locked_key', echo: false }]);
    assert.match(prompts[0].payload.instructions, /saved passphrase did not unlock/u);
    assertNoSecret(JSON.stringify(prompts[0].payload), 'dialog request');
    prompts.length = 0;
    const retry = terminals.create({ profile: wrong, cols: 120, rows: 30 });
    await until(() => /Enter passphrase for key '[^']+locked_key': $/u.test(output(retry.id)), 'the passphrase prompt in the terminal');
    assertNoSecret(output(retry.id), 'terminal output before typing');
    terminals.write(retry.id, `${PASSPHRASE}\r`);
    await reachShell(retry.id);
    assert.equal(output(retry.id).split('Enter passphrase for key').length - 1, 1, 'asked once in the terminal');
    assertNoSecret(terminals.exportTranscript(retry.id).text, 'transcript after typing');
    terminals.close(retry.id);
    assert.equal(prompts.length, 0, 'a terminal session never opens a dialog');
    console.log('WRONG_SAVED_PASSPHRASE_ASKED_ONCE_PASSED');

    // 5. An unknown host key is shown for confirmation and refused unless the
    // user types "yes".
    const unknownHosts = path.join(fixture.directory, 'unknown_hosts');
    profiles.set('unknown', { ...saved, id: 'unknown', knownHostsFile: unknownHosts });
    for (const [index, reply] of [{ answers: ['y'] }, { answers: ['fine'] }, { answers: [hostFingerprint] }, { answers: [] }].entries()) {
      prompts.length = 0;
      answer = () => reply;
      await startTunnel(`t-unknown-${index}`, 'unknown');
      const refused = await tunnelStatus(`t-unknown-${index}`, ['running', 'failed', 'stopped']);
      assert.equal(refused.status, 'failed', JSON.stringify(reply));
      assert.match(refused.lastError, /not trusted/u);
      assert.equal(prompts.length, 1);
      assert.equal(prompts[0].payload.name, 'Unknown SSH server');
      assert.ok(prompts[0].payload.instructions.includes(hostFingerprint), 'the fingerprint OpenSSH printed is shown');
      assert.deepEqual(prompts[0].payload.prompts.map((prompt) => prompt.echo), [true]);
      assert.equal(fs.existsSync(unknownHosts) && fs.readFileSync(unknownHosts, 'utf8').trim() !== '', false, 'a refused key is not recorded');
    }
    prompts.length = 0;
    answer = () => ({ answers: ['yes'] });
    const acceptedPort = await startTunnel('t-unknown-yes', 'unknown');
    assert.equal((await tunnelStatus('t-unknown-yes', ['running', 'failed'])).status, 'running');
    assert.equal(await echoThrough(acceptedPort), 'AUX_SAVED_CREDENTIAL_OK');
    assert.equal(prompts.length, 1, 'the host key is confirmed; the passphrase comes from the vault');
    assert.match(fs.readFileSync(unknownHosts, 'utf8'), /ssh-ed25519/u);
    tunnels.stop('t-unknown-yes');
    await tunnelStatus('t-unknown-yes', ['stopped']);
    // In a terminal the same question stays in the terminal.
    prompts.length = 0;
    const terminalHosts = path.join(fixture.directory, 'terminal_hosts');
    const asking = terminals.create({ profile: { ...saved, knownHostsFile: terminalHosts }, cols: 200, rows: 30 });
    await until(() => output(asking.id).includes('Are you sure you want to continue connecting (yes/no/[fingerprint])? '), 'the host-key question in the terminal');
    assert.ok(output(asking.id).includes(hostFingerprint));
    terminals.write(asking.id, 'no\r');
    await until(() => exits.has(asking.id), 'the refused session to end');
    assert.match(output(asking.id), /Host key verification failed/u);
    assert.equal(fs.existsSync(terminalHosts), false);
    const trusting = terminals.create({ profile: { ...saved, knownHostsFile: terminalHosts }, cols: 200, rows: 30 });
    await until(() => output(trusting.id).includes('Are you sure you want to continue connecting'), 'the host-key question in the terminal');
    terminals.write(trusting.id, 'yes\r');
    await reachShell(trusting.id);
    assert.doesNotMatch(output(trusting.id), /Enter passphrase/u);
    terminals.close(trusting.id);
    assert.equal(prompts.length, 0);
    console.log('UNKNOWN_HOST_KEY_CONFIRMED_BY_USER_PASSED');

    // 6. With nothing saved a terminal session starts exactly as before: no
    // askpass variables, and OpenSSH asks in the terminal itself.
    const plain = terminals.create({ profile: nothingSaved, cols: 120, rows: 30 });
    assert.equal(terminals.sessions.get(plain.id).askpass, null);
    const plainProcess = await sshProcess(terminals.sessions.get(plain.id).terminal.child.pid);
    assert.deepEqual(plainProcess.environ.filter((entry) => /^(?:SSH_ASKPASS|AUX_COMMAND_ASKPASS)/u.test(entry)), []);
    await until(() => /Enter passphrase for key '[^']+locked_key': $/u.test(output(plain.id)), 'OpenSSH to ask in the terminal');
    terminals.write(plain.id, `${PASSPHRASE}\r`);
    await reachShell(plain.id);
    terminals.close(plain.id);
    // A credential id that the vault does not hold counts as nothing saved.
    const dangling = terminals.create({ profile: { ...nothingSaved, id: 'dangling', credentialId: 'missing', credentialKind: 'passphrase' }, cols: 120, rows: 30 });
    assert.equal(terminals.sessions.get(dangling.id).askpass, null);
    terminals.close(dangling.id);
    console.log('NOTHING_SAVED_TERMINAL_UNCHANGED_PASSED');

    // 7. Nothing saved, background process: the passphrase is asked for in a
    // dialog; cancelling fails at once and is not followed by more dialogs.
    prompts.length = 0;
    answer = () => ({ answers: [] });
    const started = Date.now();
    await assert.rejects(() => monitor.snapshot(nothingSaved), /Sign-in was cancelled/u);
    assert.ok(Date.now() - started < 10_000, 'a cancelled sign-in fails fast');
    assert.equal(prompts.length, 1);
    assert.match(prompts[0].payload.instructions, /protected by a passphrase/u);
    await assert.rejects(() => monitor.snapshot(nothingSaved), /Permission denied/u);
    assert.equal(prompts.length, 1, 'an automatic refresh does not ask again straight after a cancel');
    prompts.length = 0;
    await startTunnel('t-cancel', 'nothing-saved');
    const cancelled = await tunnelStatus('t-cancel', ['running', 'failed', 'stopped']);
    assert.equal(cancelled.status, 'failed');
    assert.equal(cancelled.lastError, 'Sign-in was cancelled');
    assert.equal(prompts.length, 1);
    prompts.length = 0;
    answer = () => ({ answers: [PASSPHRASE] });
    const typedPort = await startTunnel('t-typed', 'nothing-saved');
    assert.equal((await tunnelStatus('t-typed', ['running', 'failed'])).status, 'running');
    assert.equal(await echoThrough(typedPort), 'AUX_SAVED_CREDENTIAL_OK');
    assert.equal(prompts.length, 1);
    tunnels.stop('t-typed');
    await tunnelStatus('t-typed', ['stopped']);
    console.log('BACKGROUND_PROMPT_DIALOG_AND_CANCEL_PASSED');

    // 8. The remote-desktop gateway forwards through the same sign-in.
    prompts.length = 0;
    const desktop = await gateway.connect({ gatewayProfile: saved, protocol: 'vnc', targetHost: '127.0.0.1', targetPort: echoPort });
    assert.equal(desktop.status, 'connected');
    assert.equal(await echoThrough(desktop.localPort), 'AUX_SAVED_CREDENTIAL_OK');
    gateway.disconnect(desktop.id);
    assert.equal(prompts.length, 0);
    console.log('SAVED_CREDENTIAL_GATEWAY_PASSED');

    // 9. Mosh starts through ssh; that sign-in uses the saved passphrase too.
    const mosh = terminals.create({ profile: { ...saved, id: 'saved-mosh', protocol: 'mosh' }, cols: 120, rows: 30 });
    await reachShell(mosh.id);
    assert.doesNotMatch(output(mosh.id), /Enter passphrase/u);
    assertNoSecret(terminals.exportTranscript(mosh.id).text, 'mosh transcript');
    terminals.close(mosh.id);
    assert.equal(prompts.length, 0);
    console.log('SAVED_CREDENTIAL_MOSH_PASSED');
  } finally {
    terminals.closeAll(); tunnels.stopAll(); monitor.cancelAll(); gateway.disconnectAll();
    await delay(300);
    fixture.close();
    await new Promise((resolve) => echo.close(resolve));
  }
}
main().then(() => process.exit(process.exitCode || 0), (error) => { console.error(error); process.exit(1); });
