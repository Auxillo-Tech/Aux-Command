'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { registerIpc } = require('../src/main/ipc.cjs');

function fixture() {
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const webContents = { mainFrame: {} };
  const window = { webContents };
  registerIpc({
    ipcMain,
    dialog: {},
    clipboard: {},
    shell: {},
    app: { getVersion: () => '0.1.0', getName: () => 'Aux Command' },
    profileStore: { list: () => [], snippets: () => [] },
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
});
