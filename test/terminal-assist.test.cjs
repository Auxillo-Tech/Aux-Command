'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const AuxAssist = require('../src/renderer/assist.js');
const {
  OsDetector, osInfoFromRelease, CommandLineMirror, CommandHistory,
  dangerCheck, suggest, correctCommand, detectCommandNotFound, dictionaryFor
} = AuxAssist;

test('CommandLineMirror tracks typing, backspace and kill chords', () => {
  const mirror = new CommandLineMirror();
  mirror.feed('lss');
  mirror.feed('\x7f');
  assert.equal(mirror.line, 'ls');
  mirror.feed(' -la');
  assert.equal(mirror.line, 'ls -la');
  mirror.feed('\x15');
  assert.equal(mirror.line, '');
  mirror.feed('echo one two');
  mirror.feed('\x17');
  assert.equal(mirror.line, 'echo one ');
  assert.equal(mirror.tracked, true);
});

test('CommandLineMirror commits on Enter and resets on Ctrl+C', () => {
  const mirror = new CommandLineMirror();
  const result = mirror.feed('uptime\r');
  assert.equal(result.committed.length, 1);
  assert.equal(result.committed[0].line, 'uptime');
  assert.equal(result.committed[0].tracked, true);
  assert.equal(mirror.line, '');

  mirror.feed('rm -rf');
  mirror.feed('\x03');
  assert.equal(mirror.line, '');
  assert.equal(mirror.tracked, true);
});

test('CommandLineMirror goes untracked on arrows and tab, recovers on commit', () => {
  const mirror = new CommandLineMirror();
  mirror.feed('vim');
  mirror.feed('\x1b[A'); // up arrow — shell may recall history invisibly
  assert.equal(mirror.tracked, false);
  const result = mirror.feed('\r');
  assert.equal(result.committed[0].tracked, false);
  assert.equal(mirror.tracked, true);

  mirror.feed('ls /et\t');
  assert.equal(mirror.tracked, false);
});

test('CommandLineMirror strips bracketed-paste markers and commits pasted lines', () => {
  const mirror = new CommandLineMirror();
  const result = mirror.feed('\x1b[200~echo one\recho two\x1b[201~');
  assert.equal(result.committed.length, 1);
  assert.equal(result.committed[0].line, 'echo one');
  assert.equal(mirror.line, 'echo two');
  assert.equal(mirror.tracked, true);
});

test('CommandLineMirror preview does not mutate the live mirror', () => {
  const mirror = new CommandLineMirror();
  mirror.feed('reboot');
  const preview = mirror.preview('\r');
  assert.equal(preview.committed[0].line, 'reboot');
  assert.equal(mirror.line, 'reboot');
});

test('OsDetector identifies distros from os-release, MOTD and banners', () => {
  const cases = [
    ['NAME="Ubuntu"\nID=ubuntu\nPRETTY_NAME="Ubuntu 24.04 LTS"', 'ubuntu', 'apt'],
    ['Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-101-generic x86_64)', 'ubuntu', 'apt'],
    ['Linux debian-box 6.1.0 #1 SMP Debian GNU/Linux 12 (bookworm)', 'debian', 'apt'],
    ['NAME="Fedora Linux"\nID=fedora\nVERSION_ID=44', 'fedora', 'dnf'],
    ['Rocky Linux 9.4 (Blue Onyx)', 'rocky', 'dnf'],
    ['ID=alpine\nPRETTY_NAME="Alpine Linux v3.20"', 'alpine', 'apk'],
    ['Darwin macbook.local 23.5.0 Darwin Kernel Version 23.5.0', 'macos', 'brew'],
    ['FreeBSD host 14.0-RELEASE FreeBSD 14.0-RELEASE', 'freebsd', 'pkg'],
    ['Microsoft Windows [Version 10.0.22631.3527]\n(c) Microsoft Corporation.', 'windows', 'winget'],
    ['Windows PowerShell\nCopyright (C) Microsoft Corporation.\nPS C:\\Users\\jd> ', 'windows', 'winget']
  ];
  for (const [output, distro, pm] of cases) {
    const detector = new OsDetector();
    const info = detector.feed(output);
    assert.equal(info?.distro, distro, `expected ${distro} from: ${output.slice(0, 40)}`);
    assert.equal(info?.packageManager, pm);
    assert.equal(detector.locked, true);
  }
});

