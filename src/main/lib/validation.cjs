'use strict';

const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const validationMessages = require('../../shared/validation-messages.js');
const { randomUUID } = require('node:crypto');

const PROTOCOLS = new Set(['local', 'ssh', 'mosh', 'telnet', 'serial', 'ftp', 'ftps', 'rdp', 'vnc']);
const TRANSFER_MODES = new Set(['sftp', 'scp']);
const TUNNEL_TYPES = new Set(['local', 'remote', 'dynamic']);
const CREDENTIAL_KINDS = new Set(['password', 'passphrase']);
const TERMINAL_THEMES = new Set([
  'aux-dark', 'light', 'high-contrast', 'nord', 'dracula', 'solarized-dark', 'solarized-light',
  'one-dark', 'catppuccin-mocha', 'tokyo-night', 'gruvbox-dark', 'monokai', 'oceanic-next', 'material'
]);
const TERMINAL_CURSOR_STYLES = new Set(['block', 'underline', 'bar']);
// Fixed palette so a profile (possibly synced from elsewhere) can only pick a
// named colour, never inject arbitrary CSS.
const TAB_COLORS = new Set(['', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink']);
// How an FTPS profile starts TLS: 'auto' picks the form from the port and
// detects it on unusual ports, the other two force one form.
const FTPS_MODES = new Set(['auto', 'explicit', 'implicit']);

// `field` names the profile property the message is about, so a stored profile
// that no longer passes can still be shown with the wrong field pointed out
// (see describeInvalidProfile).
function fail(message, field) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  if (field) error.field = field;
  throw error;
}

// A refusal that the editor can show in the user's language: one of the shared
// reasons, about one profile field.
function failReason(reason, field) {
  fail(validationMessages.message(reason, field), field);
}

function cleanString(value, name, options = {}) {
  const { required = false, max = 512, allowNewlines = false } = options;
  if (value === undefined || value === null) {
    if (required) failReason('required', name);
    return '';
  }
  if (typeof value !== 'string') failReason('notString', name);
  const result = value.trim();
  if (required && !result) failReason('required', name);
  if (result.length > max) failReason('tooLong', name);
  const controlPattern = allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  if (controlPattern.test(result)) failReason('control', name);
  return result;
}

function cleanPort(value, name = 'port', fallback = 22) {
  if (value === undefined || value === null || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) failReason('port', name);
  return port;
}

function cleanBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function cleanBoundedInteger(value, name, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number)) fail(`${name} must be an integer`);
  return Math.min(max, Math.max(min, number));
}

function rejectOptionLike(value, name, { rejectWhitespace = false } = {}) {
  if (!value) return value;
  if (value.startsWith('-')) failReason('hyphen', name);
  if (rejectWhitespace && /\s/u.test(value)) failReason('whitespace', name);
  return value;
}

