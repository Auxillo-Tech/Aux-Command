'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore } = require('../src/main/lib/settings-store.cjs');
const { appendTranscript, TerminalService } = require('../src/main/services/terminal-service.cjs');
const { buildTerminalCommand } = require('../src/main/lib/command-builder.cjs');
const { shortcuts, matches } = require('../src/shared/preferences.js');
test('UTF-8 transcript stays within byte limit without broken characters', () => {
  const session = { transcript: '' };
  appendTranscript(session, '😀日本語'.repeat(200000));
  appendTranscript(session, 'END');
  assert.ok(Buffer.byteLength(session.transcript) <= 1048576);
  assert.equal(session.transcript.includes('\ufffd'), false);
  assert.ok(session.transcript.endsWith('END'));
  assert.equal(session.transcriptTruncated, true);
});
test('SSH working directory is shell-quoted independently of commands', () => {
  const command = buildTerminalCommand({ name: 'test', protocol: 'ssh', host: 'example.invalid' }, { remoteCwd: "/tmp/a'$(touch /tmp/no)" });
  assert.equal(command.args.at(-1), "cd '/tmp/a'\\''$(touch /tmp/no)' && exec \"${SHELL:-/bin/sh}\" -l");
});
test('named workspaces persist ordered metadata without credentials or arbitrary fields', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-workspaces-'));
  try {
    const store = new SettingsStore(dir);
    const sessions = [{ profileId: 'a', protocol: 'ssh', title: 'Database', customTitle: true, cwd: '/srv/app', fontSize: 17, paneWidth: 600, paneHeight: 350, active: true, password: 'never-save' }, { profileId: 'b', protocol: 'local', fontSize: null }];
    const [saved] = store.saveNamedWorkspace({ name: 'Operations', workspace: { layout: 'grid' }, sessions });
    const restored = new SettingsStore(dir).get().namedWorkspaces[0];
    assert.equal(restored.sessions[0].cwd, '/srv/app');
    assert.equal(restored.sessions[0].title, 'Database');
    assert.equal(restored.sessions[0].fontSize, 17);
    assert.equal(restored.sessions[1].fontSize, null);
    assert.equal(restored.sessions[0].password, undefined);
    assert.equal(restored.workspace.layout, 'grid');
    store.saveNamedWorkspace({ ...saved, name: 'Updated' });
    assert.equal(store.get().namedWorkspaces.length, 1);
    store.deleteNamedWorkspace(saved.id);assert.deepEqual(store.get().namedWorkspaces, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('custom shortcuts reject duplicates and terminal copy/paste collisions', () => {
  assert.throws(() => shortcuts({ local: 'Ctrl+Shift+P' }, true), /unique/);
  assert.throws(() => shortcuts({ local: 'Ctrl+Shift+C' }, true), /reserved/);
  const result = shortcuts({ local: 'Ctrl+Shift+Q' }, true);
  assert.equal(matches({ ctrlKey: true, shiftKey: true, code: 'KeyQ' }, result.local), true);
  assert.equal(matches({ ctrlKey: true, shiftKey: true, altKey: true, code: 'KeyQ' }, result.local), false);
});
test('logging disk errors are reported without terminating the app', async () => {
  if (process.platform !== 'linux' || !fs.existsSync('/dev/full')) return;
  const messages = [];
  const service = new TerminalService(() => ({ isDestroyed: () => false, webContents: { send: (channel, data) => messages.push({ channel, data }) } }));
  const created = service.create({ profile: { id: 'log-error', name: 'Log test', protocol: 'local', startupCommand: 'sleep 10; exit' } });
  try {
    // startLogging writes an empty transcript first; the asynchronous write fails.
    service.startLogging(created.id, '/dev/full');
    service.sessions.get(created.id).logging.stream.write('disk-full-test');
    for (let i = 0; i < 100 && !messages.some((m) => m.channel === 'terminal:log-error'); i++) await new Promise(r => setTimeout(r, 20));
    assert.ok(messages.some((m) => m.channel === 'terminal:log-error' && /ENOSPC/.test(m.data.message)));
    assert.equal(service.list()[0].logging.active, false);
  } finally { service.closeAll(); }
});

test('panel sizes and terminal defaults normalize and survive partial settings updates', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-preferences-'));
  try {
    const store = new SettingsStore(directory);
    store.saveUi({ sidebarWidth: 350, filesWidth: 480, terminalDefaults: { terminalFontSize: 18, terminalTheme: 'light', terminalScrollback: 12000 } });
    store.saveUi({ language: 'pt', sidebarHidden: true });
    const restored = new SettingsStore(directory).get().ui;
    assert.equal(restored.sidebarWidth, 350); assert.equal(restored.filesWidth, 480);
    assert.equal(restored.terminalDefaults.terminalFontSize, 18); assert.equal(restored.terminalDefaults.terminalTheme, 'light');
    store.saveUi({ sidebarWidth: -99, filesWidth: 99999 });
    assert.equal(store.get().ui.sidebarWidth, 240); assert.equal(store.get().ui.filesWidth, 700);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
