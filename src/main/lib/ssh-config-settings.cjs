'use strict';

// Turns what `ssh -G` reports for a profile into the settings the ssh2-backed
// file panel needs, so it connects where the OpenSSH terminal connects. The
// profile fields that the terminal passes as command-line options (see
// sshBaseArgs: a port other than 22, user name, identity file, known-hosts
// file, ProxyJump) win over ~/.ssh/config, exactly as they do for `ssh`.
// Pure: no file or process access, so the precedence rules are unit-tested.
const os = require('node:os');
const path = require('node:path');

// Why the file panel refuses to connect from the SSH configuration. The
// messages are fixed catalogue sources, so they are translated where shown.
// Only 'ssh-missing' (OpenSSH is not installed) lets the caller use the
// profile's own fields; every other failure means the user's configuration
// could not be applied, and connecting without it might skip what it
// requires (a ProxyCommand, a jump host, a known-hosts file).
const SSH_CONFIG_MESSAGES = Object.freeze({
  timeout: 'OpenSSH took too long to read your SSH configuration, so the file panel did not connect. Look for slow Match exec commands in ~/.ssh/config.',
  failed: 'OpenSSH could not read your SSH configuration for this connection, so the file panel did not connect. Run ssh -G with the same host in a terminal to see why.',
  incomplete: 'OpenSSH returned an incomplete SSH configuration for this connection, so the file panel did not connect.',
  unsafe: 'The ProxyCommand in your SSH configuration would run with a host or user name that contains characters a shell acts on, so the file panel did not connect.'
});

class SshConfigError extends Error {
  constructor(code, message = SSH_CONFIG_MESSAGES[code] || SSH_CONFIG_MESSAGES.failed) {
    super(message);
    this.name = 'SshConfigError';
    this.code = code;
  }
}

function first(resolved, key) {
  const value = resolved?.[key]?.[0];
  return typeof value === 'string' ? value.trim() : '';
}

function localContext(context = {}) {
  return {
    home: context.home || os.homedir(),
    localUser: context.localUser || os.userInfo().username,
    uid: context.uid ?? os.userInfo().uid,
    localHost: context.localHost || os.hostname(),
    env: context.env || process.env
  };
}

function expandHomePath(value, home) {
  if (value === '~') return home;
  return value.startsWith('~/') ? path.join(home, value.slice(2)) : value;
}

// OpenSSH percent tokens. A token this code cannot compute (for example %C)
// is an error: running a half-expanded command or reading a wrong file would
// be worse than saying so.
function expandTokens(value, tokens, what) {
  return String(value).replace(/%(.?)/gu, (match, token) => {
    if (token === '%') return '%';
    if (Object.prototype.hasOwnProperty.call(tokens, token)) return String(tokens[token]);
    throw new Error(`${what} uses the token ${match}, which the file panel does not support`);
  });
}

function tokensFor(settings, context) {
  const local = localContext(context);
  return {
    h: settings.host,
    n: settings.originalHost,
    p: settings.port,
    r: settings.username,
    k: settings.hostKeyAlias || settings.host,
    u: local.localUser,
    d: local.home,
    i: local.uid,
    l: local.localHost,
    L: local.localHost.split('.')[0]
  };
}

// `ssh -G` prints ProxyCommand with its tokens still in place (checked on
// OpenSSH 9.2 and 9.6). Should a version print them expanded, there is
// nothing left to replace and the command passes through unchanged.
//
// ProxyCommand runs through `sh -c`, so a value substituted for %h, %n, %r or
// %k is code if it holds shell syntax. OpenSSH before 9.6 substitutes whatever
// the profile says (a user name such as `x$IFS-oProxyCommand=...` ran a
// command on Debian 12's OpenSSH 9.2). These values must therefore be plain
// names: letters, digits and . _ @ + : - (the last for IPv6 and user@domain).
// Anything else is refused outright, never quoted or altered: a quoted value
// would reach the proxy as a different name than the one the user typed.
// Checked here, after OpenSSH answered, so it never depends on what ssh -G or
// the installed OpenSSH version does about the same characters.
const PLAIN_NAME = /^[A-Za-z0-9._@+:-]+$/u;

