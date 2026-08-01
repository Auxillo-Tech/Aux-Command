'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSshConfig, stripInlineComment, tokenize } = require('../src/main/lib/ssh-config-parser.cjs');

test('imports every concrete alias on a multi-host line', () => {
  const profiles = parseSshConfig(`
Host prod prod-alt *.internal !blocked
  HostName 10.20.30.40
  User deploy
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
  ProxyJump bastion
  Compression yes
`);
  assert.equal(profiles.length, 2);
  assert.deepEqual(profiles.map((profile) => profile.name), ['prod', 'prod-alt']);
  for (const profile of profiles) {
    assert.equal(profile.host, '10.20.30.40');
    assert.equal(profile.username, 'deploy');
    assert.equal(profile.port, 2222);
    assert.equal(profile.proxyJump, 'bastion');
    assert.equal(profile.sshAlias, profile.name);
  }
});

test('supports equals syntax, quoted values and inline comments', () => {
  const profiles = parseSshConfig(`
Host = staging
  HostName = "stage.example.com" # endpoint
  User = ops
  Port = 2200
`);
  assert.equal(profiles[0].name, 'staging');
  assert.equal(profiles[0].host, 'stage.example.com');
  assert.equal(profiles[0].username, 'ops');
  assert.equal(profiles[0].port, 2200);
});

test('uses the first obtained value for repeated keywords', () => {
  const [profile] = parseSshConfig(`
Host edge
  User first
  User second
  HostName edge.example.com
`);
  assert.equal(profile.username, 'first');
});

test('tokenizer and inline comments respect quotes', () => {
  assert.deepEqual(tokenize('one "two three" four'), ['one', 'two three', 'four']);
  assert.equal(stripInlineComment('HostName "host#1" # comment').trim(), 'HostName "host#1"');
});

test('does not apply Match directives to the preceding Host block', () => {
  const profiles = parseSshConfig(`
Host app
  HostName app.example
Match user deploy
  ProxyJump conditional-bastion
`);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, 'app');
  assert.equal(profiles[0].proxyJump, '');
});

test('skips malformed aliases without blocking valid SSH config imports', () => {
  const profiles = parseSshConfig(`
Host -bad
  HostName bad.example
Host good
  HostName good.example
`);
  assert.deepEqual(profiles.map((profile) => profile.name), ['good']);
});

test('expands Include directives with globs, nesting, and cycle protection', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const { expandIncludes } = require('../src/main/lib/ssh-config-parser.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ssh-config-'));
  try {
    fs.mkdirSync(path.join(dir, 'config.d'));
    fs.writeFileSync(path.join(dir, 'config.d', '10-app.conf'), 'Host app\n  HostName app.example\n');
    fs.writeFileSync(path.join(dir, 'config.d', '20-db.conf'), 'Host db\n  HostName db.example\n  ProxyJump bastion,inner\n');
    fs.writeFileSync(path.join(dir, 'nested.conf'), `Include ${path.join(dir, 'config.d', '10-app.conf')}\nHost nested\n  HostName nested.example\n`);
    fs.writeFileSync(path.join(dir, 'loop-a.conf'), `Include ${path.join(dir, 'loop-b.conf')}\nHost loop-a\n  HostName loop-a.example\n`);
    fs.writeFileSync(path.join(dir, 'loop-b.conf'), `Include ${path.join(dir, 'loop-a.conf')}\nHost loop-b\n  HostName loop-b.example\n`);

    const flattened = expandIncludes([
      'Include config.d/*.conf',
      `Include ${path.join(dir, 'nested.conf')}`,
      `Include ${path.join(dir, 'loop-a.conf')}`,
      'Include /nonexistent/path/*.conf',
      'Host direct',
      '  HostName direct.example'
    ].join('\n'), dir);
    const profiles = parseSshConfig(flattened);
    const names = profiles.map((profile) => profile.name);
    // Glob matches sorted, nested include follows, cycles expand exactly once.
    assert.deepEqual(names, ['app', 'db', 'nested', 'loop-b', 'loop-a', 'direct']);
    assert.equal(profiles.find((profile) => profile.name === 'db').proxyJump, 'bastion,inner');
    assert.equal((flattened.match(/Host app/gu) || []).length, 1, 'cycle/duplicate protection keeps one copy per file');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
