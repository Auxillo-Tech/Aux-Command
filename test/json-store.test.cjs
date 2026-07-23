'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStore } = require('../src/main/lib/json-store.cjs');

test('persists atomic JSON updates and returns defensive copies', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-store-'));
  try {
    const filename = path.join(directory, 'data.json');
    const store = new JsonStore(filename, { count: 0, nested: { safe: true } });
    const copy = store.get();
    copy.nested.safe = false;
    assert.equal(store.get().nested.safe, true);
    store.update((draft) => { draft.count += 1; return draft; });
    assert.equal(JSON.parse(fs.readFileSync(filename, 'utf8')).count, 1);
    assert.equal(new JsonStore(filename, {}).get().count, 1);
    if (process.platform !== 'win32') assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('recovers from malformed JSON with defaults', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-store-'));
  try {
    const filename = path.join(directory, 'data.json');
    fs.writeFileSync(filename, '{bad json');
    const store = new JsonStore(filename, { valid: true });
    assert.deepEqual(store.get(), { valid: true });
    assert.equal(fs.existsSync(filename), false);
    assert.match(store.recovery?.quarantineFilename || '', /data\.json\.corrupt-/u);
    assert.equal(fs.readFileSync(store.recovery.quarantineFilename, 'utf8'), '{bad json');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('does not change in-memory state when persistence fails', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-store-'));
  try {
    const blocker = path.join(directory, 'not-a-directory');
    const store = new JsonStore(path.join(blocker, 'data.json'), { count: 1 });
    fs.writeFileSync(blocker, 'blocked');
    assert.throws(() => store.replace({ count: 2 }));
    assert.deepEqual(store.get(), { count: 1 });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
