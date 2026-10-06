'use strict';
const { randomUUID } = require('node:crypto');
const { normalizeProfile, normalizeSnippet } = require('./validation.cjs');

function sameConnection(a, b) {
  return ['protocol', 'host', 'port', 'username', 'sshAlias', 'useSshConfig', 'identityFile', 'credentialKind', 'proxyJump'].every(key => a[key] === b[key]);
}

function comparable(record) {
  return JSON.stringify(Object.fromEntries(Object.entries(record)
    .filter(([key]) => !['id', 'createdAt', 'updatedAt', 'credentialId'].includes(key)).sort(([a], [b]) => a.localeCompare(b))));
}

function planProfileImport(payload, current, mode = 'merge') {
  if (!['merge', 'update', 'copy'].includes(mode)) throw new Error('Choose merge, update or copy for this import');
  if (!payload || payload.format !== 'aux-command-profiles' || !Array.isArray(payload.profiles)) throw new Error('Choose an Aux Command JSON export; SSH configuration uses the Import SSH config button');
  if (payload.version !== undefined && payload.version !== 1) throw new Error(`Unsupported profile export version: ${payload.version}`);
  if (payload.profiles.length > 5000) throw new Error('An import may contain at most 5000 profiles');
  if (payload.snippets !== undefined && !Array.isArray(payload.snippets)) throw new Error('The export snippets must be a list');
  if ((payload.snippets || []).length > 1000) throw new Error('An import may contain at most 1000 snippets');
  const parse = (items, normalize, kind) => items.map((item, index) => {
    try { return normalize({ ...item, credentialId: '' }); }
    catch (error) { throw new Error(`${kind} ${index + 1}: ${error.message}`); }
  });
  const imported = parse(payload.profiles, normalizeProfile, 'Profile');
  for (const profile of imported) {
    if (profile.id === 'local-shell' && profile.protocol !== 'local') throw new Error('The local-shell ID is reserved for a local terminal');
    if (['__proto__', 'prototype', 'constructor'].includes(profile.id)) throw new Error('Invalid reserved profile ID');
  }
  const snippets = parse(payload.snippets || [], normalizeSnippet, 'Snippet');
  if (mode !== 'copy') {
    for (const [label, records] of [['profile', imported], ['snippet', snippets]]) {
      const ids = new Set();
      for (const record of records) {
        if (ids.has(record.id)) throw new Error(`Duplicate ${label} ID in the import; use separate copies or repair the export`);
        ids.add(record.id);
      }
    }
  }
  const summary = { added: 0, updated: 0, skipped: 0, conflicts: 0, snippetsAdded: 0, snippetsUpdated: 0, snippetsSkipped: 0, startupCommands: imported.filter(p => p.startupCommand).length };
  function merge(rows, incoming, kind) {
    const result = structuredClone(rows);
    for (const record of incoming) {
      const sameId = result.findIndex(p => p.id === record.id);
      const exact = result.findIndex(p => comparable(p) === comparable(record));
      const alias = kind === 'profile' && record.protocol === 'ssh' && record.useSshConfig && record.sshAlias
        ? result.findIndex(p => p.protocol === 'ssh' && p.useSshConfig && (p.sshAlias === record.sshAlias || p.sshAliases?.includes(record.sshAlias))) : -1;
      const index = sameId >= 0 ? sameId : exact >= 0 ? exact : alias;
      const counter = action => kind === 'profile' ? action : `snippets${action[0].toUpperCase()}${action.slice(1)}`;
      if (mode !== 'copy' && index >= 0) {
        const existing = result[index];
        if (comparable(existing) === comparable(record)) { summary[counter('skipped')]++; continue; }
        summary.conflicts++;
        if (mode === 'merge' || (existing.id === 'local-shell' && record.protocol !== 'local')) { summary[counter('skipped')]++; continue; }
        result[index] = { ...record, id: existing.id, createdAt: existing.createdAt, ...(kind === 'profile' ? { credentialId: sameConnection(existing, record) ? existing.credentialId || '' : '' } : {}) };
        summary[counter('updated')]++;
      } else {
        // Explicit copies always get new IDs; repeated identical imports do not.
        if (mode === 'copy' || result.some(p => p.id === record.id)) record.id = randomUUID();
        result.push(record); summary[counter('added')]++;
      }
    }
    return result;
  }
  const profiles = merge(current.profiles || [], imported, 'profile');
  const mergedSnippets = merge(current.snippets || [], snippets, 'snippet');
  return { summary, profiles, snippets: mergedSnippets };
}
module.exports = { planProfileImport, sameConnection };
