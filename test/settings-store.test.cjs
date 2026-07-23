'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore, normalizeWorkspaceSettings } = require('../src/main/lib/settings-store.cjs');

test('normalizes workspace layout and pane settings', () => {
  assert.deepEqual(normalizeWorkspaceSettings({ layout: 'grid', paneMinWidth: 999, paneMinHeight: 10 }), {
    layout: 'grid',
    paneMinWidth: 720,
    paneMinHeight: 160
  });
  assert.deepEqual(normalizeWorkspaceSettings({ layout: 'bad', paneMinWidth: 100, paneMinHeight: 999 }), {
    layout: 'single',
    paneMinWidth: 240,
    paneMinHeight: 520
  });
});

test('persists workspace settings through the JSON store', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-settings-'));
  try {
    const store = new SettingsStore(directory);
    assert.equal(store.get().workspace.layout, 'single');
    store.saveWorkspace({ layout: 'grid', paneMinWidth: 400, paneMinHeight: 300 });
    const restored = new SettingsStore(directory).get();
    assert.deepEqual(restored.workspace, { layout: 'grid', paneMinWidth: 400, paneMinHeight: 300 });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
