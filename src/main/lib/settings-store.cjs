'use strict';

const path = require('node:path');
const { JsonStore } = require('./json-store.cjs');

const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  workspace: Object.freeze({
    layout: 'single',
    paneMinWidth: 320,
    paneMinHeight: 220
  }),
  sidebar: Object.freeze({
    groups: Object.freeze([])
  }),
  sessions: []
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

function normalizeSidebarSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const seen = new Set();
  const groups = [];
  for (const entry of Array.isArray(source.groups) ? source.groups : []) {
    const name = String(entry || '').trim().slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    groups.push(name);
    if (groups.length >= 100) break;
  }
  return { groups };
}

function normalizeSession(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (!source.profileId) return null;
  return {
    profileId: String(source.profileId || ''),
    protocol: String(source.protocol || ''),
    title: String(source.title || 'Unknown'),
    startedAt: String(source.startedAt || new Date().toISOString())
  };
}

function normalizeSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    version: 1,
    workspace: normalizeWorkspaceSettings(source.workspace),
    sidebar: normalizeSidebarSettings(source.sidebar),
    sessions: Array.isArray(source.sessions) ? source.sessions.map(normalizeSession).filter(Boolean) : []
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

  saveSidebar(input) {
    const sidebar = normalizeSidebarSettings(input);
    this.store.update((data) => ({ ...normalizeSettings(data), sidebar }));
    return this.get();
  }

  saveSessions(sessions) {
    const normalized = Array.isArray(sessions) ? sessions.map(normalizeSession).filter(Boolean) : [];
    this.store.update((data) => ({ ...normalizeSettings(data), sessions: normalized.slice(0, 32) }));
    return normalized;
  }

  getSessions() {
    return normalizeSettings(this.store.get()).sessions || [];
  }
}

module.exports = { SettingsStore, normalizeSettings, normalizeWorkspaceSettings, normalizeSidebarSettings };
