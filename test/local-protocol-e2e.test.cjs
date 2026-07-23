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
  return spawnSync('bash', ['-lc', `command -v ${command}`], { encoding: 'utf8' }).status === 0;
}

function commandPath(command) {
  return spawnSync('bash', ['-lc', `command -v ${command}`], { encoding: 'utf8' }).stdout.trim() || command;
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

test('local sshd fixture supports Aux Command SSH terminal and SFTP flows', { skip: hasSshFixtureTools ? false : 'OpenSSH server/client tools are not installed' }, async () => {
  const fixture = await createSshdFixture();
  const originalHome = process.env.HOME;
  process.env.HOME = path.join(fixture.directory, 'home');
  try {
    const profile = {
      id: 'fixture-ssh',
      name: 'Local SSH fixture',
      protocol: 'ssh',
      group: 'Test',
      host: '127.0.0.1',
      port: fixture.port,
      username: fixture.user,
      identityFile: fixture.clientKey,
      knownHostsFile: path.join(fixture.directory, 'known_hosts'),
      useSshConfig: false,
      keepAliveSeconds: 0,
      startupCommand: 'printf AUX_SSH_TERMINAL_OK; exit'
    };

    const terminalEvents = [];
    const terminalService = new TerminalService(() => ({
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => terminalEvents.push({ channel, payload }) }
    }));
    const session = terminalService.create({ profile, cols: 100, rows: 32, cwd: fixture.rootDir });
    const terminalOutput = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => {
        terminalService.close(session.id);
        reject(new Error(`SSH terminal fixture timed out. Output: ${JSON.stringify(output)}`));
      }, 8_000);
      const interval = setInterval(() => {
        for (const event of terminalEvents.splice(0)) {
          if (event.channel === 'terminal:data' && event.payload.id === session.id) {
            output += event.payload.data;
            if (/Are you sure you want to continue connecting/u.test(output)) terminalService.write(session.id, 'yes\n');
          }
          if (event.channel === 'terminal:exit' && event.payload.id === session.id) {
            clearTimeout(timeout);
            clearInterval(interval);
            resolve(output);
          }
        }
      }, 25);
    });
    assert.match(terminalOutput, /AUX_SSH_TERMINAL_OK/u);

    const knownHostService = { verify: async () => true };
    const vaultService = { has: () => false, get: async () => '' };
    const promptBroker = { request: async () => ({ accept: true, remember: false }) };
    const sftpEvents = [];
    const sftpService = new SftpService(vaultService, knownHostService, promptBroker, () => ({
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => sftpEvents.push({ channel, payload }) }
    }));

    try {
      fs.writeFileSync(path.join(fixture.rootDir, 'upload.txt'), 'AUX_SFTP_UPLOAD\n');
      await assert.doesNotReject(() => sftpService.mkdir(profile, path.join(fixture.rootDir, 'remote-dir')), 'mkdir remote-dir');
      await assert.doesNotReject(() => sftpService.upload(profile, path.join(fixture.rootDir, 'upload.txt'), path.join(fixture.rootDir, 'remote-dir', 'upload.txt')), 'upload fixture file');
      const entries = await sftpService.list(profile, path.join(fixture.rootDir, 'remote-dir'));
      assert.equal(entries.some((entry) => entry.name === 'upload.txt' && !entry.directory), true);
      const remoteEditPath = path.join(fixture.rootDir, 'remote-dir', 'editable.txt');
      await assert.doesNotReject(() => sftpService.writeText(profile, remoteEditPath, 'AUX_SFTP_EDIT_BEFORE\n'), 'write editable.txt before content');
      assert.equal(await sftpService.readText(profile, remoteEditPath), 'AUX_SFTP_EDIT_BEFORE\n');
      await assert.doesNotReject(() => sftpService.writeText(profile, remoteEditPath, 'AUX_SFTP_EDIT_AFTER\n'), 'write editable.txt after content');
      assert.equal(await sftpService.readText(profile, remoteEditPath), 'AUX_SFTP_EDIT_AFTER\n');
      const downloadPath = path.join(fixture.rootDir, 'download.txt');
      await sftpService.download(profile, path.join(fixture.rootDir, 'remote-dir', 'upload.txt'), downloadPath);
      assert.equal(fs.readFileSync(downloadPath, 'utf8'), 'AUX_SFTP_UPLOAD\n');
      assert.equal(fs.statSync(downloadPath).mode & 0o777, 0o600);
      assert.equal(sftpEvents.some((event) => event.channel === 'sftp:progress' && event.payload.profileId === profile.id), true);
      await sftpService.remove(profile, remoteEditPath, false);
      await sftpService.remove(profile, path.join(fixture.rootDir, 'remote-dir', 'upload.txt'), false);
      await sftpService.remove(profile, path.join(fixture.rootDir, 'remote-dir'), true);
    } finally {
      sftpService.disconnect(profile.id);
    }
  } finally {
    process.env.HOME = originalHome;
    fixture.close();
  }
});

