'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProfileStore } = require('../src/main/lib/profile-store.cjs');
const { registerIpc } = require('../src/main/ipc.cjs');

// What 0.4.x let through: a Windows domain user, a name with a space, brackets and a glob jump host.
const LEGACY = [
  { id: 'legacy-corp', name: 'Corp box', protocol: 'ssh', group: 'Work', host: 'corp.example', port: 22, username: 'CORP\\jd', credentialId: 'cred-corp' },
  { id: 'legacy-space', name: 'Space', protocol: 'ssh', group: 'Work', host: 'space.example', port: 22, username: 'first last', credentialId: '' },
  { id: 'legacy-paren', name: 'Paren', protocol: 'ssh', group: 'Work', host: 'paren.example', port: 22, username: 'jd(ops)', credentialId: '' },
  { id: 'legacy-glob', name: 'Glob jump', protocol: 'ssh', group: 'Work', host: 'glob.example', port: 22, username: 'jd', proxyJump: '{touch,/tmp/f}', credentialId: '' },
  { id: 'legacy-extra', name: 'Extra', protocol: 'ssh', host: 'extra.example', username: 'a b', futureField: { keep: ['me', 1, null] }, 'unknown key': true }
];

function fixture(t, rows = LEGACY) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-invalid-rows-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const first = new ProfileStore(directory);
  const file = path.join(directory, 'profiles.json');
  const data = first.store.get();
  data.profiles.push(...rows.map((row) => JSON.parse(JSON.stringify(row))));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  const storedRows = () => JSON.parse(fs.readFileSync(file, 'utf8')).profiles;
  const legacyOnDisk = () => storedRows().filter((row) => rows.some((legacy) => legacy.id === row.id));
  return { directory, file, store: new ProfileStore(directory), storedRows, legacyOnDisk, expected: rows.map((row) => JSON.parse(JSON.stringify(row))) };
}

test('legacy-invalid rows stay in the list, marked with the wrong field and a plain fix', (t) => {
  const f = fixture(t);
  const all = f.store.listAll();
  for (const row of LEGACY) assert.ok(all.some((p) => p.id === row.id), `${row.id} is listed`);
  const corp = all.find((p) => p.id === 'legacy-corp');
  assert.equal(corp.invalid.field, 'username');
  assert.match(corp.invalid.message, /use user@domain instead of DOMAIN\\user/u);
  assert.equal(corp.name, 'Corp box');
  assert.equal(corp.host, 'corp.example');
  assert.equal(all.find((p) => p.id === 'legacy-glob').invalid.field, 'proxyJump');
  assert.equal(all.find((p) => p.id === 'legacy-extra').invalid.field, 'username');
  // The ones that can be used are the only ones list() and get() hand to connection code.
  assert.ok(f.store.list().every((p) => !p.invalid));
  assert.equal(f.store.get('legacy-corp'), null);
  assert.ok(f.store.get('local-shell'));
  assert.deepEqual(f.legacyOnDisk(), f.expected, 'reading changed nothing on disk');
});

test('an invalid profile cannot be connected with: a marked copy never normalises', (t) => {
  const f = fixture(t);
  const corp = f.store.listAll().find((p) => p.id === 'legacy-corp');
  assert.throws(() => require('../src/main/lib/validation.cjs').normalizeProfile(corp), (error) => error.field === 'username' && /user@domain/u.test(error.message));
  // The marker cannot be forged away by a caller either: saving over it re-validates the real fields.
  assert.throws(() => f.store.save({ ...corp, invalid: undefined }), /user@domain/u);
  assert.throws(() => f.store.save({ ...corp }), /user@domain/u);
  assert.deepEqual(f.legacyOnDisk(), f.expected);
});

