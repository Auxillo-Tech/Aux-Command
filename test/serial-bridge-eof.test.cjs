'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const helper = path.resolve(__dirname, '..', 'src', 'main', 'helpers', 'serial_bridge.py');
const hasPython = spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0;
const hasSocat = spawnSync('socat', ['-V'], { stdio: 'ignore' }).status === 0;
const ptyReason = process.platform !== 'linux' ? 'serial bridge pty tests need Linux'
  : !hasPython ? 'python3 not installed'
    : false;
const socatReason = ptyReason || (!hasSocat ? 'socat not installed' : false);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The bridge only accepts /dev/ or /tmp/ device paths, so the pty links live in /tmp.
async function startPtyPair() {
  const dir = fs.mkdtempSync('/tmp/aux-serial-bridge-');
  const device = path.join(dir, 'adapter');
  const peer = path.join(dir, 'peer');
  const socat = spawn('socat', [
    `pty,raw,echo=0,link=${device}`,
    `pty,raw,echo=0,link=${peer}`
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100 && !(fs.existsSync(device) && fs.existsSync(peer)); i += 1) {
    await sleep(50);
  }
  assert.ok(fs.existsSync(device) && fs.existsSync(peer), 'socat did not create the pty pair');
  return {
    device,
    peer,
    // Removing the adapter end is what unplugging a USB serial adapter looks like to the bridge.
    removeAdapter() {
      socat.kill('SIGKILL');
    },
    cleanup() {
      socat.kill('SIGKILL');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function runBridge(args, extraEnv) {
  const child = spawn('python3', args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...extraEnv } });
  const state = { child, stdout: '', stderr: '', exit: null };
  child.stdout.on('data', (chunk) => { state.stdout += chunk.toString('latin1'); });
  child.stderr.on('data', (chunk) => { state.stderr += chunk.toString('latin1'); });
  state.exited = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      state.exit = { code, signal };
      resolve(state.exit);
    });
  });
  return state;
}

function startBridge(device) {
  return runBridge([helper, '--baud', '115200', device]);
}

async function stopBridge(bridge) {
  bridge.child.kill('SIGKILL');
  await bridge.exited;
}

function cpuSeconds(pid) {
  // utime + stime, fields 14 and 15 of /proc/<pid>/stat, in clock ticks (100 Hz on Linux).
  const fields = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
  return (Number(fields[11]) + Number(fields[12])) / 100;
}

async function waitFor(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }
  assert.fail(message());
}

test('serial bridge passes data both ways while the adapter is present', { skip: socatReason }, async () => {
  const pair = await startPtyPair();
  const bridge = startBridge(pair.device);
  const peerFd = fs.openSync(pair.peer, fs.constants.O_RDWR | fs.constants.O_NOCTTY | fs.constants.O_NONBLOCK);
  try {
    await sleep(300);
    fs.writeSync(peerFd, 'from-device\n');
    await waitFor(() => bridge.stdout.includes('from-device'), 3000,
      () => `device output never reached the terminal: ${JSON.stringify(bridge.stdout)}`);

    bridge.child.stdin.write('from-terminal\n');
    const buffer = Buffer.alloc(256);
    let received = '';
    await waitFor(() => {
      try {
        const count = fs.readSync(peerFd, buffer);
        received += buffer.subarray(0, count).toString();
      } catch { /* nothing to read yet */ }
      return received.includes('from-terminal');
    }, 3000, () => `terminal input never reached the device: ${JSON.stringify(received)}`);
    assert.equal(bridge.exit, null, 'bridge must keep running while the adapter is present');
  } finally {
    fs.closeSync(peerFd);
    await stopBridge(bridge);
    pair.cleanup();
  }
});

test('serial bridge exits 0 and stops burning CPU when the adapter end disappears', { skip: socatReason }, async () => {
  const pair = await startPtyPair();
  const bridge = startBridge(pair.device);
  try {
    await sleep(400);
    assert.equal(bridge.exit, null, 'bridge died before the adapter was removed');
    const cpuBefore = cpuSeconds(bridge.child.pid);
    const started = Date.now();
    pair.removeAdapter();

    const result = await Promise.race([bridge.exited, sleep(3000).then(() => null)]);
    const elapsed = Date.now() - started;
    if (result === null) {
      const spent = cpuSeconds(bridge.child.pid) - cpuBefore;
      await stopBridge(bridge);
      assert.fail(`bridge still running ${elapsed} ms after the adapter vanished, burned ${spent.toFixed(2)} CPU s`);
    }
    assert.equal(result.code, 0, `exit ${JSON.stringify(result)} stderr ${JSON.stringify(bridge.stderr)}`);
    assert.ok(elapsed < 3000, `exit took ${elapsed} ms`);
    // The bridge was idle before the removal, so the CPU it ever used stays tiny when it exits at once.
    assert.ok(cpuBefore < 0.5, `bridge used ${cpuBefore.toFixed(2)} CPU s before removal`);
  } finally {
    await stopBridge(bridge);
    pair.cleanup();
  }
});

test('serial bridge uses under 0.5 CPU seconds in the 3 s after the adapter disappears', { skip: socatReason }, async () => {
  const pair = await startPtyPair();
  const bridge = startBridge(pair.device);
  try {
    await sleep(400);
    const cpuBefore = cpuSeconds(bridge.child.pid);
    pair.removeAdapter();
    await sleep(3000);
    // A bridge that exited has no /proc entry; a spinning one burns about 3 CPU s here.
    const spent = bridge.exit === null ? cpuSeconds(bridge.child.pid) - cpuBefore : 0;
    assert.ok(spent < 0.5, `bridge burned ${spent.toFixed(2)} CPU s in 3 s after the adapter vanished`);
  } finally {
    await stopBridge(bridge);
    pair.cleanup();
  }
});

test('serial bridge exits 0 when the device read fails with EIO', { skip: ptyReason }, async () => {
  // Run main() against a throwaway pty slave and force the serial read to raise EIO.
  const script = `
import errno, os, pty, sys
sys.path.insert(0, ${JSON.stringify(path.dirname(helper))})
import serial_bridge
master, slave = pty.openpty()
real_open, real_read = os.open, os.read
serial = {}
def fake_open(path, flags, *a, **k):
    fd = real_open(path, flags, *a, **k)
    serial['fd'] = fd
    return fd
def fake_read(fd, n):
    if fd == serial.get('fd'):
        raise OSError(errno.EIO, 'Input/output error')
    return real_read(fd, n)
os.open, os.read = fake_open, fake_read
os.write(master, b'x')
sys.exit(serial_bridge.main(['--baud', '9600', os.ttyname(slave)]))
`;
  const bridge = runBridge(['-c', script]);
  const result = await Promise.race([bridge.exited, sleep(3000).then(() => null)]);
  if (result === null) {
    await stopBridge(bridge);
    assert.fail('bridge did not exit after a read EIO');
  }
  assert.equal(result.code, 0, `exit ${JSON.stringify(result)} stderr ${JSON.stringify(bridge.stderr)}`);
});
