'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createRequire } = require('node:module');
const { compileFunction } = require('node:vm');

const servicePath = path.resolve(__dirname, '../src/main/services/sftp-service.cjs');
const source = fs.readFileSync(servicePath, 'utf8');
const realRequire = createRequire(servicePath);
const turn = () => new Promise((resolve) => setImmediate(resolve));
const tooLarge = /too large|exceed|larger than|size limit/iu;
const profile = { id: 'read-text', protocol: 'ssh', host: 'example.test', username: 'tester' };

// Deliver one chunk per event-loop turn, so a consumer cannot accidentally
// drain the whole remote file before its overflow handler runs. autoDestroy is
// deliberately off: on an SFTP error the reader must close its own resource.
class RemoteStream extends Readable {
  constructor(chunks, options = {}) {
    super({ highWaterMark: 1, autoDestroy: false });
    this.chunks = chunks;
    this.index = 0;
    this.bytesProduced = 0;
    this.peakQueuedBytes = 0;
    this.pending = false;
    this.remaining = options.end == null ? Infinity : options.end + 1;
    assert.equal(options.start || 0, 0, 'text reads must start at byte zero');
  }

  _read() {
    if (this.pending) return;
    this.pending = true;
    this.scheduled = setImmediate(() => {
      this.pending = false;
      if (this.destroyed) return;
      if (this.index === this.chunks.length || this.remaining === 0) {
        this.push(null);
        return;
      }
      const chunk = this.chunks[this.index++];
      if (chunk instanceof Error) {
        this.emit('error', chunk);
        return;
      }
      const data = chunk.subarray(0, this.remaining);
      this.remaining -= data.length;
      this.bytesProduced += data.length;
      this.push(data);
      this.peakQueuedBytes = Math.max(this.peakQueuedBytes, this.readableLength);
    });
  }

  _destroy(error, callback) {
    clearImmediate(this.scheduled);
    callback(error);
  }
}

function attributesFor(size, mode) {
  return { size, mode, isDirectory: () => (mode & 0o170000) === 0o040000,
    isFile: () => (mode & 0o170000) === 0o100000 };
}

