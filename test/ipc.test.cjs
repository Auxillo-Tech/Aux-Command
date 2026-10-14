'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { registerIpc } = require('../src/main/ipc.cjs');

function fixture(clipboard = {}, shell = {}) {
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const webContents = { mainFrame: {} };
  const window = { webContents };
  registerIpc({
    ipcMain,
    dialog: {},
    clipboard,
    shell,
    app: { getVersion: () => '0.1.0', getName: () => 'Aux Command' },
    profileStore: { list: () => [], snippets: () => [] },
    settingsStore: { get: () => ({ version: 1, workspace: { layout: 'single', paneMinWidth: 320, paneMinHeight: 220 } }), saveWorkspace: (workspace) => ({ version: 1, workspace }) },
    terminalService: { list: () => [] },
    externalService: {},
    tunnelService: { list: () => [] },
    sftpService: {},
    vaultService: { status: () => ({ persistentEncryptionAvailable: false }) },
    promptBroker: {},
    systemService: { diagnostics: () => ({ platform: 'linux' }) },
    updateService: {
      getStatus: () => ({ supported: false }),
      check: () => ({ supported: false }),
      download: () => ({ supported: false }),
      quitAndInstall: () => false
    },
    getWindow: () => window
  });
  return { handlers, webContents };
}

test('IPC rejects non-main-window senders and subframes', async () => {
  const { handlers, webContents } = fixture();
  const handler = handlers.get('app:get-state');
  await assert.rejects(
    handler({ sender: {}, senderFrame: webContents.mainFrame }),
    /Untrusted IPC sender/u
  );
  await assert.rejects(
    handler({ sender: webContents, senderFrame: {} }),
    /Untrusted IPC sender/u
  );
});

test('IPC accepts the current main window main frame', async () => {
  const { handlers, webContents } = fixture();
  const state = await handlers.get('app:get-state')({
    sender: webContents,
    senderFrame: webContents.mainFrame
  });
  assert.equal(state.name, 'Aux Command');
  assert.equal(state.version, '0.1.0');
  assert.deepEqual(state.profiles, []);
  assert.deepEqual(state.settings.workspace, { layout: 'single', paneMinWidth: 320, paneMinHeight: 220 });
});

test('clipboard IPC reaches the Linux primary selection only when asked', async () => {
  const calls = [];
  const clipboard = { writeText: (text, type) => calls.push(['write', text, type]), readText: (type) => { calls.push(['read', type]); return type === 'selection' ? 'highlighted' : 'copied'; } };
  const { handlers, webContents } = fixture(clipboard);
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  await handlers.get('clipboard:write-text')(event, 'one');
  await handlers.get('clipboard:write-text')(event, 'two', 'selection');
  await handlers.get('clipboard:write-text')(event, 'three', 'find');
  const primary = process.platform === 'linux' ? 'selection' : 'clipboard';
  assert.deepEqual(calls, [['write', 'one', 'clipboard'], ['write', 'two', primary], ['write', 'three', 'clipboard']]);
  assert.equal(await handlers.get('clipboard:read-text')(event, 'selection'), process.platform === 'linux' ? 'highlighted' : 'copied');
  assert.equal(await handlers.get('clipboard:read-text')(event), 'copied');
  await assert.rejects(handlers.get('clipboard:write-text')(event, 42), /Invalid clipboard text/u);
});

test('terminal links open only http and https URLs', async () => {
  const opened = [];
  const { handlers, webContents } = fixture({}, { openExternal: async (url) => { opened.push(url); } });
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  await handlers.get('system:open-url')(event, 'https://auxillo.tech/docs?a=1');
  for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'ssh://host', 'not a url', `https://x.test/${'a'.repeat(3000)}`]) {
    await assert.rejects(handlers.get('system:open-url')(event, bad));
  }
  assert.deepEqual(opened, ['https://auxillo.tech/docs?a=1']);
});
