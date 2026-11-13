'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  AskpassPolicy,
  MAX_ANSWER_BYTES,
  MAX_PROMPT_CHARS,
  MAX_REQUEST_BYTES,
  SOCKET_ENV,
  TOKEN_ENV,
  askpassProgram,
  classifyPrompt,
  createAskpassSession,
  hasStoredCredential,
  supportsForcedAskpass,
  supportsSavedCredentialAnswers,
  sweepStaleAskpassDirectories,
  tokenMatches,
  usableAnswer
} = require('../src/main/lib/ssh-askpass.cjs');
const { resolveHelper } = require('../src/main/lib/command-builder.cjs');
const { LiveMonitorService } = require('../src/main/services/live-monitor.cjs');
const { RemoteDesktopGateway } = require('../src/main/services/rdp-gateway.cjs');
const { TunnelService } = require('../src/main/services/tunnel-service.cjs');
const { TerminalService } = require('../src/main/services/terminal-service.cjs');
const { findExecutable } = require('../src/main/lib/executable-finder.cjs');

const HELPER = path.join(__dirname, '../src/main/helpers/ssh_askpass.py');
const SECRET = 'unit-test secret 9K';
const HOST_KEY_PROMPT = "The authenticity of host '[127.0.0.1]:2222 ([127.0.0.1]:2222)' can't be established.\n"
  + 'ED25519 key fingerprint is SHA256:d2R4qWcIhTB2N7+FKN+mnLD5aCip+t+nxP1Oq7sXZ7s.\n'
  + 'This key is not known by any other names.\n'
  + 'Are you sure you want to continue connecting (yes/no/[fingerprint])? ';

function vault(secret = SECRET) {
  const calls = [];
  return { calls, has: (id) => id === 'cred', get: async (id) => { calls.push(id); return secret; } };
}

function dialogs(reply = () => ({ answers: [] })) {
  const requests = [];
  return { requests, request: async (kind, payload, timeoutMs) => { requests.push({ kind, payload, timeoutMs }); return reply(payload, requests.length); } };
}

const passwordProfile = { id: 'p', name: 'Server', host: 'server.example', username: 'deploy', credentialId: 'cred', credentialKind: 'password', useSshConfig: false };
const keyProfile = { id: 'k', name: 'Server', host: 'server.example', username: 'deploy', identityFile: '/keys/id_ed25519', credentialId: 'cred', credentialKind: 'passphrase', useSshConfig: false };
const noLookup = async () => ({});

function policy(options) {
  return new AskpassPolicy({ resolveLogin: noLookup, ...options });
}

test('recognises the prompts OpenSSH itself prints, and nothing else', () => {
  assert.deepEqual(classifyPrompt("deploy@server.example's password: "), { type: 'password', user: 'deploy', host: 'server.example' });
  assert.deepEqual(classifyPrompt("first.last@corp@10.0.0.5's password: "), { type: 'password', user: 'first.last@corp', host: '10.0.0.5' });
  assert.deepEqual(classifyPrompt("Enter passphrase for key '/home/u/.ssh/id_ed25519': "), { type: 'passphrase', keyPath: '/home/u/.ssh/id_ed25519' });
  assert.deepEqual(classifyPrompt("Enter passphrase for key '/home/u/my keys/it's here': "), { type: 'passphrase', keyPath: "/home/u/my keys/it's here" });
  const hostKey = classifyPrompt(HOST_KEY_PROMPT);
  assert.equal(hostKey.type, 'host-key');
  assert.match(hostKey.details, /SHA256:d2R4qWcIhTB2N7\+FKN\+mnLD5aCip\+t\+nxP1Oq7sXZ7s\.\nThis key is not known by any other names\.$/u);
  assert.equal(classifyPrompt("Warning: the ED25519 host key for 'server' differs from the key for the IP address '10.0.0.5'\nOffending key for IP in /home/u/.ssh/known_hosts:3\nAre you sure you want to continue connecting (yes/no)? ").type, 'host-key');
  assert.equal(classifyPrompt("Please type 'yes', 'no' or the fingerprint: ").type, 'host-key');
  assert.equal(classifyPrompt("Please type 'yes' or 'no': ").type, 'host-key');

  for (const other of [
    '',
    '(deploy@server.example) Password: ',
    '(deploy@server.example) Verification code: ',
    // A server cannot imitate OpenSSH's own prompts through keyboard-interactive.
    "(deploy@jump.example) deploy@server.example's password: ",
    "(deploy@jump.example) Enter passphrase for key '/keys/id_ed25519': ",
    `(deploy@jump.example) ${HOST_KEY_PROMPT}`,
    "Enter deploy@server.example's old password: ",
    "Enter deploy@server.example's new password: ",
    "Retype deploy@server.example's new password: ",
    'Enter PIN for ED25519-SK key /home/u/.ssh/id_ed25519_sk: ',
    "deploy@server.example's password:",
    "@server.example's password: ",
    "deploy@'s password: ",
    "Enter passphrase for key '': ",
    "Enter passphrase for key '/a\n/b': ",
    'Are you sure you want to continue connecting (yes/no/[fingerprint])? ',
    "The authenticity of host 'x' can't be established.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? and more",
    'Password: '
  ]) assert.deepEqual(classifyPrompt(other), { type: 'other' }, JSON.stringify(other));
  assert.deepEqual(classifyPrompt(undefined), { type: 'other' });
  assert.deepEqual(classifyPrompt({ prompt: "a@b's password: " }), { type: 'other' });
});

test('tokens are compared as a whole and answers must survive the trip through OpenSSH', () => {
  assert.equal(tokenMatches('abc', 'abc'), true);
  for (const wrong of ['abd', 'ab', 'abcd', '', undefined, null, 123, ['abc']]) assert.equal(tokenMatches('abc', wrong), false);
  assert.equal(tokenMatches('', ''), false);
  assert.equal(usableAnswer('correct horse'), true);
  assert.equal(usableAnswer(''), true);
  assert.equal(usableAnswer('two\nlines'), false);
  assert.equal(usableAnswer('carriage\rreturn'), false);
  assert.equal(usableAnswer('nul\u0000byte'), false);
  assert.equal(usableAnswer('x'.repeat(MAX_ANSWER_BYTES)), true);
  assert.equal(usableAnswer('x'.repeat(MAX_ANSWER_BYTES + 1)), false);
  assert.equal(usableAnswer(42), false);
  assert.equal(hasStoredCredential({ credentialId: 'cred' }, vault()), true);
  assert.equal(hasStoredCredential({ credentialId: 'other' }, vault()), false);
  assert.equal(hasStoredCredential({ credentialId: '' }, vault()), false);
  assert.equal(hasStoredCredential({ credentialId: 'cred' }, null), false);
  assert.equal(hasStoredCredential({ credentialId: 'cred' }, { has: () => { throw new Error('invalid'); } }), false);
});

