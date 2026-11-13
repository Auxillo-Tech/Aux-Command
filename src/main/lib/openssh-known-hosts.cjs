'use strict';

// Reads OpenSSH known_hosts files so SFTP trusts a server the terminal (and
// OpenSSH) already trusts, and warns when OpenSSH has a different key for it.
// Supports plain and hashed (|1|salt|hash) host names, [host]:port entries,
// * and ? wildcards and negated patterns. @cert-authority lines are ignored;
// @revoked keys are never trusted.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, createHmac } = require('node:crypto');

const MAX_KNOWN_HOSTS_BYTES = 4 * 1024 * 1024;

function hostToken(host, port) {
  return Number(port) === 22 ? host : `[${host}]:${port}`;
}

// One pattern character against one value character, the way the anchored
// regular expression the old matcher built compared them: exact for a
// case-sensitive match and Unicode simple case folding (the iu flag) otherwise.
// One tiny regex per distinct pattern character is compiled and kept; nothing
// is compiled from the whole pattern.
const literalCache = new Map();
function sameChar(patternChar, valueChar, ignoreCase) {
  if (patternChar === valueChar) return true;
  if (!ignoreCase) return false;
  let regex = literalCache.get(patternChar);
  if (!regex) {
    regex = new RegExp(`^${patternChar.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'iu');
    if (literalCache.size >= 4096) literalCache.clear();
    literalCache.set(patternChar, regex);
  }
  return regex.test(valueChar);
}

// What '.' matched in the old regex: any code point except a line terminator.
function isAnyChar(char) {
  return char !== '\n' && char !== '\r' && char !== '\u2028' && char !== '\u2029';
}

// Glob match with '*' (any run) and '?' (one character), anchored at both
// ends. Iterative two-pointer matching: no regular expression is built from the
// pattern, so a pattern with many stars cannot backtrack (the old '*' to '.*'
// regex took 15 s for '*a*a*a*a*b' against 200 characters). The work is bounded
// by pattern length times value length and never exponential.
function globMatch(pattern, value, { ignoreCase = true } = {}) {
  const p = Array.from(String(pattern));
  const v = Array.from(String(value));
  let pi = 0;
  let vi = 0;
  let starPi = -1;
  let starVi = 0;
  while (vi < v.length) {
    if (pi < p.length && p[pi] === '*') {
      starPi = pi;
      starVi = vi;
      pi += 1;
      continue;
    }
    if (pi < p.length) {
      const single = p[pi] === '?' ? isAnyChar(v[vi]) : sameChar(p[pi], v[vi], ignoreCase);
      if (single) {
        pi += 1;
        vi += 1;
        continue;
      }
    }
    if (starPi >= 0 && isAnyChar(v[starVi])) {
      // The star absorbs one more character and the rest is tried again.
      starVi += 1;
      pi = starPi + 1;
      vi = starVi;
      continue;
    }
    return false;
  }
  while (pi < p.length && p[pi] === '*') pi += 1;
  return pi === p.length;
}

function hostsFieldMatches(field, token) {
  if (field.startsWith('|1|')) {
    const [, , salt, hash] = field.split('|');
    if (!salt || !hash) return false;
    try { return createHmac('sha1', Buffer.from(salt, 'base64')).update(token).digest('base64') === hash; }
    catch { return false; }
  }
  let matched = false;
  for (const pattern of field.split(',')) {
    if (pattern.startsWith('!')) {
      if (globMatch(pattern.slice(1), token)) return false;
    } else if (globMatch(pattern, token)) {
      matched = true;
    }
  }
  return matched;
}

function defaultKnownHostsFiles(profile = {}) {
  // Set when the connection follows ~/.ssh/config: the user and global files
  // OpenSSH itself would read for this host.
  if (Array.isArray(profile.knownHostsFiles)) return profile.knownHostsFiles;
  const files = [];
  if (profile.knownHostsFile) files.push(profile.knownHostsFile.replace(/^~(?=$|\/)/u, os.homedir()));
  else files.push(path.join(os.homedir(), '.ssh', 'known_hosts'), path.join(os.homedir(), '.ssh', 'known_hosts2'));
  files.push('/etc/ssh/ssh_known_hosts', '/etc/ssh/ssh_known_hosts2');
  return files;
}

function readEntries(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_KNOWN_HOSTS_BYTES) return [];
    return fs.readFileSync(file, 'utf8').split(/\r?\n/u);
  } catch {
    return [];
  }
}

// Returns { trusted, revoked, conflicts: [fingerprintHex] } for the raw host
// key blob the server presented.
function checkOpenSshKnownHosts(host, port, keyBlob, files) {
  const token = hostToken(String(host || ''), Number(port) || 22);
  const presented = Buffer.isBuffer(keyBlob) ? keyBlob : Buffer.alloc(0);
  const presentedType = presented.length > 4 ? presented.subarray(4, 4 + presented.readUInt32BE(0)).toString() : '';
  const result = { trusted: false, revoked: false, conflicts: [] };
  const otherTypes = [];
  for (const file of files) {
    for (const raw of readEntries(file)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split(/\s+/u);
      let marker = '';
      if (parts[0].startsWith('@')) marker = parts.shift();
      if (marker === '@cert-authority' || parts.length < 3) continue;
      const [hosts, type, encoded] = parts;
      if (!hostsFieldMatches(hosts, token)) continue;
      let blob;
      try { blob = Buffer.from(encoded, 'base64'); } catch { continue; }
      if (marker === '@revoked') {
        if (blob.equals(presented)) result.revoked = true;
        continue;
      }
      if (blob.equals(presented)) result.trusted = true;
      else if (type === presentedType) result.conflicts.push(createHash('sha256').update(blob).digest('hex'));
      else otherTypes.push(createHash('sha256').update(blob).digest('hex'));
    }
  }
  if (result.revoked) result.trusted = false;
  // OpenSSH knows this host only under another key type. Someone intercepting
  // the connection can offer a type that is not on record to dodge the
  // changed-key warning, so an unrecorded type counts as a changed identity.
  if (!result.trusted && !result.conflicts.length) result.conflicts.push(...otherTypes);
  return result;
}

// Host key algorithms ssh2 should ask for first so a server known to OpenSSH
// presents the key that is already on record.
const HOST_KEY_ALGORITHMS = {
  'ssh-ed25519': ['ssh-ed25519'],
  'ecdsa-sha2-nistp256': ['ecdsa-sha2-nistp256'],
  'ecdsa-sha2-nistp384': ['ecdsa-sha2-nistp384'],
  'ecdsa-sha2-nistp521': ['ecdsa-sha2-nistp521'],
  'ssh-rsa': ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa']
};
const DEFAULT_HOST_KEY_ORDER = ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'];

function knownHostKeyTypes(host, port, files) {
  const token = hostToken(String(host || ''), Number(port) || 22);
  const types = new Set();
  for (const file of files) {
    for (const raw of readEntries(file)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('@')) continue;
      const parts = line.split(/\s+/u);
      if (parts.length < 3 || !hostsFieldMatches(parts[0], token)) continue;
      if (HOST_KEY_ALGORITHMS[parts[1]]) types.add(parts[1]);
    }
  }
  return [...types];
}

// Returns the full host key algorithm list with the recorded types first, or
// null when OpenSSH has no record of the host (keep ssh2's defaults).
function preferredHostKeyAlgorithms(host, port, files) {
  const preferred = knownHostKeyTypes(host, port, files).flatMap((type) => HOST_KEY_ALGORITHMS[type]);
  if (!preferred.length) return null;
  return [...new Set([...DEFAULT_HOST_KEY_ORDER.filter((name) => preferred.includes(name)), ...DEFAULT_HOST_KEY_ORDER])];
}

module.exports = { checkOpenSshKnownHosts, defaultKnownHostsFiles, globMatch, hostToken, hostsFieldMatches, knownHostKeyTypes, preferredHostKeyAlgorithms };
