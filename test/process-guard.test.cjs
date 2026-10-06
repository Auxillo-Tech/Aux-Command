'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const helper = path.join(__dirname, '../src/main/helpers/process_guard.py');
const tunnelSource = fs.readFileSync(path.join(__dirname, '../src/main/services/tunnel-service.cjs'), 'utf8');
const ptySource = fs.readFileSync(path.join(__dirname, '../src/main/lib/python-pty.cjs'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

test('tunnel and PTY launch paths use the parent-death guard', () => {
  assert.match(tunnelSource, /process_guard\.py/u);
  assert.match(tunnelSource, /--parent-pid/u);
  assert.match(ptySource, /process_guard\.py/u);
  assert.match(ptySource, /--parent-pid/u);
  assert.ok(packageJson.build.asarUnpack.includes('src/main/helpers/process_guard.py'));
});

function waitForLine(stream, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for child PID: ${buffer}`)), timeoutMs);
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const line = buffer.split('\n')[0].trim();
      if (/^\d+$/u.test(line)) {
        clearTimeout(timeout);
        resolve(Number(line));
      }
    });
  });
}

async function waitForExit(pid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const state = stat.split(') ')[1]?.split(' ')[0];
      if (state === 'Z') return;
      process.kill(pid, 0);
    }
    catch (error) {
      if (error.code === 'ESRCH' || error.code === 'ENOENT') return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Guarded child ${pid} survived its parent`);
}

test('guarded process exits when its direct parent is killed', async () => {
  assert.equal(fs.existsSync(helper), true, 'process guard helper must be bundled');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-guard-direct-'));
  const pidFile = path.join(directory, 'child.pid');
  const guardedProgram = [
    'import os,pathlib,signal,time',
    `pathlib.Path(${JSON.stringify(pidFile)}).write_text(str(os.getpid()))`,
    'signal.signal(signal.SIGTERM, signal.SIG_IGN)',
    'time.sleep(30)'
  ].join(';');
  const parentScript = `
    const { spawn } = require('node:child_process');
    spawn('python3', [${JSON.stringify(helper)}, '--parent-pid', String(process.pid), '--', '/usr/bin/python3', '-c', ${JSON.stringify(guardedProgram)}], {
      stdio: ['ignore', 'ignore', 'inherit']
    });
    setInterval(() => {}, 1000);
  `;
  const parent = spawn(process.execPath, ['-e', parentScript], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 4_000;
      const poll = () => {
        if (fs.existsSync(pidFile)) return resolve();
        if (Date.now() >= deadline) return reject(new Error('guarded child PID was not written'));
        setTimeout(poll, 25);
      };
      poll();
    });
    const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.ok(childPid > 1);
    parent.kill('SIGKILL');
    await waitForExit(childPid);
  } finally {
    try { parent.kill('SIGKILL'); } catch { /* already exited */ }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('guarded process terminates stubborn descendants when its owner is killed', { timeout: 10_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-guard-tree-'));
  const pidFile = path.join(directory, 'descendant.pid');
  const guardedProgram = [
    'import pathlib,signal,subprocess,time',
    `p=subprocess.Popen(['/usr/bin/python3','-c','import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); signal.signal(signal.SIGHUP, signal.SIG_IGN); time.sleep(30)'])`,
    `pathlib.Path(${JSON.stringify(pidFile)}).write_text(str(p.pid))`,
    'signal.signal(signal.SIGTERM, signal.SIG_IGN)',
    'signal.signal(signal.SIGHUP, signal.SIG_IGN)',
    'time.sleep(30)'
  ].join(';');
  const parentScript = `
    const { spawn } = require('node:child_process');
    const child = spawn('python3', [${JSON.stringify(helper)}, '--parent-pid', String(process.pid), '--ready-fd', '3', '--', '/usr/bin/python3', '-c', ${JSON.stringify(guardedProgram)}], {
      stdio: ['ignore', 'ignore', 'inherit', 'pipe']
    });
    child.stdio[3].once('data', () => process.stdout.write('READY\\n'));
    setInterval(() => {}, 1000);
  `;
  const parent = spawn(process.execPath, ['-e', parentScript], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 4_000;
      const poll = () => {
        if (fs.existsSync(pidFile)) return resolve();
        if (Date.now() >= deadline) return reject(new Error('descendant PID was not written'));
        setTimeout(poll, 25);
      };
      poll();
    });
    const descendantPid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.ok(descendantPid > 1);
    parent.kill('SIGKILL');
    await waitForExit(descendantPid, 6_000);
  } finally {
    try { parent.kill('SIGKILL'); } catch { /* already exited */ }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


async function waitForMissing(pid, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (fs.existsSync(`/proc/${pid}`)) {
    if (Date.now() >= deadline) throw new Error(`Process ${pid} was not reaped`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

test('guard reaps adopted children while the main child remains alive and preserves its exit code', { timeout: 10_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-guard-reap-'));
  const release = path.join(directory, 'release');
  const program = `
import os, pathlib, time
pid = os.fork()
if pid == 0:
    adopted = os.fork()
    if adopted == 0:
        time.sleep(0.1)
        os._exit(9)
    print(adopted, flush=True)
    os._exit(0)
os.waitpid(pid, 0)
while not pathlib.Path(${JSON.stringify(release)}).exists():
    time.sleep(0.02)
os._exit(37)
`;
  const guard = spawn('python3', [helper, '--parent-pid', String(process.pid), '--', '/usr/bin/python3', '-c', program], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => guard.once('exit', (code) => resolve(code)));
  try {
    const adopted = await waitForLine(guard.stdout);
    await waitForMissing(adopted);
    assert.equal(guard.exitCode, null, 'collecting an adopted child must not end the session');
    fs.writeFileSync(release, 'go');
    assert.equal(await exited, 37);
  } finally {
    guard.kill('SIGTERM');
    await exited;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('guard terminates and reaps adopted descendants on main child exit', { timeout: 10_000 }, async () => {
  const program = `
import os, signal, time
read_fd, write_fd = os.pipe()
pid = os.fork()
if pid == 0:
    adopted = os.fork()
    if adopted == 0:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        os.write(write_fd, b'R')
        time.sleep(30)
        os._exit(0)
    print(adopted, flush=True)
    os._exit(0)
os.read(read_fd, 1)
os.waitpid(pid, 0)
os._exit(23)
`;
  const guard = spawn('python3', [helper, '--parent-pid', String(process.pid), '--', '/usr/bin/python3', '-c', program], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => guard.once('exit', (code) => resolve(code)));
  let adopted;
  try {
    adopted = await waitForLine(guard.stdout);
    assert.equal(await exited, 23);
    await waitForMissing(adopted);
  } finally {
    guard.kill('SIGTERM');
    if (adopted && fs.existsSync(`/proc/${adopted}`)) {
      try { process.kill(adopted, 'SIGKILL'); } catch { /* exited */ }
    }
    await exited;
  }
});
