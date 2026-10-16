'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const status = read('docs/RELEASE_STATUS.md');
const published = status.match(/latest published release is \*\*v(\d+\.\d+\.\d+)\*\*/u)?.[1];
assert.ok(published, 'release status must identify a published version');
const supportedSeries = published.split('.').slice(0, 2).join('.');

for (const language of ['de', 'es', 'fr', 'it', 'ja', 'pt', 'ru', 'zh']) {
  test(`published downloads in ${language} use the published release`, () => {
    const text = read(`README.${language}.md`);
    assert.ok(text.includes(`**${published}**`), 'current version must be the published version');
    const versions = [...text.matchAll(/Aux-Command-(\d+\.\d+\.\d+)-/gu)].map((match) => match[1]);
    assert.ok(versions.length >= 4, 'expected packaged installation examples');
    assert.deepEqual([...new Set(versions)], [published]);
  });
}

test('website download examples use only the published release', () => {
  const versions = [...read('website/index.html').matchAll(/Aux-Command-(\d+\.\d+\.\d+)-/gu)].map((match) => match[1]);
  assert.ok(versions.length >= 3, 'expected website installation examples');
  assert.deepEqual([...new Set(versions)], [published]);
});

test('both security policies support the currently published series', () => {
  for (const name of ['SECURITY.md', '.github/SECURITY.md']) {
    assert.ok(read(name).includes(`| ${supportedSeries}.x | Active |`), name);
    assert.ok(read(name).includes(`| < ${supportedSeries} | Not supported; upgrade to the latest release |`), name);
  }
});


test('binary AUR package pins the published AppImage version and digest', () => {
  const recipe = read('packaging/aur/aux-command-bin/PKGBUILD');
  assert.equal(recipe.match(/^pkgver=(\S+)$/mu)?.[1], published);
  const digest = read('packaging/flatpak/tech.auxillo.command.yml').match(/sha256: ([a-f0-9]{64})/u)?.[1];
  assert.ok(digest, 'the published AppImage digest is recorded');
  assert.ok(recipe.includes(`sha256sums=('${digest}')`));
});
