'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSshAuthHandler, defaultKeyFiles, readKeyFile } = require('../src/main/lib/ssh-auth.cjs');

function keygen(directory, name, passphrase = '') {
  const filename = path.join(directory, name);
  const result = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', passphrase, '-f', filename], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return { filename, data: fs.readFileSync(filename) };
}

// Drives the handler the way ssh2 does: one call per attempt, the server's
// remaining methods passed back after the first reply.
async function attempts(handler, methodsLeft = ['publickey', 'password', 'keyboard-interactive'], limit = 12) {
  const seen = [];
  let remaining = null;
  for (let index = 0; index < limit; index += 1) {
    const result = await new Promise((resolve) => handler(remaining, false, resolve));
    seen.push(result);
    if (result === false) break;
    remaining = methodsLeft;
  }
  return seen;
}

const summary = (list) => list.map((item) => (item && typeof item === 'object' ? item.type : item));

test('sign-in follows the OpenSSH order: agent, keys, password, keyboard-interactive', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ssh-auth-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const key = keygen(directory, 'plain');
  const seen = await attempts(createSshAuthHandler({ username: 'ops', agent: '/run/agent.sock', keys: [key], password: 'stored' }));
  assert.deepEqual(summary(seen), ['none', 'agent', 'publickey', 'password', 'keyboard-interactive', false]);
  assert.equal(seen[1].agent, '/run/agent.sock');
  assert.equal(seen[2].username, 'ops');
  assert.equal(seen[2].key.isPrivateKey(), true);
  assert.equal(seen[3].password, 'stored');
});

test('a passphrase-protected key asks for its passphrase instead of failing the connection', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ssh-auth-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const key = keygen(directory, 'locked', 'correct horse');
  const asked = [];
  const answers = ['wrong', 'correct horse'];
  const seen = await attempts(createSshAuthHandler({
    username: 'ops', keys: [key],
    askPassphrase: async (filename, attempt) => { asked.push([path.basename(filename), attempt]); return answers.shift(); }
  }));
  assert.deepEqual(asked, [['locked', 1], ['locked', 2]]);
  assert.deepEqual(summary(seen), ['none', 'publickey', 'keyboard-interactive', false]);
  assert.equal(seen[1].key.isPrivateKey(), true);

  // A stored passphrase unlocks the key without a prompt.
  const stored = await attempts(createSshAuthHandler({ username: 'ops', keys: [key], keyPassphrase: 'correct horse', askPassphrase: async () => assert.fail('must not prompt') }));
  assert.deepEqual(summary(stored), ['none', 'publickey', 'keyboard-interactive', false]);
});

test('a cancelled or unusable key is skipped so later methods still run', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ssh-auth-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const locked = keygen(directory, 'locked', 'secret');
  const plain = keygen(directory, 'plain');
  const garbage = { filename: path.join(directory, 'garbage'), data: Buffer.from('not a key') };
  let prompts = 0;
  const seen = await attempts(createSshAuthHandler({
    username: 'ops', agent: '/run/agent.sock', keys: [locked, garbage, plain], password: 'stored',
    askPassphrase: async () => { prompts += 1; return ''; }
  }));
  assert.equal(prompts, 1, 'cancelling stops asking for that key');
  assert.deepEqual(summary(seen), ['none', 'agent', 'publickey', 'password', 'keyboard-interactive', false]);

  let attemptsMade = 0;
  const exhausted = await attempts(createSshAuthHandler({ username: 'ops', keys: [locked], askPassphrase: async () => { attemptsMade += 1; return 'wrong'; } }));
  assert.equal(attemptsMade, 3, 'a wrong passphrase is retried a bounded number of times');
  assert.deepEqual(summary(exhausted), ['none', 'keyboard-interactive', false]);
});

test('methods the server no longer accepts are not attempted', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ssh-auth-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const key = keygen(directory, 'locked', 'secret');
  const passwordOnly = await attempts(createSshAuthHandler({
    username: 'ops', agent: '/run/agent.sock', keys: [key], password: 'stored',
    askPassphrase: async () => assert.fail('a key the server will not accept must not prompt')
  }), ['password']);
  assert.deepEqual(summary(passwordOnly), ['none', 'password', false]);
});

test('a password is asked for once when none is stored and the server accepts passwords', async () => {
  let asked = 0;
  const seen = await attempts(createSshAuthHandler({ username: 'ops', askPassword: async () => { asked += 1; return 'typed'; } }), ['password']);
  assert.deepEqual(summary(seen), ['none', 'password', false]);
  assert.equal(seen[1].password, 'typed');
  assert.equal(asked, 1);
  const declined = await attempts(createSshAuthHandler({ username: 'ops', askPassword: async () => '' }), ['password', 'keyboard-interactive']);
  assert.deepEqual(summary(declined), ['none', 'keyboard-interactive', false]);
});

test('cancelling the connection stops further sign-in attempts', async () => {
  let cancelled = false;
  const handler = createSshAuthHandler({ username: 'ops', password: 'stored', isCancelled: () => cancelled });
  assert.equal((await new Promise((resolve) => handler(null, false, resolve))).type, 'none');
  cancelled = true;
  assert.equal(await new Promise((resolve) => handler(['password'], false, resolve)), false);
});

test('default key files are read from ~/.ssh in OpenSSH order and unsafe files are refused', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ssh-auth-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'id_rsa'), 'rsa');
  fs.writeFileSync(path.join(directory, 'id_ed25519'), 'ed');
  fs.mkdirSync(path.join(directory, 'id_ecdsa'));
  assert.deepEqual(defaultKeyFiles(directory).map((key) => path.basename(key.filename)), ['id_ed25519', 'id_rsa']);
  assert.deepEqual(defaultKeyFiles(path.join(directory, 'missing')), []);
  assert.throws(() => readKeyFile(path.join(directory, 'id_ecdsa')), /not a regular file/u);
  fs.writeFileSync(path.join(directory, 'huge'), Buffer.alloc(65_537));
  assert.throws(() => readKeyFile(path.join(directory, 'huge')), /larger than 64 KB/u);
});

test('a saved password is tried before asking for the passphrase of a locked key', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ssh-auth-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const locked = keygen(directory, 'locked', 'secret');
  const plain = keygen(directory, 'plain');
  const order = [];
  const handler = createSshAuthHandler({
    username: 'ops', keys: [locked, plain], password: 'stored',
    askPassphrase: async () => { order.push('asked'); return 'secret'; }
  });
  const seen = await attempts(handler);
  // The unlocked key goes first, then the saved password, and only then the prompt.
  assert.deepEqual(summary(seen), ['none', 'publickey', 'password', 'publickey', 'keyboard-interactive', false]);
  assert.deepEqual(order, ['asked']);
  // If the password already signed in, ssh2 stops calling: no prompt was shown.
  const untouched = [];
  const early = createSshAuthHandler({ username: 'ops', keys: [locked], password: 'stored', askPassphrase: async () => { untouched.push('asked'); return ''; } });
  assert.equal((await new Promise((resolve) => early(null, false, resolve))).type, 'none');
  assert.equal((await new Promise((resolve) => early(['publickey', 'password'], false, resolve))).type, 'password');
  assert.deepEqual(untouched, []);
});
