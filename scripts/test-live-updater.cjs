'use strict';
// Run with Electron under a disposable X display. All installation writes are
// restricted to a new temporary directory; no installed application is touched.
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { AppImageUpdater } = require('electron-updater');
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
const { UpdateService, verifyDownloadedArtifact } = require('../src/main/services/update-service.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-live-updater-'));
app.setPath('userData', path.join(directory, 'electron'));
app.whenReady().then(async () => {
  const image = path.join(directory, 'Aux-Command.AppImage');
  fs.writeFileSync(image, 'isolated old application placeholder');
  process.env.APPIMAGE = image;
  const config = path.join(directory, 'app-update.yml');
  fs.writeFileSync(config, 'provider: github\nowner: Auxillo-Tech\nrepo: Aux-Command\nupdaterCacheDirName: cache\n');
  let installed = false;
  const adapter = {
    version: '0.0.1', name: 'aux-command', isPackaged: true,
    appUpdateConfigPath: config, userDataPath: path.join(directory, 'data'), baseCachePath: directory,
    whenReady: async () => {}, relaunch() {}, onQuit() {},
    quit() { installed = true; }
  };
  const updater = new AppImageUpdater(null, adapter);
  updater.httpExecutor = new ElectronHttpExecutor();
  updater.disableDifferentialDownload = true;
  // Verify the actual installation destination, while leaving the desktop
  // launch to the separately isolated packaged-app smoke test.
  updater.spawnLog = async (destination) => assert.equal(destination, image);
  const service = new UpdateService({
    isPackaged: true, getVersion: () => adapter.version, getAppPath: () => path.resolve(__dirname, '..')
  }, () => null, { updater });
  const checked = await service.check();
  assert.equal(checked.authenticated, true);
  assert.equal(checked.updateAvailable, true);
  const downloaded = await service.download();
  assert.equal(downloaded.downloaded, true);
  await service.quitAndInstall();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(installed, true);
  await verifyDownloadedArtifact(image, service.verifiedRelease.manifest);
  console.log(JSON.stringify({ passed: true, version: checked.latestVersion, signedMetadata: true, realDownload: true, realInstallerReplacement: true, installedImage: image }));
  app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
