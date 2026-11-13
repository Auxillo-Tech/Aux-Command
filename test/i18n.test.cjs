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
  const base = normalizeUiSettings(undefined);
  assert.equal(base.language, 'en');
  assert.equal(base.density, 'comfortable');
  assert.equal(base.sidebarHidden, false);
  assert.deepEqual(normalizeUiSettings({ language: 'de' }), { ...base, language: 'de' });
  assert.deepEqual(normalizeUiSettings({ language: 'xx' }), base);
  const codes = LANGUAGES.map(([code]) => code);
  for (const code of codes) assert.equal(normalizeUiSettings({ language: code }).language, code);
});

test('dialog messages translate every supplied message in all supported languages', () => {
 assert.ok(Object.keys(AuxI18n.MESSAGES).length>70);
 for(const [source,catalog] of Object.entries(AuxI18n.MESSAGES)) {
  assert.equal(catalog.en,source);
  for(const [language] of LANGUAGES) {assert.equal(typeof catalog[language],'string');assert.ok(catalog[language].trim());}
 }
 setLanguage('pt');assert.equal(AuxI18n.message('Save current workspace'),'Guardar área de trabalho atual');
 setLanguage('ja');assert.equal(AuxI18n.message('Folder'),'フォルダー');
 assert.equal(AuxI18n.message('/tmp/untouched user data'),'/tmp/untouched user data');setLanguage('en');
});

test('dialog interpolation preserves data and supports numbered placeholders', () => {
 setLanguage('en');
 assert.equal(AuxI18n.message('Connect to {p0}', {p0:'production <server>'}),'Connect to production <server>');
 assert.equal(AuxI18n.message('Path {p0}, count {count}', {p0:'/tmp/{count}',count:2}),'Path /tmp/{count}, count 2');
});

test('registered UI messages preserve substitutions in every language',()=>{
 const sources=require('../scripts/ui-message-sources.json');
 for(const source of sources){
  const entry=AuxI18n.MESSAGES[source]; assert.ok(entry,source);
  const placeholders=s=>(s.match(/\{[a-zA-Z][a-zA-Z0-9]*\}/gu)||[]).sort();
  for(const [language] of LANGUAGES){assert.deepEqual(placeholders(entry[language]),placeholders(source),language+': '+source);assert.doesNotMatch(entry[language],/▁|ZQX\d+ZQX/u);}
 }
});

// ---- Source checks: text a user reads must go through the catalog ----

const { findUntranslated, translatedSources } = require('./renderer-strings.cjs');
const registeredSources = new Set(require('../scripts/ui-message-sources.json'));
const chromeSources = new Set(Object.values(CATALOGS.en));
const inCatalog = (source) => Object.hasOwn(AuxI18n.MESSAGES, source) || chromeSources.has(source);
const readSource = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// Text that is deliberately the same in every language. Keep this list short:
// a new entry needs a reason that fits one of these headings.
const SAME_IN_EVERY_LANGUAGE = new Set([
  // Protocol and option names, written as the tools and standards write them.
  'SSH', 'SFTP', 'FTP', 'FTPS', 'RDP', 'VNC', 'HTTPS', 'ProxyJump',
  // Fixed-width list badges: a local terminal, and a directory in the size column.
  'TERM', 'DIR',
  // Examples of what to type: host names, account names, paths and commands.
  'server.example.com', 'admin', 'CORP', 'logs',
  '~/.ssh/id_ed25519', '~/.ssh/known_hosts', '/dev/ttyUSB0', '/path/to/profiles.json', '/remote/path/profiles.json',
  'tmux attach || tmux new', 'systemctl status nginx --no-pager'
]);
// Key combinations are printed as they are on the keyboard.
const KEY_COMBINATION = /^Ctrl\+\S+$/u;
// Tables of English source strings that are translated where they are shown.
const TRANSLATED_AT_USE = ['TOUR_STEPS', 'THEME_LABELS'];

test('the registered message list and the catalog name exactly the same messages', () => {
  assert.equal(registeredSources.size, require('../scripts/ui-message-sources.json').length, 'a message is registered twice');
  assert.deepEqual(Object.keys(AuxI18n.MESSAGES).filter((source) => !registeredSources.has(source)), [], 'in the catalog but not registered');
  assert.deepEqual([...registeredSources].filter((source) => !Object.hasOwn(AuxI18n.MESSAGES, source)), [], 'registered but not in the catalog');
});

