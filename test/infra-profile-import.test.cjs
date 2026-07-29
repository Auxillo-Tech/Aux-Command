'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { defaultInfraProfiles } = require('../src/main/lib/command-builder.cjs');
const { ProfileStore } = require('../src/main/lib/profile-store.cjs');

const commandBuilderSource = fs.readFileSync(path.join(__dirname, '../src/main/lib/command-builder.cjs'), 'utf8');

test('public application defaults do not embed private infrastructure topology', () => {
  assert.deepEqual(defaultInfraProfiles(), []);
  assert.doesNotMatch(commandBuilderSource, /77\.42\.3\.71|148\.251\.203\.93|10\.10\.0\.(?:10|11|14|20|102)/u);
  assert.doesNotMatch(commandBuilderSource, /identityFile:\s*['"]~\/\.ssh\/id_/u);
});

test('fresh ProfileStore contains only the local connection and generic snippets', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-profile-defaults-'));
  try {
    const store = new ProfileStore(directory);
    const profiles = store.list();
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].id, 'local-shell');
    assert.equal(profiles[0].protocol, 'local');
    assert.ok(store.snippets().length >= 4);
    assert.doesNotMatch(JSON.stringify(store.snippets()), /AMI|Auxillo|WireGuard|WARP|10\.10\.0\./u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