test('the saved password answers the profile\'s own password prompt once, then the user is asked', async () => {
  const store = vault();
  const broker = dialogs(() => ({ answers: ['typed by the user'] }));
  const aborted = [];
  const rules = policy({ profile: passwordProfile, vaultService: store, promptBroker: broker, onAbort: (reason) => aborted.push(reason) });
  assert.deepEqual(await rules.decide({ prompt: "deploy@server.example's password: ", pid: 10 }), { action: 'answer', value: SECRET });
  assert.equal(broker.requests.length, 0);
  // Asked again: the saved password was wrong. It is not sent a second time.
  assert.deepEqual(await rules.decide({ prompt: "deploy@server.example's password: ", pid: 10 }), { action: 'answer', value: 'typed by the user' });
  assert.deepEqual(await rules.decide({ prompt: "deploy@server.example's password: ", pid: 10 }), { action: 'answer', value: 'typed by the user' });
  assert.equal(store.calls.length, 1);
  assert.equal(broker.requests.length, 2);
  assert.equal(broker.requests[0].kind, 'keyboard-interactive');
  assert.deepEqual(broker.requests[0].payload, {
    profileName: 'Server', host: 'server.example', name: 'SSH sign-in',
    instructions: 'The saved password was not accepted.', language: '',
    prompts: [{ prompt: 'Password for deploy@server.example', echo: false }],
    // The same text as source messages, for the window to translate.
    messages: {
      name: { text: 'SSH sign-in', params: {} },
      instructions: { text: 'The saved password was not accepted.', params: {} },
      prompts: [{ text: 'Password for {p0}', params: { p0: 'deploy@server.example' } }],
      details: ''
    }
  });
  assert.equal(JSON.stringify(broker.requests).includes(SECRET), false);
  assert.deepEqual(aborted, []);
});

test('the saved password is never given to another host, another user or another kind of prompt', async () => {
  for (const prompt of [
    "deploy@jump.example's password: ",
    "root@server.example's password: ",
    '(deploy@server.example) Password: ',
    "(deploy@jump.example) deploy@server.example's password: ",
    "Enter passphrase for key '/keys/id_ed25519': ",
    "Enter deploy@server.example's old password: ",
    HOST_KEY_PROMPT,
    'Verification code: '
  ]) {
    const store = vault();
    const broker = dialogs(() => ({ answers: ['from the user'] }));
    const rules = policy({ profile: passwordProfile, vaultService: store, promptBroker: broker });
    const reply = await rules.decide({ prompt, pid: 10 });
    assert.equal(store.calls.length, 0, prompt);
    assert.equal(broker.requests.length, 1, prompt);
    assert.notEqual(reply.value, SECRET, prompt);
  }
});

test('the login OpenSSH resolves from its configuration counts as the profile\'s own', async () => {
  const aliasProfile = { ...passwordProfile, host: 'prod', sshAlias: 'prod', username: '', useSshConfig: true };
  const resolved = async () => ({ hostname: '10.0.0.5', user: 'ops', hostKeyAlias: 'prod-key' });
  for (const prompt of ["ops@10.0.0.5's password: ", "ops@prod-key's password: ", "ops@prod's password: "]) {
    const rules = new AskpassPolicy({ profile: aliasProfile, vaultService: vault(), promptBroker: dialogs(), resolveLogin: resolved });
    assert.deepEqual(await rules.decide({ prompt }), { action: 'answer', value: SECRET }, prompt);
  }
  const store = vault();
  const strict = new AskpassPolicy({ profile: aliasProfile, vaultService: store, promptBroker: dialogs(), resolveLogin: resolved });
  assert.deepEqual(await strict.decide({ prompt: "deploy@10.0.0.5's password: " }), { action: 'deny' });
  assert.equal(store.calls.length, 0);
  // A profile's own user name wins over the configuration's.
  const named = new AskpassPolicy({ profile: { ...aliasProfile, username: 'deploy' }, vaultService: vault(), promptBroker: dialogs(), resolveLogin: resolved });
  assert.deepEqual(await named.decide({ prompt: "deploy@10.0.0.5's password: " }), { action: 'answer', value: SECRET });
  // When the configuration cannot be read, the profile and the local account name still apply.
  const failing = new AskpassPolicy({ profile: { ...passwordProfile, username: '' }, vaultService: vault(), promptBroker: dialogs(), resolveLogin: async () => { throw new Error('ssh -G failed'); } });
  assert.deepEqual(await failing.decide({ prompt: `${os.userInfo().username}@server.example's password: ` }), { action: 'answer', value: SECRET });
});

test('two password prompts at the same moment cannot both receive the saved password', async () => {
  const store = vault();
  const broker = dialogs(() => ({ answers: ['typed'] }));
  const rules = policy({ profile: passwordProfile, vaultService: store, promptBroker: broker });
  const replies = await Promise.all([1, 2, 3].map((pid) => rules.decide({ prompt: "deploy@server.example's password: ", pid })));
  assert.equal(replies.filter((reply) => reply.value === SECRET).length, 1);
  assert.equal(store.calls.length, 1);
});

test('the saved passphrase unlocks the profile\'s key once per key and ssh process', async () => {
  const store = vault();
  const broker = dialogs(() => ({ answers: ['typed passphrase'] }));
  // Process 10 is the one started for this policy; 11 is the ProxyJump ssh it started.
  const tree = new Map([[10, 1], [11, 10]]);
  const rules = policy({ profile: keyProfile, vaultService: store, promptBroker: broker, parentOf: (pid) => tree.get(pid) || 0 });
  rules.trackProcess(10);
  const prompt = "Enter passphrase for key '/keys/id_ed25519': ";
  assert.deepEqual(await rules.decide({ prompt, pid: 10 }), { action: 'answer', value: SECRET });
  // A jump-host ssh process loading the same key gets its own single try.
  assert.deepEqual(await rules.decide({ prompt, pid: 11 }), { action: 'answer', value: SECRET });
  assert.equal(broker.requests.length, 0);
  // The same process asking again means the passphrase did not unlock the key.
  assert.deepEqual(await rules.decide({ prompt, pid: 10 }), { action: 'answer', value: 'typed passphrase' });
  assert.equal(store.calls.length, 2);
  assert.deepEqual(broker.requests[0].payload.prompts, [{ prompt: 'Passphrase for id_ed25519', echo: false }]);
  assert.equal(broker.requests[0].payload.instructions, 'The saved passphrase did not unlock /keys/id_ed25519.');

  // Another key is not the profile's key.
  const other = policy({ profile: keyProfile, vaultService: vault(), promptBroker: dialogs(() => ({ answers: ['x'] })) });
  assert.deepEqual(await other.decide({ prompt: "Enter passphrase for key '/home/u/.ssh/id_rsa': ", pid: 10 }), { action: 'answer', value: 'x' });
  assert.equal(other.vaultService.calls.length, 0);
  assert.equal(other.promptBroker.requests[0].payload.instructions, 'The SSH key /home/u/.ssh/id_rsa is protected by a passphrase.');

  // A password prompt never receives a passphrase.
  const mismatch = policy({ profile: keyProfile, vaultService: vault(), promptBroker: dialogs(() => ({ answers: ['pw'] })) });
  assert.deepEqual(await mismatch.decide({ prompt: "deploy@server.example's password: ", pid: 10 }), { action: 'answer', value: 'pw' });
  assert.equal(mismatch.vaultService.calls.length, 0);

  // Without an identity file in the profile, each key OpenSSH tries gets one attempt.
  const anyKey = policy({ profile: { ...keyProfile, identityFile: '' }, vaultService: vault(), promptBroker: dialogs() });
  anyKey.trackProcess(10);
  assert.deepEqual(await anyKey.decide({ prompt: "Enter passphrase for key '/home/u/.ssh/id_rsa': ", pid: 10 }), { action: 'answer', value: SECRET });
  assert.deepEqual(await anyKey.decide({ prompt: "Enter passphrase for key '/home/u/.ssh/id_ed25519': ", pid: 10 }), { action: 'answer', value: SECRET });
  assert.deepEqual(await anyKey.decide({ prompt: "Enter passphrase for key '/home/u/.ssh/id_rsa': ", pid: 10 }), { action: 'deny' });

  // OpenSSH prints at most 100 bytes of a long key path.
  const longPath = `/keys/${'d'.repeat(120)}/id_ed25519`;
  const long = policy({ profile: { ...keyProfile, identityFile: longPath }, vaultService: vault(), promptBroker: dialogs() });
  long.trackProcess(10);
  assert.deepEqual(await long.decide({ prompt: `Enter passphrase for key '${longPath.slice(0, 100)}': `, pid: 10 }), { action: 'answer', value: SECRET });
});

