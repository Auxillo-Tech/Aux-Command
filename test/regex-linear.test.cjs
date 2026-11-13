'use strict';

// Regular expressions that backtrack badly on long input. Each site below used
// to take seconds or minutes on input a remote host or a config file can
// supply. The timed checks run in a child process with a hard limit, so the
// old code fails the test cleanly instead of hanging the runner. The
// differential checks compare the new code with a verbatim copy of the old
// regular expressions on generated input, so verdicts stay identical.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const knownHosts = require('../src/main/lib/openssh-known-hosts.cjs');
const { resolveIncludePattern } = require('../src/main/lib/ssh-config-parser.cjs');
const { trimBlankEdges } = require('../src/main/services/live-monitor.cjs');

const LIMIT_MS = 8000;

function runTimed(code) {
  const started = Date.now();
  const result = spawnSync(process.execPath, ['-e', code], { cwd: root, timeout: LIMIT_MS, encoding: 'utf8' });
  return { ...result, elapsed: Date.now() - started };
}

function assertFinishes(code, label) {
  const result = runTimed(code);
  assert.equal(result.error?.code, undefined, `${label}: did not finish within ${LIMIT_MS} ms (${result.error?.code})`);
  assert.equal(result.status, 0, `${label}: child failed: ${result.stderr}`);
  return result;
}

// Small deterministic generator so a failure reproduces.
function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomString(next, alphabet, maxLength) {
  const length = Math.floor(next() * (maxLength + 1));
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(next() * alphabet.length)];
  return out;
}

// ---- site 1 and 2: glob matching ---------------------------------------

// The matcher the code used before: every glob character became a regex.
function oldGlobMatch(pattern, value, flags) {
  const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*').replace(/\?/gu, '.')}$`, flags);
  return regex.test(value);
}

const GLOB_ALPHABET = ['a', 'a', 'b', 'A', 'B', '.', '-', '*', '*', '?', '[', ']', '\\', '(', '$', '\n', '\r', '\u2028', 'ı', 'İ', 'ß', 'ẞ', 'ſ', 's', 'S', '\u212a', 'k', 'K', 'é', 'É', '😀'];

test('globMatch gives the old verdict on generated patterns and values (case-insensitive)', () => {
  const next = prng(20261113);
  for (let i = 0; i < 20000; i += 1) {
    const pattern = randomString(next, GLOB_ALPHABET, 8);
    const value = randomString(next, GLOB_ALPHABET.filter((c) => c !== '*' && c !== '?').concat(['*', '?']), 9);
    assert.equal(knownHosts.globMatch(pattern, value), oldGlobMatch(pattern, value, 'iu'), `ignoreCase ${JSON.stringify([pattern, value])}`);
  }
});

test('globMatch gives the old verdict on generated patterns and values (case-sensitive)', () => {
  const next = prng(77);
  for (let i = 0; i < 20000; i += 1) {
    const pattern = randomString(next, GLOB_ALPHABET, 8);
    const value = randomString(next, GLOB_ALPHABET, 9);
    assert.equal(knownHosts.globMatch(pattern, value, { ignoreCase: false }), oldGlobMatch(pattern, value, 'u'), `case-sensitive ${JSON.stringify([pattern, value])}`);
  }
});

test('globMatch keeps the old verdict on literal cases', () => {
  const cases = [
    ['*', 'anything', true], ['*', '', true], ['', '', true], ['', 'a', false], ['?', '', false],
    ['*.example.com', 'host.example.com', true], ['*.example.com', 'example.com', false],
    ['host?.example.com', 'HOST1.example.com', true], ['[::1]:2222', '[::1]:2222', true],
    ['a*', 'a\nb', false], ['a?b', 'a\nb', false], ['10.0.0.*', '10.0.0.7', true], ['10.0.0.*', '10x0x0x7', false]
  ];
  for (const [pattern, value, expected] of cases) {
    assert.equal(knownHosts.globMatch(pattern, value), expected, JSON.stringify([pattern, value]));
    assert.equal(oldGlobMatch(pattern, value, 'iu'), expected, `old ${JSON.stringify([pattern, value])}`);
  }
});

test('hostsFieldMatches keeps negation and comma lists', () => {
  assert.equal(knownHosts.hostsFieldMatches('*.example.com,!bad.example.com', 'ok.example.com'), true);
  assert.equal(knownHosts.hostsFieldMatches('*.example.com,!bad.example.com', 'bad.example.com'), false);
  assert.equal(knownHosts.hostsFieldMatches('!*.example.com', 'ok.example.com'), false);
  assert.equal(knownHosts.hostsFieldMatches('a,b', 'c'), false);
});

test('known_hosts glob with many stars stays fast on a long host name', () => {
  assertFinishes(`
    const { hostsFieldMatches } = require('./src/main/lib/openssh-known-hosts.cjs');
    const started = Date.now();
    const no = hostsFieldMatches('*a*a*a*a*b', 'a'.repeat(5000));
    const yes = hostsFieldMatches('*a*a*a*a*b', 'a'.repeat(5000) + 'b');
    if (no !== false || yes !== true) { console.error('wrong verdict', no, yes); process.exit(2); }
    if (Date.now() - started > 3000) { console.error('slow'); process.exit(3); }
  `, 'known_hosts glob');
});

