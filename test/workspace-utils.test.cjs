'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterProfiles, visibleFiles, matches } = require('../src/renderer/workspace-utils.js');
test('connection search combines terms across fields, aliases and view filters', () => {
  const profiles = [
    { id: 'a', name: 'Production', host: 'db1', protocol: 'ssh', favorite: true, sshAliases: ['database'] },
    { id: 'b', name: 'Production web', host: 'web2', protocol: 'ssh' }
  ];
  assert.deepEqual(filterProfiles(profiles, 'DATABASE ssh').map(p => p.id), ['a']);
  assert.deepEqual(filterProfiles(profiles, 'production', 'favorites').map(p => p.id), ['a']);
  assert.deepEqual(filterProfiles(profiles, 'ssh', 'active', new Set(['b'])).map(p => p.id), ['b']);
  assert.equal(filterProfiles(profiles, 'missing').length, 0);
  assert.equal(matches('Live server monitor', 'monitor live'), true);
});
test('file views keep directories first, sort naturally and do not mutate source', () => {
  const entries = [
    { name: 'file10', size: 10, modifiedAt: '2026-01-01' },
    { name: '.env', size: 40 },
    { name: 'file2', size: 50, modifiedAt: '2026-02-01' },
    { name: 'z-folder', directory: true }
  ];
  assert.deepEqual(visibleFiles(entries, { hidden: false }).map(e => e.name), ['z-folder', 'file2', 'file10']);
  assert.deepEqual(visibleFiles(entries, { query: 'FILE', sort: 'modified' }).map(e => e.name), ['file2', 'file10']);
  assert.deepEqual(visibleFiles(entries, { sort: 'size' }).map(e => e.name), ['z-folder', 'file2', '.env', 'file10']);
  assert.equal(entries[0].name, 'file10');
});

test('connection search matches ports and serial devices', () => {
  const list = [{ id: 'a', name: 'Lab', host: '127.0.0.1', port: 2299, protocol: 'ssh' }, { id: 'b', name: 'Switch', protocol: 'serial', device: '/dev/ttyUSB0' }];
  assert.deepEqual(filterProfiles(list, '2299').map((p) => p.id), ['a']);
  assert.deepEqual(filterProfiles(list, 'ttyUSB0').map((p) => p.id), ['b']);
});
