'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('flatpak manifest uses the canonical app id and Electron base app', () => {
  const manifest = read('packaging/flatpak/tech.auxillo.command.yml');
  assert.match(manifest, new RegExp(`app-id: ${pkg.build.appId.replace(/\./gu, '\\.')}`, 'u'));
  assert.match(manifest, /base: org\.electronjs\.Electron2\.BaseApp/u);
  assert.match(manifest, /command: aux-command/u);
  // SSH config access and the secret-service credential store are declared.
  assert.match(manifest, /--filesystem=~\/\.ssh/u);
  assert.match(manifest, /--talk-name=org\.freedesktop\.secrets/u);
});

test('flatpak metainfo is valid AppStream with the AGPL license and app id', () => {
  const metainfo = read('packaging/flatpak/tech.auxillo.command.metainfo.xml');
  assert.match(metainfo, /<id>tech\.auxillo\.command<\/id>/u);
  assert.match(metainfo, /<project_license>AGPL-3\.0-or-later<\/project_license>/u);
  assert.match(metainfo, new RegExp(`<release version="${pkg.version}"`, 'u'));
  assert.match(metainfo, /<launchable type="desktop-id">tech\.auxillo\.command\.desktop<\/launchable>/u);
});

test('desktop entry launches the packaged binary with the network category', () => {
  const desktop = read('packaging/flatpak/tech.auxillo.command.desktop');
  assert.match(desktop, /^Exec=aux-command %U$/mu);
  assert.match(desktop, /^Icon=tech\.auxillo\.command$/mu);
  assert.match(desktop, /Categories=.*Network.*/u);
});

test('AUR PKGBUILDs match the current version and hard dependencies', () => {
  for (const rel of ['packaging/aur/aux-command-bin/PKGBUILD', 'packaging/aur/aux-command/PKGBUILD']) {
    const pkgbuild = read(rel);
    assert.match(pkgbuild, new RegExp(`pkgver=${pkg.version.replace(/\./gu, '\\.')}`, 'u'), `${rel} pkgver`);
    assert.match(pkgbuild, /license=\('AGPL-3\.0-or-later'\)/u, `${rel} license`);
    assert.match(pkgbuild, /depends=\('openssh' 'python'/u, `${rel} depends`);
    assert.match(pkgbuild, /freerdp: RDP sessions/u, `${rel} optdepends`);
  }
});

test('website kit references bundled assets and current version', () => {
  const html = read('website/index.html');
  // Every referenced local asset exists.
  for (const match of html.matchAll(/(?:src|href)="((?:assets|screenshots)\/[^"]+)"/gu)) {
    assert.ok(fs.existsSync(path.join(root, 'website', match[1])), `missing website asset ${match[1]}`);
  }
  assert.match(html, /<title>Aux Command/u);
  assert.match(html, new RegExp(`Aux-Command-${pkg.version.replace(/\./gu, '\\.')}-x86_64\\.AppImage`, 'u'));
  assert.match(html, /auxillo\.tech/u);
  assert.match(html, /AGPL-3\.0/u);
  // Section tags are balanced.
  assert.equal((html.match(/<section/gu) || []).length, (html.match(/<\/section>/gu) || []).length);
});

test('release-pinned packaging carries a real AppImage checksum, not a placeholder', () => {
  const flatpak = read('packaging/flatpak/tech.auxillo.command.yml');
  const aurBin = read('packaging/aur/aux-command-bin/PKGBUILD');
  // The AppImage-pinned manifests must reference a 64-hex SHA-256, never a placeholder.
  assert.doesNotMatch(flatpak, /REPLACE_WITH_APPIMAGE_SHA256/u);
  assert.match(flatpak, /sha256: [0-9a-f]{64}\b/u);
  assert.match(aurBin, /sha256sums=\('[0-9a-f]{64}'\)/u);
  // The from-source AUR build legitimately uses SKIP (git tag provides integrity).
  assert.match(read('packaging/aur/aux-command/PKGBUILD'), /sha256sums=\('SKIP'\)/u);
});