function expandProxyCommand(settings, context) {
  const tokens = tokensFor(settings, context);
  const command = String(settings.proxyCommand);
  // Only values that are actually substituted are checked, so a command with
  // no %h/%n/%r/%k is not refused for a name it does not use.
  const used = new Set([...command.matchAll(/%(.?)/gu)].map((match) => match[1]));
  for (const token of ['h', 'n', 'r', 'k']) {
    if (used.has(token) && !PLAIN_NAME.test(String(tokens[token]))) throw new SshConfigError('unsafe');
  }
  return expandTokens(command, tokens, 'ProxyCommand');
}

function agentSocket(value, local) {
  if (!value || value === 'SSH_AUTH_SOCK') return local.env.SSH_AUTH_SOCK || '';
  if (value.toLowerCase() === 'none') return '';
  if (value.startsWith('$')) return local.env[value.slice(1).replace(/^\{|\}$/gu, '')] || '';
  return expandHomePath(value, local.home);
}

// `ssh -G` prints these lists space-separated and unquoted.
function fileList(resolved, key, home) {
  return (resolved?.[key] || []).flatMap((line) => String(line).split(/\s+/u))
    .filter((file) => file && file.toLowerCase() !== 'none')
    .map((file) => expandHomePath(file, home));
}

// profile: a normalized profile with useSshConfig set.
// resolved: resolveSshConfig() output, { lowercasekeyword: [values] }.
function sshConfigSettings(profile, resolved, context) {
  const local = localContext(context);
  const host = first(resolved, 'hostname');
  const resolvedPort = Number(first(resolved, 'port'));
  if (!host || !Number.isInteger(resolvedPort) || resolvedPort < 1 || resolvedPort > 65535) {
    throw new SshConfigError('incomplete');
  }
  const settings = {
    originalHost: profile.sshAlias || profile.host,
    host,
    port: profile.port !== 22 ? profile.port : resolvedPort,
    username: profile.username || first(resolved, 'user') || local.localUser,
    hostKeyAlias: first(resolved, 'hostkeyalias'),
    identityFiles: [],
    identitiesOnly: first(resolved, 'identitiesonly').toLowerCase() === 'yes',
    agent: agentSocket(first(resolved, 'identityagent'), local),
    proxyJump: '',
    proxyCommand: '',
    knownHostsFiles: []
  };

  // ProxyJump and ProxyCommand compete in OpenSSH: the one given first wins,
  // and a jump host set on the profile is given on the command line.
  const configJump = first(resolved, 'proxyjump');
  const configCommand = first(resolved, 'proxycommand');
  if (profile.proxyJump) settings.proxyJump = profile.proxyJump;
  else if (configJump && configJump.toLowerCase() !== 'none') settings.proxyJump = configJump;
  else if (configCommand && configCommand.toLowerCase() !== 'none') settings.proxyCommand = configCommand;

  // The identity file set on the profile is read separately (it must exist);
  // these are the further keys from the configuration, in OpenSSH's order.
  const tokens = tokensFor(settings, local);
  const seen = new Set(profile.identityFile ? [expandHomePath(profile.identityFile, local.home)] : []);
  for (const entry of resolved?.identityfile || []) {
    const raw = String(entry).trim();
    if (!raw || raw.toLowerCase() === 'none') continue;
    let file;
    try { file = expandHomePath(expandTokens(raw, tokens, 'IdentityFile'), local.home); } catch { continue; }
    if (!path.isAbsolute(file)) file = path.join(local.home, file);
    if (!seen.has(file)) { seen.add(file); settings.identityFiles.push(file); }
  }

  const userFiles = profile.knownHostsFile
    ? [expandHomePath(profile.knownHostsFile, local.home)]
    : fileList(resolved, 'userknownhostsfile', local.home);
  settings.knownHostsFiles = [...new Set([...userFiles, ...fileList(resolved, 'globalknownhostsfile', local.home)])];
  return settings;
}

module.exports = { PLAIN_NAME, SSH_CONFIG_MESSAGES, SshConfigError, expandProxyCommand, expandTokens, sshConfigSettings };
