'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function validateKeyName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(name) || name === '.' || name === '..') {
    throw new Error('SSH key name must be 1-64 letters, numbers, dots, underscores, or hyphens');
  }
  return name;
}

function fingerprintFor(keyPath) {
  const result = spawnSync('ssh-keygen', ['-lf', keyPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 10_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not read fingerprint: ${String(result.stderr || '').trim()}`);
  const output = String(result.stdout || '').trim();
  const match = output.match(/^\d+\s+(SHA256:[^\s]+)\s+/u);
  if (!match) throw new Error('ssh-keygen returned an unrecognized fingerprint');
  return { fingerprint: match[1], output };
}

class SshKeyService {
  constructor(sshDir = path.join(os.homedir(), '.ssh')) {
    this.sshDir = path.resolve(sshDir);
  }

  listKeys() {
    if (!fs.existsSync(this.sshDir)) return [];
    const keys = [];
    for (const file of fs.readdirSync(this.sshDir)) {
      if (!file.endsWith('.pub')) continue;
      const name = file.slice(0, -4);
      try { validateKeyName(name); } catch { continue; }
      const privateKey = path.join(this.sshDir, name);
      const publicKey = path.join(this.sshDir, file);
      if (!fs.existsSync(privateKey) || !fs.statSync(privateKey).isFile()) continue;
      try {
        const content = fs.readFileSync(publicKey, 'utf8').trim();
        const parts = content.split(/\s+/u);
        const { fingerprint } = fingerprintFor(publicKey);
        keys.push({
          name,
          publicKey,
          privateKey,
          fingerprint,
          type: parts[0] || 'unknown',
          comment: parts.slice(2).join(' '),
          fullKey: content
        });
      } catch { /* skip unreadable or invalid key pairs */ }
    }
    return keys.sort((a, b) => a.name.localeCompare(b.name));
  }

  generateKey(nameInput, type = 'ed25519', passphrase = '') {
    const name = validateKeyName(nameInput);
    if (type !== 'ed25519' && type !== 'rsa') throw new Error('SSH key type must be ed25519 or rsa');
    if (typeof passphrase !== 'string' || passphrase.length > 4096 || passphrase.includes('\u0000')) {
      throw new Error('Invalid SSH key passphrase');
    }
    fs.mkdirSync(this.sshDir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(this.sshDir, 0o700); } catch { /* best effort on non-POSIX filesystems */ }
    const keyPath = path.join(this.sshDir, name);
    if (fs.existsSync(keyPath) || fs.existsSync(`${keyPath}.pub`)) throw new Error(`Key ${name} already exists`);

    const args = ['-q', '-t', type, '-f', keyPath, '-C', `aux-command-${os.hostname()}`];
    if (type === 'ed25519') args.push('-a', '100');
    else args.push('-b', '4096');
    let askpassDir = '';
    let result;
    try {
      const options = {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 30_000
      };
      if (passphrase) {
        const memoryRoot = fs.existsSync('/dev/shm') ? '/dev/shm' : os.tmpdir();
        askpassDir = fs.mkdtempSync(path.join(memoryRoot, 'aux-command-askpass-'));
        fs.chmodSync(askpassDir, 0o700);
        const helper = path.join(askpassDir, 'askpass');
        const secret = path.join(askpassDir, 'secret');
        fs.writeFileSync(helper, '#!/bin/sh\nexec /bin/cat -- "$AUX_COMMAND_ASKPASS_FILE"\n', { mode: 0o700 });
        fs.writeFileSync(secret, `${passphrase}\n`, { mode: 0o600 });
        options.env = {
          ...process.env,
          DISPLAY: process.env.DISPLAY || 'aux-command:0',
          SSH_ASKPASS: helper,
          SSH_ASKPASS_REQUIRE: 'force',
          AUX_COMMAND_ASKPASS_FILE: secret
        };
      } else {
        args.push('-N', '');
      }
      result = spawnSync('ssh-keygen', args, options);
    } finally {
      if (askpassDir) fs.rmSync(askpassDir, { recursive: true, force: true });
    }
    if (result.error || result.status !== 0) {
      try { fs.rmSync(keyPath, { force: true }); } catch { /* best effort */ }
      try { fs.rmSync(`${keyPath}.pub`, { force: true }); } catch { /* best effort */ }
      throw new Error(`ssh-keygen failed: ${result.error?.message || String(result.stderr || '').trim()}`);
    }
    try { fs.chmodSync(keyPath, 0o600); } catch { /* best effort */ }
    try { fs.chmodSync(`${keyPath}.pub`, 0o644); } catch { /* best effort */ }
    const content = fs.readFileSync(`${keyPath}.pub`, 'utf8').trim();
    const parts = content.split(/\s+/u);
    const { fingerprint } = fingerprintFor(`${keyPath}.pub`);
    return {
      name,
      path: keyPath,
      publicKey: `${keyPath}.pub`,
      fingerprint,
      type: parts[0] || type,
      comment: parts.slice(2).join(' ')
    };
  }

  getPublicKey(nameInput) {
    const name = validateKeyName(nameInput);
    const keyPath = path.join(this.sshDir, `${name}.pub`);
    if (!fs.existsSync(keyPath)) throw new Error(`Public key ${name}.pub not found`);
    return fs.readFileSync(keyPath, 'utf8').trim();
  }

  getFingerprint(nameInput) {
    const name = validateKeyName(nameInput);
    const keyPath = path.join(this.sshDir, name);
    if (!fs.existsSync(keyPath)) throw new Error(`Private key ${name} not found`);
    return fingerprintFor(keyPath).output;
  }

  deleteKey(nameInput) {
    const name = validateKeyName(nameInput);
    const privateKey = path.join(this.sshDir, name);
    const publicKey = `${privateKey}.pub`;
    let deleted = false;
    if (fs.existsSync(privateKey)) { fs.rmSync(privateKey); deleted = true; }
    if (fs.existsSync(publicKey)) { fs.rmSync(publicKey); deleted = true; }
    return deleted;
  }
}

module.exports = { SshKeyService, validateKeyName };