test('OsDetector falls back to generic linux and matches across chunk boundaries', () => {
  const detector = new OsDetector();
  const info = detector.feed('Linux host 6.9.4-200 #1 SMP x86_64 GNU/Linux\n$ ');
  assert.equal(info?.family, 'linux');
  assert.equal(info?.distro, null);
  assert.equal(detector.locked, false);

  detector.feed('NAME="Fedora');
  const locked = detector.feed(' Linux"\nID=fedora\n');
  assert.equal(locked?.distro, 'fedora');
});

test('OsDetector respects a local seed and the scan budget', () => {
  const seeded = new OsDetector({ family: 'linux', distro: 'fedora', label: 'Fedora', packageManager: 'dnf' });
  seeded.feed('Welcome to Ubuntu');
  assert.equal(seeded.osInfo.distro, 'fedora');

  const budget = new OsDetector();
  budget.scanned = 1e9;
  assert.equal(budget.feed('ID=ubuntu'), null);
});

test('osInfoFromRelease maps local platforms', () => {
  assert.equal(osInfoFromRelease('darwin', '').distro, 'macos');
  assert.equal(osInfoFromRelease('win32', '').packageManager, 'winget');
  assert.equal(osInfoFromRelease('linux', 'ID=fedora\nNAME="Fedora Linux"').label, 'Fedora');
  assert.equal(osInfoFromRelease('linux', 'ID=weirdos').label, 'Linux');
});

test('dangerCheck flags destructive commands with reasons', () => {
  const dangerous = [
    'rm -rf /',
    'rm -rf /*',
    'sudo rm -rf / --no-preserve-root',
    'rm -fr ~',
    'rm -rf $HOME',
    'dd if=/dev/zero of=/dev/sda bs=1M',
    'mkfs.ext4 /dev/sdb1',
    ':(){ :|:& };:',
    'chmod -R 777 /',
    'chown -R jd /',
    'iptables -F',
    'shutdown -h now',
    'reboot',
    'init 0'
  ];
  for (const command of dangerous) {
    const hit = dangerCheck(command);
    assert.ok(hit, `expected danger flag for: ${command}`);
    assert.ok(hit.reason.length > 10);
  }
});

test('dangerCheck leaves everyday commands alone', () => {
  const safe = [
    'rm -rf ./build',
    'rm -rf node_modules',
    'rm file.txt',
    'dd if=/dev/sda of=backup.img',
    'ls -la /',
    'chmod -R 755 ./public',
    'echo reboot',
    'grep -r "shutdown" src/',
    'git checkout -- .',
    'systemctl restart nginx'
  ];
  for (const command of safe) {
    assert.equal(dangerCheck(command), null, `false positive for: ${command}`);
  }
});

test('suggest prefers session history over the dictionary', () => {
  const history = new CommandHistory();
  history.add('systemctl status nginx');
  history.add('systemctl restart caddy');
  const fromHistory = suggest('systemctl re', history, { family: 'linux', packageManager: 'dnf' });
  assert.equal(fromHistory.full, 'systemctl restart caddy');
  assert.equal(fromHistory.source, 'history');

  const fromDictionary = suggest('journalctl -', history, { family: 'linux', packageManager: 'dnf' });
  assert.equal(fromDictionary.source, 'dictionary');
  assert.equal(suggest('x', history, null), null);
});

test('suggestions adapt the dictionary to the detected OS', () => {
  const history = new CommandHistory();
  assert.ok(suggest('dnf in', history, { family: 'linux', packageManager: 'dnf' }));
  assert.equal(suggest('dnf in', history, { family: 'linux', packageManager: 'apt' }), null);
  assert.ok(suggest('apt in', history, { family: 'linux', packageManager: 'apt' }));
  assert.ok(suggest('winget in', history, { family: 'windows', packageManager: 'winget' }));
  assert.ok(suggest('brew in', history, { family: 'macos', packageManager: 'brew' }));
  assert.equal(dictionaryFor({ family: 'windows' }).includes('ls -la'), false);
});

