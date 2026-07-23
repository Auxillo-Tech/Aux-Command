'use strict';

const { autoUpdater } = require('electron-updater');

class UpdateService {
  constructor(app, getWindow) {
    this.app = app;
    this.getWindow = getWindow;
    this.status = {
      supported: Boolean(app.isPackaged),
      checking: false,
      updateAvailable: false,
      downloaded: false,
      version: app.getVersion(),
      channel: 'github-releases',
      transport: 'github',
      lastCheckedAt: null,
      latestVersion: null,
      error: null
    };

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => this.#merge({ checking: true, error: null }));
    autoUpdater.on('update-available', (info) => this.#merge({
      checking: false,
      updateAvailable: true,
      downloaded: false,
      latestVersion: info?.version || null,
      error: null
    }));
    autoUpdater.on('update-not-available', (info) => this.#merge({
      checking: false,
      updateAvailable: false,
      downloaded: false,
      latestVersion: info?.version || this.app.getVersion(),
      error: null
    }));
    autoUpdater.on('update-downloaded', (info) => this.#merge({
      checking: false,
      updateAvailable: true,
      downloaded: true,
      latestVersion: info?.version || this.status.latestVersion,
      error: null
    }));
    autoUpdater.on('error', (error) => this.#merge({ checking: false, error: error?.message || String(error) }));
  }

  getStatus() {
    return { ...this.status };
  }

  async check() {
    if (!this.app.isPackaged) {
      this.#merge({
        supported: false,
        checking: false,
        error: 'Update checks are only enabled in packaged releases.'
      });
      return this.getStatus();
    }
    this.#merge({ supported: true, checking: true, lastCheckedAt: new Date().toISOString(), error: null });
    await autoUpdater.checkForUpdates();
    return this.getStatus();
  }

  async download() {
    if (!this.app.isPackaged) throw new Error('Update downloads are only enabled in packaged releases.');
    if (!this.status.updateAvailable) throw new Error('No update is currently available.');
    await autoUpdater.downloadUpdate();
    return this.getStatus();
  }

  quitAndInstall() {
    if (!this.status.downloaded) throw new Error('No downloaded update is ready to install.');
    autoUpdater.quitAndInstall(false, true);
    return true;
  }

  #merge(patch) {
    this.status = { ...this.status, ...patch };
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('updates:status', this.getStatus());
  }
}

module.exports = { UpdateService };
