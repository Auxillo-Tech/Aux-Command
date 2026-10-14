'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { shortcuts } = require('../../shared/preferences.js');
const { TERMINAL_THEMES } = require('./validation.cjs');
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
  highlight: Object.freeze({
    enabled: false,
    rules: Object.freeze([])
  }),
  onboarding: Object.freeze({
    tourCompleted: false
  }),
  assist: Object.freeze({
    enabled: true,
    suggestions: true,
    autocorrect: true,
    dangerGuard: true,
    osDetection: true
  }),
  ai: Object.freeze({
    enabled: false,
    endpoint: '',
    model: ''
  }),
  ui: Object.freeze({
    language: 'en',
    density: 'comfortable',
    sidebarHidden: false
  }),
  namedWorkspaces: [],
  sessions: []
});

function normalizeOnboardingSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return { tourCompleted: Boolean(source.tourCompleted) };
}

function normalizeAssistSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const flag = (key) => (key in source ? Boolean(source[key]) : DEFAULT_SETTINGS.assist[key]);
  return {
    enabled: flag('enabled'),
    suggestions: flag('suggestions'),
    autocorrect: flag('autocorrect'),
    dangerGuard: flag('dangerGuard'),
    osDetection: flag('osDetection')
  };
}

const HIGHLIGHT_COLORS = new Set(['red', 'amber', 'green', 'blue', 'magenta', 'cyan']);

function normalizeHighlightSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const rules = [];
  for (const entry of Array.isArray(source.rules) ? source.rules : []) {
    const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const pattern = String(record.pattern || '').slice(0, 200);
    if (!pattern) continue;
    rules.push({
      id: String(record.id || '').slice(0, 64) || `rule-${rules.length + 1}`,
      label: String(record.label || '').slice(0, 60),
      pattern,
      color: HIGHLIGHT_COLORS.has(record.color) ? record.color : 'amber',
      caseSensitive: Boolean(record.caseSensitive),
      wholeWord: Boolean(record.wholeWord),
      enabled: record.enabled !== false
    });
    if (rules.length >= 50) break;
  }
  return { enabled: Boolean(source.enabled), rules };
}

function normalizeAiSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const endpoint = /^https?:\/\//iu.test(String(source.endpoint || '').trim()) ? String(source.endpoint).trim().slice(0, 500) : '';
  return {
    // AI assist is opt-in and impossible to enable without an endpoint.
    enabled: Boolean(source.enabled) && Boolean(endpoint),
    endpoint,
    model: String(source.model || '').trim().slice(0, 200)
  };
}

const UI_LANGUAGES = new Set(['en', 'de', 'es', 'fr', 'it', 'ja', 'pt', 'ru', 'zh']);

function normalizeUiSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return { language: UI_LANGUAGES.has(source.language) ? source.language : 'en',
    density: source.density === 'compact' ? 'compact' : 'comfortable',
    sidebarHidden: source.sidebarHidden === true,
    sidebarWidth: Math.max(240, Math.min(500, Number(source.sidebarWidth) || 280)),
    filesWidth: Math.max(320, Math.min(700, Number(source.filesWidth) || 384)),
    shortcuts: shortcuts(source.shortcuts),
    terminalCopyOnSelect: source.terminalCopyOnSelect !== false,
    terminalPasteWarning: source.terminalPasteWarning !== false,
    terminalRightClick: source.terminalRightClick === 'paste' ? 'paste' : 'menu',
    terminalDefaults: {
      terminalTheme: TERMINAL_THEMES.has(source.terminalDefaults?.terminalTheme) ? source.terminalDefaults.terminalTheme : 'aux-dark',
      terminalFontSize: Math.max(8, Math.min(32, Math.round(Number(source.terminalDefaults?.terminalFontSize) || 13))),
      terminalFontFamily: String(source.terminalDefaults?.terminalFontFamily || 'JetBrains Mono, monospace').slice(0, 240),
      terminalScrollback: Math.max(1000, Math.min(200000, Math.round(Number(source.terminalDefaults?.terminalScrollback) || 20000)))
    } };
}

function normalizeWorkspaceSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const layout = source.layout === 'grid' ? 'grid' : 'single';
  const width = Number(source.paneMinWidth);
  const height = Number(source.paneMinHeight);
  return {
    layout,
    paneFlow: ['rows','columns'].includes(source.paneFlow) ? source.paneFlow : 'auto',
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
    title: String(source.title || 'Unknown').slice(0, 100),
    startedAt: String(source.startedAt || new Date().toISOString()).slice(0, 100),
    customTitle: source.customTitle === true,
    cwd: typeof source.cwd === 'string' && source.cwd.startsWith('/') && !/[\x00-\x1f]/u.test(source.cwd) ? source.cwd.slice(0, 4096) : '',
    fontSize: source.fontSize != null && Number.isFinite(Number(source.fontSize)) ? Math.max(8, Math.min(32, Number(source.fontSize))) : null,
    active: source.active === true,
    paneWidth: Math.max(0, Math.min(4000, Number(source.paneWidth) || 0)),
    paneHeight: Math.max(0, Math.min(3000, Number(source.paneHeight) || 0))
  };
}

function normalizeNamedWorkspaces(input) {
  const seen = new Set();
  return (Array.isArray(input) ? input : []).slice(0, 30).flatMap((item) => {
    if (!item || typeof item !== 'object' || !item.id || !item.name || seen.has(item.id)) return [];
    const id = String(item.id).slice(0, 100); seen.add(id);
    return [{ id, name: String(item.name).trim().slice(0, 80),
      workspace: normalizeWorkspaceSettings(item.workspace),
      sessions: (Array.isArray(item.sessions) ? item.sessions : []).slice(0, 50).map(normalizeSession).filter(Boolean) }];
  });
}

function normalizeSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    version: 1,
    workspace: normalizeWorkspaceSettings(source.workspace),
    sidebar: normalizeSidebarSettings(source.sidebar),
    highlight: normalizeHighlightSettings(source.highlight),
    onboarding: normalizeOnboardingSettings(source.onboarding),
    assist: normalizeAssistSettings(source.assist),
    ai: normalizeAiSettings(source.ai),
    ui: normalizeUiSettings(source.ui),
    namedWorkspaces: normalizeNamedWorkspaces(source.namedWorkspaces),
    sessions: Array.isArray(source.sessions) ? source.sessions.slice(0, 50).map(normalizeSession).filter(Boolean) : []
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

  saveHighlight(input) {
    const highlight = normalizeHighlightSettings(input);
    this.store.update((data) => ({ ...normalizeSettings(data), highlight }));
    return this.get();
  }

  saveOnboarding(input) {
    const onboarding = normalizeOnboardingSettings(input);
    this.store.update((data) => ({ ...normalizeSettings(data), onboarding }));
    return this.get();
  }

  saveAssist(input) {
    const assist = normalizeAssistSettings(input);
    this.store.update((data) => ({ ...normalizeSettings(data), assist }));
    return this.get();
  }

  saveAi(input) {
    const ai = normalizeAiSettings(input);
    this.store.update((data) => ({ ...normalizeSettings(data), ai }));
    return this.get();
  }

  saveUi(input) {
    if (input?.shortcuts) shortcuts(input.shortcuts, true);
    const ui = normalizeUiSettings({ ...this.get().ui, ...(input && typeof input === 'object' && !Array.isArray(input) ? input : {}) });
    this.store.update((data) => ({ ...normalizeSettings(data), ui }));
    return this.get();
  }

  saveNamedWorkspace(input) {
    if (!input || typeof input.name !== 'string' || !input.name.trim()) throw new Error('Workspace name is required');
    const current = this.get();
    if (!input.id && current.namedWorkspaces.length >= 30) throw new Error('A maximum of 30 named workspaces is supported');
    const id = input.id && current.namedWorkspaces.some((item) => item.id === input.id) ? input.id : randomUUID();
    const [workspace] = normalizeNamedWorkspaces([{ ...input, id }]);
    if (!workspace) throw new Error('Invalid workspace');
    current.namedWorkspaces = [...current.namedWorkspaces.filter((item) => item.id !== id), workspace];
    this.store.replace(current);
    return current.namedWorkspaces;
  }

  deleteNamedWorkspace(id) {
    const current = this.get();
    current.namedWorkspaces = current.namedWorkspaces.filter((item) => item.id !== id);
    this.store.replace(current);
    return current.namedWorkspaces;
  }

  saveSessions(sessions) {
    const normalized = Array.isArray(sessions) ? sessions.map(normalizeSession).filter(Boolean) : [];
    this.store.update((data) => ({ ...normalizeSettings(data), sessions: normalized.slice(0, 50) }));
    return normalized;
  }

  getSessions() {
    return normalizeSettings(this.store.get()).sessions || [];
  }
}

module.exports = { SettingsStore, normalizeSettings, normalizeWorkspaceSettings, normalizeSidebarSettings, normalizeHighlightSettings, normalizeAssistSettings, normalizeAiSettings, normalizeUiSettings };
