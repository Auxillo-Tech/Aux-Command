'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ftp = require('basic-ftp');
const { FtpService, replaceFtpRemoteFile } = require('../src/main/services/ftp-service.cjs');

for (const rollbackFails of [false, true]) test(`FTP replacement preserves original when replacement fails (rollback failure: ${rollbackFails})`, async () => {
  const files = new Map([['target', 'original'], ['partial', 'replacement']]);
  const client = {
    async rename(from, to) {
      if (from === 'partial' || (rollbackFails && from.includes('aux-backup'))) throw new Error('Server refused rename');
      files.set(to, files.get(from)); files.delete(from);
    },
    async remove(name) { files.delete(name); }
  };
  await assert.rejects(() => replaceFtpRemoteFile(client, 'partial', 'target'), rollbackFails ? /Original file is preserved at target.aux-backup/ : /refused rename/);
  assert.equal([...files.values()].includes('original'), true);
  if (!rollbackFails) assert.equal(files.get('target'), 'original');
});

test('FTP servers that reject overwrite can replace through a recoverable backup', async () => {
  const files = new Map([['target', 'original'], ['partial', 'replacement']]);
  const client = {
    async rename(from, to) {
      if (files.has(to)) throw new Error('Target exists');
      files.set(to, files.get(from)); files.delete(from);
    },
    async remove(name) { files.delete(name); }
  };
  await replaceFtpRemoteFile(client, 'partial', 'target');
  assert.deepEqual([...files], [['target', 'replacement']]);
});

function fixture(t) {
  t.mock.method(ftp.Client.prototype, 'access', async () => {});
  const service = new FtpService({ has: () => false }, () => null);
  t.after(() => service.disconnectAll());
  const profile = { id: 'ftp-test', name: 'FTP test', protocol: 'ftp', host: '127.0.0.1', port: 21 };
  return { service, profile };
}

test('FTP partial downloads are private before data arrives and truncate stale resume bytes', async (t) => {
  const { service, profile } = fixture(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ftp-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'download');
  const partial = `${target}.aux-command-test.part`;
  fs.writeFileSync(partial, 'abcdefghi', { mode: 0o644 });
  t.mock.method(ftp.Client.prototype, 'size', async () => 3);
  t.mock.method(ftp.Client.prototype, 'downloadTo', async (file, remote, offset) => {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(file).size, 3);
    assert.equal(offset, 3);
  });
  await service.download(profile, '/file', target, { transferId: 'test', offset: 9 });
  assert.equal(fs.readFileSync(target, 'utf8'), 'abc');
});

test('FTP editor stops receiving once its byte limit is exceeded', async (t) => {
  const { service, profile } = fixture(t);
  t.mock.method(ftp.Client.prototype, 'downloadTo', async (sink) => {
    assert.equal(typeof sink.write, 'function');
    sink.on('error', () => {});
    await new Promise((resolve, reject) => sink.write(Buffer.alloc(17), (error) => error ? reject(error) : resolve()));
  });
  await assert.rejects(() => service.readText(profile, '/file', 16), /too large/);
});

test('FTP transfer cancelled while queued does not issue a data command', async (t) => {
  const { service, profile } = fixture(t);
  t.mock.method(ftp.Client.prototype, 'size', async () => assert.fail('cancelled download should not start'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => service.download(profile, '/file', '/tmp/unused-aux-test', { signal: controller.signal }), { name: 'AbortError' });
});
