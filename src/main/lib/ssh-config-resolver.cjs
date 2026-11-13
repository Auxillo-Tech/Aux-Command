'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { sshBaseArgs, resolveHelper } = require('./command-builder.cjs');
const { findExecutable } = require('./executable-finder.cjs');
const { SshConfigError } = require('./ssh-config-settings.cjs');
const run = promisify(execFile);

// How long `ssh -G` may take. It evaluates Match exec clauses, which run
// commands the user wrote (a VPN check, a lookup over the network), so a
// few seconds is normal and 3 s was too short: a slow answer is not a wrong
// one. The limit only has to stop a command that never returns, because the
// answer decides how the connection is made and there is no safe default
// when it is missing (see SshConfigError in ssh-config-settings.cjs).
const RESOLVE_TIMEOUT_MS = 15000;

// OpenSSH applies Includes, wildcards and first-value precedence. -G prints
// settings without opening a network connection or authenticating to a server.
async function resolveSshConfig(profile, options = {}) {
  const target = profile.useSshConfig && profile.sshAlias ? profile.sshAlias : profile.host;
  const args = options.configFile ? ['-F', options.configFile] : [];
  args.push('-G', ...sshBaseArgs(profile), '--', target);
  const python = findExecutable(['python3']);
  const ssh = findExecutable([options.executable || 'ssh']);
  if (!ssh) throw new SshConfigError('ssh-missing', 'OpenSSH is not installed');
  if (!python) throw new SshConfigError('failed');
  const timeout = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : RESOLVE_TIMEOUT_MS;
  let stdout;
  try {
    // Match exec clauses can spawn descendants even with -G. Keep those owned
    // by the same process guard as terminals so cancellation cleans up the tree.
    ({ stdout } = await run(python, [resolveHelper('process_guard.py'), '--parent-pid', String(process.pid), '--', ssh, ...args], { timeout, maxBuffer: 512 * 1024, windowsHide: true }));
  } catch (error) {
    // execFile kills the child on timeout and reports it as killed.
    if (error?.killed || error?.signal) throw new SshConfigError('timeout');
    throw new SshConfigError('failed');
  }
  const config = {};
  for (const line of stdout.split(/\r?\n/u)) {
    const match = line.match(/^(\S+)\s+(.*)$/u);
    if (!match) continue;
    const key = match[1].toLowerCase();
    (config[key] ||= []).push(match[2]);
  }
  if (!config.hostname?.[0] || !Number(config.port?.[0])) throw new SshConfigError('incomplete');
  return config;
}

module.exports = { RESOLVE_TIMEOUT_MS, resolveSshConfig };