// OpenSSH before 9.6 puts a user or host name into `sh -c` strings (a
// ProxyCommand with %r or %h, ProxyJump hops) without checking it, so one that
// holds shell syntax runs a command: `x$IFS-oProxyCommand=touch\ /tmp/f` did on
// Debian 12's OpenSSH 9.2. Version 9.6 refuses these characters itself; the
// app refuses them for every version, because the installed OpenSSH is not
// under its control. The list is OpenSSH 9.6's (quotes, backtick, $, backslash,
// ; & | < > ( ) and whitespace; control characters are refused by cleanString)
// plus the glob characters * and ?, which no real name needs. A name is refused
// whole: silently changing it would connect somewhere else.
const SHELL_SYNTAX = /['"`$\\;&|<>()*?\s]/u;

function rejectShellSyntax(value, name) {
  if (value && SHELL_SYNTAX.test(value)) {
    // A Windows domain user (CORP\\jd) is the one name people really have that
    // holds one of these characters; tell them the form that works.
    if (name === 'username' && /\\/u.test(value) && !SHELL_SYNTAX.test(value.replace(/\\/gu, ''))) {
      failReason('backslash', name);
    }
    failReason('shell', name);
  }
  return value;
}

// A host or jump host is a DNS name (letters of any script, digits, dot,
// hyphen, underscore), an IPv4 address (same characters), or an IPv6 address.
// Brace, bracket, tilde, bang and hash characters are refused: a shell expands
// {a,b} and ~ and OpenSSH before 9.6 hands these names to one, so
// `{touch,/tmp/f}` in a ProxyJump hop ran a command on openSUSE Leap 15.6.
const HOST_NAME = /^[\p{L}\p{N}._-]+$/u;
// An alias from ~/.ssh/config: the same characters, nothing else.
const ALIAS_NAME = HOST_NAME;
// A jump hop's user part: the characters a user name needs (letters, digits,
// dot, underscore, hyphen, plus, and @ for a user@domain name). Everything else,
// % included, is refused, so the hop grammar stays closed whatever OpenSSH
// does with it (%r and %h are expanded in some of its settings).
const HOP_USER = /^[\p{L}\p{N}._+@-]+$/u;
// An IPv6 zone id (fe80::1%eth0): letters, digits, dot, underscore and hyphen,
// not starting with a hyphen.
const ZONE_ID = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/u;

function isIPv6Address(value) {
  if (!net.isIPv6(value)) return false;
  const percent = value.indexOf('%');
  return percent < 0 || ZONE_ID.test(value.slice(percent + 1));
}

function isHostName(value) {
  if (isIPv6Address(value)) return true;
  const bracketed = /^\[([^\]]+)\]$/u.exec(value);
  if (bracketed) return isIPv6Address(bracketed[1]);
  return HOST_NAME.test(value);
}

function rejectBadHost(value, name) {
  if (value && !isHostName(value)) failReason('host', name);
  return value;
}

function rejectBadAlias(value, name) {
  if (value && !ALIAS_NAME.test(value)) failReason('alias', name);
  return value;
}

// One hop at a time: [user@]host[:port]. The host is a DNS name, an IPv4
// address, or an IPv6 address inside one pair of brackets; a bare IPv6 address
// is refused because its colons cannot be told from a port.
function checkJumpHop(hop) {
  if (!hop || hop.startsWith('-')) return false;
  const at = hop.lastIndexOf('@');
  if (at === 0) return false;
  if (at > 0) {
    const user = hop.slice(0, at);
    if (!HOP_USER.test(user) || user.startsWith('@') || user.endsWith('@')) return false;
  }
  const target = hop.slice(at + 1);
  let host = target;
  let port = '';
  if (target.startsWith('[')) {
    const match = /^\[([^\]]+)\](?::([^:]*))?$/u.exec(target);
    if (!match || !isIPv6Address(match[1])) return false;
    host = match[1];
    port = match[2] ?? '';
    if (target.endsWith(':') && port === '') return false;
  } else {
    const parts = target.split(':');
    if (parts.length > 2) return false;
    [host, port = ''] = parts;
    if (!host || host.startsWith('-') || !HOST_NAME.test(host)) return false;
    if (parts.length === 2 && port === '') return false;
  }
  if (port !== '') {
    if (!/^\d{1,5}$/u.test(port)) return false;
    const number = Number(port);
    if (number < 1 || number > 65535) return false;
  }
  return true;
}

function rejectBadJumpHosts(value, name) {
  if (!value) return value;
  rejectShellSyntax(value, name);
  if (!value.split(',').every(checkJumpHop)) failReason('jump', name);
  return value;
}

function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => cleanString(tag, 'tags', { max: 48 })).filter(Boolean))].slice(0, 24);
}

