'use strict';

// Authentication order for the ssh2-backed SFTP connection. It follows what
// OpenSSH does for the same profile so the file browser signs in wherever the
// terminal does: SSH agent, then key files (the profile's identity file, or
// the standard ~/.ssh keys when none is set), then the stored or prompted
// password, then keyboard-interactive. A key that would need a passphrase
// prompt waits until a saved password has been tried.
//
// Key files are parsed only when their turn comes. A passphrase-protected key
// asks for its passphrase instead of failing the whole connection, and a key
// that cannot be used is skipped so later methods still get their chance.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_PASSPHRASE_ATTEMPTS = 3;
const DEFAULT_KEY_NAMES = ['id_ed25519', 'id_ecdsa', 'id_rsa'];

function readKeyFile(filename) {
  const stat = fs.statSync(filename);
  if (!stat.isFile()) throw new Error('not a regular file');
  if (stat.size > 65_536) throw new Error('file is larger than 64 KB');
  return fs.readFileSync(filename);
}

function defaultKeyFiles(sshDirectory = path.join(os.homedir(), '.ssh')) {
  const keys = [];
  for (const name of DEFAULT_KEY_NAMES) {
    const filename = path.join(sshDirectory, name);
    try { keys.push({ filename, data: readKeyFile(filename) }); } catch { /* absent or unusable default key */ }
  }
  return keys;
}

function defaultParseKey(data, passphrase) {
  // Resolved lazily so the module also loads where ssh2 is replaced by a stub.
  const parse = require('ssh2').utils?.parseKey;
  if (typeof parse !== 'function') return new Error('SSH key parsing is unavailable');
  const parsed = parse(data, passphrase || undefined);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

function needsPassphrase(error) {
  return /no passphrase given|bad passphrase|encrypted/iu.test(String(error?.message || ''));
}

// options:
//   username          login name
//   agent             SSH agent socket path ('' when there is no agent)
//   keys              [{ filename, data }] in the order to try
//   keyPassphrase     stored passphrase for the profile's identity file ('' if none)
//   password          stored account password ('' if none)
//   askPassphrase     async (filename, attempt) => string ('' cancels this key)
//   askPassword       async () => string ('' skips password sign-in)
//   isCancelled       () => boolean
//   parseKey          override for tests
function createSshAuthHandler(options = {}) {
  const username = String(options.username || '');
  const parseKey = options.parseKey || defaultParseKey;
  const isCancelled = options.isCancelled || (() => false);
  const steps = [{ kind: 'none' }];
  if (options.agent) steps.push({ kind: 'agent' });
  for (const key of options.keys || []) steps.push({ kind: 'key', key });
  steps.push({ kind: 'password' }, { kind: 'keyboard-interactive' });
  let askedPassword = false;

  // Returns a parsed key, null when the key cannot be used, or 'locked' when
  // it needs a passphrase that may only be obtained by asking (`mayAsk`).
  async function usableKey({ filename, data }, mayAsk) {
    let passphrase = options.keyPassphrase || '';
    let parsed = parseKey(data, passphrase);
    for (let attempt = 1; parsed instanceof Error && needsPassphrase(parsed) && attempt <= MAX_PASSPHRASE_ATTEMPTS; attempt += 1) {
      if (!mayAsk) return 'locked';
      if (typeof options.askPassphrase !== 'function') return null;
      passphrase = await options.askPassphrase(filename, attempt);
      if (!passphrase || isCancelled()) return null;
      parsed = parseKey(data, passphrase);
    }
    if (parsed instanceof Error || !parsed) return null;
    if (typeof parsed.isPrivateKey === 'function' && !parsed.isPrivateKey()) return null;
    return parsed;
  }

  async function next(methodsLeft) {
    // After the first reply the server lists which methods can still succeed.
    const allowed = (method) => !Array.isArray(methodsLeft) || methodsLeft.includes(method);
    while (steps.length) {
      if (isCancelled()) return false;
      const step = steps.shift();
      if (step.kind === 'none') return { type: 'none', username };
      if (step.kind === 'agent') {
        if (allowed('publickey')) return { type: 'agent', username, agent: options.agent };
      } else if (step.kind === 'key') {
        if (!allowed('publickey')) continue;
        // A saved password is tried before interrupting with a passphrase
        // prompt: the locked key moves behind the password step.
        const passwordPending = Boolean(options.password) && steps.some((later) => later.kind === 'password');
        const key = await usableKey(step.key, step.deferred || !passwordPending);
        if (key === 'locked') {
          steps.splice(steps.findIndex((later) => later.kind === 'password') + 1, 0, { ...step, deferred: true });
          continue;
        }
        if (key) return { type: 'publickey', username, key };
      } else if (step.kind === 'password') {
        if (!allowed('password')) continue;
        let password = options.password || '';
        if (!password && typeof options.askPassword === 'function' && !askedPassword) {
          askedPassword = true;
          password = await options.askPassword();
        }
        if (password && !isCancelled()) return { type: 'password', username, password };
      } else if (step.kind === 'keyboard-interactive') {
        // The string form makes ssh2 raise its 'keyboard-interactive' event.
        if (allowed('keyboard-interactive')) return 'keyboard-interactive';
      }
    }
    return false;
  }

  return (methodsLeft, _partialSuccess, callback) => {
    next(methodsLeft).then((result) => callback(isCancelled() ? false : result), () => callback(false));
  };
}

module.exports = { createSshAuthHandler, defaultKeyFiles, readKeyFile, needsPassphrase, MAX_PASSPHRASE_ATTEMPTS };
