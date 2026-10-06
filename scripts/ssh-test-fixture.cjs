'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { TerminalService } = require('../src/main/services/terminal-service.cjs');
const { SftpService } = require('../src/main/services/sftp-service.cjs');

function commandExists(command) {
  return spawnSync('bash', ['-lc', `PATH="$PATH:/usr/sbin:/sbin" command -v ${command}`], { encoding: 'utf8' }).status === 0;
}

function commandPath(command) {
  return spawnSync('bash', ['-lc', `PATH="$PATH:/usr/sbin:/sbin" command -v ${command}`], { encoding: 'utf8' }).stdout.trim() || command;
}

const hasSshFixtureTools = commandExists('sshd') && commandExists('ssh-keygen') && commandExists('ssh');
const hasSerialFixtureTools = commandExists('socat');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function createSshdFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-sshd-'));
  const sshDir = path.join(directory, 'home', '.ssh');
  const runDir = path.join(directory, 'run');
  const rootDir = path.join(directory, 'root');
  fs.mkdirSync(sshDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(rootDir, { recursive: true });
  spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path.join(directory, 'host_key')], { stdio: 'inherit' });
  spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path.join(directory, 'client_key')], { stdio: 'inherit' });
  fs.copyFileSync(path.join(directory, 'client_key.pub'), path.join(sshDir, 'authorized_keys'));
  fs.chmodSync(sshDir, 0o700);
  fs.chmodSync(path.join(sshDir, 'authorized_keys'), 0o600);

  const port = await freePort();
  const user = os.userInfo().username;
  const config = [
    `Port ${port}`,
    'ListenAddress 127.0.0.1',
    `HostKey ${path.join(directory, 'host_key')}`,
    `PidFile ${path.join(runDir, 'sshd.pid')}`,
    `AuthorizedKeysFile ${path.join(sshDir, 'authorized_keys')}`,
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    'ChallengeResponseAuthentication no',
    'PubkeyAuthentication yes',
    'StrictModes no',
    'UsePAM no',
    'PermitRootLogin no',
    `AllowUsers ${user}`,
    'Subsystem sftp internal-sftp',
    'LogLevel ERROR',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(directory, 'sshd_config'), config);
  const logPath = path.join(directory, 'sshd.log');
  const log = fs.openSync(logPath, 'a');
  const child = spawn(commandPath('sshd'), ['-D', '-e', '-f', path.join(directory, 'sshd_config')], {
    stdio: ['ignore', log, log],
    shell: false
  });

  const clientKey = path.join(directory, 'client_key');
  const knownHosts = path.join(directory, 'known_hosts');
  let last = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    last = spawnSync('ssh', [
      '-i', clientKey,
      '-p', String(port),
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=no',
      '-o', `UserKnownHostsFile=${knownHosts}`,
      `${user}@127.0.0.1`,
      'printf AUX_SSH_FIXTURE_READY'
    ], { encoding: 'utf8', timeout: 3_000 });
    if (last.status === 0 && last.stdout.includes('AUX_SSH_FIXTURE_READY')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!last || last.status !== 0) {
    child.kill('SIGTERM');
    fs.closeSync(log);
    throw new Error(`sshd fixture failed: ${last?.stderr || ''}\n${fs.readFileSync(logPath, 'utf8')}`);
  }

  return {
    directory,
    rootDir,
    port,
    user,
    clientKey,
    close() {
      child.kill('SIGTERM');
      fs.closeSync(log);
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}


module.exports = { createSshdFixture, freePort };
