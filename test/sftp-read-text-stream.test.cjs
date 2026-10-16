'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SFTP } = require('ssh2/lib/protocol/SFTP.js');
const { SftpService } = require('../src/main/services/sftp-service.cjs');

// Exercise ssh2's actual ReadStream as well as the independent fake-stream
// acceptance tests: its inclusive end offset and handle cleanup matter here.
function fixture(t, payload, {
  readError, statError, lstatError, size = 0, mode = 0o100644,
  statSize = size, statMode = 0o100644
} = {}) {
  const streams = [];
  const calls = { metadata: [], stat: [], lstat: [], stream: [], open: [] };
  let delivered = 0;
  let closes = 0;
  const sftp = {
    // stat follows symlinks to their regular target; lstat describes the path.
    stat(remote, callback) {
      calls.metadata.push('stat');
      calls.stat.push(remote);
      callback(statError || null, { size: statSize, mode: statMode });
    },
    lstat(remote, callback) {
      calls.metadata.push('lstat');
      calls.lstat.push(remote);
      callback(lstatError || null, { size, mode });
    },
    open(remote, _flags, _mode, callback) {
      calls.open.push(remote);
      setImmediate(() => callback(null, Buffer.from('handle')));
    },
    read(_handle, buffer, offset, length, position, callback) {
      setImmediate(() => {
        if (readError) return callback(readError);
        const count = Math.min(length, payload.length - position);
        payload.copy(buffer, offset, position, position + count);
        delivered += count;
        callback(null, count);
      });
    },
    close(_handle, callback) { closes++; setImmediate(() => callback(null)); },
    createReadStream(...args) {
      calls.stream.push(args[0]);
      const stream = SFTP.prototype.createReadStream.apply(this, args);
      streams.push(stream);
      return stream;
    }
  };
  const service = new SftpService({}, {}, {}, () => null);
  service.connect = async () => ({ sftp });
  t.after(() => { for (const stream of streams) stream.destroy(); });
  return {
    read: (limit) => service.readText({}, '/text', limit),
    async check(expectedBytes) {
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(calls.lstat, ['/text']);
      assert.deepEqual(calls.stat, ['/text']);
      assert.deepEqual(calls.metadata, ['stat', 'lstat']);
      assert.equal(delivered, expectedBytes);
      assert.equal(closes, 1, 'remote handle closes exactly once');
      assert.equal(streams[0].destroyed, true);
    },
    notDownloaded(metadata = ['stat', 'lstat']) {
      assert.deepEqual(calls.metadata, metadata);
      assert.deepEqual(calls.stat, ['/text']);
      assert.deepEqual(calls.lstat, metadata.includes('lstat') ? ['/text'] : []);
      assert.deepEqual(calls.stream, []);
      assert.deepEqual(calls.open, []);
      assert.equal(delivered, 0);
      assert.equal(closes, 0);
    }
  };
}

for (const payload of [Buffer.alloc(0), Buffer.from('éab')]) {
  test(`ssh2 stream accepts ${payload.length} bytes at the exact limit and closes`, async (t) => {
    const f = fixture(t, payload);
    assert.equal(await f.read(payload.length), payload.toString('utf8'));
    await f.check(payload.length);
  });
}

test('ssh2 stream requests at most limit plus one bytes from a lying remote', async (t) => {
  const f = fixture(t, Buffer.from('123456789'));
  await assert.rejects(f.read(4), /too large/u);
  await f.check(5);
});

test('ssh2 stream closes its handle on read failure', async (t) => {
  const f = fixture(t, Buffer.from('abc'), { readError: new Error('remote read failed') });
  await assert.rejects(f.read(4), /remote read failed/u);
  await f.check(0);
});

test('symlink to a small regular file rejects before downloading its target', async (t) => {
  const payload = Buffer.from('abc');
  const f = fixture(t, payload, { size: payload.length, mode: 0o120777 });
  await assert.rejects(f.read(4), /regular/iu);
  f.notDownloaded();
});

test('lstat failure rejects without downloading', async (t) => {
  const error = new Error('remote lstat failed');
  const f = fixture(t, Buffer.from('abc'), { lstatError: error });
  await assert.rejects(f.read(4), (actual) => actual === error);
  f.notDownloaded();
});

test('invalid byte limits reject before connecting or allocating', async () => {
  const service = new SftpService({}, {}, {}, () => null);
  service.connect = () => assert.fail('invalid limits must not connect');
  for (const limit of [-1, 0.5, NaN, Infinity, '4', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(service.readText({}, '/text', limit), /byte limit/u);
  }
});

// Stat preflight must remain effective even if lstat would report a small
// regular file (e.g. the path changes between metadata requests).
for (const [name, limit, suppliedLimit] of [
  ['default editor', 1_000_000, undefined], ['explicit sync', 5_000_000, 5_000_000]
]) {
  test(`${name} oversized stat rejects before lstat or streaming`, async (t) => {
    const f = fixture(t, Buffer.from('abc'), { statSize: limit + 1, size: 3 });
    await assert.rejects(f.read(suppliedLimit), /too large/u);
    f.notDownloaded(['stat']);
  });
}

test('nonregular stat rejects before lstat or streaming', async (t) => {
  const f = fixture(t, Buffer.from('abc'), { statMode: 0o040755 });
  await assert.rejects(f.read(4), /regular/iu);
  f.notDownloaded(['stat']);
});

test('stat failure rejects before lstat or streaming', async (t) => {
  const error = new Error('remote stat failed');
  const f = fixture(t, Buffer.from('abc'), { statError: error });
  await assert.rejects(f.read(4), (actual) => actual === error);
  f.notDownloaded(['stat']);
});

test('oversized lstat still rejects before streaming after a small stat', async (t) => {
  const f = fixture(t, Buffer.from('abc'), { statSize: 1, size: 5 });
  await assert.rejects(f.read(4), /too large/u);
  f.notDownloaded();
});
