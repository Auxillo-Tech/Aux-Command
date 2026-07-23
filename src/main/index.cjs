'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  dialog,
  ipcMain,
  safeStorage,
  shell
} = require('electron');
const { ProfileStore } = require('./lib/profile-store.cjs');
const { SettingsStore } = require('./lib/settings-store.cjs');
const { PromptBroker } = require('./lib/prompt-broker.cjs');
const { ExternalService } = require('./services/external-service.cjs');
const { KnownHostService } = require('./services/known-host-service.cjs');
const { SftpService } = require('./services/sftp-service.cjs');
const { SystemService } = require('./services/system-service.cjs');
const { TerminalService } = require('./services/terminal-service.cjs');
const { TunnelService } = require('./services/tunnel-service.cjs');
const { UpdateService } = require('./services/update-service.cjs');
const { VaultService } = require('./services/vault-service.cjs');
const { registerIpc } = require('./ipc.cjs');

app.setName('Aux Command');
app.setAppUserModelId('tech.auxillo.command');
app.disableHardwareAcceleration();

let mainWindow = null;
let services = null;
const getWindow = () => mainWindow;
let rendererRecoveryTimer = null;
let rendererRecoveryInFlight = false;

function recoverRenderer(reason, details = {}) {
  if (!mainWindow || mainWindow.isDestroyed() || rendererRecoveryInFlight) return;
  rendererRecoveryInFlight = true;
  const payload = JSON.stringify({ reason, details, at: new Date().toISOString() });
  process.stderr.write(`Aux Command renderer recovery: ${payload}\n`);
  services?.sftpService.disconnectAll();
  services?.promptBroker.cancelAll('Renderer was restarted');
  mainWindow.webContents.once('did-finish-load', () => { rendererRecoveryInFlight = false; });
  mainWindow.webContents.once('did-fail-load', () => { rendererRecoveryInFlight = false; });
  mainWindow.webContents.reloadIgnoringCache();
}

function createWindow() {
  const development = process.argv.includes('--dev');
  const icon = path.join(__dirname, '../../build/icons/256x256.png');
  mainWindow = new BrowserWindow({
    title: 'Aux Command',
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#071018',
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: development,
      navigateOnDragDrop: false
    }
  });

  const indexFile = path.join(__dirname, '../renderer/index.html');
  const indexUrl = pathToFileURL(indexFile).toString();
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== indexUrl) event.preventDefault();
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    recoverRenderer('render-process-gone', { reason: details.reason, exitCode: details.exitCode });
  });
  mainWindow.webContents.on('unresponsive', () => {
    if (rendererRecoveryTimer) clearTimeout(rendererRecoveryTimer);
    rendererRecoveryTimer = setTimeout(() => recoverRenderer('unresponsive'), 5_000);
    rendererRecoveryTimer.unref();
  });
  mainWindow.webContents.on('responsive', () => {
    if (rendererRecoveryTimer) {
      clearTimeout(rendererRecoveryTimer);
      rendererRecoveryTimer = null;
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    if (rendererRecoveryTimer) clearTimeout(rendererRecoveryTimer);
    rendererRecoveryTimer = null;
    rendererRecoveryInFlight = false;
    mainWindow = null;
  });
  mainWindow.loadFile(indexFile);

  if (development) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function initializeServices() {
  const dataDir = path.join(app.getPath('userData'), 'aux-command-data');
  const profileStore = new ProfileStore(dataDir);
  const settingsStore = new SettingsStore(dataDir);
  const promptBroker = new PromptBroker(getWindow);
  const vaultService = new VaultService(dataDir, safeStorage);
  const knownHostService = new KnownHostService(dataDir, promptBroker);
  const terminalService = new TerminalService(getWindow);
  const tunnelService = new TunnelService(profileStore, getWindow);
  const sftpService = new SftpService(vaultService, knownHostService, promptBroker, getWindow);
  const externalService = new ExternalService();
  const systemService = new SystemService();
  const updateService = new UpdateService(app, getWindow);

  services = {
    profileStore,
    settingsStore,
    promptBroker,
    vaultService,
    knownHostService,
    terminalService,
    tunnelService,
    sftpService,
    externalService,
    systemService,
    updateService
  };

  registerIpc({
    ipcMain,
    dialog,
    clipboard,
    shell,
    app,
    ...services,
    getWindow
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    initializeServices();
    createWindow();
  });
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  services?.terminalService.closeAll();
  services?.tunnelService.stopAll();
  services?.sftpService.disconnectAll();
  services?.vaultService.clearMemory();
  services?.promptBroker.cancelAll();
});
