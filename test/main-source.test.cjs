'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
const ipcSource = fs.readFileSync(path.join(root, 'src/main/ipc.cjs'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'src/preload/index.cjs'), 'utf8');
const updateSource = fs.readFileSync(path.join(root, 'src/main/services/update-service.cjs'), 'utf8');
const smokeSource = fs.readFileSync(path.join(root, 'scripts/e2e-cdp-smoke.py'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('main process handles renderer crash and hang recovery paths', () => {
  assert.match(mainSource, /webContents\.on\('render-process-gone'/u);
  assert.match(mainSource, /details\.reason/u);
  assert.match(mainSource, /reloadIgnoringCache\(\)/u);
  assert.match(mainSource, /webContents\.on\('unresponsive'/u);
  assert.match(mainSource, /webContents\.on\('responsive'/u);
  assert.match(mainSource, /sftpService\.disconnectAll\(\)/u);
  assert.match(mainSource, /promptBroker\.cancelAll\('Renderer was restarted'\)/u);
});

test('main process disables hardware acceleration before app readiness', () => {
  const disableAt = mainSource.indexOf('app.disableHardwareAcceleration()');
  const readyAt = mainSource.indexOf('app.whenReady()');
  assert.ok(disableAt >= 0, 'hardware acceleration should be disabled explicitly');
  assert.ok(readyAt >= 0, 'app readiness handler should exist');
  assert.ok(disableAt < readyAt, 'hardware acceleration must be disabled before app readiness');
});

test('main process denies Chromium permission requests by default', () => {
  assert.match(mainSource, /setPermissionRequestHandler\(\(_webContents, _permission, callback\) => callback\(false\)\)/u);
  assert.match(mainSource, /setPermissionCheckHandler\(\(\) => false\)/u);
});

test('package exposes a CDP soak validation script', () => {
  assert.equal(packageJson.scripts['soak:cdp'], 'python3 scripts/soak-cdp.py');
  assert.equal(fs.existsSync(path.join(root, 'scripts/soak-cdp.py')), true);
});

test('CDP smoke keeps screenshot capture diagnostic-only', () => {
  assert.match(smokeSource, /def capture_screenshot\(cdp: CDP\) -> dict:/u);
  assert.match(smokeSource, /screenshot capture skipped after functional smoke passed/u);
  assert.match(smokeSource, /screenshotWarning/u);
  assert.match(smokeSource, /if \(!document\.getElementById\('terminal-stack'\)\.classList\.contains\('layout-grid'\)\)/u);
});

test('package exposes GitHub release update configuration', () => {
  assert.equal(packageJson.dependencies['electron-updater'], '6.8.9');
  assert.deepEqual(packageJson.build.publish, [{
    provider: 'github',
    owner: 'Auxillo-Tech',
    repo: 'Aux-Command',
    releaseType: 'release'
  }]);
  assert.match(mainSource, /new UpdateService\(app, getWindow[,)]/u);
  assert.match(updateSource, /this\.updater\.autoDownload = false/u);
  assert.match(updateSource, /checkForUpdates\(\)/u);
  assert.match(ipcSource, /updates:check/u);
  assert.match(preloadSource, /updates: Object\.freeze/u);
});

test('production package locks Electron runtime fuses', () => {
  assert.deepEqual(packageJson.build.electronFuses, {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false,
    grantFileProtocolExtraPrivileges: false
  });
});

test('main process hardening from the pre-release security review stays in place', () => {
  const sftpSource = fs.readFileSync(path.join(root, 'src/main/services/sftp-service.cjs'), 'utf8');
  const windowsSource = fs.readFileSync(path.join(root, 'src/main/services/terminal-windows.cjs'), 'utf8');
  const rdpSource = fs.readFileSync(path.join(root, 'src/main/services/rdp-embed.cjs'), 'utf8');
  // Identity files are checked before reading so /dev/zero or a FIFO cannot hang the app.
  assert.match(sftpSource, /if \(!stat\.isFile\(\)\) throw new Error\('not a regular file'\);\s*if \(stat\.size > 65_536\)/u);
  // Workspace backups list their startup commands before a restore.
  assert.match(ipcSource, /startupCommands \};/u);
  // Static and detached windows expose no developer tools in normal use; print has no script.
  assert.match(ipcSource, /javascript: false,\s*devTools: false/u);
  assert.match(windowsSource, /devTools:this\.devTools/u);
  // Subframes may only navigate to the isolated VNC viewer.
  assert.match(mainSource, /will-frame-navigate/u);
  assert.match(mainSource, /registerAppSchemes\(protocol\);/u);
  // Embedded RDP: cookie-protected display and a socket-only VNC server.
  assert.match(rdpSource, /'-auth', session\.xauthority\]/u);
  assert.match(rdpSource, /'-rfbport', '0',\s*'-rfbportv6', '-1',\s*'-unixsock', session\.x11vncSocket/u);
  assert.doesNotMatch(rdpSource, /'-rfbport', String\(/u);
});
