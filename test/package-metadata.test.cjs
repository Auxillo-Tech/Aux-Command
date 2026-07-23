'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('package metadata and license declare free open-source distribution', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const licenseText = fs.readFileSync('LICENSE', 'utf8');
  const readme = fs.readFileSync('README.md', 'utf8');
  const roadmap = fs.readFileSync('docs/ROADMAP.md', 'utf8');

  assert.equal(packageJson.private, false);
  assert.equal(packageJson.license, 'AGPL-3.0-or-later');
  assert.match(licenseText, /GNU AFFERO GENERAL PUBLIC LICENSE/u);
  assert.match(licenseText, /Version 3/u);
  assert.match(readme, /free and open-source software licensed under \*\*AGPL-3\.0-or-later\*\*/u);
  assert.match(readme, /no enterprise-only modules, paid editions, or payment walls/u);
  assert.match(roadmap, /Every feature in this roadmap targets the public build/u);
  assert.doesNotMatch(readme, /proprietary unless Auxillo publishes/u);
});
