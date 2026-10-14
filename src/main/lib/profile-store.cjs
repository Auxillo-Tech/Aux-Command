'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { resolveSshConfig } = require('./ssh-config-resolver.cjs');
const { planProfileImport } = require('./profile-import.cjs');
const { JsonStore } = require('./json-store.cjs');
const { defaultLocalProfile, defaultInfraProfiles, defaultInfraSnippets } = require('./command-builder.cjs');
const { normalizeProfile, normalizeSnippet, expandHome } = require('./validation.cjs');
const { readDefaultSshConfig } = require('./ssh-config-parser.cjs');

const PROFILE_STORE_VERSION = 2;
const MANAGED_CONNECTIVITY_FIELDS = Object.freeze([
  'name', 'protocol', 'group', 'host', 'port', 'username', 'identityFile', 'knownHostsFile',
  'sshAlias', 'useSshConfig', 'proxyJump', 'keepAliveSeconds', 'notes'
]);

class ProfileStore {
  constructor(dataDir, options = {}) {
    this.resolveSsh = options.resolveSsh || resolveSshConfig;
    this.sshConfigFile = options.sshConfigFile;
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
    // One hand-edited or legacy-invalid entry must not take every profile
    // (and app startup) down with it; invalid entries are skipped with a
    // warning and stay untouched in profiles.json for manual repair.
    const data = this.store.get();
    const profiles = [];
    for (const profile of data.profiles) {
      try {
        profiles.push(normalizeProfile({ ...profile, sshAliases: [...(profile.sshAliases || []), ...(data.sshAliasGroups?.[profile.id] || [])] }, profile.id));
      } catch (error) {
        process.stderr.write(`Aux Command skipped invalid profile ${profile?.id || '(no id)'} in profiles.json: ${error?.message || error}\n`);
      }
    }
    return profiles;
  }

  snippets() {
    const snippets = [];
    for (const snippet of this.store.get().snippets || []) {
      try {
        snippets.push(normalizeSnippet(snippet, snippet.id));
      } catch (error) {
        process.stderr.write(`Aux Command skipped invalid snippet ${snippet?.id || '(no id)'} in profiles.json: ${error?.message || error}\n`);
      }
    }
    return snippets;
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

  moveGroup(from, to) {
    if(typeof from!=='string'||!from||from==='Local'||typeof to!=='string'||!to.trim())throw new Error('Invalid folder move');
    const updates=new Map(this.list().filter(p=>p.group===from||p.group.startsWith(from+' / ')).map(p=>[p.id,normalizeProfile({...p,group:to+p.group.slice(from.length)},p.id)]));
    this.store.update(data=>({...data,profiles:data.profiles.map(p=>updates.get(p.id)||p)}));return updates.size;
  }
  bulkUpdate(ids, patch) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 2000 || new Set(ids).size !== ids.length) throw new Error('Select 1–2,000 distinct connections');
    if (!patch || Object.keys(patch).some(key => !['group', 'tags', 'favorite', 'username', 'port', 'keepAliveSeconds'].includes(key))) throw new Error('Unsupported bulk field');
    const currentProfiles = new Map(this.list().map(profile => [profile.id, profile]));
    const updates = ids.map(id => {
      const existing = currentProfiles.get(id);
      if (!existing) throw new Error('A selected connection no longer exists');
      return normalizeProfile({ ...existing, ...patch, updatedAt: new Date().toISOString() }, id);
    });
    const byId = new Map(updates.map(p => [p.id, p]));
    this.store.update(data => ({ ...data, profiles: data.profiles.map(p => byId.get(p.id) || p) }));
    return updates;
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

