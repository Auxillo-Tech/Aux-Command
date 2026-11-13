'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { resolveSshConfig } = require('./ssh-config-resolver.cjs');
const { planProfileImport } = require('./profile-import.cjs');
const { JsonStore } = require('./json-store.cjs');
const { defaultLocalProfile, defaultInfraProfiles, defaultInfraSnippets } = require('./command-builder.cjs');
const { normalizeProfile, normalizeSnippet, expandHome } = require('./validation.cjs');
const { readDefaultSshConfigDetailed } = require('./ssh-config-parser.cjs');

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

  // Every stored row, each either normalised or, when it no longer passes
  // validation, a display copy marked `invalid` with the reason. The raw row is
  // never changed by reading it.
  #rows(data) {
    return data.profiles.map((profile) => {
      try {
        const own = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : null;
        if (!own) throw new Error('profile must be an object');
        return normalizeProfile(withAliasGroups(own, data), own.id);
      } catch (error) {
        return invalidView(profile, error, data);
      }
    });
  }

  // The profiles that can be used to connect. A stored one that fails
  // validation (a legacy user name, a hand edit) is left out here but stays
  // untouched in profiles.json; listAll() shows it so it can be fixed.
  list() {
    return this.#rows(this.store.get()).filter((profile) => !profile.invalid);
  }

  // The same list including the invalid entries, for the profile list in the
  // window. Nothing but display code may connect with an entry that has `invalid`.
  listAll() {
    return this.#rows(this.store.get());
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

  // The stored row as it is on disk, for deleting its saved credential.
  raw(id) {
    return this.store.get().profiles.find((profile) => profile?.id === id) || null;
  }

  save(input) {
    // `invalid` only ever comes from the window's copy of a stored profile; the
    // editor's own payload never carries it, so nothing below may depend on it.
    const { invalid: marker, ...source } = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    if (source.id === 'local-shell' && source.protocol && source.protocol !== 'local') {
      throw new Error('The default local shell must remain a local profile');
    }
    // An invalid stored profile can be saved over once the edit makes it valid.
    // The base is the full stored row, never the window's display copy, so a
    // field the edit does not touch stays exactly as it was stored. It still
    // goes through normalizeProfile below, which drops unknown fields.
    const data = this.store.get();
    const stored = source.id ? data.profiles.find((profile) => profile?.id === source.id) : null;
    let existing = null;
    let base = {};
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      const row = this.#rows({ ...data, profiles: [stored] })[0];
      existing = { id: stored.id };
      base = row.invalid ? withAliasGroups(stored, data) : row;
      // The window shows a stored invalid row with long values cut to the
      // validation limits, and the editor sends back what it shows, with or
      // without the `invalid` marker. Over any stored invalid row, a field that
      // still holds exactly the cut text keeps its stored value, so a cut never
      // replaces a stored value unasked and validation refuses it with the
      // real reason.
      if (row.invalid) keepUncut(source, base);
    }
    // A marked copy that matches no stored row (Duplicate on an invalid row) is a new row built from the
    // cut display copy: it keeps the marker, so validation refuses it with the row's own reason.
    const marked = !existing && marker !== undefined ? { invalid: marker } : {};
    const normalized = normalizeProfile({ ...base, ...source, ...marked, updatedAt: new Date().toISOString() }, existing?.id || source.id);
    this.store.update((data) => {
      const index = data.profiles.findIndex((profile) => profile?.id === normalized.id);
      if (index >= 0) data.profiles[index] = normalized;
      else data.profiles.push(normalized);
      return data;
    });
    return normalized;
  }

  moveGroup(from, to) {
    if(typeof from!=='string'||!from||from==='Local'||typeof to!=='string'||!to.trim())throw new Error('Invalid folder move');
    const updates=new Map(this.list().filter(p=>p.group===from||p.group.startsWith(from+' / ')).map(p=>[p.id,normalizeProfile({...p,group:to+p.group.slice(from.length)},p.id)]));
    this.store.update(data=>({...data,profiles:data.profiles.map(p=>updates.get(p?.id)||p)}));return updates.size;
  }
  bulkUpdate(ids, patch) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 2000 || new Set(ids).size !== ids.length) throw new Error('Select 1–2,000 distinct connections');
    if (!patch || Object.keys(patch).some(key => !['group', 'tags', 'favorite', 'username', 'port', 'keepAliveSeconds'].includes(key))) throw new Error('Unsupported bulk field');
    const currentProfiles = new Map(this.listAll().map(profile => [profile.id, profile]));
    const updates = ids.map(id => {
      const existing = currentProfiles.get(id);
      if (!existing) throw new Error('A selected connection no longer exists');
      // An invalid stored profile stops the whole change with its own reason;
      // nothing is written (normalizeProfile refuses the `invalid` marker).
      return normalizeProfile({ ...existing, ...patch, updatedAt: new Date().toISOString() }, id);
    });
    const byId = new Map(updates.map(p => [p.id, p]));
    this.store.update(data => ({ ...data, profiles: data.profiles.map(p => byId.get(p?.id) || p) }));
    return updates;
  }
  delete(id) {
    if (id === 'local-shell') throw new Error('The default local shell profile cannot be deleted');
    let removed = false;
    this.store.update((data) => {
      const kept = data.profiles.filter((profile) => profile?.id !== id);
      removed = kept.length < data.profiles.length;
      data.profiles = kept;
      return data;
    });
    return removed;
  }

  // Hosts are read from $HOME/.ssh/config, so OpenSSH must resolve them from
  // the same file; without -F it reads the account's passwd home instead.
  #defaultSshConfigFile() {
    const filename = path.join(os.homedir(), '.ssh', 'config');
    return fs.existsSync(filename) ? filename : undefined;
  }

  async importSshConfig() {
    const { profiles: parsed, skipped } = readDefaultSshConfigDetailed();
    const imported = [];
    // Resolve all entries before writing: a bad config must not partially
    // replace working saved connections. Ignore copied fields when resolving.
    for (const profile of parsed) {
      const config = await this.resolveSsh({ name: profile.name, protocol: 'ssh', host: profile.sshAlias, sshAlias: profile.sshAlias, useSshConfig: true }, { configFile: this.sshConfigFile || this.#defaultSshConfigFile() });
      profile.host = config.hostname[0];
      profile.port = Number(config.port[0]);
      profile.username = config.user?.[0] || '';
      profile.identityFile = (config.identityfile || []).find((file) => fs.existsSync(expandHome(file))) || (config.identityfile?.length === 1 && config.identityfile[0] !== 'none' ? config.identityfile[0] : '');
      profile.proxyJump = config.proxyjump?.[0] === 'none' ? '' : config.proxyjump?.[0] || '';
      profile.compression = config.compression?.[0] === 'yes';
      profile.agentForwarding = config.forwardagent?.[0] === 'yes';
      // The user name and host OpenSSH resolved (Match blocks, wildcards,
      // Include files) can hold shell syntax even when the alias did not, and
      // the resolved values are what reaches a shell. Check the finished
      // profile the way saving does; one that fails is reported, never
      // altered, and never written (list() would otherwise hide it).
      try { normalizeProfile(profile, profile.id); } catch (error) {
        skipped.push({ alias: profile.sshAlias, field: error?.field || '', reason: error?.message || 'invalid entry' });
        continue;
      }
      imported.push(profile);
    }
    let added = 0;
    let updated = 0;
    this.store.update((data) => {
      // Display names and resolved hosts can change without creating a new
      // SSH connection. Keep imported aliases stable across repeated imports.
      const identity = (profile) => profile.protocol === 'ssh' && profile.useSshConfig && profile.sshAlias
        ? JSON.stringify(['ssh-alias', profile.sshAlias])
        : JSON.stringify([profile.protocol, profile.name, profile.host]);
      const aliases = new Map(data.profiles.filter((profile) => profile && typeof profile === 'object').map((profile) => [identity(profile), profile]));
      for (const existing of data.profiles) {
        if (existing?.protocol !== 'ssh' || !existing.useSshConfig) continue;
        for (const alias of [...(Array.isArray(existing.sshAliases) ? existing.sshAliases : []), ...(data.sshAliasGroups?.[existing.id] || [])]) aliases.set(JSON.stringify(['ssh-alias', alias]), existing);
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
    return { found: imported.length, added, updated, skipped, profiles: this.listAll() };
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

  // The rows import and merge work against: the ones that validate, plus the
  // ids of those that do not (a new profile must not reuse such an id).
  #importBase() {
    const data = this.store.get();
    const rows = this.#rows(data);
    return {
      profiles: rows.filter((row) => !row.invalid),
      snippets: this.snippets(),
      reservedIds: rows.filter((row) => row.invalid).map((row) => row.id)
    };
  }

  previewImport(payload, mode = 'merge') {
    return planProfileImport(payload, this.#importBase(), mode).summary;
  }

  importSafe(payload, mode = 'merge') {
    const plan = planProfileImport(payload, this.#importBase(), mode);
    this.store.update((data) => {
      // Rows that fail validation are kept exactly as stored: the plan only
      // knows the valid ones, in their stored order, followed by new ones.
      const valid = new Set(this.#rows(data).map((row, index) => (row.invalid ? -1 : index)).filter((index) => index >= 0));
      let next = 0;
      const merged = data.profiles.map((row, index) => (valid.has(index) ? plan.profiles[next++] : row));
      return { ...data, profiles: [...merged, ...plan.profiles.slice(next)], snippets: plan.snippets };
    });
    return { ...plan.summary, profiles: this.listAll(), snippets: this.snippets() };
  }

}

// Every field of a stored profile, by the kind of value it holds. A stored row
// that fails validation is shown with these fields at full length, so the
// editor is filled with what is really stored and saving it changes only what
// the user changed. Anything else in the row (unknown or injected keys, values
// of the wrong kind) is not carried.
const STRING_FIELDS = [
  'name', 'protocol', 'group', 'host', 'username', 'identityFile', 'knownHostsFile', 'sshAlias', 'transferMode',
  'credentialId', 'credentialKind', 'tabColor', 'startupCommand', 'proxyJump', 'sftpRoot', 'ftpsMode', 'device',
  'rdpDomain', 'terminalTheme', 'terminalFontFamily', 'terminalCursorStyle', 'notes', 'createdAt', 'updatedAt'
];
const NUMBER_FIELDS = ['port', 'keepAliveSeconds', 'baudRate', 'rdpWidth', 'rdpHeight', 'terminalFontSize', 'terminalScrollback'];
const BOOLEAN_FIELDS = [
  'favorite', 'useSshConfig', 'trackRemoteCwd', 'compression', 'agentForwarding', 'x11Forwarding', 'rdpAudio',
  'inheritTerminalDefaults', 'terminalCursorBlink'
];
const BOOLEAN_DEFAULTS = { useSshConfig: true, terminalCursorBlink: true };
// The longest value normalizeProfile accepts for each text field (validation.cjs),
// and for the two lists. The view of an invalid row is cut to these, so a
// hand-edited profiles.json cannot send an oversized value to the window. A value
// that was cut is still the stored row's own text up to that length; the stored
// row itself is never changed by reading it. The id is not cut: it is the key the
// window uses to edit or delete the row, so it must match the stored row exactly.
const STRING_LIMITS = {
  name: 120, protocol: 16, group: 80, host: 255, username: 128, identityFile: 4096, knownHostsFile: 4096,
  sshAlias: 255, transferMode: 16, credentialId: 128, credentialKind: 16, tabColor: 32, startupCommand: 2048,
  proxyJump: 512, sftpRoot: 4096, ftpsMode: 16, device: 4096, rdpDomain: 128, terminalTheme: 32,
  terminalFontFamily: 240, terminalCursorStyle: 32, notes: 4096, createdAt: 64, updatedAt: 64
};
const LIST_LIMITS = { tags: { items: 24, length: 48 }, sshAliases: { items: 128, length: 255 } };

function capped(value, limit = 512) {
  return value.length <= limit ? value : value.trim().slice(0, limit);
}

function cappedList(value, { items, length }) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string').slice(0, items).map((entry) => capped(entry, length)) : [];
}

// A text field as the editor hands it back: line ends as LF (a textarea does this),
// then trimmed (every input does this).
function editorText(value) {
  return value.replace(/\r\n?/gu, '\n').trim();
}

function keepUncut(source, stored) {
  for (const field of STRING_FIELDS) {
    const value = stored[field];
    if (typeof value === 'string' && value.length > (STRING_LIMITS[field] ?? 512) && typeof source[field] === 'string'
      && editorText(source[field]) === editorText(capped(value, STRING_LIMITS[field]))) delete source[field];
  }
  for (const [field, limits] of Object.entries(LIST_LIMITS)) {
    const value = stored[field];
    if (!Array.isArray(value) || !Array.isArray(source[field])) continue;
    const cut = cappedList(value, limits);
    if (JSON.stringify(cut) !== JSON.stringify(value) && JSON.stringify(source[field]) === JSON.stringify(cut)) delete source[field];
  }
}

function withAliasGroups(own, data) {
  return { ...own, sshAliases: [...(Array.isArray(own.sshAliases) ? own.sshAliases : []), ...(data?.sshAliasGroups?.[own.id] || [])] };
}

// What the profile list shows for a stored row that fails validation, and what
// the editor is filled from: the row's own values (strings, numbers, booleans
// and lists of strings), the reason, and the field to fix.
function invalidView(row, error, data) {
  const source = row && typeof row === 'object' && !Array.isArray(row) ? withAliasGroups(row, data) : {};
  const view = { id: typeof source.id === 'string' ? source.id : '' };
  for (const field of STRING_FIELDS) if (field !== 'id' && typeof source[field] === 'string') view[field] = capped(source[field], STRING_LIMITS[field]);
  for (const field of NUMBER_FIELDS) if (Number.isFinite(source[field])) view[field] = source[field];
  // A flag the row never had reads as normalizeProfile would read it.
  for (const field of BOOLEAN_FIELDS) view[field] = typeof source[field] === 'boolean' ? source[field] : BOOLEAN_DEFAULTS[field] ?? false;
  view.name = capped(view.name || view.host || view.id || '', STRING_LIMITS.name);
  view.protocol ||= 'ssh';
  view.group = view.group || 'Connections';
  if (!(Number.isInteger(source.port) && source.port >= 1 && source.port <= 65535)) delete view.port;
  view.tags = cappedList(source.tags, LIST_LIMITS.tags);
  view.sshAliases = cappedList(source.sshAliases, LIST_LIMITS.sshAliases);
  view.invalid = { field: typeof error?.field === 'string' ? error.field : '', message: String(error?.message || 'invalid entry') };
  return view;
}

module.exports = { ProfileStore };