test('the saved passphrase is released once per key to the session, however many pids a client claims', async () => {
  const prompt = "Enter passphrase for key '/keys/id_ed25519': ";
  const tree = new Map([[10, 1], [11, 10], [12, 11], [900, 1]]);
  const parentOf = (pid) => tree.get(pid) || 0;
  const forged = [1000, 1001, 1002, 1003, 1004, 900, 1, 0, -5, 'x', 10.5];

  // A process started for the policy is registered: forged pids get nothing.
  const store = vault();
  const broker = dialogs(() => ({ answers: ['typed'] }));
  const rules = policy({ profile: keyProfile, vaultService: store, promptBroker: broker, parentOf });
  rules.trackProcess(10);
  for (const pid of forged) assert.deepEqual(await rules.decide({ prompt, pid }), { action: 'answer', value: 'typed' }, `pid ${pid}`);
  assert.equal(store.calls.length, 0);
  // The real process and its descendants (a ProxyJump ssh, and its own ProxyJump) still get one release each.
  assert.deepEqual(await rules.decide({ prompt, pid: 10 }), { action: 'answer', value: SECRET });
  assert.deepEqual(await rules.decide({ prompt, pid: 12 }), { action: 'answer', value: SECRET });
  assert.deepEqual(await rules.decide({ prompt, pid: 10 }), { action: 'answer', value: 'typed' });
  assert.equal(store.calls.length, 2);

  // Nothing tracked yet: no pid belongs to this session, so nothing is released
  // and every request is answered by the user (a forged pid cannot be accepted
  // just because the real process was never registered).
  const loose = vault();
  const unregistered = policy({ profile: keyProfile, vaultService: loose, promptBroker: dialogs(() => ({ answers: ['typed', 'typed', 'typed', 'typed', 'typed', 'typed'] })), parentOf });
  for (const pid of [10, 11, 12, 1000, 1001, 1002, 0, undefined]) {
    assert.deepEqual(await unregistered.decide({ prompt, pid }), { action: 'answer', value: 'typed' }, `pid ${pid}`);
  }
  assert.equal(loose.calls.length, 0);
  // Tracking a process afterwards starts releasing for it, once.
  unregistered.trackProcess(10);
  assert.deepEqual(await unregistered.decide({ prompt, pid: 10 }), { action: 'answer', value: SECRET });
  assert.deepEqual(await unregistered.decide({ prompt, pid: 1000 }), { action: 'answer', value: 'typed' });
});

