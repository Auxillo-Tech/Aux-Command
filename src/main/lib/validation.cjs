'use strict';

const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const PROTOCOLS = new Set(['local', 'ssh', 'mosh', 'telnet', 'serial', 'rdp', 'vnc']);
const TUNNEL_TYPES = new Set(['local', 'remote', 'dynamic']);
const CREDENTIAL_KINDS = new Set(['password', 'passphrase']);

function fail(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  throw error;
}

function cleanString(value, name, options = {}) {
  const { required = false, max = 512, allowNewlines = false } = options;
  if (value === undefined || value === null) {
    if (required) fail(`${name} is required`);
    return '';
  }
  if (typeof value !== 'string') fail(`${name} must be a string`);
  const result = value.trim();
  if (required && !result) fail(`${name} is required`);
  if (result.length > max) fail(`${name} is too long`);
  const controlPattern = allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  if (controlPattern.test(result)) fail(`${name} contains control characters`);
  return result;
}

function cleanPort(value, name = 'port', fallback = 22) {
  if (value === undefined || value === null || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`${name} must be between 1 and 65535`);
  return port;
}

function cleanBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function rejectOptionLike(value, name, { rejectWhitespace = false } = {}) {
  if (!value) return value;
  if (value.startsWith('-')) fail(`${name} cannot start with a hyphen`);
  if (rejectWhitespace && /\s/u.test(value)) fail(`${name} cannot contain whitespace`);
  return value;
}

function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => cleanString(tag, 'tag', { max: 48 })).filter(Boolean))].slice(0, 24);
}

function expandHome(input) {
  const value = cleanString(input, 'path', { max: 4096 });
  if (!value) return '';
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function normalizeProfile(input = {}, existingId = '') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('profile must be an object');
  const protocol = cleanString(input.protocol || 'ssh', 'protocol', { required: true, max: 16 }).toLowerCase();
  if (!PROTOCOLS.has(protocol)) fail(`unsupported protocol: ${protocol}`);
  const identityFile = expandHome(input.identityFile);
  const credentialKind = cleanString(
    input.credentialKind || (identityFile ? 'passphrase' : 'password'),
    'credentialKind',
    { required: true, max: 16 }
  ).toLowerCase();
  if (!CREDENTIAL_KINDS.has(credentialKind)) fail(`unsupported credential kind: ${credentialKind}`);

  const profile = {
    id: cleanString(existingId || input.id || randomUUID(), 'id', { required: true, max: 128 }),
    name: cleanString(input.name || (protocol === 'local' ? 'Local shell' : input.host), 'name', { required: true, max: 120 }),
    protocol,
    group: cleanString(input.group || 'Connections', 'group', { max: 80 }) || 'Connections',
    host: rejectOptionLike(cleanString(input.host, 'host', { required: !['local', 'serial'].includes(protocol), max: 255 }), 'host', { rejectWhitespace: true }),
    port: protocol === 'local' ? 0 : cleanPort(input.port, 'port', protocol === 'rdp' ? 3389 : protocol === 'vnc' ? 5900 : protocol === 'telnet' ? 23 : 22),
    username: rejectOptionLike(cleanString(input.username, 'username', { max: 128 }), 'username'),
    identityFile,
    sshAlias: rejectOptionLike(cleanString(input.sshAlias, 'sshAlias', { max: 255 }), 'sshAlias', { rejectWhitespace: true }),
    credentialId: cleanString(input.credentialId, 'credentialId', { max: 128 }),
    credentialKind,
    tags: cleanTags(input.tags),
    favorite: cleanBoolean(input.favorite),
    useSshConfig: cleanBoolean(input.useSshConfig, true),
    startupCommand: cleanString(input.startupCommand, 'startupCommand', { max: 2048, allowNewlines: true }),
    proxyJump: rejectOptionLike(cleanString(input.proxyJump, 'proxyJump', { max: 512 }), 'proxyJump', { rejectWhitespace: true }),
    keepAliveSeconds: Math.min(600, Math.max(0, Number.isInteger(Number(input.keepAliveSeconds)) ? Number(input.keepAliveSeconds) : 30)),
    compression: cleanBoolean(input.compression),
    agentForwarding: cleanBoolean(input.agentForwarding),
    x11Forwarding: cleanBoolean(input.x11Forwarding),
    sftpRoot: cleanString(input.sftpRoot || '/', 'sftpRoot', { max: 4096 }) || '/',
    device: cleanString(input.device, 'device', { required: protocol === 'serial', max: 4096 }),
    baudRate: Math.min(4_000_000, Math.max(50, Number.isInteger(Number(input.baudRate)) ? Number(input.baudRate) : 115200)),
    rdpDomain: cleanString(input.rdpDomain, 'rdpDomain', { max: 128 }),
    notes: cleanString(input.notes, 'notes', { max: 4096, allowNewlines: true }),
    createdAt: cleanString(input.createdAt, 'createdAt', { max: 64 }) || new Date().toISOString(),
    updatedAt: cleanString(input.updatedAt, 'updatedAt', { max: 64 }) || new Date().toISOString()
  };

  if (protocol === 'local') {
    profile.host = '';
    profile.port = 0;
  }
  if (protocol === 'serial' && !path.isAbsolute(profile.device)) {
    fail('serial device must be an absolute path');
  }
  return profile;
}

