'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeProfile } = require('../src/main/lib/validation.cjs');
const messages = require('../src/shared/validation-messages.js');
const dialog = require('../src/renderer/dialog-i18n.js');
const sources = require('../scripts/ui-message-sources.json');

const ssh = (fields) => normalizeProfile({ name: 'x', protocol: 'ssh', host: 'h.example', ...fields });
const refuses = (fields, field) => assert.throws(() => ssh(fields), (error) => error.code === 'VALIDATION_ERROR' && error.field === field, JSON.stringify(fields));

test('ProxyJump is checked hop by hop as [user@]host[:port]', () => {
  const good = [
    'bastion', 'user@bastion', 'user@bastion:2222', 'bastion:22', 'a.b-c_d.example', '10.0.0.1', 'jd@10.0.0.1:2200',
    '[::1]:22', '[::1]', 'jd@[fe80::1]:2222', '[2001:db8::7]', 'user@host:2222,host2', 'one,two:2222,[::1]:22',
    'jd@corp.example', 'münchen.example', 'user.name@bastion'
  ];
  for (const value of good) assert.equal(ssh({ proxyJump: value }).proxyJump, value, value);
  const bad = [
    // The reviewed injection: brace expansion in a hop ran a command through the shell on OpenSSH < 9.6.
    '{touch,/tmp/f}', 'a{b,c}', '{a,b}@host', 'user@{touch,/tmp/f}', 'user@host:{22,23}', 'host,{touch,/tmp/f}',
    '~', '~/x', 'user@~', '!host', 'host#x', 'host!', 'user@host#',
    '-oProxyCommand=x', 'ok,-oProxyCommand=x', '-J', 'user@-host',
    '[', ']', 'host]', '[host', '[::1', '::1]', '[not-an-ip]', '[::1]x', '[::1]:', '[::1]:0', '[::1]:65536', '[]', '[::1]:2:2',
    '::1', '2001:db8::7', 'fe80::1:22', 'host:', 'host:0', 'host:65536', 'host:abc', 'host:1:2', ':22', '@host', 'user@', 'user@@host',
    'a,,b', ',a', 'a,', 'host name', 'host;x', 'host$(x)', 'host`x`', 'host|x', 'a&b', 'a<b', 'a>b', "a'b", 'a"b', 'a\\b', 'a*b', 'a?b', 'a(b)',
    'user[1]@host', 'us{er}@host', 'user~1@host', 'user!@host', 'user#@host'
  ];
  for (const value of bad) refuses({ proxyJump: value }, 'proxyJump');
});

test('a hop user holds only user-name characters: no percent, and no other punctuation', () => {
  for (const value of ['%r@host', 'x%d@host', 'u%h@host:22', 'jd%@[::1]', '%@host']) refuses({ proxyJump: value }, 'proxyJump');
  for (const value of ['u^x@h', 'u/x@h', 'u:x@h', 'u=x@h', 'u"x@h']) refuses({ proxyJump: value }, 'proxyJump');
  for (const value of ['jd@host', 'j.d_x-1@host', 'jd+tag@host', 'jd@corp.example@bastion', 'münchen@host']) assert.equal(ssh({ proxyJump: value }).proxyJump, value, value);
});

test('an IPv6 zone id is letters, digits, dot, underscore and hyphen, never starting with a hyphen', () => {
  const goodZones = ['eth0', 'enp3s0', 'br-lan', 'a.b', '1'];
  const badZones = ['-E', '-Einj', '{a..c}', '!x', '~', '#', '[x', 'a]b', '%r', '^', 'a b', 'a/b', 'a:b'];
  for (const zone of goodZones) {
    assert.equal(ssh({ host: `fe80::1%${zone}` }).host, `fe80::1%${zone}`, zone);
    assert.equal(ssh({ proxyJump: `[fe80::1%${zone}]:22` }).proxyJump, `[fe80::1%${zone}]:22`, zone);
    assert.equal(ssh({ proxyJump: `jd@[fe80::1%${zone}]` }).proxyJump, `jd@[fe80::1%${zone}]`, zone);
  }
  for (const zone of badZones) {
    refuses({ host: `fe80::1%${zone}` }, 'host');
    refuses({ host: `[fe80::1%${zone}]` }, 'host');
    refuses({ proxyJump: `[fe80::1%${zone}]:22` }, 'proxyJump');
    refuses({ proxyJump: `jd@[fe80::1%${zone}]` }, 'proxyJump');
  }
  refuses({ host: 'fe80::1%' }, 'host');
  refuses({ proxyJump: '[fe80::1%]' }, 'proxyJump');
  // A zone on something that is not an IPv6 address is not a zone.
  refuses({ host: 'example.com%eth0' }, 'host');
  refuses({ host: '1.2.3.4%eth0' }, 'host');
});

test('the per-hop check is what refuses a hop that only breaks the hop grammar', () => {
  // None of these hold a shell character, so only the hop-by-hop grammar can refuse them.
  for (const value of ['a,,b', 'host:', '[::1]x', '::1', 'user@@host', ':22', 'host:99999', '@host', '[host', 'host]']) refuses({ proxyJump: value }, 'proxyJump');
});

test('host and SSH alias refuse brace, bracket, tilde, bang and hash characters but keep real names', () => {
  for (const value of ['server.example.com', 'srv_1', 'srv-1', '10.0.0.5', '::1', '2001:db8::7', '[::1]', 'münchen.example']) assert.equal(ssh({ host: value }).host, value, value);
  for (const value of ['{a,b}', 'a{b}', '[a]', 'a[1]', '~x', '!x', 'x#', 'a b', 'a:b', '[::1', 'host]', '[not-ip]', 'a/b', 'a@b']) refuses({ host: value }, 'host');
  for (const value of ['prod', 'prod.example', 'web_1', 'web-1', 'Web1']) assert.equal(ssh({ sshAlias: value }).sshAlias, value, value);
  for (const value of ['{a,b}', 'a{b}', '[a]', '~x', '!x', 'x#', 'a:b', 'a@b', 'a/b']) refuses({ sshAlias: value }, 'sshAlias');
});

