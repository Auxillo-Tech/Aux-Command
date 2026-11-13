'use strict';

// UpdateService.check() must hand the signed release and the running version
// to the package updater, show its answer, and install in the right order.
// test/package-updater.test.cjs sets service.packagePlan by hand, so it never
// drives this wiring. Here the real UpdateService runs against the signed
// fixture manifest, with a recording package updater and a recording recovery
// service in place of the ones that talk to the system.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { UpdateService } = require('../src/main/services/update-service.cjs');

const manifestPath = path.join(__dirname, 'fixtures/update-auth-manifest.json');
const publicKeyPath = path.join(__dirname, '../SIGNING_KEY.asc');
const updaterBytes = Buffer.from('version: 9.9.9\n');
const releaseMeta = {
  tag_name: 'v9.9.9',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'release-manifest.json', browser_download_url: 'https://fixture/manifest' },
    { name: 'release-manifest.json.asc', browser_download_url: 'https://fixture/signature' },
    { name: 'latest-linux.yml', browser_download_url: 'https://fixture/latest' }
  ]
};
const availablePlan = {
  available: true,
  kind: 'deb',
  version: '9.9.9',
  artifact: { name: 'Aux-Command-9.9.9-amd64.deb', size: 1, sha256: 'a'.repeat(64) },
  url: 'https://github.com/x'
};

function rig(version, planResults, { installError = null, file = '/nonexistent/pkg.deb' } = {}) {
  const responses = new Map([
    ['https://api.github.com/repos/Auxillo-Tech/Aux-Command/releases/latest', Buffer.from(JSON.stringify(releaseMeta))],
    ['https://fixture/manifest', fs.readFileSync(manifestPath)],
    ['https://fixture/signature', fs.readFileSync(`${manifestPath}.asc`)],
    ['https://fixture/latest', updaterBytes]
  ]);
  const fetch = async (url) => {
    const body = responses.get(String(url));
    return body ? new Response(body, { status: 200 }) : new Response('no', { status: 404 });
  };
  // electron-updater is inactive on deb and rpm installs: it resolves null.
  const updater = Object.assign(new EventEmitter(), { checkForUpdates: async () => null });
  const calls = [];
  const signedSeen = [];
  const packageUpdater = {
    plan: async (release, current) => { calls.push(['plan', release.version, current]); signedSeen.push(release.signed); return planResults.shift(); },
    download: async (plan) => { calls.push(['download', plan.artifact.name]); return file; },
    install: async (downloaded, plan) => {
      calls.push(['install', downloaded, plan.version]);
      if (installError) throw installError;
    }
  };
  const app = {
    isPackaged: true,
    getVersion: () => version,
    getAppPath: () => path.join(__dirname, '..'),
    relaunch: () => calls.push(['relaunch']),
    quit: () => calls.push(['quit'])
  };
  const recoveryService = { snapshot: (reason) => calls.push(['snapshot', reason]) };
  const service = new UpdateService(app, () => null, {
    updater, fetch, publicKeyPath, arch: 'x64', packageUpdater, recoveryService
  });
  return { service, calls, signedSeen };
}

test('check() asks the package updater about the signed release and this app version, and the button follows', async () => {
  const { service, calls } = rig('0.5.0', [availablePlan]);
  const status = await service.check();
  assert.deepEqual(calls[0], ['plan', '9.9.9', '0.5.0']);
  assert.equal(status.updateAvailable, true);
  assert.equal(status.error, null);
  assert.equal(status.downloaded, false);
  assert.equal((await service.download()).downloaded, true);
  assert.deepEqual(calls.at(-1), ['download', 'Aux-Command-9.9.9-amd64.deb']);
});

test('check() shows the reason and offers nothing when the package updater cannot install', async () => {
  const { service, calls } = rig('0.5.0', [{ available: false, reason: 'pkexec is not installed' }]);
  const status = await service.check();
  assert.equal(status.updateAvailable, false);
  assert.equal(status.error, 'pkexec is not installed');
  await assert.rejects(() => service.download());
  assert.equal(calls.some((call) => call[0] === 'download'), false);
});

test('a second check forgets the plan from the first', async () => {
  const { service, calls } = rig('0.5.0', [availablePlan, { available: false, reason: 'gone' }]);
  await service.check();
  await service.check();
  await assert.rejects(() => service.download());
  assert.equal(calls.some((call) => call[0] === 'download'), false);
});

test('installing snapshots the workspace first, installs, then relaunches and quits', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-update-wiring-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'pkg.deb');
  fs.writeFileSync(file, 'x');
  const { service, calls } = rig('0.5.0', [availablePlan], { file });
  await service.check();
  await service.download();
  await service.quitAndInstall();
  assert.deepEqual(calls.map((call) => call[0]).slice(-4), ['snapshot', 'install', 'relaunch', 'quit']);
  assert.deepEqual(calls.find((call) => call[0] === 'install'), ['install', file, '9.9.9']);
});

test('a failed install does not relaunch and keeps the file for another try', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-update-wiring-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'pkg.deb');
  fs.writeFileSync(file, 'x');
  const { service, calls } = rig('0.5.0', [availablePlan], { file, installError: new Error('administrator permission was not given') });
  await service.check();
  await service.download();
  await assert.rejects(() => service.quitAndInstall(), /administrator permission was not given/u);
  assert.equal(calls.some((call) => call[0] === 'relaunch' || call[0] === 'quit'), false);
  assert.equal(service.getStatus().downloaded, true);
  assert.equal(service.getStatus().error, 'administrator permission was not given');
});


test('check() hands the package updater the exact signed manifest and signature the helper will verify again', async () => {
  const { service, signedSeen } = rig('0.5.0', [availablePlan]);
  await service.check();
  assert.equal(signedSeen.length, 1);
  assert.deepEqual(signedSeen[0].manifest, fs.readFileSync(manifestPath));
  assert.deepEqual(signedSeen[0].signature, fs.readFileSync(`${manifestPath}.asc`));
});

test('each failure carries the step it belongs to, so the window names it correctly', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-update-wiring-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'pkg.deb');
  fs.writeFileSync(file, 'x');
  const noPlan = rig('0.5.0', [{ available: false, reason: 'pkexec is not installed' }]);
  assert.equal((await noPlan.service.check()).errorStage, 'check');
  const install = rig('0.5.0', [availablePlan], { file, installError: new Error('half-configured') });
  await install.service.check();
  assert.equal(install.service.getStatus().errorStage, null);
  await install.service.download();
  await assert.rejects(() => install.service.quitAndInstall());
  assert.equal(install.service.getStatus().errorStage, 'install');
  assert.equal(install.service.getStatus().installing, false);
});