test('a pid is checked against the real process tree in /proc', { skip: !fs.existsSync('/proc/self/stat') }, async () => {
  const prompt = "Enter passphrase for key '/keys/id_ed25519': ";
  // sh (started here) starts a sleeping child: the child is a descendant.
  const shell = spawn('/bin/sh', ['-c', 'sleep 30 & echo $!; wait'], { stdio: ['ignore', 'pipe', 'ignore'] });
  let childPid = 0;
  try {
    childPid = await new Promise((resolve) => shell.stdout.once('data', (chunk) => resolve(Number(String(chunk).trim()))));
    const store = vault();
    const rules = policy({ profile: keyProfile, vaultService: store, promptBroker: dialogs(() => ({ answers: ['typed'] })) });
    rules.trackProcess(shell.pid);
    // This test process is not a descendant of the shell.
    assert.deepEqual(await rules.decide({ prompt, pid: process.pid }), { action: 'answer', value: 'typed' });
    assert.equal(store.calls.length, 0);
    assert.deepEqual(await rules.decide({ prompt, pid: childPid }), { action: 'answer', value: SECRET });
    assert.equal(store.calls.length, 1);
  } finally {
    for (const pid of [childPid, shell.pid]) { try { if (pid) process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  }
});

test('start-up removes askpass directories a crash left behind, and only those', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-sweep-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stale = path.join(root, 'aux-command-askpass-AbC123');
  fs.mkdirSync(stale);
  fs.writeFileSync(path.join(stale, 's'), '');                    // socket file nobody listens on
  const empty = path.join(root, 'aux-command-askpass-Zz9876');
  fs.mkdirSync(empty);
  const liveDirectory = path.join(root, 'aux-command-askpass-Live01');
  fs.mkdirSync(liveDirectory);
  const live = net.createServer((socket) => socket.destroy());   // another running instance
  await new Promise((resolve) => live.listen(path.join(liveDirectory, 's'), resolve));
  t.after(() => live.close());
  const unrelated = path.join(root, 'aux-command-other');
  fs.mkdirSync(unrelated);
  const wrongName = path.join(root, 'aux-command-askpass-short');
  fs.mkdirSync(wrongName);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-sweep-target-'));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  fs.symlinkSync(target, path.join(root, 'aux-command-askpass-Link99'));
  const mine = createAskpassSession({ runtimeDir: root, helper: HELPER });
  t.after(() => mine.close());

  const removed = await sweepStaleAskpassDirectories({ roots: [root] });
  assert.deepEqual(removed.map((directory) => path.basename(directory)).sort(), ['aux-command-askpass-AbC123', 'aux-command-askpass-Zz9876']);
  assert.equal(fs.existsSync(liveDirectory), true);
  assert.equal(fs.existsSync(mine.directory), true);
  assert.equal(fs.existsSync(unrelated), true);
  assert.equal(fs.existsSync(wrongName), true);
  assert.equal(fs.existsSync(target), true);
  assert.equal(fs.existsSync(path.join(root, 'aux-command-askpass-Link99')), true);
});

test('a host key is only ever accepted by the user typing yes', async () => {
  for (const [typed, accepted] of [['yes', true], [' YES ', true], ['y', false], ['', false], ['no', false], ['yes please', false], ['SHA256:d2R4qWcIhTB2N7+FKN+mnLD5aCip+t+nxP1Oq7sXZ7s', false], [SECRET, false]]) {
    const store = vault();
    const broker = dialogs(() => ({ answers: [typed] }));
    const aborted = [];
    const rules = policy({ profile: passwordProfile, vaultService: store, promptBroker: broker, onAbort: (reason) => aborted.push(reason) });
    const reply = await rules.decide({ prompt: HOST_KEY_PROMPT, pid: 10 });
    assert.deepEqual(reply, accepted ? { action: 'answer', value: 'yes' } : { action: 'deny' }, JSON.stringify(typed));
    assert.equal(aborted.length, accepted ? 0 : 1);
    assert.equal(store.calls.length, 0, 'the vault is never consulted for a host key');
    assert.equal(broker.requests.length, 1);
    const { payload } = broker.requests[0];
    assert.equal(payload.name, 'Unknown SSH server');
    assert.ok(payload.instructions.includes('ED25519 key fingerprint is SHA256:d2R4qWcIhTB2N7+FKN+mnLD5aCip+t+nxP1Oq7sXZ7s.'));
    assert.deepEqual(payload.prompts.map((prompt) => prompt.echo), [true]);
    // OpenSSH's own text travels separately and unchanged; only the text
    // written by the application has a source message.
    assert.equal(payload.messages.details, HOST_KEY_PROMPT.slice(0, HOST_KEY_PROMPT.lastIndexOf('\n')).trim());
    assert.ok(payload.instructions.startsWith(`${payload.messages.details}\n\n`));
    assert.deepEqual(payload.messages.name, { text: 'Unknown SSH server', params: {} });
    assert.equal(payload.messages.instructions.text, 'Check the fingerprint. Type yes to trust this server and continue; anything else stops the connection.');
    assert.deepEqual(payload.messages.prompts, [{ text: 'Trust this server? Type yes to continue', params: {}, placeholder: 'yes' }]);
  }
  // No window to ask in: refused, never assumed.
  const aborted = [];
  const alone = policy({ profile: passwordProfile, vaultService: vault(), promptBroker: null, onAbort: (reason) => aborted.push(reason) });
  assert.deepEqual(await alone.decide({ prompt: HOST_KEY_PROMPT }), { action: 'deny' });
  assert.equal(aborted.length, 1);
});

test('a cancelled, unanswered or failed dialog denies the prompt and every later one', async () => {
  for (const reply of [() => ({ answers: [] }), () => ({}), () => null, () => { throw new Error('keyboard-interactive prompt timed out'); }]) {
    const broker = dialogs(reply);
    const aborted = [];
    const prompting = [];
    const rules = policy({ profile: { ...passwordProfile, credentialId: '' }, vaultService: vault(), promptBroker: broker, onAbort: (reason) => aborted.push(reason), onPrompting: (open) => prompting.push(open) });
    assert.deepEqual(await rules.decide({ prompt: "deploy@server.example's password: " }), { action: 'deny' });
    assert.deepEqual(await rules.decide({ prompt: "deploy@server.example's password: " }), { action: 'deny' });
    assert.deepEqual(await rules.decide({ prompt: HOST_KEY_PROMPT }), { action: 'deny' });
    assert.equal(broker.requests.length, 1, 'no further dialog after a cancel');
    assert.equal(aborted.length, 1);
    assert.deepEqual(prompting, [true, false]);
  }
  // Nothing saved and a typed answer: passed on, with the dialog time-out the caller chose.
  const broker = dialogs(() => ({ answers: ['123456'] }));
  const rules = policy({ profile: { ...passwordProfile, credentialId: '' }, vaultService: vault(), promptBroker: broker, promptTimeoutMs: 4321 });
  assert.deepEqual(await rules.decide({ prompt: '(deploy@server.example) Verification code: ' }), { action: 'answer', value: '123456' });
  assert.equal(broker.requests[0].timeoutMs, 4321);
  assert.deepEqual(broker.requests[0].payload.prompts, [{ prompt: '(deploy@server.example) Verification code', echo: false }]);
  assert.deepEqual(broker.requests[0].payload.messages.prompts, [null], 'a prompt from the server has no source message, so it is never translated');
  assert.equal(broker.requests[0].payload.messages.instructions, null);
  // An answer OpenSSH could not read back is refused rather than cut short.
  const multi = policy({ profile: { ...passwordProfile, credentialId: '' }, promptBroker: dialogs(() => ({ answers: ['two\nlines'] })) });
  assert.deepEqual(await multi.decide({ prompt: 'Verification code: ' }), { action: 'deny' });
});

test('a saved secret the vault cannot produce, or that OpenSSH could not read, falls back to asking', async () => {
  for (const store of [
    { has: () => true, get: async () => { throw new Error('Persistent credential encryption is unavailable'); } },
    { has: () => true, get: async () => 'line one\nline two' },
    { has: () => true, get: async () => 'x'.repeat(MAX_ANSWER_BYTES + 1) },
    { has: () => true, get: async () => '' },
    { has: () => false, get: async () => SECRET }
  ]) {
    const broker = dialogs(() => ({ answers: ['typed'] }));
    const rules = policy({ profile: passwordProfile, vaultService: store, promptBroker: broker });
    assert.deepEqual(await rules.decide({ prompt: "deploy@server.example's password: " }), { action: 'answer', value: 'typed' });
    assert.equal(broker.requests[0].payload.instructions, '', 'nothing saved was tried, so nothing is reported as rejected');
  }
});

test('in a terminal session everything the vault does not answer goes back to the terminal', async () => {
  const broker = dialogs(() => ({ answers: ['must not be used'] }));
  const rules = policy({ profile: keyProfile, vaultService: vault(), promptBroker: broker, mode: 'terminal' });
  rules.trackProcess(10);
  const prompt = "Enter passphrase for key '/keys/id_ed25519': ";
  assert.deepEqual(await rules.decide({ prompt, pid: 10 }), { action: 'answer', value: SECRET });
  assert.deepEqual(await rules.decide({ prompt, pid: 10 }), { action: 'terminal', echo: false });
  assert.deepEqual(await rules.decide({ prompt: HOST_KEY_PROMPT, pid: 10 }), { action: 'terminal', echo: true });
  assert.deepEqual(await rules.decide({ prompt: "Please type 'yes', 'no' or the fingerprint: ", pid: 10 }), { action: 'terminal', echo: true });
  assert.deepEqual(await rules.decide({ prompt: '(deploy@server.example) Verification code: ', pid: 10 }), { action: 'terminal', echo: false });
  assert.deepEqual(await rules.decide({ prompt: "deploy@server.example's password: ", pid: 10 }), { action: 'terminal', echo: false });
  assert.equal(broker.requests.length, 0);
});

// --- the socket broker and the bundled helper --------------------------------

function send(socketPath, payload, { end = false } = {}) {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    let received = '';
    socket.on('connect', () => { if (payload !== null) socket.write(payload); if (end) socket.end(); });
    socket.on('data', (chunk) => { received += chunk; });
    socket.on('error', () => resolve({ received, error: true }));
    socket.on('close', () => resolve({ received }));
  });
}