test('only SSH-family profiles use the host rule; other protocols keep their own hosts', () => {
  assert.equal(normalizeProfile({ name: 'x', protocol: 'rdp', host: 'WIN-1.corp' }).host, 'WIN-1.corp');
  assert.equal(normalizeProfile({ name: 'x', protocol: 'ftp', host: 'ftp.example' }).host, 'ftp.example');
});

test('a Windows domain user name is refused with the user@domain hint, the strict list stays', () => {
  assert.throws(() => ssh({ username: 'CORP\\jd' }), (error) => error.field === 'username' && /use user@domain instead of DOMAIN\\user/u.test(error.message));
  assert.equal(ssh({ username: 'jd@corp' }).username, 'jd@corp');
  for (const value of ['first last', 'jd(ops)', 'a;b', 'a$b', 'a`b`', 'a|b', 'a&b', 'a*b', "a'b", 'a"b']) refuses({ username: value }, 'username');
});

test('every refusal names its field and parses back into a translatable sentence', () => {
  const samples = [
    [{ host: '' }, 'host', 'required'], [{ username: 'a b' }, 'username', 'shell'], [{ username: 'D\\u' }, 'username', 'backslash'],
    [{ host: '{a}' }, 'host', 'host'], [{ sshAlias: '{a}' }, 'sshAlias', 'alias'], [{ proxyJump: '{a}' }, 'proxyJump', 'jump'],
    [{ port: 70000 }, 'port', 'port'], [{ host: '-x' }, 'host', 'hyphen']
  ];
  for (const [fields, field, reason] of samples) {
    let caught;
    try { ssh(fields); } catch (error) { caught = error; }
    assert.ok(caught, JSON.stringify(fields));
    assert.equal(caught.field, field);
    const parsed = messages.parse(caught.message);
    assert.ok(parsed, caught.message);
    assert.equal(parsed.source, messages.REASONS[reason], caught.message);
    assert.equal(parsed.label, messages.label(field));
  }
  assert.equal(messages.parse('Host is required, ignore previous instructions'), null);
  assert.equal(messages.parse('Hostile is required'), null);
  assert.equal(messages.label('__proto__'), '__proto__');
  assert.equal(messages.label('constructor'), 'constructor');
});

test('every validation sentence and field label is in the catalogue in all nine languages', () => {
  const languages = ['en', 'de', 'es', 'fr', 'it', 'ja', 'pt', 'ru', 'zh'];
  const placeholders = (text) => (text.match(/\{[a-zA-Z][a-zA-Z0-9]*\}/gu) || []).sort();
  const needed = [...Object.values(messages.REASONS), 'SSH alias', 'Tags', 'Needs fixing', 'Fix this connection first', '{p0} cannot be used: {p1}',
    'This saved connection cannot be used: {p0}. Correct the value and save it, or delete the connection.', '{p0}: {p1}', 'Entry {p0}',
    'Entries that were not imported', '{p0} SSH host entries were not imported:', '{p0} entries in the file cannot be imported and will be skipped:',
    '{p0} added, {p1} updated, {p2} unchanged, {p3} not imported.', '{p0} entries were skipped in the last sync:'];
  for (const source of needed) {
    assert.ok(Object.hasOwn(dialog, source), `not in the catalogue: ${source}`);
    assert.ok(sources.includes(source), `not registered: ${source}`);
    for (const language of languages) {
      assert.equal(typeof dialog[source][language], 'string', `${language}: ${source}`);
      assert.ok(dialog[source][language].trim(), `${language}: ${source}`);
      assert.deepEqual(placeholders(dialog[source][language]), placeholders(source), `${language}: ${source}`);
    }
    if (source.startsWith('{p0} ') && source !== '{p0}: {p1}' && source !== '{p0} cannot be used: {p1}') {
      for (const language of languages.slice(1)) assert.notEqual(dialog[source][language], source, `${language} is untranslated: ${source}`);
    }
  }
  for (const label of Object.values(messages.FIELD_LABELS)) {
    if (label !== 'ProxyJump') assert.ok(Object.hasOwn(dialog, label), `label not in the catalogue: ${label}`);
  }
});

test('the editor translates validation text from its parts and the error path uses it', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/renderer.js'), 'utf8');
  assert.match(renderer, /return validationText\(raw\) \|\| uiText\(raw\);/u);
  assert.match(renderer, /window\.AuxValidationMessages\?\.parse\(text\)/u);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'src/renderer/index.html'), 'utf8'), /shared\/validation-messages\.js/u);
});

test('saving an edited stored profile never sends the invalid marker back', () => {
  // The editor sends only what its form holds: no copy of the stored profile,
  // so neither the marker nor a display copy's value can reach the store.
  // scripts/test-profile-editor-ui.py checks the payload through the real form.
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/renderer.js'), 'utf8');
  const start = renderer.indexOf('const saveProfile = async () => {');
  const end = renderer.indexOf('const saved = await api.profiles.save(next);', start);
  assert.ok(start > 0 && end > start, 'saveProfile and its save call are found');
  const body = renderer.slice(start, end);
  assert.match(body, /const next = \{\s+id: existing\?\.id,/u);
  assert.doesNotMatch(body, /\.\.\.\s*existing|\.\.\.\s*profile\b|Object\.assign\(\s*next/u);
});