test('an unrelated import over legacy-invalid rows leaves those rows byte for byte', (t) => {
  const f = fixture(t);
  const before = f.legacyOnDisk();
  const summary = f.store.importSafe({ format: 'aux-command-profiles', version: 1, profiles: [{ name: 'Fresh', protocol: 'ssh', host: 'fresh.example', username: 'ops' }] });
  assert.equal(summary.added, 1);
  assert.deepEqual(f.legacyOnDisk(), before);
  assert.equal(JSON.stringify(f.legacyOnDisk()), JSON.stringify(f.expected));
  assert.ok(f.storedRows().some((row) => row.name === 'Fresh'));
  // Same under 'replace' style merges and a second import.
  f.store.importSafe({ format: 'aux-command-profiles', version: 1, profiles: [{ name: 'Fresh', protocol: 'ssh', host: 'fresh.example', username: 'ops', notes: 'changed' }] });
  assert.deepEqual(f.legacyOnDisk(), before);
  assert.ok(f.store.listAll().filter((p) => p.invalid).length === LEGACY.length);
});

test('an imported profile never takes the id of a stored invalid row', (t) => {
  const f = fixture(t);
  f.store.importSafe({ format: 'aux-command-profiles', version: 1, profiles: [{ id: 'legacy-corp', name: 'Other', protocol: 'ssh', host: 'other.example', username: 'ops' }] }, 'copy');
  assert.deepEqual(f.legacyOnDisk(), f.expected);
  assert.ok(f.storedRows().some((row) => row.name === 'Other' && row.id !== 'legacy-corp'));
});

test('save, move, bulk update and sync-style rewrites keep rows they cannot normalise', (t) => {
  const f = fixture(t);
  const before = f.legacyOnDisk();
  const created = f.store.save({ name: 'New', protocol: 'ssh', host: 'new.example', username: 'ops' });
  f.store.save({ ...created, notes: 'edited' });
  f.store.moveGroup?.(created.id, 'Elsewhere');
  f.store.bulkUpdate([created.id], { group: 'Bulk' });
  f.store.delete(created.id);
  assert.deepEqual(f.legacyOnDisk(), before);
  assert.equal(JSON.stringify(f.legacyOnDisk()), JSON.stringify(f.expected));
});

test('a bulk change that includes an invalid row refuses with its reason and writes nothing', (t) => {
  const f = fixture(t);
  const raw = fs.readFileSync(f.file);
  assert.throws(() => f.store.bulkUpdate(['legacy-corp'], { group: 'X' }), /user@domain/u);
  assert.deepEqual(fs.readFileSync(f.file), raw);
});

test('an invalid profile can be edited to a valid value and then connects', (t) => {
  const f = fixture(t);
  const corp = f.store.listAll().find((p) => p.id === 'legacy-corp');
  const { invalid, ...fields } = corp;
  const fixed = f.store.save({ ...fields, username: 'jd@corp' });
  assert.equal(fixed.id, 'legacy-corp');
  assert.equal(fixed.credentialId, 'cred-corp');
  assert.equal(f.store.get('legacy-corp').username, 'jd@corp');
  assert.equal(f.store.listAll().find((p) => p.id === 'legacy-corp').invalid, undefined);
  assert.equal(f.storedRows().filter((row) => row.id === 'legacy-corp').length, 1);
  assert.deepEqual(f.legacyOnDisk().filter((row) => row.id !== 'legacy-corp'), f.expected.filter((row) => row.id !== 'legacy-corp'));
});

// A stored row that fails on its username only, with every other field set to
// something other than the default and the long text over 500 characters.
const RICH = {
  id: 'legacy-rich', name: 'Rich', protocol: 'ssh', group: 'Work', host: 'rich.example', port: 2222, username: 'CORP\\jd',
  identityFile: '/home/rich/.ssh/id_rich', knownHostsFile: '/home/rich/.ssh/kh_rich', proxyJump: 'bastion:2200', credentialId: 'cred-rich', credentialKind: 'passphrase',
  startupCommand: `tmux attach || tmux new ${'x'.repeat(1400)}`, notes: `line one\nline two ${'n'.repeat(3000)}`,
  keepAliveSeconds: 77, compression: true, agentForwarding: true, x11Forwarding: true, trackRemoteCwd: true, terminalFontSize: 19,
  terminalScrollback: 54321, terminalTheme: 'aux-dark', favorite: true, tabColor: '', tags: ['a', 'b'], createdAt: '2020-01-02T03:04:05.000Z',
  updatedAt: '2021-01-02T03:04:05.000Z', useSshConfig: false, sftpRoot: '/srv', transferMode: 'scp', baudRate: 9600, rdpWidth: 1280, rdpHeight: 800,
  rdpDomain: 'CORP', rdpAudio: true, inheritTerminalDefaults: true, terminalCursorBlink: false, terminalCursorStyle: 'bar',
  terminalFontFamily: 'Hack, monospace', futureField: { keep: 1 }
};
const KNOWN = Object.keys(RICH).filter((key) => key !== 'futureField');

