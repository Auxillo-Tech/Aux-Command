'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
  const parentScript = `
    const { spawn } = require('node:child_process');
    const child = spawn('python3', [${JSON.stringify(helper)}, '--parent-pid', String(process.pid), '--', '/usr/bin/python3', '-c', 'import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(30)'], {
      stdio: ['ignore', 'ignore', 'inherit', 'pipe']
    });
    child.stdio[3].setEncoding('utf8');
    child.stdio[3].once('data', (data) => {
      if (data.trim() === 'READY') process.stdout.write(String(child.pid) + '\\n');
    });
    setInterval(() => {}, 1000);
  `;
  const parent = spawn(process.execPath, ['-e', parentScript], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const childPid = await waitForLine(parent.stdout);
  parent.kill('SIGKILL');
  await waitForExit(childPid);
});