function runHelper(env, args, helper = HELPER) {
  return new Promise((resolve, reject) => {
    const child = spawn(helper, args, { env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('the broker lives in a private directory and its environment holds no secret', async () => {
  const session = createAskpassSession({ profile: passwordProfile, vaultService: vault(), promptBroker: dialogs(), resolveLogin: noLookup });
  try {
    assert.equal(fs.statSync(session.directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(session.socketPath).mode & 0o777, 0o600);
    assert.ok(fs.statSync(session.socketPath).isSocket());
    assert.deepEqual(Object.keys(session.env).sort(), ['AUX_COMMAND_ASKPASS_SOCKET', 'AUX_COMMAND_ASKPASS_TOKEN', 'SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE']);
    assert.equal(session.env.SSH_ASKPASS_REQUIRE, 'force');
    assert.equal(session.env[SOCKET_ENV], session.socketPath);
    assert.match(session.env[TOKEN_ENV], /^[0-9a-f]{64}$/u);
    assert.equal(JSON.stringify(session.env).includes(SECRET), false);
    assert.ok(Buffer.byteLength(session.socketPath) < 104, 'fits a Unix socket address');
    const second = createAskpassSession({ profile: passwordProfile, vaultService: vault(), promptBroker: dialogs(), resolveLogin: noLookup });
    assert.notEqual(second.env[TOKEN_ENV], session.env[TOKEN_ENV]);
    assert.notEqual(second.socketPath, session.socketPath);
    second.close();
  } finally {
    session.close();
  }
  assert.equal(session.closed, true);
  assert.equal(fs.existsSync(session.directory), false, 'closing removes the socket and its directory');
  session.close();
});

test('the broker answers only a well-formed request that carries its token', async () => {
  const session = createAskpassSession({ profile: passwordProfile, vaultService: vault(), promptBroker: dialogs(), resolveLogin: noLookup, requestTimeoutMs: 150 });
  try {
    const token = session.env[TOKEN_ENV];
    const prompt = "deploy@server.example's password: ";
    const request = (fields) => `${JSON.stringify(fields)}\n`;
    for (const bad of [
      request({ token: `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`, prompt }),
      request({ token: '', prompt }),
      request({ prompt }),
      request({ token, prompt: 'x'.repeat(MAX_PROMPT_CHARS + 1) }),
      request({ token, prompt: 42 }),
      request([token, prompt]),
      'not json\n',
      '\n'
    ]) {
      const reply = await send(session.socketPath, bad);
      assert.equal(reply.received, '', bad.slice(0, 40));
    }
    assert.equal(session.closed, true, 'repeated bad requests shut the broker');
  } finally { session.close(); }

  const fresh = createAskpassSession({ profile: passwordProfile, vaultService: vault(), promptBroker: dialogs(), resolveLogin: noLookup, requestTimeoutMs: 150 });
  try {
    const token = fresh.env[TOKEN_ENV];
    // Too large: dropped without being parsed.
    assert.equal((await send(fresh.socketPath, 'x'.repeat(MAX_REQUEST_BYTES + 1))).received, '');
    // Too slow: a request that never completes is dropped.
    const started = Date.now();
    assert.equal((await send(fresh.socketPath, '{"token":')).received, '');
    assert.ok(Date.now() - started < 3000);
    assert.equal((await send(fresh.socketPath, null)).received, '');
    // A proper request is answered once per connection.
    const line = `${JSON.stringify({ token, prompt: "deploy@server.example's password: ", pid: 7 })}\n`;
    assert.deepEqual(JSON.parse((await send(fresh.socketPath, `${line}${line}`)).received), { action: 'answer', value: SECRET });
    assert.deepEqual(JSON.parse((await send(fresh.socketPath, line)).received), { action: 'deny' });
  } finally { fresh.close(); }
  assert.equal((await send(fresh.socketPath, 'x\n')).error, true, 'nothing listens after close');
});

test('the bundled helper prints the broker\'s answer and nothing else', async () => {
  assert.ok(fs.statSync(HELPER).mode & 0o100, 'OpenSSH executes the helper directly');
  assert.equal(resolveHelper('ssh_askpass.py', path.join(__dirname, '../src/main/lib')), HELPER);
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.ok(packageJson.build.asarUnpack.includes('src/main/helpers/ssh_askpass.py'));

  const broker = dialogs((payload) => (payload.prompts[0].prompt.startsWith('Trust') ? { answers: ['no'] } : { answers: ['654321'] }));
  const session = createAskpassSession({ profile: passwordProfile, vaultService: vault(), promptBroker: broker, resolveLogin: noLookup });
  try {
    assert.equal(session.env.SSH_ASKPASS, HELPER);
    const saved = await runHelper(session.env, ["deploy@server.example's password: "]);
    assert.deepEqual(saved, { code: 0, stdout: `${SECRET}\n`, stderr: '' });
    const typed = await runHelper(session.env, ['(deploy@server.example) Verification code: ']);
    assert.deepEqual(typed, { code: 0, stdout: '654321\n', stderr: '' });
    // A notification expects no answer and must not reach the broker.
    const before = broker.requests.length;
    assert.deepEqual(await runHelper({ ...session.env, SSH_ASKPASS_PROMPT: 'none' }, ['Confirm user presence for key ED25519-SK']), { code: 0, stdout: '', stderr: '' });
    assert.equal(broker.requests.length, before);
    // Wrong token, missing variables, oversized prompt: no output, failure status.
    assert.deepEqual(await runHelper({ ...session.env, [TOKEN_ENV]: 'f'.repeat(64) }, ["deploy@server.example's password: "]), { code: 1, stdout: '', stderr: '' });
    assert.deepEqual(await runHelper({ [SOCKET_ENV]: session.socketPath }, ['x']), { code: 1, stdout: '', stderr: '' });
    assert.deepEqual(await runHelper({ [TOKEN_ENV]: session.env[TOKEN_ENV] }, ['x']), { code: 1, stdout: '', stderr: '' });
    assert.deepEqual(await runHelper(session.env, ['x'.repeat(MAX_PROMPT_CHARS + 1)]), { code: 1, stdout: '', stderr: '' });
    // A refused host key: the helper fails, so OpenSSH stops.
    assert.deepEqual(await runHelper(session.env, [HOST_KEY_PROMPT]), { code: 1, stdout: '', stderr: '' });
    assert.deepEqual(await runHelper(session.env, ['(deploy@server.example) Verification code: ']), { code: 1, stdout: '', stderr: '' }, 'denied after the refusal');
  } finally { session.close(); }
  assert.deepEqual(await runHelper(session.env, ['x']), { code: 1, stdout: '', stderr: '' }, 'no broker, no answer');
});

test('the helper refuses a reply it cannot hand to OpenSSH and gives up on a silent broker', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-askpass-'));
  const socketPath = path.join(directory, 's');
  let reply = '';
  const server = net.createServer((socket) => {
    socket.on('error', () => { /* the helper hung up on a reply it refused */ });
    socket.on('data', () => socket.end(reply));
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));
  try {
    const env = { [SOCKET_ENV]: socketPath, [TOKEN_ENV]: 't' };
    for (const bad of [
      `${JSON.stringify({ action: 'answer', value: 'a\nb' })}\n`,
      `${JSON.stringify({ action: 'answer', value: 'x'.repeat(MAX_ANSWER_BYTES + 1) })}\n`,
      `${JSON.stringify({ action: 'answer', value: 7 })}\n`,
      `${JSON.stringify({ action: 'something-else', value: 'x' })}\n`,
      `${JSON.stringify(['answer', 'x'])}\n`,
      `${'y'.repeat(40_000)}\n`,
      'not json\n',
      ''
    ]) {
      reply = bad;
      assert.deepEqual(await runHelper(env, ['prompt']), { code: 1, stdout: '', stderr: '' }, bad.slice(0, 40));
    }
    reply = `${JSON.stringify({ action: 'answer', value: 'fine' })}\n`;
    assert.deepEqual(await runHelper(env, ['prompt']), { code: 0, stdout: 'fine\n', stderr: '' });
    // "terminal" without a controlling terminal cannot be answered.
    reply = `${JSON.stringify({ action: 'terminal', echo: false })}\n`;
    const detached = await new Promise((resolve) => {
      const child = spawn(HELPER, ['prompt'], { env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      let stdout = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.once('close', (code) => resolve({ code, stdout }));
    });
    assert.deepEqual(detached, { code: 1, stdout: '' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a helper that lost its executable bit is started through a private launcher', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux askpass-'));
  try {
    const copy = path.join(directory, "helper's copy.py");
    fs.copyFileSync(HELPER, copy);
    fs.chmodSync(copy, 0o600);
    const session = createAskpassSession({ profile: passwordProfile, vaultService: vault(), promptBroker: dialogs(), resolveLogin: noLookup, helper: copy });
    try {
      assert.equal(session.env.SSH_ASKPASS, path.join(session.directory, 'askpass'));
      assert.equal(fs.statSync(session.env.SSH_ASKPASS).mode & 0o777, 0o700);
      assert.deepEqual(await runHelper(session.env, ["deploy@server.example's password: "], session.env.SSH_ASKPASS), { code: 0, stdout: `${SECRET}\n`, stderr: '' });
    } finally { session.close(); }
    assert.equal(askpassProgram(directory, HELPER), HELPER);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('the OpenSSH version decides between no redirection, dialogs only, and saved credentials', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-askpass-version-'));
  try {
    const bands = [
      // banner, prompts can be redirected (8.4+), saved credential may be released (8.7+)
      ['OpenSSH_7.4p1, OpenSSL 1.0.2k-fips', false, false],
      ['OpenSSH_8.3p1, OpenSSL 1.1.1', false, false],
      ['OpenSSH_8.4p1, OpenSSL 1.1.1', true, false],
      ['OpenSSH_8.5p1, OpenSSL 1.1.1', true, false],
      ['OpenSSH_8.6p1, OpenSSL 1.1.1', true, false],
      ['OpenSSH_8.7p1, OpenSSL 1.1.1', true, true],
      ['OpenSSH_8.9p1 Ubuntu-3ubuntu0.10, OpenSSL 3.0.2', true, true],
      ['OpenSSH_9.2p1 Debian-2+deb12u10, OpenSSL 3.0.22', true, true],
      ['OpenSSH_10.0p2, OpenSSL 3.5.0', true, true],
      ['something else', false, false]
    ];
    for (const [index, [banner, redirect, release]] of bands.entries()) {
      const filename = path.join(directory, `ssh-${index}`);
      fs.writeFileSync(filename, `#!/bin/sh\necho "${banner}" >&2\n`, { mode: 0o700 });
      assert.equal(supportsForcedAskpass(filename), redirect, banner);
      assert.equal(supportsSavedCredentialAnswers(filename), release, banner);
    }
    for (const unusable of [path.join(directory, 'missing'), '', undefined]) {
      assert.equal(supportsForcedAskpass(unusable), false);
      assert.equal(supportsSavedCredentialAnswers(unusable), false);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('when the saved credential may not be released, the vault is never consulted', async () => {
  const cases = [
    [passwordProfile, "deploy@server.example's password: ", 'Password for deploy@server.example', ''],
    [keyProfile, "Enter passphrase for key '/keys/id_ed25519': ", 'Passphrase for id_ed25519', 'The SSH key /keys/id_ed25519 is protected by a passphrase.']
  ];
  for (const [profile, prompt, label, instructions] of cases) {
    const store = vault();
    store.has = (id) => { store.calls.push(`has:${id}`); return true; };
    const broker = dialogs(() => ({ answers: ['typed by the user'] }));
    const rules = policy({ profile, vaultService: store, promptBroker: broker, useVault: false });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.deepEqual(await rules.decide({ prompt, pid: 10 }), { action: 'answer', value: 'typed by the user' });
    }
    assert.deepEqual(store.calls, [], 'neither looked up nor read');
    assert.equal(broker.requests.length, 3);
    for (const request of broker.requests) {
      assert.deepEqual(request.payload.prompts, [{ prompt: label, echo: false }]);
      assert.equal(request.payload.instructions, instructions, 'asked as if nothing were saved');
    }
    // The same in a terminal session: straight back to the terminal.
    const terminalStore = vault();
    const terminal = policy({ profile, vaultService: terminalStore, mode: 'terminal', useVault: false });
    assert.deepEqual(await terminal.decide({ prompt, pid: 10 }), { action: 'terminal', echo: false });
    assert.deepEqual(terminalStore.calls, []);
  }
});

test('OpenSSH 8.4 to 8.6: background processes ask in a dialog and never use the saved credential', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-askpass-middle-'));
  try {
    for (const banner of ['OpenSSH_8.4p1, OpenSSL 1.1.1', 'OpenSSH_8.6p1, OpenSSL 1.1.1k']) {
      // Asks for the password like OpenSSH and reports whether it got the saved one.
      const ssh = fakeSsh(directory, [
        `[ "$1" = -V ] && { echo "${banner}" >&2; exit 0; }`,
        'case " $* " in *" BatchMode=yes "*) echo "batch mode kept" >&2; exit 255;; esac',
        'answer=$("$SSH_ASKPASS" "test@127.0.0.1\'s password: ") || { echo "Permission denied (publickey,password)." >&2; exit 255; }',
        `[ "$answer" = "${SECRET}" ] && { echo "the saved secret was released" >&2; exit 9; }`,
        '[ "$answer" = "typed-password" ] || { echo "Permission denied (publickey,password)." >&2; exit 255; }',
        "printf '%s\\n' '===UPTIME===' 'up 1 day'"
      ].join('\n'), `ssh-${banner.slice(8, 11)}`);
      const store = vault();
      const broker = dialogs(() => ({ answers: ['typed-password'] }));
      const service = new LiveMonitorService({ sshExecutable: ssh, vaultService: store, promptBroker: broker });
      assert.equal((await service.snapshot(monitorProfile)).sections.uptime, 'up 1 day', banner);
      assert.deepEqual(store.calls, [], banner);
      assert.equal(broker.requests.length, 1, banner);
      assert.equal(broker.requests[0].payload.instructions, '');

      const gatewaySsh = fakeSsh(directory, [
        `[ "$1" = -V ] && { echo "${banner}" >&2; exit 0; }`,
        'answer=$("$SSH_ASKPASS" "test@127.0.0.1\'s password: ") || exit 255',
        `[ "$answer" = "${SECRET}" ] && { echo "the saved secret was released" >&2; exit 9; }`,
        "echo 'debug1: Local forwarding listening on 127.0.0.1 port 45680.' >&2",
        "trap 'exit 0' TERM INT",
        'while :; do sleep 1; done'
      ].join('\n'), `gateway-ssh-${banner.slice(8, 11)}`);
      const gatewayStore = vault();
      const gatewayBroker = dialogs(() => ({ answers: ['typed-password'] }));
      const gateway = new RemoteDesktopGateway({ sshExecutable: gatewaySsh, clientExecutable: fakeSsh(directory, 'sleep 5', 'fake-client'), useGuard: false, vaultService: gatewayStore, promptBroker: gatewayBroker });
      const connected = await gateway.connect({ gatewayProfile: { ...monitorProfile, id: 'jump', name: 'Jump' }, targetHost: '10.0.0.10', targetPort: 5900, protocol: 'vnc', localPort: 45680 });
      assert.equal(connected.status, 'connected');
      gateway.disconnectAll();
      assert.deepEqual(gatewayStore.calls, [], banner);
      assert.equal(gatewayBroker.requests.length, 1, banner);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('OpenSSH 8.4 to 8.6: a tunnel asks in a dialog, and a terminal session is left untouched', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-askpass-middle-'));
  const originalPath = process.env.PATH;
  const outputs = new Map();
  const exited = new Set();
  const terminalStore = vault();
  const terminals = new TerminalService(() => ({ isDestroyed: () => false, webContents: { send: (channel, value) => {
    if (channel === 'terminal:data') outputs.set(value.id, `${outputs.get(value.id) || ''}${value.data}`);
    if (channel === 'terminal:exit') exited.add(value.id);
  } } }), { vaultService: terminalStore });
  try {
    fs.symlinkSync(findExecutable(['python3'], originalPath), path.join(directory, 'python3'));
    fakeSsh(directory, [
      '[ "$1" = -V ] && { echo "OpenSSH_8.6p1, OpenSSL 1.1.1k" >&2; exit 0; }',
      `PATH='${originalPath}'`,
      "env | grep -c -E '^(SSH_ASKPASS|SSH_ASKPASS_REQUIRE|AUX_COMMAND_ASKPASS_SOCKET|AUX_COMMAND_ASKPASS_TOKEN)=' | sed 's/^/ASKPASS_VARIABLES=/'",
      'case " $* " in *" -N "*) ;; *) echo FAKE_SSH_DONE; exit 0;; esac',
      'answer=$("$SSH_ASKPASS" "test@127.0.0.1\'s password: ") || exit 255',
      `[ "$answer" = "${SECRET}" ] && { echo "the saved secret was released" >&2; exit 9; }`,
      "printf '%s\\n' 'debug1: Local forwarding listening on 127.0.0.1 port 18081.' >&2",
      "trap 'exit 0' TERM",
      'while :; do sleep 1; done'
    ].join('\n'), 'ssh');

    const store = vault();
    const broker = dialogs(() => ({ answers: ['typed-password'] }));
    const events = [];
    const window = { isDestroyed: () => false, webContents: { send: (channel, payload) => { if (channel === 'tunnel:status') events.push(payload); } } };
    const tunnels = new TunnelService({ get: () => ({ ...monitorProfile, id: 'profile-1' }) }, () => window, { vaultService: store, promptBroker: broker });
    process.env.PATH = directory;
    try { tunnels.start({ id: 'middle', name: 'T', type: 'local', profileId: 'profile-1', bindHost: '127.0.0.1', bindPort: 18081, targetHost: '127.0.0.1', targetPort: 80 }); } finally { process.env.PATH = originalPath; }
    for (let i = 0; i < 200 && !events.some((event) => ['running', 'failed', 'stopped'].includes(event.status)); i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(events.at(-1).status, 'running', JSON.stringify(events.at(-1)));
    assert.deepEqual(store.calls, []);
    assert.equal(broker.requests.length, 1);
    tunnels.stop('middle');
    for (let i = 0; i < 200 && events.at(-1).status !== 'stopped'; i += 1) await new Promise((resolve) => setTimeout(resolve, 25));

    process.env.PATH = directory;
    let created;
    try { created = terminals.create({ profile: { id: 'with', name: 'Server', protocol: 'ssh', host: 'server.example', username: 'deploy', useSshConfig: false, credentialId: 'cred', credentialKind: 'password' }, cols: 80, rows: 24 }); } finally { process.env.PATH = originalPath; }
    assert.equal(terminals.sessions.get(created.id).askpass, null);
    for (let i = 0; i < 200 && !exited.has(created.id); i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.match(outputs.get(created.id), /ASKPASS_VARIABLES=0/u);
    assert.match(outputs.get(created.id), /FAKE_SSH_DONE/u);
    assert.deepEqual(terminalStore.calls, []);
  } finally {
    process.env.PATH = originalPath;
    terminals.closeAll();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('an older OpenSSH keeps BatchMode for background processes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-askpass-old-'));
  try {
    const ssh = fakeSsh(directory, '[ "$1" = -V ] && { echo "OpenSSH_8.2p1 Ubuntu-4ubuntu0.13, OpenSSL 1.1.1f" >&2; exit 0; }\ncase " $* " in *" BatchMode=yes "*) echo "batch mode kept" >&2; exit 255;; esac\necho "prompted without a way to answer" >&2; exit 9');
    const broker = dialogs();
    const service = new LiveMonitorService({ sshExecutable: ssh, vaultService: vault(), promptBroker: broker });
    await assert.rejects(() => service.snapshot(monitorProfile), /batch mode kept/u);
    assert.equal(broker.requests.length, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

// --- wiring: a stand-in ssh that asks through SSH_ASKPASS like OpenSSH does ---

function fakeSsh(directory, body, name = 'fake-ssh') {
  const filename = path.join(directory, name);
  fs.writeFileSync(filename, `#!/bin/sh\n${body}\n`, { mode: 0o700 });
  return filename;
}

const monitorProfile = { id: 'server', name: 'Server', protocol: 'ssh', host: '127.0.0.1', port: 22, username: 'test', useSshConfig: false, credentialId: 'cred', credentialKind: 'password' };
// Signs in when the first answer is the saved secret; otherwise asks once more.
const REPORT_VERSION = '[ "$1" = -V ] && { echo "OpenSSH_9.2p1, OpenSSL 3.0.0" >&2; exit 0; }';
const PASSWORD_LOGIN = [
  REPORT_VERSION,
  'case " $* " in *" BatchMode=yes "*) echo "Permission denied (publickey,password)." >&2; exit 255;; esac',
  '[ "$SSH_ASKPASS_REQUIRE" = force ] || { echo "askpass not forced" >&2; exit 3; }',
  'first=$("$SSH_ASKPASS" "test@127.0.0.1\'s password: ") || { echo "Permission denied (publickey,password)." >&2; exit 255; }',
  `if [ "$first" != "${SECRET}" ]; then`,
  '  echo "Permission denied, please try again." >&2',
  '  second=$("$SSH_ASKPASS" "test@127.0.0.1\'s password: ") || { echo "Permission denied (publickey,password)." >&2; exit 255; }',
  '  [ "$second" = "typed-password" ] || { echo "Permission denied (publickey,password)." >&2; exit 255; }',
  'fi'
].join('\n');

test('the live monitor signs in with the saved password, asks once when it is wrong, and fails fast on cancel', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-askpass-monitor-'));
  try {
    const ssh = fakeSsh(directory, `${PASSWORD_LOGIN}\nprintf '%s\\n' '===UPTIME===' 'up 1 day'`);
    const broker = dialogs(() => ({ answers: ['typed-password'] }));
    const service = new LiveMonitorService({ sshExecutable: ssh, vaultService: vault(), promptBroker: broker });
    assert.equal((await service.snapshot(monitorProfile)).sections.uptime, 'up 1 day');
    assert.equal(broker.requests.length, 0);

    const wrong = new LiveMonitorService({ sshExecutable: ssh, vaultService: vault('outdated'), promptBroker: broker });
    assert.equal((await wrong.snapshot(monitorProfile)).sections.uptime, 'up 1 day');
    assert.equal(broker.requests.length, 1);
    assert.equal(broker.requests[0].payload.instructions, 'The saved password was not accepted.');

    const cancelling = dialogs(() => ({ answers: [] }));
    const cancelled = new LiveMonitorService({ sshExecutable: ssh, vaultService: vault('outdated'), promptBroker: cancelling });
    await assert.rejects(() => cancelled.snapshot(monitorProfile), /^Error: Sign-in was cancelled$/u);
    // Straight after a cancel the monitor does not ask again (it may be on a timer).
    await assert.rejects(() => cancelled.snapshot(monitorProfile), /Permission denied/u);
    assert.equal(cancelling.requests.length, 1);
    cancelled.quietUntil.clear();
    await assert.rejects(() => cancelled.snapshot(monitorProfile), /Sign-in was cancelled/u);
    assert.equal(cancelling.requests.length, 2);
    assert.equal(cancelled.active.size, 0);

    // Without a prompt broker nobody can answer: BatchMode, as before.
    const batch = new LiveMonitorService({ sshExecutable: ssh, vaultService: vault() });
    await assert.rejects(() => batch.snapshot(monitorProfile), /Permission denied/u);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('time spent in a sign-in dialog does not count towards the monitor time-out', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-askpass-monitor-'));
  try {
    const ssh = fakeSsh(directory, `${PASSWORD_LOGIN}\nprintf '%s\\n' '===UPTIME===' 'up 1 day'`);
    const slow = { requests: [], request: (kind, payload) => new Promise((resolve) => { slow.requests.push(payload); setTimeout(() => resolve({ answers: ['typed-password'] }), 1800); }) };
    const service = new LiveMonitorService({ sshExecutable: ssh, vaultService: vault('outdated'), promptBroker: slow, timeout: 1000 });
    assert.equal((await service.snapshot(monitorProfile)).sections.uptime, 'up 1 day');
    assert.equal(slow.requests.length, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('a tunnel signs in through askpass, survives a rejected saved password and reports a cancelled sign-in', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-askpass-tunnel-'));
  const originalPath = process.env.PATH;
  try {
    fs.symlinkSync(findExecutable(['python3'], originalPath), path.join(directory, 'python3'));
    fakeSsh(directory, `PATH='${originalPath}'\n${PASSWORD_LOGIN}\nprintf '%s\\n' 'debug1: Local forwarding listening on 127.0.0.1 port 18080.' >&2\ntrap 'exit 0' TERM\nwhile :; do sleep 1; done`, 'ssh');
    const profile = { ...monitorProfile, id: 'profile-1' };
    const tunnel = { id: 'askpass-tunnel', name: 'T', type: 'local', profileId: 'profile-1', bindHost: '127.0.0.1', bindPort: 18080, targetHost: '127.0.0.1', targetPort: 80 };
    const run = async (vaultService, promptBroker) => {
      const events = [];
      const window = { isDestroyed: () => false, webContents: { send: (channel, payload) => { if (channel === 'tunnel:status') events.push(payload); } } };
      const service = new TunnelService({ get: () => profile }, () => window, { vaultService, promptBroker });
      process.env.PATH = directory;
      try { service.start(tunnel); } finally { process.env.PATH = originalPath; }
      const entry = service.tunnels.get(tunnel.id);
      for (let i = 0; i < 200 && !events.some((event) => ['running', 'failed', 'stopped'].includes(event.status)); i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
      const outcome = events.at(-1);
      if (outcome.status === 'running') {
        assert.equal(entry.askpass.closed, true, 'the broker closes once the tunnel is up');
        service.stop(tunnel.id);
        for (let i = 0; i < 200 && events.at(-1).status !== 'stopped'; i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(entry.askpass ? fs.existsSync(entry.askpass.directory) : false, false);
      return outcome;
    };

    const typing = dialogs(() => ({ answers: ['typed-password'] }));
    assert.equal((await run(vault(), typing)).status, 'running');
    assert.equal(typing.requests.length, 0);
    // "Permission denied, please try again." is a sign-in retry, not a failed forward.
    assert.equal((await run(vault('outdated'), typing)).status, 'running');
    assert.equal(typing.requests.length, 1);

    const cancelling = dialogs(() => ({ answers: [] }));
    const cancelled = await run(vault('outdated'), cancelling);
    assert.equal(cancelled.status, 'failed');
    assert.equal(cancelled.lastError, 'Sign-in was cancelled');
    assert.equal(cancelling.requests.length, 1);

    // Without a prompt broker the tunnel keeps BatchMode and fails instead of waiting.
    const batch = await run(vault(), null);
    assert.equal(batch.status, 'failed');
    assert.match(batch.lastError, /Permission denied/u);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the remote-desktop gateway signs in through askpass and stops when the sign-in is cancelled', { timeout: 15_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-askpass-gateway-'));
  try {
    const ssh = fakeSsh(directory, `${PASSWORD_LOGIN}\necho 'debug1: Local forwarding listening on 127.0.0.1 port 45679.' >&2\ntrap 'exit 0' TERM INT\nwhile :; do sleep 1; done`);
    const client = fakeSsh(directory, 'sleep 5', 'fake-client');
    const spec = { gatewayProfile: { ...monitorProfile, id: 'jump', name: 'Jump' }, targetHost: '10.0.0.10', targetPort: 5900, protocol: 'vnc', localPort: 45679 };
    const typing = dialogs(() => ({ answers: ['typed-password'] }));
    const service = new RemoteDesktopGateway({ sshExecutable: ssh, clientExecutable: client, useGuard: false, vaultService: vault(), promptBroker: typing });
    const connected = await service.connect(spec);
    assert.equal(connected.status, 'connected');
    assert.equal(typing.requests.length, 0);
    service.disconnectAll();

    // A slow answer does not trip the readiness time-out.
    const slow = { request: () => new Promise((resolve) => setTimeout(() => resolve({ answers: ['typed-password'] }), 1500)) };
    const patient = new RemoteDesktopGateway({ sshExecutable: ssh, clientExecutable: client, useGuard: false, vaultService: vault('outdated'), promptBroker: slow, connectTimeout: 1000 });
    assert.equal((await patient.connect(spec)).status, 'connected');
    patient.disconnectAll();

    const cancelling = dialogs(() => ({ answers: [] }));
    const refused = new RemoteDesktopGateway({ sshExecutable: ssh, clientExecutable: client, useGuard: false, vaultService: vault('outdated'), promptBroker: cancelling });
    await assert.rejects(() => refused.connect(spec), /^Error: Sign-in was cancelled$/u);
    assert.equal(refused.list().length, 0);
    assert.equal(cancelling.requests.length, 1);

    const batch = new RemoteDesktopGateway({ sshExecutable: ssh, clientExecutable: client, useGuard: false, vaultService: vault() });
    // The exit can be reported before the last error line has been read.
    await assert.rejects(() => batch.connect(spec), /Permission denied|exited with code 255/u);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('a terminal session gets askpass variables only when its profile has a saved credential', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-askpass-terminal-'));
  const originalPath = process.env.PATH;
  const saved = { SSH_ASKPASS: process.env.SSH_ASKPASS, SSH_ASKPASS_REQUIRE: process.env.SSH_ASKPASS_REQUIRE };
  delete process.env.SSH_ASKPASS;
  delete process.env.SSH_ASKPASS_REQUIRE;
  const outputs = new Map();
  const exited = new Set();
  const service = new TerminalService(() => ({ isDestroyed: () => false, webContents: { send: (channel, value) => {
    if (channel === 'terminal:data') outputs.set(value.id, `${outputs.get(value.id) || ''}${value.data}`);
    if (channel === 'terminal:exit') exited.add(value.id);
  } } }), { vaultService: vault() });
  try {
    fs.symlinkSync(findExecutable(['python3'], originalPath), path.join(directory, 'python3'));
    // Prints which askpass variables it was given, then asks for a password the way OpenSSH would.
    fakeSsh(directory, `${REPORT_VERSION}\nPATH='${originalPath}'\nenv | grep -c -E '^(SSH_ASKPASS|SSH_ASKPASS_REQUIRE|AUX_COMMAND_ASKPASS_SOCKET|AUX_COMMAND_ASKPASS_TOKEN)=' | sed 's/^/ASKPASS_VARIABLES=/'\nif [ -n "$SSH_ASKPASS" ]; then answer=$("$SSH_ASKPASS" "deploy@server.example's password: "); [ "$answer" = "${SECRET}" ] && echo SIGNED_IN_FROM_VAULT; fi\necho FAKE_SSH_DONE`, 'ssh');
    const run = async (profile) => {
      process.env.PATH = directory;
      let created;
      try { created = service.create({ profile, cols: 80, rows: 24 }); } finally { process.env.PATH = originalPath; }
      const askpass = service.sessions.get(created.id).askpass;
      for (let i = 0; i < 200 && !exited.has(created.id); i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
      return { text: outputs.get(created.id) || '', askpass };
    };
    const base = { name: 'Server', protocol: 'ssh', host: 'server.example', username: 'deploy', useSshConfig: false };

    const withCredential = await run({ ...base, id: 'with', credentialId: 'cred', credentialKind: 'password' });
    assert.match(withCredential.text, /ASKPASS_VARIABLES=4/u);
    assert.match(withCredential.text, /SIGNED_IN_FROM_VAULT/u);
    assert.equal(withCredential.text.includes(SECRET), false, 'the secret never passes through the terminal');
    assert.equal(withCredential.askpass.closed, true, 'the broker ends with the session');
    assert.equal(fs.existsSync(withCredential.askpass.directory), false);

    for (const profile of [{ ...base, id: 'without' }, { ...base, id: 'dangling', credentialId: 'not-in-vault', credentialKind: 'password' }]) {
      const result = await run(profile);
      assert.equal(result.askpass, null);
      assert.match(result.text, /ASKPASS_VARIABLES=0/u);
      assert.match(result.text, /FAKE_SSH_DONE/u);
    }
    assert.equal(JSON.stringify(service.list()).includes('askpass'), false);
  } finally {
    process.env.PATH = originalPath;
    for (const [name, value] of Object.entries(saved)) { if (value !== undefined) process.env[name] = value; }
    service.closeAll();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