test('terminal service retains bounded session transcripts for export', async () => {
  const terminalEvents = [];
  const terminalService = new TerminalService(() => ({
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => terminalEvents.push({ channel, payload }) }
  }));

  const session = terminalService.create({
    profile: {
      id: 'local-transcript',
      name: 'Local transcript',
      protocol: 'local',
      startupCommand: "printf 'AUX_TRANSCRIPT_LINE\\n'; exit"
    },
    cols: 80,
    rows: 24
  });

  let output = '';
  for (let attempt = 0; attempt < 80; attempt += 1) {
    for (const event of terminalEvents.splice(0)) {
      if (event.channel === 'terminal:data' && event.payload.id === session.id) output += event.payload.data;
    }
    if (output.includes('AUX_TRANSCRIPT_LINE')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const exportResult = terminalService.exportTranscript(session.id);
  assert.equal(exportResult.id, session.id);
  assert.match(exportResult.text, /AUX_TRANSCRIPT_LINE/u);
  assert.equal(exportResult.truncated, false);
  assert.equal(terminalService.close(session.id), true);
});

test('local socat fixture supports bundled serial bridge terminal flows', { skip: hasSerialFixtureTools ? false : 'socat is not installed' }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-serial-'));
  const left = path.join(directory, 'tty-left');
  const right = path.join(directory, 'tty-right');
  const socat = spawn(commandPath('socat'), [
    '-d', '-d',
    `pty,link=${left},raw,echo=0`,
    `pty,link=${right},raw,echo=0`
  ], { stdio: ['ignore', 'ignore', 'pipe'], shell: false });
  try {
    for (let attempt = 0; attempt < 50 && (!fs.existsSync(left) || !fs.existsSync(right)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(fs.existsSync(left), true);
    assert.equal(fs.existsSync(right), true);

    const terminalEvents = [];
    const terminalService = new TerminalService(() => ({
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => terminalEvents.push({ channel, payload }) }
    }));
    const session = terminalService.create({
      profile: {
        id: 'fixture-serial',
        name: 'Local serial fixture',
        protocol: 'serial',
        group: 'Test',
        device: left,
        baudRate: 115200
      },
      cols: 80,
      rows: 24,
      cwd: directory
    });

    const peer = fs.createReadStream(right, { encoding: 'utf8' });
    const peerWriter = fs.createWriteStream(right, { encoding: 'utf8' });
    let peerInput = '';
    peer.on('data', (chunk) => { peerInput += chunk; });
    peer.on('error', (error) => {
      if (error.code !== 'EIO') throw error;
    });
    peerWriter.on('error', (error) => {
      if (error.code !== 'EIO') throw error;
    });
    peerWriter.write('AUX_SERIAL_FROM_DEVICE\n');
    terminalService.write(session.id, 'AUX_SERIAL_FROM_TERMINAL\n');

    let output = '';
    for (let attempt = 0; attempt < 50; attempt += 1) {
      for (const event of terminalEvents.splice(0)) {
        if (event.channel === 'terminal:data' && event.payload.id === session.id) output += event.payload.data;
      }
      if (output.includes('AUX_SERIAL_FROM_DEVICE') && peerInput.includes('AUX_SERIAL_FROM_TERMINAL')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    terminalService.close(session.id);
    peer.destroy();
    peerWriter.destroy();
    assert.match(output, /AUX_SERIAL_FROM_DEVICE/u);
    assert.match(peerInput, /AUX_SERIAL_FROM_TERMINAL/u);
  } finally {
    socat.kill('SIGTERM');
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('loopback TCP fixture supports bundled telnet bridge terminal flows', async () => {
  const server = net.createServer((socket) => {
    socket.write('AUX_TELNET_READY\n');
    socket.on('data', (chunk) => {
      socket.write(`AUX_TELNET_ECHO:${chunk.toString('utf8')}`);
    });
  });
  const port = await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.on('error', reject);
  });
  try {
    const terminalEvents = [];
    const terminalService = new TerminalService(() => ({
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => terminalEvents.push({ channel, payload }) }
    }));
    const session = terminalService.create({
      profile: {
        id: 'fixture-telnet',
        name: 'Local telnet fixture',
        protocol: 'telnet',
        group: 'Test',
        host: '127.0.0.1',
        port
      },
      cols: 80,
      rows: 24,
      cwd: os.tmpdir()
    });
    terminalService.write(session.id, 'AUX_TELNET_FROM_TERMINAL\n');

    let output = '';
    for (let attempt = 0; attempt < 50; attempt += 1) {
      for (const event of terminalEvents.splice(0)) {
        if (event.channel === 'terminal:data' && event.payload.id === session.id) output += event.payload.data;
      }
      if (output.includes('AUX_TELNET_READY') && output.includes('AUX_TELNET_ECHO:AUX_TELNET_FROM_TERMINAL')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    terminalService.close(session.id);
    assert.match(output, /AUX_TELNET_READY/u);
    assert.match(output, /AUX_TELNET_ECHO:AUX_TELNET_FROM_TERMINAL/u);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