test('the renderer has no untranslated text in toasts, status messages, dialogs or labels', () => {
  const leftovers = findUntranslated(rendererSource, { deferredTables: TRANSLATED_AT_USE })
    .filter((hit) => !SAME_IN_EVERY_LANGUAGE.has(hit.text) && !KEY_COMBINATION.test(hit.text));
  assert.deepEqual(leftovers.map((hit) => `renderer.js:${hit.line} ${hit.where} ${JSON.stringify(hit.text)}`), [],
    'wrap these in uiText(...) and add them to the catalog, or add them to SAME_IN_EVERY_LANGUAGE with a reason');
  // The tables above really are translated where they are shown.
  assert.match(rendererSource, /elements\.tourTitle\.textContent = uiText\(step\.title\);/u);
  assert.match(rendererSource, /elements\.tourBody\.textContent = uiText\(step\.body\);/u);
  assert.match(rendererSource, /THEME_LABELS\[key\]/u);
  assert.match(rendererSource, /function themeLabel\(key\) \{[^}]*uiText\(/u);
});

test('the source scan itself catches the usual ways of leaving text untranslated', () => {
  const caught = (code) => findUntranslated(code).map((hit) => hit.text);
  assert.deepEqual(caught("toast('Saved the file', detail, 'success');"), ['Saved the file']);
  assert.deepEqual(caught("toast(uiText('Saved'), 'All files were written', 'success');"), ['All files were written']);
  assert.deepEqual(caught("setStatus('Loading files');"), ['Loading files']);
  assert.deepEqual(caught("setStatus(`Loaded ${count} files`);"), ['Loaded {} files']);
  assert.deepEqual(caught("showModal({ title: 'Delete file?', description: ok ? 'Really delete' : uiText('No') });"), ['Delete file?', 'Really delete']);
  assert.deepEqual(caught("node('button', { text: 'Run now', attrs: { 'aria-label': 'Run the task' } });"), ['Run now', 'Run the task']);
  assert.deepEqual(caught("input.placeholder = 'Search files';"), ['Search files']);
  assert.deepEqual(caught("status.textContent = 'Running on ' + count + ' sessions';"), ['Running on ', ' sessions']);
  assert.deepEqual(caught("throw new Error('Choose a file first');"), ['Choose a file first']);
  assert.deepEqual(caught("field('Host name', input, 'Where to connect');"), ['Host name', 'Where to connect']);
  assert.deepEqual(caught("selectInput('mode', [['auto', 'Automatic'], ['off', uiText('Off')]], value);"), ['Automatic']);
  assert.deepEqual(caught("uiText('{p0} group', { p0: open ? 'Collapse' : 'Expand' });"), ['Collapse', 'Expand']);
  assert.deepEqual(caught("function label(state) { return state.busy ? 'Working…' : uiText('Ready'); }"), ['Working…']);
  assert.deepEqual(caught("function ask({ title, label = 'Value' }) {}"), ['Value']);
  // Translated text, identifiers, comparisons and class names are left alone.
  assert.deepEqual(caught("toast(uiText('Saved'), uiText('{p0} files', { p0: count }), 'success'); setStatus(message, 'error');"), []);
  assert.deepEqual(caught("node('div', { className: 'warning-box full', text: uiText('Careful') }); if (kind === 'error') element.textContent = value;"), []);
  assert.deepEqual(caught("showModal({ title: uiText(changed ? 'Changed' : 'Same'), description: `${name} · ${host}` });"), []);
  assert.deepEqual(caught("const text = '// not a comment'; /* title: 'Not code' */ const pattern = /title: 'x'/u;"), []);
});

test('every message the renderer translates is in the catalog and registered', () => {
  const sources = translatedSources(rendererSource);
  assert.ok(sources.length > 900, `expected the renderer's messages, found ${sources.length}`);
  for (const source of sources) {
    assert.ok(inCatalog(source), `not in the catalog: ${source}`);
    if (!chromeSources.has(source)) assert.ok(registeredSources.has(source), `not in scripts/ui-message-sources.json: ${source}`);
  }
  // Tables that are translated where they are shown.
  const table = (name) => rendererSource.match(new RegExp(`const ${name} = [\\[{][\\s\\S]*?\\n  [\\]}];`, 'u'))?.[0] || '';
  const tourText = [...table('TOUR_STEPS').matchAll(/(?:title|body): '((?:[^'\\]|\\.)*)'/gu)].map((match) => match[1]);
  assert.equal(tourText.length, 12);
  for (const source of tourText) assert.ok(inCatalog(source), `tour text not in the catalog: ${source}`);
  const themeNames = [...table('THEME_LABELS').matchAll(/: '([^']+)'/gu)].map((match) => match[1]);
  assert.ok(themeNames.length >= 14);
  for (const source of themeNames) assert.ok(inCatalog(source), `theme name not in the catalog: ${source}`);
  // Network tool tabs: tool names stay as they are, the descriptive ones are translated.
  assert.match(rendererSource, /className: 'mini-button', text: uiText\(name\), attrs: \{ role: 'tab'/u);
  for (const source of ['DNS lookup', 'Port scan']) assert.ok(registeredSources.has(source), source);
});

test('index.html, the separate terminal window and the VNC viewer leave no text outside the catalog', () => {
  // index.html: every text node sits in an element that names its message.
  const visible = [...indexHtml.matchAll(/<([a-z0-9]+)([^>]*)>([^<]*\p{L}{2}[^<]*)</gu)]
    .filter(([, tag, attributes]) => !['title', 'script', 'style', 'kbd'].includes(tag) && !/data-i18n=|data-ui-message=/u.test(attributes))
    .map(([, tag, , text]) => `<${tag}> ${text.trim()}`);
  assert.deepEqual(visible, []);
  for (const match of indexHtml.matchAll(/data-ui-(?:message|title|aria|placeholder)="([^"]+)"/gu)) {
    const source = match[1].replaceAll('&amp;', '&');
    assert.ok(inCatalog(source), `index.html message not in the catalog: ${source}`);
  }
  for (const label of ['Quick connect', 'Pane size', 'Tile sessions', 'Find terminal', 'Close tab']) {
    assert.match(indexHtml, new RegExp(`</kbd> <span data-ui-message="${label}">${label}</span></span>`, 'u'));
  }

  // These two pages load only dialog-i18n.js, so their text must be in it.
  for (const [page, script] of [['src/renderer/detached.html', 'src/renderer/detached.js'], ['src/renderer/vnc.html', 'src/renderer/vnc.js']]) {
    const html = readSource(page);
    assert.match(html, /<script src="\.\/dialog-i18n\.js"><\/script>/u);
    const body = html.slice(html.indexOf('<body'));
    const marked = [...body.matchAll(/<[a-z0-9]+[^>]*\sdata-t[^>]*>([^<]+)</gu)].map((match) => match[1].trim());
    assert.ok(marked.length >= 3, page);
    const unmarked = [...body.matchAll(/<([a-z0-9]+)([^>]*)>([^<]*\p{L}{2}[^<]*)</gu)].filter(([, tag, attributes]) => !['script', 'style'].includes(tag) && !/\sdata-t\b/u.test(attributes));
    assert.deepEqual(unmarked.map((match) => match[3].trim()), [], page);
    const used = translatedSources(readSource(script), ['t']);
    assert.ok(used.length >= 3, script);
    for (const source of [...marked, ...used]) {
      assert.ok(Object.hasOwn(AuxI18n.MESSAGES, source), `${page}: not in dialog-i18n.js: ${source}`);
      assert.ok(registeredSources.has(source), `${page}: not registered: ${source}`);
    }
  }
  const detached = readSource('src/renderer/detached.js');
  assert.deepEqual(findUntranslated(detached).map((hit) => hit.text), [' — Aux Command'], 'only the product name in the window title is fixed');
  // The separate window follows the language the workspace stored.
  assert.match(detached, /localStorage\.getItem\('aux-command-language'\)/u);
  assert.match(rendererSource, /localStorage\.setItem\('aux-command-language', window\.AuxI18n\.getLanguage\(\)\)/u);
});

