'use strict';

const path = require('node:path');
const { JsonStore } = require('./json-store.cjs');

const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  workspace: Object.freeze({
    layout: 'single',
    paneMinWidth: 320,
    paneMinHeight: 220
  })
});

function normalizeWorkspaceSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const layout = source.layout === 'grid' ? 'grid' : 'single';
  const width = Number(source.paneMinWidth);
  const height = Number(source.paneMinHeight);
  return {
    layout,
    paneMinWidth: Number.isFinite(width) ? Math.max(240, Math.min(720, Math.round(width))) : DEFAULT_SETTINGS.workspace.paneMinWidth,
    paneMinHeight: Number.isFinite(height) ? Math.max(160, Math.min(520, Math.round(height))) : DEFAULT_SETTINGS.workspace.paneMinHeight
  };
}

function normalizeSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    version: 1,
    workspace: normalizeWorkspaceSettings(source.workspace)
  };
}

class SettingsStore {
  constructor(dataDir) {
    this.store = new JsonStore(path.join(dataDir, 'settings.json'), DEFAULT_SETTINGS);
  }

  get() {
    return normalizeSettings(this.store.get());
  }

  saveWorkspace(input) {
    const workspace = normalizeWorkspaceSettings(input);
    this.store.update((data) => ({ ...normalizeSettings(data), workspace }));
    return this.get();
  }
}

module.exports = { SettingsStore, normalizeSettings, normalizeWorkspaceSettings };
