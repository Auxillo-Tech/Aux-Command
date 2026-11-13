'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { credentialArgs, describeRdpFailure, resolveRdpCredentials, sendCredentials } = require('../src/main/lib/rdp-credentials.cjs');

function broker(answer) {
  const requests = [];
  return { requests, request: async (kind, payload, timeout) => { requests.push({ kind, payload, timeout }); return answer; } };
}

test('a stored RDP password is used without asking', async () => {
  const prompts = broker({ answers: ['unused'] });
  const vaultService = { has: (id) => id === 'cred', get: async () => 'stored-secret' };
  const credentials = await resolveRdpCredentials({ name: 'Desk', host: 'desk.example', username: 'ops', credentialId: 'cred' }, { vaultService, promptBroker: prompts });
  assert.deepEqual(credentials, { username: 'ops', password: 'stored-secret', stored: true });
  assert.equal(prompts.requests.length, 0);
});

test('without a stored password the user is asked, and a missing user name is asked for too', async () => {
  const withUser = broker({ answers: ['typed'] });
  assert.deepEqual(await resolveRdpCredentials({ name: 'Desk', host: 'desk.example', username: 'ops' }, { promptBroker: withUser }), { username: 'ops', password: 'typed', stored: false });
  assert.equal(withUser.requests[0].kind, 'keyboard-interactive');
  assert.equal(withUser.requests[0].payload.name, 'RDP sign-in');
  assert.deepEqual(withUser.requests[0].payload.prompts, [{ prompt: 'Password for ops', echo: false }]);

  const withoutUser = broker({ answers: ['CORP\\ops', 'typed'] });
  assert.deepEqual(await resolveRdpCredentials({ name: 'Desk', host: 'desk.example' }, { promptBroker: withoutUser }), { username: 'CORP\\ops', password: 'typed', stored: false });
  assert.deepEqual(withoutUser.requests[0].payload.prompts, [{ prompt: 'User name', echo: true }, { prompt: 'Password', echo: false }]);
});

test('cancelling the sign-in stops the connection; an empty password is allowed', async () => {
  await assert.rejects(() => resolveRdpCredentials({ username: 'ops' }, { promptBroker: broker({ answers: [] }) }), /RDP sign-in was cancelled/u);
  await assert.rejects(() => resolveRdpCredentials({ username: 'ops' }, { promptBroker: broker(undefined) }), /RDP sign-in was cancelled/u);
  assert.equal((await resolveRdpCredentials({ username: 'ops' }, { promptBroker: broker({ answers: [''] }) })).password, '');
  // No prompt available (headless use): continue without a password.
  assert.deepEqual(await resolveRdpCredentials({ username: 'ops' }), { username: 'ops', password: '', stored: false });
});

test('sign-in values cannot smuggle extra lines or FreeRDP options', async () => {
  // A password FreeRDP cannot take as one line is refused, never altered.
  for (const password of ['first\nsecond', 'bell\u0007', 'cr\rlf']) {
    await assert.rejects(() => resolveRdpCredentials({ username: 'ops' }, { promptBroker: broker({ answers: [password] }) }), /RDP sign-in failed: the password contains a line break or control character/u);
  }
  const vaultService = { has: () => true, get: async () => 'stored\nsecond' };
  await assert.rejects(() => resolveRdpCredentials({ username: 'ops', credentialId: 'c' }, { vaultService }), /line break or control character/u);
  assert.equal((await resolveRdpCredentials({ username: 'ops' }, { promptBroker: broker({ answers: ['tab\there and spaces '] }) })).password, 'tab\there and spaces ', 'tabs and spaces are part of the password');
  for (const name of ['/p:leak', '-sec-nla', '+clipboard']) {
    await assert.rejects(() => resolveRdpCredentials({}, { promptBroker: broker({ answers: [name, 'pw'] }) }), /user name is invalid/u);
  }
});

