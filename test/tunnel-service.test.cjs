'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TunnelService } = require('../src/main/services/tunnel-service.cjs');
const { findExecutable } = require('../src/main/lib/executable-finder.cjs');
const tunnelSource = fs.readFileSync(path.join(__dirname, '../src/main/services/tunnel-service.cjs'), 'utf8');

test('tunnel readiness is evidence-based and never elapsed-time based', () => {
  assert.doesNotMatch(tunnelSource, /TUNNEL_STARTUP_GRACE_MS|runningTimer/u);
  assert.match(tunnelSource, /remote forward success/u);
});

function tunnelInput() {
  return {
    id: 'test-tunnel',
    name: 'Test tunnel',
    type: 'local',
    profileId: 'profile-1',
    bindHost: '127.0.0.1',
    bindPort: 18080,
    targetHost: '127.0.0.1',
    targetPort: 80
  };
}

function profileStore() {
  return {
    get: () => ({
      id: 'profile-1',
      name: 'Gateway',
      protocol: 'ssh',
      host: 'gateway.example',
      port: 22,
      useSshConfig: true
    })
  };
}

function eventHarness() {
  const events = [];
  const waiters = [];
  const window = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        if (channel !== 'tunnel:status') return;
        events.push(payload);
        for (const waiter of [...waiters]) {
          if (waiter.status === payload.status) {
            clearTimeout(waiter.timer);
            waiters.splice(waiters.indexOf(waiter), 1);
            waiter.resolve(payload);
          }
        }
      }
    }
  };
  const waitFor = (status, timeout = 3000) => {
    const existing = events.findLast((event) => event.status === status);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { status, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for tunnel status: ${status}`));
      }, timeout);
      waiters.push(waiter);
    });
  };
  return { events, waitFor, window };
}

test('recovers from a spawn failure and cleanly reuses the tunnel ID', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-tunnel-'));
  const originalPath = process.env.PATH;
  try {
    const python = findExecutable(['python3'], originalPath);
    fs.symlinkSync(python, path.join(directory, 'python3'));
    const harness = eventHarness();
    const service = new TunnelService(profileStore(), () => harness.window);
    process.env.PATH = directory;

    assert.throws(() => service.start(tunnelInput()), /ssh is required for tunnels/u);
    assert.deepEqual(service.list(), []);
    assert.equal(harness.events.filter((event) => event.status === 'failed').length, 0);

    const fakeSsh = path.join(directory, 'ssh');
    fs.writeFileSync(fakeSsh, "#!/bin/sh\nprintf '%s\\n' 'Local forwarding listening' >&2\ntrap 'exit 0' TERM\nwhile :; do sleep 1; done\n", { mode: 0o755 });
    fs.chmodSync(fakeSsh, 0o755);

    const started = service.start(tunnelInput());
    assert.equal(started.status, 'starting');
    await harness.waitFor('running');
    assert.equal(service.list()[0].status, 'running');
    assert.equal(service.stop('test-tunnel'), true);
    await harness.waitFor('stopped');
    assert.deepEqual(service.list(), []);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('does not mark a delayed SSH tunnel failure as running before exit', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-tunnel-'));
  const originalPath = process.env.PATH;
  try {
    const python = findExecutable(['python3'], originalPath);
    fs.symlinkSync(python, path.join(directory, 'python3'));
    const harness = eventHarness();
    const service = new TunnelService(profileStore(), () => harness.window);
    process.env.PATH = directory;
    const fakeSsh = path.join(directory, 'ssh');
    fs.writeFileSync(fakeSsh, "#!/bin/sh\nsleep 1\nprintf '%s\\n' 'Permission denied' >&2\nexit 255\n", { mode: 0o755 });
    fs.chmodSync(fakeSsh, 0o755);

    service.start(tunnelInput());
    const failed = await harness.waitFor('failed', 3000);
    assert.equal(failed.status, 'failed');
    assert.match(failed.lastError, /Permission denied/u);
    assert.equal(harness.events.some((event) => event.status === 'running'), false);
    assert.deepEqual(service.list(), []);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a forward that fails after ssh reports listening is never shown as ready', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-tunnel-'));
  const originalPath = process.env.PATH;
  try {
    const python = findExecutable(['python3'], originalPath);
    fs.symlinkSync(python, path.join(directory, 'python3'));
    const harness = eventHarness();
    const service = new TunnelService(profileStore(), () => harness.window);
    process.env.PATH = directory;
    const fakeSsh = path.join(directory, 'ssh');
    fs.writeFileSync(fakeSsh, "#!/bin/sh\nprintf '%s\\n' 'debug1: Entering interactive session.' 'debug1: Local forwarding listening on ::1 port 80.' >&2\nsleep 0.3\nprintf '%s\\n' 'bind [127.0.0.1]:80: Permission denied' 'debug1: channel_setup_fwd_listener_tcpip: cannot listen to port: 80' 'Could not request local forwarding.' >&2\nexit 255\n", { mode: 0o755 });
    fs.chmodSync(fakeSsh, 0o755);
    service.start(tunnelInput());
    const failed = await harness.waitFor('failed', 4000);
    assert.equal(harness.events.some((event) => event.status === 'running'), false);
    assert.doesNotMatch(failed.lastError, /debug1:/u);
    assert.match(failed.lastError, /Permission denied/u);
    assert.match(failed.lastError, /Could not request local forwarding/u);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('ssh errors are summarized without the verbose debug log', () => {
  const { summarizeSshError } = require('../src/main/services/tunnel-service.cjs');
  assert.equal(summarizeSshError('debug1: a\ndebug2: b\nbind [127.0.0.1]:18999: Address already in use\ndebug1: c\nCould not request local forwarding.\n'), 'bind [127.0.0.1]:18999: Address already in use · Could not request local forwarding.');
});
