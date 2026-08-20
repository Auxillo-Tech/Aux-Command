'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AuxI18n = require('../src/renderer/i18n.js');
const { CATALOGS, LANGUAGES, t, setLanguage, profileCount } = AuxI18n;

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'src/preload/index.cjs'), 'utf8');
const ipcSource = fs.readFileSync(path.join(root, 'src/main/ipc.cjs'), 'utf8');

test('every language catalog has exactly the English key set with non-empty values', () => {
  const enKeys = Object.keys(CATALOGS.en).sort();
  assert.ok(enKeys.length >= 70);
  for (const [code] of LANGUAGES) {
    const catalog = CATALOGS[code];
    assert.ok(catalog, `missing catalog for ${code}`);
    assert.deepEqual(Object.keys(catalog).sort(), enKeys, `${code} key set differs from en`);
    for (const [key, value] of Object.entries(catalog)) {
      assert.equal(typeof value, 'string', `${code}.${key} not a string`);
      assert.ok(value.trim().length > 0, `${code}.${key} empty`);
    }
  }
});

test('non-English catalogs actually translate the visible chrome', () => {
  // Keys that must differ from English in every language (SFTP/Sync-style
  // technical labels are allowed to match).
  const mustDiffer = ['quick.connect', 'sidebar.connections', 'welcome.title', 'tour.next', 'sftp.upload', 'status.noSession'];
  for (const [code] of LANGUAGES) {
    if (code === 'en') continue;
    for (const key of mustDiffer) {
      assert.notEqual(CATALOGS[code][key], CATALOGS.en[key], `${code}.${key} left untranslated`);
    }
  }
});

test('t() resolves the active language and falls back safely', () => {
  setLanguage('de');
  assert.equal(t('quick.connect'), 'Verbinden');
  setLanguage('nope');
  assert.equal(AuxI18n.getLanguage(), 'en');
  assert.equal(t('quick.connect'), 'Connect');
  assert.equal(t('missing.key'), 'missing.key');
  setLanguage('en');
});

test('profileCount applies real plural rules including Russian forms', () => {
  setLanguage('en');
  assert.equal(profileCount(1), '1 profile');
  assert.equal(profileCount(3), '3 profiles');
  setLanguage('de');
  assert.equal(profileCount(1), '1 Profil');
  assert.equal(profileCount(2), '2 Profile');
  setLanguage('ru');
  assert.equal(profileCount(1), '1 профиль');
  assert.equal(profileCount(3), '3 профиля');
  assert.equal(profileCount(5), '5 профилей');
  assert.equal(profileCount(11), '11 профилей');
  assert.equal(profileCount(21), '21 профиль');
  setLanguage('ja');
  assert.equal(profileCount(2), '2件のプロファイル');
  setLanguage('en');
});

test('index.html chrome is instrumented and i18n is wired end to end', () => {
  assert.match(indexHtml, /<script src="\.\/i18n\.js"><\/script>/u);
  assert.match(indexHtml, /id="language-select"/u);
  assert.ok((indexHtml.match(/data-i18n=/gu) || []).length >= 40, 'expected at least 40 data-i18n attributes');
  assert.ok((indexHtml.match(/data-i18n-title=/gu) || []).length >= 12);
  // every data-i18n key referenced in the HTML must exist in the en catalog
  for (const match of indexHtml.matchAll(/data-i18n(?:-title|-placeholder|-aria)?="([^"]+)"/gu)) {
    assert.ok(match[1] in CATALOGS.en, `unknown i18n key in HTML: ${match[1]}`);
  }
  assert.match(rendererSource, /function initializeLanguage\(settings\)/u);
  assert.match(rendererSource, /initializeLanguage\(initial\.settings\);/u);
  assert.match(rendererSource, /window\.AuxI18n\.profileCount\(state\.profiles\.length\)/u);
  assert.match(rendererSource, /window\.AuxI18n\.t\('toolbar\.tiled'\)/u);
  assert.match(preloadSource, /saveUiSettings: \(ui\) => invoke\('app:save-ui-settings', ui\)/u);
  assert.match(ipcSource, /handle\('app:save-ui-settings', \(ui\) => settingsStore\.saveUi\(ui\)\)/u);
});

test('ui settings normalize to the supported language whitelist', () => {
  const { normalizeUiSettings } = require('../src/main/lib/settings-store.cjs');
  assert.deepEqual(normalizeUiSettings(undefined), { language: 'en' });
  assert.deepEqual(normalizeUiSettings({ language: 'de' }), { language: 'de' });
  assert.deepEqual(normalizeUiSettings({ language: 'xx' }), { language: 'en' });
  const codes = LANGUAGES.map(([code]) => code);
  for (const code of codes) assert.equal(normalizeUiSettings({ language: code }).language, code);
});