  // Hosts are read from $HOME/.ssh/config, so OpenSSH must resolve them from
  // the same file; without -F it reads the account's passwd home instead.
  #defaultSshConfigFile() {
    const filename = path.join(os.homedir(), '.ssh', 'config');
    return fs.existsSync(filename) ? filename : undefined;
  }

  async importSshConfig() {
    const imported = readDefaultSshConfig();
    // Resolve all entries before writing: a bad config must not partially
    // replace working saved connections. Ignore copied fields when resolving.
    for (const profile of imported) {
      const config = await this.resolveSsh({ name: profile.name, protocol: 'ssh', host: profile.sshAlias, sshAlias: profile.sshAlias, useSshConfig: true }, { configFile: this.sshConfigFile || this.#defaultSshConfigFile() });
      profile.host = config.hostname[0];
      profile.port = Number(config.port[0]);
      profile.username = config.user?.[0] || '';
      profile.identityFile = (config.identityfile || []).find((file) => fs.existsSync(expandHome(file))) || (config.identityfile?.length === 1 && config.identityfile[0] !== 'none' ? config.identityfile[0] : '');
      profile.proxyJump = config.proxyjump?.[0] === 'none' ? '' : config.proxyjump?.[0] || '';
      profile.compression = config.compression?.[0] === 'yes';
      profile.agentForwarding = config.forwardagent?.[0] === 'yes';
    }
    let added = 0;
    let updated = 0;
    this.store.update((data) => {
      // Display names and resolved hosts can change without creating a new
      // SSH connection. Keep imported aliases stable across repeated imports.
      const identity = (profile) => profile.protocol === 'ssh' && profile.useSshConfig && profile.sshAlias
        ? JSON.stringify(['ssh-alias', profile.sshAlias])
        : JSON.stringify([profile.protocol, profile.name, profile.host]);
      const aliases = new Map(data.profiles.map((profile) => [identity(profile), profile]));
      for (const existing of data.profiles) {
        if (existing.protocol !== 'ssh' || !existing.useSshConfig) continue;
        for (const alias of [...(existing.sshAliases || []), ...(data.sshAliasGroups?.[existing.id] || [])]) aliases.set(JSON.stringify(['ssh-alias', alias]), existing);
      }
      for (const profile of imported) {
        const key = identity(profile);
        if (!aliases.has(key)) {
          data.profiles.push(profile);
          aliases.set(key, profile);
          added += 1;
        } else {
          const existing = aliases.get(key);
          // Explicitly consolidated aliases remain callable in OpenSSH, but
          // reimport must not recreate their redundant sidebar profiles.
          if (existing.sshAlias !== profile.sshAlias) continue;
          for (const field of ['host', 'port', 'username', 'identityFile', 'proxyJump', 'compression', 'agentForwarding']) existing[field] = profile[field];
          existing.updatedAt = new Date().toISOString();
          updated += 1;
        }
      }
      return data;
    });
    return { found: imported.length, added, updated, profiles: this.list() };
  }

  exportSafe() {
    // Export only fields accepted by the current profile schema. Reading through
    // list() deliberately drops legacy or manually injected password/token fields.
    const profiles = this.list();
    return {
      format: 'aux-command-profiles',
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: profiles.map((profile) => {
        const portable = filename => filename === os.homedir() ? '~' : filename.startsWith(os.homedir() + path.sep) ? '~/' + path.relative(os.homedir(), filename) : filename;
        return { ...profile, credentialId: '', identityFile: portable(profile.identityFile), knownHostsFile: portable(profile.knownHostsFile) };
      }),
      snippets: this.snippets()
    };
  }

  previewImport(payload, mode = 'merge') {
    return planProfileImport(payload, { profiles: this.list(), snippets: this.snippets() }, mode).summary;
  }

  importSafe(payload, mode = 'merge') {
    const plan = planProfileImport(payload, { profiles: this.list(), snippets: this.snippets() }, mode);
    this.store.update(data => ({ ...data, profiles: plan.profiles, snippets: plan.snippets }));
    return { ...plan.summary, profiles: this.list(), snippets: this.snippets() };
  }

}

module.exports = { ProfileStore };
