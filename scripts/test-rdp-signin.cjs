'use strict';
// Run under xvfb-run. Checks RDP sign-in against a FreeRDP shadow server that
// requires network level authentication: a stored password, a password asked
// for at connection time, a refused password and a cancelled prompt. The
// server binds only to loopback with a disposable account and configuration.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { VncBridgeService } = require('../src/main/services/vnc-bridge.cjs');
const { RdpEmbedService } = require('../src/main/services/rdp-embed.cjs');
const { KnownHostService } = require('../src/main/services/known-host-service.cjs');
const { startShadowServer } = require('./start-shadow-server.cjs');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// FreeRDP 3 packages name the test server freerdp-shadow-cli3.
const shadowServer = require('../src/main/lib/executable-finder.cjs').findExecutable(['freerdp-shadow-cli', 'freerdp-shadow-cli3']) || 'freerdp-shadow-cli';
const PASSWORD = 'Fixture-Pass-1';

function ntHash(password) {
  const input = Buffer.from(password, 'utf16le');
  try { return createHash('md4').update(input).digest('hex'); }
  catch {
    // OpenSSL 3 keeps MD4 in its legacy provider.
    const result = spawnSync('openssl', ['dgst', '-md4', '-provider', 'legacy'], { input, encoding: 'utf8' });
    const match = /([0-9a-f]{32})\s*$/u.exec(result.stdout || '');
    if (!match) throw new Error(`Could not compute the fixture account hash: ${result.stderr}`);
    return match[1];
  }
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-rdp-signin-'));
  process.env.XDG_CONFIG_HOME = directory;
  const sam = path.join(directory, 'sam');
  fs.writeFileSync(sam, `fixture:::${ntHash(PASSWORD)}:::\n`, { mode: 0o600 });
  const listener = net.createServer(); await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  const shadow = await startShadowServer(shadowServer, [`/port:${port}`, '/bind-address:127.0.0.1', '/sec:nla', `/sam-file:${sam}`], port);
  const bridge = new VncBridgeService();
  const knownHostService = new KnownHostService(directory, { request: async () => ({ accept: true, remember: true }) });
  const prompts = [];
  let promptAnswer = { answers: [] };
  const promptBroker = { request: async (kind, payload) => { prompts.push({ kind, payload }); return promptAnswer; } };
  let stored = '';
  const vaultService = { has: () => Boolean(stored), get: async () => stored };
  const service = new RdpEmbedService({ vncBridge: bridge, knownHostService, vaultService, promptBroker });
  const profile = (extra = {}) => ({ id: 'fixture', name: 'Fixture RDP', protocol: 'rdp', host: '127.0.0.1', port, username: 'fixture', credentialId: 'test', ...extra });
  const connected = async (session) => {
    await delay(2500);
    assert.equal(service.list().length, 1, `RDP client exited: ${shadow.log}`);
    const record = service.sessions.get(session.id);
    const windows = spawnSync('xwininfo', ['-display', `:${record.display}`, '-root', '-tree'], { encoding: 'utf8', env: { ...process.env, XAUTHORITY: record.xauthority } });
    assert.match(windows.stdout, /FreeRDP/u, 'RDP must have a rendered client window');
    service.stop(session.id);
    await delay(500);
  };
  try {
    assert.equal(shadow.exitCode, null, shadow.log);
    // FreeRDP 2 and 3 ask for sign-in details differently; say which one ran.
    const { findExecutable } = require('../src/main/lib/executable-finder.cjs');
    const { freerdpMajor } = require('../src/main/lib/rdp-certificate.cjs');
    const client = findExecutable(['xfreerdp3', 'xfreerdp']);
    console.log(`RDP_SIGN_IN_CLIENT ${client} (FreeRDP ${freerdpMajor(client)})`);

    stored = PASSWORD;
    await connected(await service.start(profile()));
    assert.equal(prompts.length, 0, 'a stored password must not prompt');
    console.log('RDP_NLA_STORED_PASSWORD_PASSED');

    // With a domain set there is nothing left for FreeRDP to ask for either.
    await connected(await service.start(profile({ rdpDomain: 'WORKGROUP' })));
    assert.equal(prompts.length, 0);
    console.log('RDP_NLA_STORED_PASSWORD_WITH_DOMAIN_PASSED');

    stored = '';
    promptAnswer = { answers: [PASSWORD] };
    await connected(await service.start(profile()));
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].kind, 'keyboard-interactive');
    assert.deepEqual(prompts[0].payload.prompts, [{ prompt: 'Password for fixture', echo: false }]);
    console.log('RDP_NLA_PROMPTED_PASSWORD_PASSED');

    promptAnswer = { answers: ['fixture', PASSWORD] };
    await connected(await service.start(profile({ username: '' })));
    assert.deepEqual(prompts[1].payload.prompts.map((prompt) => prompt.echo), [true, false], 'a missing user name is asked for with the password');
    console.log('RDP_NLA_PROMPTED_USER_AND_PASSWORD_PASSED');

    // The password never appears in a process argument list.
    stored = PASSWORD;
    const session = await service.start(profile());
    const commandLines = spawnSync('ps', ['-eo', 'args'], { encoding: 'utf8' }).stdout;
    assert.equal(commandLines.includes(PASSWORD), false, 'the password must not be visible in the process list');
    service.stop(session.id); await delay(500);
    console.log('RDP_PASSWORD_NOT_IN_PROCESS_LIST_PASSED');

    stored = 'not-the-password';
    await assert.rejects(() => service.start(profile()), /RDP sign-in failed/u);
    assert.equal(service.list().length, 0, 'a refused sign-in must not leave a session');
    assert.equal(bridge.list().length, 0);
    console.log('RDP_NLA_WRONG_PASSWORD_REPORTED');

    stored = '';
    promptAnswer = { answers: [] };
    await assert.rejects(() => service.start(profile()), /RDP sign-in was cancelled/u);
    assert.equal(service.list().length, 0, 'a cancelled sign-in must not start anything');
    console.log('RDP_SIGN_IN_CANCEL_PASSED');

    // No password at all: the client must give up instead of waiting forever.
    promptAnswer = { answers: [''] };
    const started = Date.now();
    await assert.rejects(() => service.start(profile()), /RDP sign-in failed|closed the connection/u);
    assert.ok(Date.now() - started < 15000, 'a connection without a password must not hang');
    assert.equal(service.list().length, 0);
    console.log('RDP_EMPTY_PASSWORD_DOES_NOT_HANG_PASSED');
  } finally {
    service.stopAll(); bridge.stopAll(); shadow.kill('SIGTERM');
    await delay(1000); fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