function normalizeTerminalRequest(input = {}) {
  if (!input || typeof input !== 'object') fail('terminal request must be an object');
  return {
    profile: normalizeProfile(input.profile || {}),
    cols: Math.min(500, Math.max(20, Number.isInteger(Number(input.cols)) ? Number(input.cols) : 100)),
    rows: Math.min(300, Math.max(5, Number.isInteger(Number(input.rows)) ? Number(input.rows) : 30)),
    cwd: expandHome(input.cwd || os.homedir())
  };
}

function normalizeTunnel(input = {}) {
  if (!input || typeof input !== 'object') fail('tunnel must be an object');
  const type = cleanString(input.type || 'local', 'tunnel type', { required: true, max: 16 });
  if (!TUNNEL_TYPES.has(type)) fail(`unsupported tunnel type: ${type}`);
  const tunnel = {
    id: cleanString(input.id || randomUUID(), 'tunnel id', { required: true, max: 128 }),
    name: cleanString(input.name || `${type} tunnel`, 'tunnel name', { required: true, max: 120 }),
    type,
    profileId: cleanString(input.profileId, 'profileId', { required: true, max: 128 }),
    bindHost: cleanString(input.bindHost || '127.0.0.1', 'bindHost', { required: true, max: 255 }),
    bindPort: cleanPort(input.bindPort, 'bindPort', 8080),
    targetHost: cleanString(input.targetHost || '127.0.0.1', 'targetHost', { required: type !== 'dynamic', max: 255 }),
    targetPort: type === 'dynamic' ? 0 : cleanPort(input.targetPort, 'targetPort', 80)
  };
  return tunnel;
}

function normalizeSnippet(input = {}, existingId = '') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('snippet must be an object');
  return {
    id: cleanString(existingId || input.id || randomUUID(), 'snippet id', { required: true, max: 128 }),
    name: cleanString(input.name, 'snippet name', { required: true, max: 120 }),
    command: cleanString(input.command, 'snippet command', { required: true, max: 4096, allowNewlines: true }),
    description: cleanString(input.description, 'snippet description', { max: 512, allowNewlines: true }),
    createdAt: cleanString(input.createdAt, 'snippet createdAt', { max: 64 }) || new Date().toISOString(),
    updatedAt: cleanString(input.updatedAt, 'snippet updatedAt', { max: 64 }) || new Date().toISOString()
  };
}

function normalizeRemotePath(value) {
  const raw = cleanString(value || '/', 'remote path', { required: true, max: 4096 });
  const normalized = path.posix.normalize(raw.startsWith('/') ? raw : `/${raw}`);
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

module.exports = {
  CREDENTIAL_KINDS,
  PROTOCOLS,
  TUNNEL_TYPES,
  cleanBoolean,
  cleanPort,
  cleanString,
  expandHome,
  normalizeProfile,
  normalizeRemotePath,
  normalizeSnippet,
  normalizeTerminalRequest,
  normalizeTunnel
};