test('text written by the main process and shown by the renderer is in the catalog', () => {
  const literals = (relative, pattern) => [...readSource(relative).matchAll(pattern)].map((match) => match[1]);
  const expectRegistered = (sources, least, what) => {
    assert.ok(sources.length >= least, `${what}: found only ${sources.length}`);
    for (const source of sources) {
      assert.ok(Object.hasOwn(AuxI18n.MESSAGES, source), `${what} not in the catalog: ${source}`);
      assert.ok(registeredSources.has(source), `${what} not registered: ${source}`);
    }
  };
  // Prompts: message('…') source strings, including both sides of a ?: choice.
  expectRegistered(literals('src/main/lib/rdp-credentials.cjs', /message\('((?:[^'\\]|\\.)+)'/gu), 5, 'RDP prompt text');
  const sftp = readSource('src/main/services/sftp-service.cjs');
  const promptLines = sftp.split('\n').filter((line) => /\bmessage\(/u.test(line)).join('\n');
  expectRegistered([...promptLines.matchAll(/'((?:[^'\\]|\\.)*\p{L}{3}(?:[^'\\]|\\.)*)'/gu)].map((match) => match[1]).filter((text) => /\s|^[A-Z]/u.test(text)), 5, 'SSH prompt text');
  // SSH sign-in through OpenSSH's askpass: prompt text and the reasons a sign-in is stopped.
  const askpassLines = readSource('src/main/lib/ssh-askpass.cjs').split('\n').filter((line) => /\bmessage\(|this\.#abort\(|new Error\('/u.test(line)).join('\n');
  expectRegistered([...askpassLines.matchAll(/'((?:[^'\\]|\\.)*\p{L}{3}(?:[^'\\]|\\.)*)'/gu)].map((match) => match[1]).filter((text) => /\s|^[A-Z]/u.test(text)), 15, 'SSH askpass text');
  // Fixed errors from the services that sign in that way.
  for (const [file, least] of [['tunnel-service', 2], ['live-monitor', 3], ['rdp-gateway', 8]]) {
    expectRegistered(literals(`src/main/services/${file}.cjs`, /new Error\('([^']+)'\)/gu).filter((text) => !text.startsWith('Python 3 is required')), least, `${file} error`);
  }
  assert.match(rendererSource, /uiText\('Tunnel failed'\), uiText\(tunnel\.lastError\) \|\| tunnel\.name/u);
  // RDP sign-in failures.
  expectRegistered(literals('src/main/lib/rdp-credentials.cjs', /'((?:RDP sign-in|The RDP server|The secure connection)[^']*)'/gu).filter((text) => text !== 'RDP sign-in'), 11, 'RDP failure');
  // Why a session ended, and what to do about it.
  const { diagnoseConnection } = require('../src/main/lib/connection-diagnostics.cjs');
  const diagnoses = ['Host key verification failed', 'Could not resolve hostname x', 'kex_exchange_identification: closed', 'Permission denied (publickey,password).', 'no such identity: /tmp/key', 'Connection refused', 'Connection timed out', 'mosh-server: command not found', 'Permission denied']
    .map((output, index) => diagnoseConnection(index === 8 ? 'serial' : 'ssh', output));
  assert.equal(new Set(diagnoses.map((entry) => entry.category)).size, 9);
  expectRegistered(diagnoses.flatMap((entry) => [entry.title, entry.guidance]), 18, 'session diagnosis');
  // Recovery point names.
  expectRegistered([
    ...literals('src/main/ipc.cjs', /recoveryService\.snapshot\('([^']+)'\)/gu),
    ...literals('src/main/services/recovery-service.cjs', /this\.#replace\([^;]*, '([^']+)'\)/gu),
    ...literals('src/main/services/update-service.cjs', /snapshot\('([^']+)'\)/gu)
  ], 7, 'recovery point name');
  // Reasons shown by the dangerous-command confirmation.
  expectRegistered(literals('src/renderer/assist.js', /reason: '((?:[^'\\]|\\.)+)'/gu), 11, 'dangerous-command reason');
  assert.match(rendererSource, /uiText\(hit\.reason\)/u);
  assert.match(rendererSource, /uiText\(point\.reason\)/u);
  assert.match(rendererSource, /toast\(uiText\(diagnosis\.title\), uiText\(diagnosis\.guidance\), 'error'\);/u);
});

test('prompts written by Aux Command are translated; text from a server is shown as received', () => {
  // The dialog translates only through the `messages` field, which only the
  // application's own prompts carry.
  assert.match(rendererSource, /const own = data\.messages && typeof data\.messages === 'object' \? data\.messages : \{\};/u);
  assert.match(rendererSource, /Object\.hasOwn\(window\.AuxI18n\?\.MESSAGES \|\| \{\}, message\.text\)/u);
  assert.match(rendererSource, /title: promptText\(own\.name, data\.name\) \|\| uiText\('SSH authentication'\)/u);
  assert.match(rendererSource, /field\(promptText\(own\.prompts\?\.\[index\], prompt\.prompt\) \|\|/u);
  // OpenSSH's own host-key report is shown as received, in its own block, and
  // only an application prompt can suggest what to type.
  assert.match(rendererSource, /node\('pre', \{ className: 'prompt-received', text: details \}\)/u);
  assert.match(rendererSource, /typeof own\.prompts\?\.\[index\]\?\.placeholder === 'string'/u);
  assert.match(readSource('src/renderer/styles.css'), /\.prompt-received \{[^}]*font-family: var\(--mono\)[^}]*white-space: pre-wrap/u);
  assert.match(readSource('src/renderer/styles.css'), /\.warning-box \{[^}]*white-space: pre-wrap/u);
  // The path that relays a server's keyboard-interactive request adds no `messages`.
  const sftp = readSource('src/main/services/sftp-service.cjs');
  const relay = sftp.slice(sftp.indexOf('async function onKeyboardInteractive'), sftp.indexOf("client.on('keyboard-interactive', onKeyboardInteractive)"));
  assert.ok(relay.length > 200);
  assert.doesNotMatch(relay, /messages/u);
  // Substituted values are data: they are inserted once and never re-read as placeholders.
  setLanguage('de');
  assert.equal(AuxI18n.message('Password for {p0}', { p0: 'ops@{p0}.example' }), 'Passwort für ops@{p0}.example');
  assert.equal(AuxI18n.message('The SSH key {p0} is protected by a passphrase.', { p0: '/home/a/.ssh/id_ed25519' }), 'Der SSH-Schlüssel /home/a/.ssh/id_ed25519 ist durch eine Passphrase geschützt.');
  assert.equal(AuxI18n.message('Verification code: '), 'Verification code: ', 'a server prompt has no catalog entry and stays as sent');
  setLanguage('en');
});

test('native file-chooser titles follow the chosen language and fall back to English', () => {
  const { dialogTitle } = require('../src/main/lib/dialog-title.cjs');
  assert.equal(dialogTitle('Back up workspace', 'de'), AuxI18n.MESSAGES['Back up workspace'].de);
  assert.notEqual(dialogTitle('Back up workspace', 'de'), 'Back up workspace');
  assert.equal(dialogTitle('Select files to upload', 'pt'), 'Selecionar ficheiros para carregar');
  for (const language of ['en', 'xx', '', undefined, null, 7, 'constructor', '__proto__', 'DE']) {
    assert.equal(dialogTitle('Back up workspace', language), 'Back up workspace', String(language));
  }
  for (const source of ['Not a registered title', 'constructor', 'toString', '']) assert.equal(dialogTitle(source, 'de'), source);
  // Every chooser opened by the main process asks for its title this way.
  const ipc = readSource('src/main/ipc.cjs');
  const titles = [...ipc.matchAll(/title: chooserTitle\('([^']+)'\)/gu)].map((match) => match[1]);
  assert.equal(titles.length, 9);
  for (const source of titles) {
    assert.ok(registeredSources.has(source), `chooser title not registered: ${source}`);
    for (const [language] of LANGUAGES) if (language !== 'en') assert.notEqual(dialogTitle(source, language), source, `${language}: ${source}`);
  }
  assert.equal([...ipc.matchAll(/show(?:Open|Save)Dialog\(/gu)].length, 9);
  assert.doesNotMatch(ipc, /show(?:Open|Save)Dialog\([^;]*?title: '/u);
  assert.match(ipc, /dialogTitle\(source, settingsStore\?\.get\?\.\(\)\?\.ui\?\.language\)/u);
});
