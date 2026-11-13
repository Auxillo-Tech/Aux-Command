'use strict';

// Sign-in details for FreeRDP. The X11 FreeRDP client has no sign-in window of
// its own: without a password it waits on a terminal that a desktop app does
// not have. Aux Command therefore supplies the password itself, from the
// profile's stored credential or by asking when the connection opens, and
// hands it to FreeRDP on standard input so it never appears in the process
// list.

const { english, message } = require('./prompt-message.cjs');

const SIGN_IN_CANCELLED = 'RDP sign-in was cancelled';

function cleanLine(value, max) {
  // One line only, without control characters.
  return String(value ?? '').split(/[\r\n]/u)[0].replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, max);
}

// FreeRDP reads the password as one line. A password that contains a line
// break or control character cannot be passed on unchanged, and changing it
// silently would only produce a confusing refusal from the server.
function passwordLine(value) {
  const password = String(value ?? '');
  if (/[\u0000-\u0008\u000a-\u001f\u007f]/u.test(password)) {
    throw new Error('RDP sign-in failed: the password contains a line break or control character, which cannot be sent to FreeRDP');
  }
  if (password.length > 32_768) throw new Error('RDP sign-in failed: the password is too long');
  return password;
}

// Returns { username, password }. An empty password is allowed: servers such
// as xrdp show their own sign-in screen. Cancelling the prompt throws.
async function resolveRdpCredentials(profile, { vaultService = null, promptBroker = null } = {}) {
  let username = cleanLine(profile.username, 128);
  if (vaultService && profile.credentialId && vaultService.has(profile.credentialId)) {
    const stored = passwordLine(await vaultService.get(profile.credentialId));
    if (stored) return { username, password: stored, stored: true };
  }
  if (!promptBroker) return { username, password: '', stored: false };

  // Each text is sent in English and also as a source message, so the
  // window can show it in the user's language.
  const asked = [];
  if (!username) asked.push({ message: message('User name'), echo: true });
  asked.push({ message: username ? message('Password for {p0}', { p0: username }) : message('Password'), echo: false });
  const prompts = asked.map((entry) => ({ prompt: english(entry.message), echo: entry.echo }));
  const title = message('RDP sign-in');
  const instructions = message('Leave the password empty if this server shows its own sign-in screen. To skip this prompt, save a password in the connection profile.');
  const response = await promptBroker.request('keyboard-interactive', {
    profileName: profile.name || '',
    host: profile.host || '',
    name: english(title),
    instructions: english(instructions),
    language: '',
    prompts,
    messages: { name: title, instructions, prompts: asked.map((entry) => entry.message) }
  }, 300_000);
  const answers = Array.isArray(response?.answers) ? response.answers : [];
  if (answers.length < prompts.length) throw new Error(SIGN_IN_CANCELLED);
  if (!username) {
    username = cleanLine(answers[0], 128);
    if (username.startsWith('-') || username.startsWith('/') || username.startsWith('+')) throw new Error('RDP sign-in user name is invalid');
  }
  return { username, password: passwordLine(answers[answers.length - 1]), stored: false };
}

// FreeRDP arguments for the resolved sign-in, added only when a password will
// be written. `/from-stdin:force` makes FreeRDP read exactly one line, the
// password, while it parses its arguments. Plain `/from-stdin` reads later, at
// sign-in, and what it asks for differs by version: FreeRDP 3 asks for a
// domain first when none is set and would take the password as that answer.
function credentialArgs(profile, credentials) {
  const args = [];
  if (credentials.username && !profile.username) args.push(`/u:${credentials.username}`);
  if (credentials.password) args.push('/from-stdin:force');
  return args;
}

// Always closes standard input: with a password FreeRDP reads it from there,
// without one a pending terminal prompt ends at once instead of hanging.
function sendCredentials(child, credentials) {
  // A client that exits early closes the pipe; that must not surface as an
  // unhandled stream error in the main process.
  child.stdin.on('error', () => {});
  try {
    if (credentials.password) child.stdin.write(`${credentials.password}\n`);
    child.stdin.end();
  } catch { /* the client exited before reading its sign-in */ }
}

// Turns FreeRDP's log into a message a person can act on. Messages that
// start with "RDP sign-in" are final for the caller: retrying in another
// client would fail the same way.
function describeRdpFailure(log) {
  const text = String(log || '');
  if (/LOGON_FAILURE|ERRCONNECT_AUTHENTICATION_FAILED|ERRCONNECT_WRONG_PASSWORD|STATUS_WRONG_PASSWORD/iu.test(text)) return 'RDP sign-in failed: the user name or password was not accepted';
  if (/ERRCONNECT_PASSWORD_EXPIRED|PASSWORD_MUST_CHANGE|PASSWORD_CERTAINLY_EXPIRED/iu.test(text)) return 'RDP sign-in failed: the password has expired and must be changed on the server';
  if (/ACCOUNT_(LOCKED_OUT|DISABLED|EXPIRED|RESTRICTION)/iu.test(text)) return 'RDP sign-in failed: the account is locked, disabled or restricted';
  // FreeRDP wanted sign-in details it was not given (for example a password
  // for a server that requires one).
  if (/ERRCONNECT_CONNECT_CANCELLED/iu.test(text)) return 'RDP sign-in failed: the server requires a user name and password';
  if (/ERRCONNECT_DNS|ERRCONNECT_CONNECT_FAILED|unable to connect/iu.test(text)) return 'The RDP server could not be reached';
  if (/ERRCONNECT_TLS|ERRCONNECT_SECURITY_NEGO/iu.test(text)) return 'The secure connection to the RDP server could not be set up';
  // Some servers drop the connection instead of answering a refused sign-in,
  // and a network fault looks the same, so both causes are named.
  if (/ERRCONNECT_CONNECT_TRANSPORT_FAILED/iu.test(text)) return 'RDP sign-in failed or the connection was dropped: check the user name and password, and that the server is reachable';
  return '';
}

module.exports = { SIGN_IN_CANCELLED, cleanLine, passwordLine, credentialArgs, describeRdpFailure, resolveRdpCredentials, sendCredentials };
