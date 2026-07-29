'use strict';

const path = require('node:path');
const { JsonStore } = require('./json-store.cjs');
const { defaultLocalProfile, defaultInfraProfiles, defaultInfraSnippets } = require('./command-builder.cjs');
const { normalizeProfile, normalizeSnippet } = require('./validation.cjs');
const { readDefaultSshConfig } = require('./ssh-config-parser.cjs');

const PROFILE_STORE_VERSION = 2;
const MANAGED_CONNECTIVITY_FIELDS = Object.freeze([
  'name', 'protocol', 'group', 'host', 'port', 'username', 'identityFile', 'knownHostsFile',
  'sshAlias', 'useSshConfig', 'proxyJump', 'keepAliveSeconds', 'notes'
]);

class ProfileStore {
  constructor(dataDir) {
    this.store = new JsonStore(path.join(dataDir, 'profiles.json'), {
      version: PROFILE_STORE_VERSION,
      profiles: [defaultLocalProfile(), ...defaultInfraProfiles()],
      snippets: defaultInfraSnippets()
    });
    this.#migrateManagedProfiles();
  }

  #migrateManagedProfiles() {
    const current = this.store.get();
    if (Number(current.version || 1) >= PROFILE_STORE_VERSION) return;

    const managedProfiles = defaultInfraProfiles();
    this.store.update((data) => {
      data.profiles = Array.isArray(data.profiles) ? data.profiles : [defaultLocalProfile()];
      for (const managed of managedProfiles) {
        const index = data.profiles.findIndex((profile) => profile.id === managed.id);
        if (index < 0) {
          data.profiles.push(managed);
          continue;
        }

        const migrated = { ...data.profiles[index] };
        for (const field of MANAGED_CONNECTIVITY_FIELDS) migrated[field] = managed[field];
        data.profiles[index] = normalizeProfile(migrated, managed.id);
      }
      data.snippets = Array.isArray(data.snippets) ? data.snippets : defaultInfraSnippets();
      data.version = PROFILE_STORE_VERSION;
      return data;
    });
  }

  list() {
    const data = this.store.get();
    return data.profiles.map((profile) => normalizeProfile(profile, profile.id));
  }

  snippets() {
    return (this.store.get().snippets || []).map((snippet) => normalizeSnippet(snippet, snippet.id));
  }

  saveSnippet(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const existing = source.id ? this.snippets().find((snippet) => snippet.id === source.id) : null;
    const normalized = normalizeSnippet({ ...existing, ...source, updatedAt: new Date().toISOString() }, existing?.id || source.id);
    this.store.update((data) => {
      data.snippets ||= [];
      const index = data.snippets.findIndex((snippet) => snippet.id === normalized.id);
      if (index >= 0) data.snippets[index] = normalized;
      else data.snippets.push(normalized);
      return data;
    });
    return normalized;
  }

  deleteSnippet(id) {
    const before = this.snippets().length;
    this.store.update((data) => {
      data.snippets = (data.snippets || []).filter((snippet) => snippet.id !== id);
      return data;
    });
    return this.snippets().length < before;
  }

  get(id) {
    return this.list().find((profile) => profile.id === id) || null;
  }

  save(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    if (source.id === 'local-shell' && source.protocol && source.protocol !== 'local') {
      throw new Error('The default local shell must remain a local profile');
    }
    const existing = source.id ? this.get(source.id) : null;
    const normalized = normalizeProfile({ ...existing, ...source, updatedAt: new Date().toISOString() }, existing?.id || source.id);
    this.store.update((data) => {
      const index = data.profiles.findIndex((profile) => profile.id === normalized.id);
      if (index >= 0) data.profiles[index] = normalized;
      else data.profiles.push(normalized);
      return data;
    });
    return normalized;
  }

  delete(id) {
    if (id === 'local-shell') throw new Error('The default local shell profile cannot be deleted');
    const before = this.list().length;
    this.store.update((data) => {
      data.profiles = data.profiles.filter((profile) => profile.id !== id);
      return data;
    });
    return this.list().length < before;
  }

  importSshConfig() {
    const imported = readDefaultSshConfig();
    let added = 0;
    this.store.update((data) => {
      const aliases = new Set(data.profiles.map((profile) => `${profile.protocol}:${profile.name}:${profile.host}`));
      for (const profile of imported) {
        const key = `${profile.protocol}:${profile.name}:${profile.host}`;
        if (!aliases.has(key)) {
          data.profiles.push(profile);
          aliases.add(key);
          added += 1;
        }
      }
      return data;
    });
    return { found: imported.length, added, profiles: this.list() };
  }

  exportSafe() {
    // Export only fields accepted by the current profile schema. Reading through
    // list() deliberately drops legacy or manually injected password/token fields.
    const profiles = this.list();
    return {
      format: 'aux-command-profiles',
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: profiles.map((profile) => ({ ...profile, credentialId: '' })),
      snippets: this.snippets()
    };
  }

  importSafe(payload) {
    if (!payload || payload.format !== 'aux-command-profiles' || !Array.isArray(payload.profiles)) {
      throw new Error('Unsupported Aux Command profile export');
    }
    const imported = payload.profiles.map((profile) => normalizeProfile({ ...profile, credentialId: '' }));
    const snippets = Array.isArray(payload.snippets) ? payload.snippets.map((snippet) => normalizeSnippet(snippet)) : [];
    this.store.update((data) => {
      const currentIds = new Set(data.profiles.map((profile) => profile.id));
      for (const profile of imported) {
        if (currentIds.has(profile.id)) profile.id = require('node:crypto').randomUUID();
        currentIds.add(profile.id);
        data.profiles.push(profile);
      }
      data.snippets ||= [];
      const snippetIds = new Set(data.snippets.map((snippet) => snippet.id));
      for (const snippet of snippets) {
        if (snippetIds.has(snippet.id)) snippet.id = require('node:crypto').randomUUID();
        snippetIds.add(snippet.id);
        data.snippets.push(snippet);
      }
      return data;
    });
    return { added: imported.length, snippetsAdded: snippets.length, profiles: this.list(), snippets: this.snippets() };
  }
}

module.exports = { ProfileStore };