test('FreeRDP reads the password from standard input, never from its arguments', () => {
  // :force reads only the password, on every FreeRDP version; plain /from-stdin
  // makes FreeRDP 3 ask for a domain first.
  assert.deepEqual(credentialArgs({ username: 'ops' }, { username: 'ops', password: 'secret' }), ['/from-stdin:force']);
  assert.deepEqual(credentialArgs({ username: '' }, { username: 'typed', password: 'secret' }), ['/u:typed', '/from-stdin:force']);
  assert.deepEqual(credentialArgs({ username: 'ops' }, { username: 'ops', password: '' }), []);

  const writes = [];
  const stdin = Object.assign(new EventEmitter(), { write: (text) => writes.push(text), end: () => writes.push('<end>') });
  sendCredentials({ stdin }, { password: 'secret' });
  assert.deepEqual(writes, ['secret\n', '<end>']);
  // Standard input is closed even without a password so the client cannot wait on it.
  writes.length = 0;
  sendCredentials({ stdin }, { password: '' });
  assert.deepEqual(writes, ['<end>']);
  assert.doesNotThrow(() => stdin.emit('error', new Error('EPIPE')));
});

test('FreeRDP failures are reported in plain words', () => {
  assert.match(describeRdpFailure('[ERROR] freerdp_set_last_error_ex ERRCONNECT_LOGON_FAILURE [0x00020014]'), /user name or password was not accepted/u);
  assert.match(describeRdpFailure('nla_recv_pdu: SPNEGO failed with NTSTATUS: STATUS_PASSWORD_MUST_CHANGE'), /password has expired/u);
  assert.match(describeRdpFailure('ERRCONNECT_ACCOUNT_LOCKED_OUT'), /locked, disabled or restricted/u);
  assert.match(describeRdpFailure('ERRCONNECT_CONNECT_FAILED'), /could not be reached/u);
  assert.match(describeRdpFailure('transport_read_layer: ERRCONNECT_CONNECT_TRANSPORT_FAILED [0x0002000D]'), /RDP sign-in failed or the connection was dropped/u);
  assert.match(describeRdpFailure('ERRCONNECT_AUTHENTICATION_FAILED'), /user name or password was not accepted/u);
  assert.match(describeRdpFailure('nla_client_setup_identity: ERRCONNECT_CONNECT_CANCELLED'), /RDP sign-in failed: the server requires a user name and password/u);
  assert.equal(describeRdpFailure('something unrelated'), '');
});

test('the sign-in prompt also carries its source text and values for translation', async () => {
  const { english, message } = require('../src/main/lib/prompt-message.cjs');
  assert.deepEqual(message('Password for {p0}', { p0: 'ops' }), { text: 'Password for {p0}', params: { p0: 'ops' } });
  assert.equal(english(message('Password for {p0}', { p0: 'ops' })), 'Password for ops');
  assert.equal(english(message('Password')), 'Password');
  // A value is inserted once; it is never read again as a placeholder.
  assert.equal(english(message('{p0} and {p1}', { p0: '{p1}', p1: 'x' })), '{p1} and x');
  assert.equal(english(message('Password for {p0}')), 'Password for {p0}');

  const withUser = broker({ answers: ['typed'] });
  await resolveRdpCredentials({ name: 'Desk', host: 'desk.example', username: 'ops' }, { promptBroker: withUser });
  const payload = withUser.requests[0].payload;
  assert.deepEqual(payload.messages.name, { text: 'RDP sign-in', params: {} });
  assert.deepEqual(payload.messages.prompts, [{ text: 'Password for {p0}', params: { p0: 'ops' } }]);
  // The English wording is exactly the source with its values filled in.
  assert.equal(payload.name, english(payload.messages.name));
  assert.equal(payload.instructions, english(payload.messages.instructions));
  assert.deepEqual(payload.prompts.map((prompt) => prompt.prompt), payload.messages.prompts.map(english));

  const withoutUser = broker({ answers: ['ops', 'typed'] });
  await resolveRdpCredentials({ name: 'Desk', host: 'desk.example' }, { promptBroker: withoutUser });
  assert.deepEqual(withoutUser.requests[0].payload.messages.prompts, [{ text: 'User name', params: {} }, { text: 'Password', params: {} }]);
});