function expandHome(input, name = 'path') {
  const value = cleanString(input, name, { max: 4096 });
  if (!value) return '';
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function normalizeProfile(input = {}, existingId = '') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('profile must be an object');
  // The window marks a stored profile that failed validation with `invalid`
  // (see ProfileStore.listAll). It cannot be used until it is edited, whatever
  // the display copy of its fields looks like.
  if (input.invalid && typeof input.invalid === 'object' && typeof input.invalid.message === 'string') {
    fail(input.invalid.message, typeof input.invalid.field === 'string' ? input.invalid.field : undefined);
  }
  const protocol = cleanString(input.protocol || 'ssh', 'protocol', { required: true, max: 16 }).toLowerCase();
  if (!PROTOCOLS.has(protocol)) fail(`unsupported protocol: ${protocol}`);
  const identityFile = rejectOptionLike(expandHome(input.identityFile, 'identityFile'), 'identityFile');
  const knownHostsFile = rejectOptionLike(expandHome(input.knownHostsFile, 'knownHostsFile'), 'knownHostsFile');
  const credentialKind = cleanString(
    input.credentialKind || (identityFile ? 'passphrase' : 'password'),
    'credentialKind',
    { required: true, max: 16 }
  ).toLowerCase();
  if (!CREDENTIAL_KINDS.has(credentialKind)) fail(`unsupported credential kind: ${credentialKind}`);
  const terminalTheme = cleanString(input.terminalTheme || 'aux-dark', 'terminalTheme', { max: 32 }).toLowerCase();
  if (!TERMINAL_THEMES.has(terminalTheme)) fail(`unsupported terminal theme: ${terminalTheme}`);
  const terminalCursorStyle = cleanString(input.terminalCursorStyle || 'block', 'terminalCursorStyle', { max: 32 }).toLowerCase();
  if (!TERMINAL_CURSOR_STYLES.has(terminalCursorStyle)) fail(`unsupported terminal cursor style: ${terminalCursorStyle}`);
  // An unknown colour (e.g. from a newer version's export) falls back to none
  // rather than rejecting the whole profile.
  const requestedTabColor = String(input.tabColor || '').trim().toLowerCase();
  const tabColor = TAB_COLORS.has(requestedTabColor) ? requestedTabColor : '';
  // Same rule for the FTPS mode: an unknown value means automatic.
  const requestedFtpsMode = typeof input.ftpsMode === 'string' ? input.ftpsMode.trim().toLowerCase() : '';
  const ftpsMode = protocol === 'ftps' && FTPS_MODES.has(requestedFtpsMode) ? requestedFtpsMode : 'auto';
  const transferMode = cleanString(input.transferMode || 'sftp', 'transferMode', { max: 16 }).toLowerCase();
  if (!TRANSFER_MODES.has(transferMode)) fail(`unsupported transfer mode: ${transferMode}`);

  // Names OpenSSH will place in a shell string: ssh and mosh profiles only
  // (an RDP user may be DOMAIN\\name, an FTP password-style name may hold more).
  const sshFamily = protocol === 'ssh' || protocol === 'mosh';
  const shellNamed = (value, name) => (sshFamily ? rejectShellSyntax(value, name) : value);
  const hostNamed = (value, name) => (sshFamily ? rejectBadHost(shellNamed(value, name), name) : value);
  const aliasNamed = (value, name) => (sshFamily ? rejectBadAlias(shellNamed(value, name), name) : value);
  const jumpNamed = (value, name) => (sshFamily ? rejectBadJumpHosts(value, name) : value);

  const profile = {
    id: cleanString(existingId || input.id || randomUUID(), 'id', { required: true, max: 128 }),
    name: cleanString(input.name || (protocol === 'local' ? 'Local shell' : input.host), 'name', { required: true, max: 120 }),
    protocol,
    group: cleanString(cleanString(input.group || 'Connections', 'group', { max: 80 }).split('/').map(part => part.trim()).filter(Boolean).join(' / ') || 'Connections', 'group', { max: 80 }),
    host: hostNamed(rejectOptionLike(cleanString(input.host, 'host', { required: !['local', 'serial'].includes(protocol), max: 255 }), 'host', { rejectWhitespace: true }), 'host'),
    port: protocol === 'local' ? 0 : cleanPort(input.port, 'port', protocol === 'rdp' ? 3389 : protocol === 'vnc' ? 5900 : protocol === 'telnet' ? 23 : protocol === 'ftp' ? 21 : protocol === 'ftps' ? 990 : 22),
    username: shellNamed(rejectOptionLike(cleanString(input.username, 'username', { max: 128 }), 'username'), 'username'),
    identityFile,
    knownHostsFile,
    sshAlias: aliasNamed(rejectOptionLike(cleanString(input.sshAlias, 'sshAlias', { max: 255 }), 'sshAlias', { rejectWhitespace: true }), 'sshAlias'),
    sshAliases: [...new Set((Array.isArray(input.sshAliases) ? input.sshAliases : []).slice(0, 128).map((alias) => aliasNamed(rejectOptionLike(cleanString(alias, 'sshAliases', { required: true, max: 255 }), 'sshAliases', { rejectWhitespace: true }), 'sshAliases')))],
    transferMode: protocol === 'ssh' ? transferMode : 'sftp',
    credentialId: cleanString(input.credentialId, 'credentialId', { max: 128 }),
    credentialKind,
    tags: cleanTags(input.tags),
    favorite: cleanBoolean(input.favorite),
    tabColor,
    useSshConfig: cleanBoolean(input.useSshConfig, true),
    startupCommand: rejectOptionLike(cleanString(input.startupCommand, 'startupCommand', { max: 2048, allowNewlines: true }).trimStart(), 'startupCommand'),
    proxyJump: jumpNamed(rejectOptionLike(cleanString(input.proxyJump, 'proxyJump', { max: 512 }), 'proxyJump', { rejectWhitespace: true }), 'proxyJump'),
    trackRemoteCwd: cleanBoolean(input.trackRemoteCwd, false),
    keepAliveSeconds: Math.min(600, Math.max(0, Number.isInteger(Number(input.keepAliveSeconds)) ? Number(input.keepAliveSeconds) : 30)),
    compression: cleanBoolean(input.compression),
    agentForwarding: cleanBoolean(input.agentForwarding),
    x11Forwarding: cleanBoolean(input.x11Forwarding),
    sftpRoot: cleanString(input.sftpRoot || '/', 'sftpRoot', { max: 4096 }) || '/',
    ftpsMode,
    device: cleanString(input.device, 'device', { required: protocol === 'serial', max: 4096 }),
    baudRate: Math.min(4_000_000, Math.max(50, Number.isInteger(Number(input.baudRate)) ? Number(input.baudRate) : 115200)),
    rdpAudio: cleanBoolean(input.rdpAudio, false),
    rdpWidth: Math.max(800, Math.min(3840, Math.round(Number(input.rdpWidth) || 1600))),
    rdpHeight: Math.max(600, Math.min(2160, Math.round(Number(input.rdpHeight) || 900))),
    rdpDomain: cleanString(input.rdpDomain, 'rdpDomain', { max: 128 }),
    inheritTerminalDefaults: cleanBoolean(input.inheritTerminalDefaults, false),
    terminalTheme,
    terminalFontFamily: cleanString(input.terminalFontFamily || 'JetBrains Mono, Fira Code, Cascadia Code, DejaVu Sans Mono, monospace', 'terminalFontFamily', { max: 240 }),
    terminalFontSize: cleanBoundedInteger(input.terminalFontSize, 'terminalFontSize', 13, 8, 32),
    terminalCursorStyle,
    terminalCursorBlink: cleanBoolean(input.terminalCursorBlink, true),
    terminalScrollback: cleanBoundedInteger(input.terminalScrollback, 'terminalScrollback', 20000, 1000, 200000),
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
    cwd: expandHome(input.cwd || os.homedir()),
    remoteCwd: input.remoteCwd && String(input.remoteCwd).startsWith('/') ? cleanString(input.remoteCwd, 'remoteCwd', { max: 4096 }) : ''
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
  FTPS_MODES,
  PROTOCOLS,
  TAB_COLORS,
  TERMINAL_CURSOR_STYLES,
  TERMINAL_THEMES,
  TRANSFER_MODES,
  TUNNEL_TYPES,
  cleanBoolean,
  cleanBoundedInteger,
  cleanPort,
  cleanString,
  expandHome,
  checkJumpHop,
  normalizeProfile,
  normalizeRemotePath,
  normalizeSnippet,
  normalizeTerminalRequest,
  normalizeTunnel
};
