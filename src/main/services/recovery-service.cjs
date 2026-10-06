'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { normalizeSettings } = require('../lib/settings-store.cjs');
const { planProfileImport, sameConnection } = require('../lib/profile-import.cjs');
const { JsonStore } = require('../lib/json-store.cjs');

class RecoveryService {
  constructor(dataDir, profileStore, settingsStore) {
    this.directory = path.join(dataDir, 'recovery');
    this.profiles = profileStore;
    this.settings = settingsStore;
    this.journal = new JsonStore(path.join(this.directory, 'pending.json'), {});
    const pending = this.journal.get();
    if (pending.profiles && pending.settings) {
      this.profiles.store.replace(pending.profiles);
      this.settings.store.replace(pending.settings);
      this.journal.replace({});
    }
  }
  snapshot(reason) {
    const id = `${Date.now()}-${randomUUID()}`;
    const data = { id, reason, createdAt: new Date().toISOString(), profiles: this.profiles.store.get(), settings: this.settings.store.get() };
    new JsonStore(path.join(this.directory, `${id}.json`), {}).replace(data);
    // Keep the newest ten automatic recovery points; never touch exports.
    for (const entry of this.list().slice(10)) fs.rmSync(path.join(this.directory, `${entry.id}.json`));
    return id;
  }
  list() {
    if (!fs.existsSync(this.directory)) return [];
    return fs.readdirSync(this.directory).filter(name => /^\d+-[a-f0-9-]+\.json$/u.test(name)).flatMap(name => {
      try { const data = JSON.parse(fs.readFileSync(path.join(this.directory, name), 'utf8')); return [{ id: name.slice(0, -5), reason: data.reason, createdAt: data.createdAt }]; }
      catch { return []; }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  exportWorkspace() {
    const settings = this.settings.get();
    // Endpoint URLs can contain tokens. Portable backups do not configure AI
    // services or reconnect sessions on the receiving computer.
    delete settings.ai; settings.sessions = [];
    return { format: 'aux-command-workspace', version: 1, exportedAt: new Date().toISOString(), profiles: this.profiles.exportSafe(), settings, credentialsIncluded: false };
  }
  validateWorkspace(payload) {
    if (payload?.format !== 'aux-command-workspace' || payload.version !== 1 || !payload.settings || typeof payload.settings !== 'object' || Array.isArray(payload.settings)) throw new Error('Choose an Aux Command workspace backup (version 1)');
    const plan = planProfileImport(payload.profiles, { profiles: [], snippets: [] });
    // Reuse a local secret only when both the stable ID and connection identity
    // match. A file from another computer cannot attach itself to local secrets.
    const current = new Map(this.profiles.list().map(p => [p.id, p]));
    for (const profile of plan.profiles) {
      const existing = current.get(profile.id);
      if (existing && sameConnection(existing, profile)) profile.credentialId = existing.credentialId;
    }
    const settings = normalizeSettings({ ...payload.settings, ai: this.settings.get().ai, sessions: [] });
    return { profiles: { version: 2, profiles: plan.profiles, snippets: plan.snippets }, settings };
  }
  restoreWorkspace(payload) { return this.#replace(this.validateWorkspace(payload), 'Before workspace restore'); }
  restoreLocal(id) {
    if (!this.list().some(item => item.id === id)) throw new Error('Recovery point not found');
    return this.#replace(JSON.parse(fs.readFileSync(path.join(this.directory, `${id}.json`), 'utf8')), 'Before recovery restore');
  }
  #replace(next, reason) {
    const recoveryId = this.snapshot(reason);
    const previous = { profiles: this.profiles.store.get(), settings: this.settings.store.get() };
    this.journal.replace(previous);
    try {
      this.profiles.store.replace(next.profiles);
      this.settings.store.replace(next.settings);
      this.journal.replace({});
    } catch (error) {
      try { this.profiles.store.replace(previous.profiles); this.settings.store.replace(previous.settings); this.journal.replace({}); }
      catch { /* retained journal restores the previous state at next startup */ }
      throw error;
    }
    return { recoveryId, profiles: this.profiles.list(), settings: this.settings.get(), snippets: this.profiles.snippets() };
  }
}
module.exports = { RecoveryService };