function savedAfterFix(f, save) {
  const view = f.store.listAll().find((p) => p.id === 'legacy-rich');
  assert.equal(view.invalid.field, 'username');
  const saved = save(view);
  assert.equal(saved.username, 'jd@corp');
  const row = f.storedRows().find((r) => r.id === 'legacy-rich');
  for (const key of KNOWN) {
    if (key === 'username' || key === 'updatedAt') continue;
    assert.deepEqual(row[key], RICH[key], `${key} kept`);
  }
  assert.equal(row.username, 'jd@corp');
  assert.equal(row.futureField, undefined, 'unknown fields are still dropped');
  assert.notEqual(row.updatedAt, RICH.updatedAt);
}

test('the editor view of an invalid row carries every editable field at full length', (t) => {
  const f = fixture(t, [RICH]);
  const view = f.store.listAll().find((p) => p.id === 'legacy-rich');
  for (const key of KNOWN) {
    if (key === 'username') continue;
    assert.deepEqual(view[key], RICH[key], `${key} in the view`);
  }
  assert.equal(view.notes.length, RICH.notes.length);
  assert.equal(view.startupCommand.length, RICH.startupCommand.length);
  assert.equal(view.futureField, undefined);
});

test('fixing only the username of an invalid row keeps every other field byte for byte (store-level save of the view)', (t) => {
  const f = fixture(t, [RICH]);
  savedAfterFix(f, (view) => f.store.save({ ...view, username: 'jd@corp' }));
});

test('fixing only the username keeps every other field when the payload is only what the editor form sends', (t) => {
  const f = fixture(t, [RICH]);
  // The renderer's saveProfile spreads the stored fields and then overwrites each form field with its (unchanged) value.
  savedAfterFix(f, (view) => {
    const { invalid: _invalid, ...existingFields } = view;
    return f.store.save({
      ...existingFields, id: view.id, name: view.name, protocol: view.protocol, group: view.group, host: view.host, port: Number(view.port),
      username: 'jd@corp', identityFile: view.identityFile, knownHostsFile: view.knownHostsFile, proxyJump: view.proxyJump,
      keepAliveSeconds: Number(view.keepAliveSeconds), startupCommand: view.startupCommand, trackRemoteCwd: view.trackRemoteCwd,
      notes: view.notes, favorite: view.favorite, compression: view.compression, agentForwarding: view.agentForwarding,
      x11Forwarding: view.x11Forwarding, terminalFontSize: Number(view.terminalFontSize), credentialId: view.credentialId
    });
  });
});

test('saving an id-only payload over an invalid row still starts from the full stored row', (t) => {
  const f = fixture(t, [RICH]);
  const saved = f.store.save({ id: 'legacy-rich', username: 'jd@corp' });
  assert.equal(saved.notes, RICH.notes);
  assert.equal(saved.startupCommand, RICH.startupCommand);
  assert.equal(saved.keepAliveSeconds, 77);
  assert.equal(saved.createdAt, RICH.createdAt);
});

test('a refused save over an invalid row leaves the stored row byte for byte', (t) => {
  const f = fixture(t, [RICH]);
  const before = fs.readFileSync(f.file);
  assert.throws(() => f.store.save({ id: 'legacy-rich', username: 'still bad' }), /user name|username/iu);
  assert.deepEqual(fs.readFileSync(f.file), before);
});

test('delete removes an invalid row, returns true, and leaves the others', (t) => {
  const f = fixture(t);
  assert.equal(f.store.delete('legacy-space'), true);
  assert.equal(f.storedRows().some((row) => row.id === 'legacy-space'), false);
  assert.equal(f.store.delete('legacy-space'), false);
  assert.equal(f.legacyOnDisk().length, LEGACY.length - 1);
});

