/* Shared, deterministic view operations; no network or filesystem access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AuxWorkspace = api;
})(typeof window === 'undefined' ? globalThis : window, () => {
  'use strict';
  const words = (query) => String(query || '').trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  function matches(value, query) {
    const text = String(value || '').toLocaleLowerCase();
    return words(query).every((word) => text.includes(word));
  }
  const searchCache = new WeakMap();
  function searchText(profile) {
    if (!searchCache.has(profile)) searchCache.set(profile, [profile.name, profile.host, profile.port ? `${profile.host}:${profile.port} ${profile.port}` : '', profile.username, profile.group, profile.protocol, profile.sshAlias, profile.device, ...(profile.tags || []), ...(profile.sshAliases || [])].join(' ').toLocaleLowerCase());
    return searchCache.get(profile);
  }
  function duplicates(profiles) {
    const groups = new Map();
    for (const p of profiles) {
      if (['local', 'serial'].includes(p.protocol)) continue;
      const key = JSON.stringify([p.protocol, String(p.host).toLowerCase(), p.port, p.username, p.proxyJump, p.identityFile, p.sshAlias, p.useSshConfig]);
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p.id);
    }
    return [...groups.values()].filter(ids => ids.length > 1);
  }
  function filterProfiles(profiles, query, mode = 'all', activeIds = new Set()) {
    const terms = words(query);
    return profiles.filter(profile => (mode !== 'favorites' || profile.favorite) && (mode !== 'active' || activeIds.has(profile.id)) && terms.every(word => searchText(profile).includes(word)));
  }

  function visibleFiles(entries, { query = '', hidden = true, sort = 'name' } = {}) {
    const timestamp = (value) => Date.parse(value) || 0;
    return entries.filter((entry) => (hidden || !entry.name.startsWith('.')) && matches(entry.name, query))
      .sort((a, b) => Number(Boolean(b.directory)) - Number(Boolean(a.directory)) ||
        (sort === 'size' ? (Number(b.size) || 0) - (Number(a.size) || 0) :
          sort === 'modified' ? timestamp(b.modifiedAt) - timestamp(a.modifiedAt) : 0) ||
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }
  return { matches, filterProfiles, visibleFiles, duplicates };
});