test('CommandHistory is MRU-ordered, deduplicated and bounded', () => {
  const history = new CommandHistory(3);
  history.add('one two');
  history.add('three four');
  history.add('one two');
  assert.deepEqual(history.list(), ['one two', 'three four']);
  history.add('five');
  history.add('six');
  assert.equal(history.list().length, 3);
  history.add('');
  assert.equal(history.list().length, 3);
});

test('detectCommandNotFound extracts the failing token across shells', () => {
  assert.equal(detectCommandNotFound('bash: gerp: command not found\n'), 'gerp');
  assert.equal(detectCommandNotFound('zsh: command not found: pythn\n'), 'pythn');
  assert.equal(detectCommandNotFound("'ipconfgi' is not recognized as an internal or external command,\noperable program or batch file."), 'ipconfgi');
  assert.equal(detectCommandNotFound('total 12\ndrwxr-xr-x. 2 jd jd'), null);
});

test('correctCommand proposes close matches from dictionary and history', () => {
  const history = new CommandHistory();
  history.add('journalctl -u nginx');
  const fromDictionary = correctCommand('gerp -r pattern .', 'gerp', history, { family: 'linux' });
  assert.equal(fromDictionary.replacement, 'grep');
  assert.equal(fromDictionary.corrected, 'grep -r pattern .');

  const fromHistory = correctCommand('journalct -u nginx', 'journalct', history, { family: 'linux' });
  assert.equal(fromHistory.replacement, 'journalctl');

  assert.equal(correctCommand('zzzzzz --help', 'zzzzzz', history, { family: 'linux' }), null);
  assert.equal(correctCommand('', '', history, null), null);
});

// --- integration wiring: every layer of the assist chain must stay connected ---

const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const rendererSource = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'src/preload/index.cjs'), 'utf8');
const ipcSource = fs.readFileSync(path.join(root, 'src/main/ipc.cjs'), 'utf8');

test('assist is wired renderer → preload → ipc → settings store', () => {
  assert.match(indexHtml, /<script src="\.\/assist\.js"><\/script>/u);
  assert.match(indexHtml, /id="assist-button"/u);
  assert.match(rendererSource, /function handleTerminalInput\(tab, data\)/u);
  assert.match(rendererSource, /function handleAssistOutput\(tab, data\)/u);
  assert.match(rendererSource, /setupTabAssist\(tab, profile\)/u);
  assert.match(rendererSource, /handleTerminalInput\(tab, data\);/u);
  assert.match(rendererSource, /handleAssistOutput\(tab, data\);/u);
  assert.match(rendererSource, /elements\.assistButton\.addEventListener\('click', openAssistModal\)/u);
  assert.match(preloadSource, /saveAssistSettings: \(assist\) => invoke\('app:save-assist-settings', assist\)/u);
  assert.match(preloadSource, /osInfo: \(\) => invoke\('system:os-info'\)/u);
  assert.match(ipcSource, /handle\('app:save-assist-settings', \(assist\) => settingsStore\.saveAssist\(assist\)\)/u);
  assert.match(ipcSource, /handle\('system:os-info', \(\) => systemService\.osInfo\(\)\)/u);
  assert.match(stylesCss, /\.assist-bar/u);
  assert.match(stylesCss, /\.tab-os-badge/u);
});

test('danger guard intercepts Enter before the write reaches the PTY', () => {
  assert.match(rendererSource, /tab\.assist\.mirror\.preview\(data\)/u);
  assert.match(rendererSource, /window\.AuxAssist\.dangerCheck\(commit\.line\)/u);
  assert.match(rendererSource, /if \(confirmed\) commitTerminalInput\(tab, data\);/u);
  // Only the assist input path may write terminal data for keystrokes.
  assert.match(rendererSource, /function dispatchTerminalInput\(tab, data\)/u);
});

test('settings store normalizes and persists assist toggles', () => {
  const { normalizeAssistSettings } = require('../src/main/lib/settings-store.cjs');
  assert.deepEqual(normalizeAssistSettings(undefined), { enabled: true, suggestions: true, autocorrect: true, dangerGuard: true, osDetection: true });
  assert.deepEqual(normalizeAssistSettings({ enabled: false, dangerGuard: 0 }), { enabled: false, suggestions: true, autocorrect: true, dangerGuard: false, osDetection: true });
});
