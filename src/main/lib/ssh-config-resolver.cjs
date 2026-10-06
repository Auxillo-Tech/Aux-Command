'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { sshBaseArgs, resolveHelper } = require('./command-builder.cjs');
const { findExecutable } = require('./executable-finder.cjs');
const run = promisify(execFile);

// OpenSSH applies Includes, wildcards and first-value precedence. -G prints
// settings without opening a network connection or authenticating to a server.
async function resolveSshConfig(profile, options = {}) {
  const target = profile.useSshConfig && profile.sshAlias ? profile.sshAlias : profile.host;
  const args = options.configFile ? ['-F', options.configFile] : [];
  args.push('-G', ...sshBaseArgs(profile), '--', target);
  const python = findExecutable(['python3']);
  const ssh = findExecutable([options.executable || 'ssh']);
  if (!python || !ssh) throw new Error('Python 3 and OpenSSH are required to resolve SSH configuration');
  // Match exec clauses can spawn descendants even with -G. Keep those owned
  // by the same process guard as terminals so cancellation cleans up the tree.
  const { stdout } = await run(python, [resolveHelper('process_guard.py'), '--parent-pid', String(process.pid), '--', ssh, ...args], { timeout: 3000, maxBuffer: 512 * 1024, windowsHide: true });
  const config = {};
  for (const line of stdout.split(/\r?\n/u)) {
    const match = line.match(/^(\S+)\s+(.*)$/u);
    if (!match) continue;
    const key = match[1].toLowerCase();
    (config[key] ||= []).push(match[2]);
  }
  if (!config.hostname?.[0] || !Number(config.port?.[0])) throw new Error('OpenSSH returned incomplete configuration');
  return config;
}

module.exports = { resolveSshConfig };
