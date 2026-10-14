'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore, normalizeWorkspaceSettings, normalizeUiSettings } = require('../src/main/lib/settings-store.cjs');

test('normalizes workspace layout and pane settings', () => {
  assert.deepEqual(normalizeWorkspaceSettings({ layout: 'grid', paneMinWidth: 999, paneMinHeight: 10 }), {
    layout: 'grid',
    paneFlow: 'auto',
    paneMinWidth: 720,
    paneMinHeight: 160
  });
  assert.deepEqual(normalizeWorkspaceSettings({ layout: 'bad', paneMinWidth: 100, paneMinHeight: 999 }), {
    layout: 'single',
    paneFlow: 'auto',
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
    assert.deepEqual(restored.workspace, { layout: 'grid', paneFlow: 'auto', paneMinWidth: 400, paneMinHeight: 300 });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('normalizes highlight settings with bounds and defaults', () => {
  const { normalizeHighlightSettings } = require('../src/main/lib/settings-store.cjs');
  const result = normalizeHighlightSettings({
    enabled: true,
    rules: [
      { id: 'a', label: 'Errors', pattern: '/error/', color: 'red', caseSensitive: true, enabled: true },
      { pattern: 'warn', color: 'not-a-color' },
      { pattern: '' },
      { label: 'no pattern is dropped' }
    ]
  });
  assert.equal(result.enabled, true);
  assert.equal(result.rules.length, 2);
  assert.equal(result.rules[0].id, 'a');
  assert.equal(result.rules[0].color, 'red');
  assert.equal(result.rules[0].caseSensitive, true);
  assert.equal(result.rules[1].color, 'amber', 'unknown colors fall back to amber');
  assert.equal(result.rules[1].enabled, true, 'rules default to enabled');

  const empty = normalizeHighlightSettings(undefined);
  assert.deepEqual(empty, { enabled: false, rules: [] });

  const capped = normalizeHighlightSettings({ rules: Array.from({ length: 80 }, (_, i) => ({ pattern: `p${i}` })) });
  assert.equal(capped.rules.length, 50, 'rule count is capped');
});

test('normalizes onboarding settings', () => {
  const { normalizeSettings } = require('../src/main/lib/settings-store.cjs');
  assert.equal(normalizeSettings({}).onboarding.tourCompleted, false);
  assert.equal(normalizeSettings({ onboarding: { tourCompleted: true } }).onboarding.tourCompleted, true);
  assert.equal(normalizeSettings({ onboarding: 'nope' }).onboarding.tourCompleted, false);
});

test('appearance settings survive language-only updates and reloads', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ui-settings-'));
  try {
    const store = new SettingsStore(directory);
    store.saveUi({ density: 'compact', sidebarHidden: true });
    store.saveUi({ language: 'pt' });
    assert.deepEqual(new SettingsStore(directory).get().ui, { ...normalizeUiSettings(), language: 'pt', density: 'compact', sidebarHidden: true });
    store.saveUi({ density: 'invalid', sidebarHidden: 'false' });
    assert.deepEqual(store.get().ui, { ...normalizeUiSettings(), language: 'pt', density: 'comfortable', sidebarHidden: false });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('terminal copy and paste settings default to copy on select with a right-click menu', () => {
  const defaults = normalizeUiSettings({});
  assert.equal(defaults.terminalCopyOnSelect, true);
  assert.equal(defaults.terminalRightClick, 'menu');
  const custom = normalizeUiSettings({ terminalCopyOnSelect: false, terminalRightClick: 'paste' });
  assert.equal(custom.terminalCopyOnSelect, false);
  assert.equal(custom.terminalRightClick, 'paste');
  assert.equal(normalizeUiSettings({ terminalRightClick: 'execute' }).terminalRightClick, 'menu');
});
