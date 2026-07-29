'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TransferQueue } = require('../src/main/services/transfer-queue.cjs');

const profile = Object.freeze({
  id: 'profile-1', name: 'Test SSH', protocol: 'ssh', host: '127.0.0.1', port: 22
});

function eventWindow(events = []) {
  return {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => events.push({ channel, payload }) }
  };
}

async function waitFor(predicate, message, timeout = 1500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

test('transfer queue validates specs before enqueueing', () => {
  const queue = new TransferQueue(() => eventWindow(), { upload: async () => {}, download: async () => {} });
  assert.throws(() => queue.enqueue({}), /profile is required/u);
  assert.throws(() => queue.enqueue({ profile, direction: 'sideways', localPath: '/tmp/a', remotePath: '/a' }), /direction/u);
  assert.throws(() => queue.enqueue({ profile, direction: 'upload', localPath: 'relative', remotePath: '/a' }), /absolute/u);
  assert.throws(() => queue.enqueue({ profile, direction: 'download', localPath: '/tmp/a', remotePath: '' }), /remote path/u);
});

test('transfer queue passes the full profile and processes one entry at a time', async () => {
  const calls = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const service = {
    upload: async (receivedProfile, localPath, remotePath, options) => {
      calls.push({ receivedProfile, localPath, remotePath, offset: options.offset });
      if (calls.length === 1) await firstGate;
      options.onProgress(4, 4);
    },
    download: async () => assert.fail('download should not be called')
  };
  const queue = new TransferQueue(() => eventWindow(), service);
  const first = queue.enqueue({ profile, direction: 'upload', localPath: '/tmp/first', remotePath: '/first' });
  const second = queue.enqueue({ profile, direction: 'upload', localPath: '/tmp/second', remotePath: '/second' });

  assert.equal('profile' in first, false, 'IPC snapshots must not expose profile internals');
  assert.equal('abortController' in first, false, 'IPC snapshots must be structured-clone safe');
  await waitFor(() => calls.length === 1, 'first transfer did not start');
  assert.equal(queue.list().find((entry) => entry.id === second.id).status, 'queued');
  assert.equal(calls[0].receivedProfile.id, profile.id);
  releaseFirst();
  await waitFor(() => queue.list().every((entry) => entry.status === 'completed'), 'queued transfers did not complete');
  assert.equal(calls.length, 2);
});

test('pause and resume continue from the last reported offset', async () => {
  const offsets = [];
  let invocation = 0;
  const service = {
    upload: async (_profile, _local, _remote, options) => {
      invocation += 1;
      offsets.push(options.offset);
      if (invocation === 1) {
        options.onProgress(4, 8);
        await new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      } else {
        options.onProgress(8, 8);
      }
    },
    download: async () => assert.fail('download should not be called')
  };
  const queue = new TransferQueue(() => eventWindow(), service);
  const entry = queue.enqueue({ profile, direction: 'upload', localPath: '/tmp/resume', remotePath: '/resume' });
  await waitFor(() => queue.list().find((item) => item.id === entry.id)?.transferred === 4, 'progress was not recorded');
  assert.equal(queue.pause(entry.id), true);
  await waitFor(() => queue.list().find((item) => item.id === entry.id)?.status === 'paused', 'transfer did not pause');
  assert.equal(queue.resume(entry.id), true);
  await waitFor(() => queue.list().find((item) => item.id === entry.id)?.status === 'completed', 'transfer did not resume');
  assert.deepEqual(offsets, [0, 4]);
});

test('failed transfers remain retryable and clearCompleted only removes completed entries', async () => {
  let shouldFail = true;
  const service = {
    upload: async (_profile, _local, _remote, options) => {
      if (shouldFail) throw new Error('fixture failure');
      options.onProgress(1, 1);
    },
    download: async () => {}
  };
  const queue = new TransferQueue(() => eventWindow(), service);
  const entry = queue.enqueue({ profile, direction: 'upload', localPath: '/tmp/retry', remotePath: '/retry' });
  await waitFor(() => queue.list().find((item) => item.id === entry.id)?.status === 'failed', 'failure was not recorded');
  queue.clearCompleted();
  assert.equal(queue.list().length, 1);
  shouldFail = false;
  assert.equal(queue.retry(entry.id), true);
  await waitFor(() => queue.list().find((item) => item.id === entry.id)?.status === 'completed', 'retry did not complete');
  queue.clearCompleted();
  assert.equal(queue.list().length, 0);
});

test('cancel aborts an active transfer, removes it, and emits a cancelled snapshot', async () => {
  const events = [];
  const service = {
    upload: async (_profile, _local, _remote, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }),
    download: async () => {}
  };
  const queue = new TransferQueue(() => eventWindow(events), service);
  const entry = queue.enqueue({ profile, direction: 'upload', localPath: '/tmp/cancel', remotePath: '/cancel' });
  await waitFor(() => queue.list().find((item) => item.id === entry.id)?.status === 'transferring', 'transfer did not start');
  assert.equal(queue.cancel(entry.id), true);
  assert.equal(queue.list().some((item) => item.id === entry.id), false);
  assert.ok(events.some(({ channel, payload }) => channel === 'transfer:update' && payload.id === entry.id && payload.status === 'cancelled'));
});