test('deleting an invalid profile also removes its saved credential from the vault', async (t) => {
  const f = fixture(t);
  const handlers = new Map();
  const deleted = [];
  const webContents = { mainFrame: {} };
  registerIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    dialog: {}, clipboard: {}, shell: {}, app: { getVersion: () => '1', getName: () => 'Aux Command' },
    profileStore: f.store, settingsStore: {}, terminalService: { list: () => [] }, externalService: {}, tunnelService: { list: () => [] }, sftpService: {},
    vaultService: { status: () => ({}), delete: (id) => { deleted.push(id); return true; } },
    promptBroker: {}, systemService: {}, updateService: { getStatus: () => ({}) }, recoveryService: { snapshot: () => {} },
    getWindow: () => ({ webContents })
  });
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const listed = await handlers.get('profiles:list')(event);
  assert.ok(listed.find((p) => p.id === 'legacy-corp').invalid);
  assert.equal(await handlers.get('profiles:delete')(event, 'legacy-corp'), true);
  assert.deepEqual(deleted, ['cred-corp']);
  assert.equal(f.storedRows().some((row) => row.id === 'legacy-corp'), false);
});

test('a JSON import lists every refused entry with its reason and imports the good ones', (t) => {
  const f = fixture(t, []);
  const payload = {
    format: 'aux-command-profiles', version: 1,
    profiles: [
      { name: 'Good one', protocol: 'ssh', host: 'one.example', username: 'ops' },
      { name: 'Corp', protocol: 'ssh', host: 'corp.example', username: 'CORP\\jd' },
      { name: 'Spaced', protocol: 'ssh', host: 'space.example', username: 'first last' },
      { name: 'Paren', protocol: 'ssh', host: 'paren.example', username: 'jd(ops)' },
      { name: 'Glob', protocol: 'ssh', host: 'glob.example', username: 'jd', proxyJump: '{touch,/tmp/f}' },
      'not an object',
      { name: 'Good two', protocol: 'ssh', host: 'two.example', username: 'ops' }
    ]
  };
  const preview = f.store.previewImport(payload);
  assert.equal(preview.rejected, 5);
  assert.equal(preview.rejectedEntries.length, 5);
  assert.deepEqual(preview.rejectedEntries.map((e) => e.name), ['Corp', 'Spaced', 'Paren', 'Glob', '']);
  assert.deepEqual(preview.rejectedEntries.map((e) => e.field), ['username', 'username', 'username', 'proxyJump', '']);
  assert.ok(preview.rejectedEntries.every((e) => e.reason));
  assert.equal(preview.added, 2);
  const result = f.store.importSafe(payload);
  assert.equal(result.added, 2);
  assert.equal(result.rejected, 5);
  assert.deepEqual(result.rejectedEntries.map((e) => e.index), [2, 3, 4, 5, 6]);
  const names = f.store.list().map((p) => p.name);
  assert.ok(names.includes('Good one') && names.includes('Good two'));
  assert.ok(!names.includes('Corp'));
});

test('an SSH config import lists every refused host with its reason', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-invalid-ssh-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  t.mock.method(os, 'homedir', () => directory);
  fs.mkdirSync(path.join(directory, '.ssh'));
  const config = path.join(directory, '.ssh/config');
  fs.writeFileSync(config, [
    'Host good\n  HostName good.example\n  User ops',
    'Host bad-one\n  HostName one.example\n  User CORP\\jd',
    'Host bad-two\n  HostName two.example\n  User jd\n  ProxyJump {a,b}',
    'Host good-two\n  HostName two-good.example\n  User ops', ''
  ].join('\n'));
  const store = new ProfileStore(path.join(directory, 'data'), { sshConfigFile: config });
  const result = await store.importSshConfig();
  assert.equal(result.added, 2);
  assert.deepEqual(result.skipped.map((s) => s.alias).sort(), ['bad-one', 'bad-two']);
  assert.ok(result.skipped.every((s) => s.field && s.reason));
});