test('Include glob with many stars stays fast on a long file name', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-include-glob-'));
  try {
    fs.writeFileSync(path.join(directory, 'a'.repeat(250)), '# long\n');
    fs.writeFileSync(path.join(directory, `${'a'.repeat(100)}b`), '# long b\n');
    fs.writeFileSync(path.join(directory, 'one.conf'), 'Host one\n');
    fs.writeFileSync(path.join(directory, 'Two.conf'), 'Host two\n');
    const result = assertFinishes(`
      const { resolveIncludePattern } = require('./src/main/lib/ssh-config-parser.cjs');
      const dir = ${JSON.stringify(directory)};
      const files = resolveIncludePattern(dir + '/*a*a*a*a*a*a*b', dir);
      console.log(JSON.stringify(files.map((file) => file.slice(dir.length + 1).length)));
    `, 'Include glob');
    assert.deepEqual(JSON.parse(result.stdout), [101]);
    // Same results as before for ordinary patterns, including case sensitivity.
    assert.deepEqual(resolveIncludePattern(`${directory}/*.conf`, directory).map((file) => path.basename(file)), ['Two.conf', 'one.conf']);
    assert.deepEqual(resolveIncludePattern(`${directory}/o?e.conf`, directory).map((file) => path.basename(file)), ['one.conf']);
    assert.deepEqual(resolveIncludePattern(`${directory}/ONE.conf`, directory), []);
    assert.deepEqual(resolveIncludePattern(`${directory}/t*.conf`, directory), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

// ---- site 3: live monitor section trim ---------------------------------

const WS_ALPHABET = ['a', 'b', ' ', ' ', '\n', '\n', '\t', '\r', '\u00a0', '\u2028', '\ufeff', '\u3000', '\u200b'];

test('trimBlankEdges gives the old result on generated sections', () => {
  const next = prng(4242);
  for (let i = 0; i < 30000; i += 1) {
    const text = randomString(next, WS_ALPHABET, 14);
    assert.equal(trimBlankEdges(text), text.replace(/^\s*\n|\s+$/gu, ''), JSON.stringify(text));
  }
});

test('trimBlankEdges keeps leading spaces of the first text line', () => {
  assert.equal(trimBlankEdges('\n\n  Mem: 1 2 3  \n\n'), '  Mem: 1 2 3');
  assert.equal(trimBlankEdges('   \n   '), '');
  assert.equal(trimBlankEdges('  x'), '  x');
});

test('live monitor snapshot with a long whitespace run in remote output stays fast', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-monitor-ws-'));
  try {
    const executable = path.join(directory, 'fake-ssh');
    fs.writeFileSync(executable, "#!/bin/sh\nprintf '%s\\n' '===UPTIME===' \"a$(head -c 150000 /dev/zero | tr '\\0' ' ')b\" '===LOAD===' '0.1 0.2 0.3'\n", { mode: 0o700 });
    const result = assertFinishes(`
      const { LiveMonitorService } = require('./src/main/services/live-monitor.cjs');
      const service = new LiveMonitorService({ sshExecutable: ${JSON.stringify(executable)} });
      const profile = { id: 's', name: 'S', protocol: 'ssh', host: '127.0.0.1', port: 22, username: 'test', sshAlias: 'fixture', useSshConfig: true };
      service.snapshot(profile).then((out) => {
        const uptime = out.sections.uptime;
        if (uptime.length !== 150002 || !uptime.startsWith('a') || !uptime.endsWith('b')) { console.error('wrong section', uptime.length); process.exit(2); }
        if (out.sections.load !== '0.1 0.2 0.3') { console.error('wrong load'); process.exit(3); }
      }).catch((error) => { console.error(error.message); process.exit(4); });
    `, 'live monitor snapshot');
    assert.ok(result.elapsed < LIMIT_MS);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

// ---- site 4: group names in the renderer --------------------------------

// The renderer is a browser script, so the two group-name lines are read from
// the source and run on their own. This keeps the check on the shipped text.
function groupNameExpressions() {
  const source = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const found = [...source.matchAll(/const trimmed = (String\(name \|\| ''\)[^;\n]*);/gu)].map((match) => match[1]);
  return found;
}

test('renderer group names are normalised in exactly two places', () => {
  assert.equal(groupNameExpressions().length, 2);
});

test('group name normalisation gives the old result on generated names', () => {
  const [expression] = groupNameExpressions();
  const normalise = new Function('name', `return ${expression};`);
  const old = (name) => String(name || '').trim().replace(/\s*\/\s*/g, ' / ').slice(0, 60);
  const next = prng(9001);
  const alphabet = ['a', 'b', ' ', ' ', '/', '/', '\t', '\n', '\u00a0', '\u2028', '\ufeff'];
  for (let i = 0; i < 30000; i += 1) {
    const name = randomString(next, alphabet, 70);
    assert.equal(normalise(name), old(name), JSON.stringify(name));
  }
  assert.equal(normalise(null), '');
  assert.equal(normalise('  Prod / EU//DB  '), 'Prod / EU /  / DB');
});

test('group name normalisation stays fast on a long whitespace run', () => {
  for (const expression of groupNameExpressions()) {
    assertFinishes(`
      const normalise = new Function('name', ${JSON.stringify(`return ${expression};`)});
      const run = ' '.repeat(300000);
      const a = normalise('a' + run + 'b');
      const b = normalise(run + 'x' + run);
      const c = normalise('a' + run + '/' + run + 'b');
      if (a !== 'a' + ' '.repeat(59) || b !== 'x' || c !== 'a / b') { console.error('wrong result', JSON.stringify([a, b, c])); process.exit(2); }
    `, 'group name');
  }
});