// linkMode/linkSize describe what lstat reports for the path itself; stat follows
// symbolic links like a real SFTP server, so by default both agree.
function fixture(t, { chunks = [], size = 0, mode = 0o100644, linkMode = mode, linkSize = size, statError, openError } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-sftp-read-test-'));
  const streams = [];
  const calls = { stat: [], lstat: [], stream: [], fastGet: [] };
  const attrs = attributesFor(size, mode);
  const linkAttrs = attributesFor(linkSize, linkMode);
  const sftp = {
    stat(remote, callback) { calls.stat.push(remote); callback(statError || null, attrs); },
    lstat(remote, callback) { calls.lstat.push(remote); callback(statError || null, linkAttrs); },
    createReadStream(remote, options) {
      calls.stream.push(remote);
      if (openError) throw openError;
      const stream = new RemoteStream(chunks, options);
      streams.push(stream);
      return stream;
    },
    // Keep the vulnerable fastGet path executable: a regression must fail on
    // returned oversized content, not merely on a missing fake method.
    fastGet(remote, local, callback) {
      calls.fastGet.push(remote);
      fs.writeFileSync(local, '');
      for (const chunk of chunks) {
        if (chunk instanceof Error) { callback(chunk); return; }
        fs.appendFileSync(local, chunk);
      }
      callback(openError || null);
    }
  };
  // Same isolated production-source loading pattern as sftp-lifecycle tests.
  // Only the transport and temp root are substituted; readText is unmodified.
  const module = { exports: {} };
  compileFunction(source, ['require', 'module', 'exports', '__filename', '__dirname'], {
    filename: servicePath
  })((name) => {
    if (name === 'ssh2') return { Client: class {} };
    if (name === 'node:os') return { ...os, tmpdir: () => root };
    return realRequire(name);
  }, module, module.exports, servicePath, path.dirname(servicePath));
  const service = new module.exports.SftpService({}, {}, {}, () => null);
  service.connect = async (input) => {
    assert.equal(input, profile);
    return { sftp };
  };
  const clean = () => assert.deepEqual(fs.readdirSync(root), [], 'no staging files or directories remain');
  t.after(() => {
    try { clean(); } finally {
      for (const stream of streams) stream.destroy();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  return {
    service, streams, calls, clean,
    read: (...limit) => service.readText(profile, '/remote/text.txt', ...limit),
    streamed() {
      assert.deepEqual(calls.fastGet, [], 'unbounded fastGet must not be used');
      assert.deepEqual(calls.stream, ['/remote/text.txt']);
      assert.deepEqual(calls.stat, ['/remote/text.txt']);
      assert.equal(streams.length, 1);
      return streams[0];
    },
    notDownloaded() {
      assert.deepEqual(calls.fastGet, []);
      assert.deepEqual(calls.stream, []);
      assert.equal(streams.length, 0);
    }
  };
}

async function overflow(f, limit, maxProduced) {
  await assert.rejects(f.read(...limit), tooLarge);
  const stream = f.streamed();
  assert.equal(stream.destroyed, true, 'overflow must destroy the remote stream');
  const consumed = stream.bytesProduced;
  assert.ok(consumed > (limit[0] ?? 1_000_000), 'overflow is measured in actual bytes');
  assert.ok(consumed <= maxProduced, `stopped at overflow, not after downloading ${consumed} bytes`);
  await turn();
  await turn();
  assert.equal(stream.bytesProduced, consumed, 'no further remote bytes after rejection');
  f.clean();
}

test('lying stat: one advertised byte, nine actual bytes, limit four rejects and destroys', async (t) => {
  const f = fixture(t, { size: 1, chunks: [Buffer.from('123456789')] });
  await overflow(f, [4], 9);
});

test('growing file stops at the first excess byte, leaving a large remote tail unread', async (t) => {
  const f = fixture(t, { size: 4, chunks: [Buffer.from('1234'), Buffer.from('5'), Buffer.alloc(2_000_000)] });
  await overflow(f, [4], 5);
  assert.equal(f.streams[0].index, 2, 'the large tail was never requested/buffered');
  assert.ok(f.streams[0].peakQueuedBytes <= 4, 'transport queue stays bounded');
});

for (const [name, chunks, size, limit, expected] of [
  ['exactly at limit', [Buffer.from('ab'), Buffer.from('cd')], 4, 4, 'abcd'],
  ['empty regular file', [], 0, 4, ''],
  ['empty regular file at zero limit', [], 0, 0, ''],
  ['UTF-8 split inside two-, three- and four-byte codepoints',
    [...Buffer.from('Aé€😀Z')].map((byte) => Buffer.from([byte])), 11, 11, 'Aé€😀Z']
]) {
  test(`${name} succeeds without staging leftovers`, async (t) => {
    const f = fixture(t, { chunks, size });
    assert.equal(await f.read(limit), expected);
    const stream = f.streamed();
    assert.equal(stream.bytesProduced, Buffer.byteLength(expected));
    assert.ok(stream.readableEnded || stream.destroyed, 'successful reader reaches EOF or closes');
    f.clean();
  });
}

test('byte limit is not a JavaScript character limit', async (t) => {
  const f = fixture(t, { size: 1, chunks: [Buffer.from('é'), Buffer.from('é'), Buffer.from('é'), Buffer.alloc(100)] });
  await overflow(f, [4], 6);
});

for (const prefix of [[], [Buffer.from('ab')]]) {
  test(`stream error after ${prefix.length ? 'partial content' : 'zero bytes'} rejects and destroys`, async (t) => {
    const error = new Error('synthetic SFTP read failure');
    const f = fixture(t, { size: 1, chunks: [...prefix, error, Buffer.alloc(100_000)] });
    await assert.rejects(f.read(4), /synthetic SFTP read failure/u);
    const stream = f.streamed();
    assert.equal(stream.destroyed, true);
    await turn();
    assert.equal(stream.bytesProduced, prefix.length ? 2 : 0);
    assert.equal(stream.index, prefix.length + 1, 'no reads beyond the failed chunk');
    f.clean();
  });
}

for (const [kind, mode] of [
  ['directory', 0o040755], ['symlink', 0o120777], ['FIFO', 0o010600],
  ['socket', 0o140600], ['character device', 0o020600], ['block device', 0o060600]
]) {
  test(`${kind} rejects before any download`, async (t) => {
    const f = fixture(t, { size: 0, mode, chunks: [Buffer.from('data')] });
    await assert.rejects(f.read(4), /regular|only.*files|not.*file/iu);
    f.notDownloaded();
    f.clean();
  });
}

test('symlink to a small regular file rejects: stat follows the link, lstat must not', async (t) => {
  // A conforming server returns the regular target from stat and the link from
  // lstat. Only checking stat would download and return the target's content.
  const f = fixture(t, { size: 1, mode: 0o100644, linkMode: 0o120777, linkSize: 11, chunks: [Buffer.from('x')] });
  await assert.rejects(f.read(4), /regular|only.*files|not.*file/iu);
  assert.deepEqual(f.calls.lstat, ['/remote/text.txt'], 'the path itself must be inspected with lstat');
  f.notDownloaded();
  f.clean();
});

test('stat failure rejects before opening a remote stream', async (t) => {
  const f = fixture(t, { statError: new Error('synthetic stat failure') });
  await assert.rejects(f.read(4), /synthetic stat failure/u);
  f.notDownloaded();
});

test('stream creation failure rejects and leaves no temporary files', async (t) => {
  const f = fixture(t, { openError: new Error('synthetic stream open failure') });
  await assert.rejects(f.read(4), /synthetic stream open failure/u);
  assert.deepEqual(f.calls.fastGet, []);
  assert.deepEqual(f.calls.stream, ['/remote/text.txt']);
  f.clean();
});

for (const [name, limit, args] of [
  ['default editor', 1_000_000, []], ['explicit sync', 5_000_000, [5_000_000]]
]) {
  test(`${name} limit accepts exactly ${limit} bytes`, async (t) => {
    const payload = Buffer.alloc(limit, 'x');
    const f = fixture(t, { size: limit, chunks: [payload.subarray(0, 700_000), payload.subarray(700_000)] });
    assert.equal(await f.read(...args), payload.toString('utf8'));
    assert.equal(f.streamed().bytesProduced, limit);
    f.clean();
  });

  test(`${name} limit rejects a growing stream at ${limit + 1} bytes`, async (t) => {
    const f = fixture(t, { size: 1, chunks: [Buffer.alloc(limit), Buffer.from('x'), Buffer.alloc(100_000)] });
    await overflow(f, args, limit + 1);
    assert.equal(f.streams[0].index, 2);
  });

  test(`${name} limit rejects oversized stat without downloading`, async (t) => {
    const f = fixture(t, { size: limit + 1 });
    await assert.rejects(f.read(...args), tooLarge);
    f.notDownloaded();
  });
}

test('SSH profile sync supplies its explicit 5 MB limit to production readText', async (t) => {
  const { ProfileSync } = require('../src/main/services/profile-sync.cjs');
  // Valid JSON above the editor limit but exactly at the sync limit.
  const payload = Buffer.from('[]' + ' '.repeat(5_000_000 - 2));
  const f = fixture(t, { size: payload.length, chunks: [payload] });
  const limits = [];
  const readText = f.service.readText.bind(f.service);
  f.service.readText = (...args) => { limits.push(args[2]); return readText(...args); };
  const sync = new ProfileSync({ list: () => [profile], get: () => profile }, () => null, { sftpService: f.service });
  t.after(() => sync.stop());
  sync.configure({ type: 'ssh', profileId: profile.id, path: '/remote/text.txt' });
  assert.deepEqual(await sync.syncNow(), { added: 0, updated: 0, total: 0 });
  assert.deepEqual(limits, [5_000_000]);
  assert.equal(f.streamed().bytesProduced, 5_000_000);
  f.clean();
});
