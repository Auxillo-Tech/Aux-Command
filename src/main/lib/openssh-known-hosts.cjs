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

function globMatch(pattern, value) {
  const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*').replace(/\?/gu, '.')}$`, 'iu');
  return regex.test(value);
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
    }
  }
  if (result.revoked) result.trusted = false;
  return result;
}

module.exports = { checkOpenSshKnownHosts, defaultKnownHostsFiles, hostToken, hostsFieldMatches };
