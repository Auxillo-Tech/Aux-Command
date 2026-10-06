'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  UpdateService,
  RELEASE_SIGNING_FINGERPRINT,
  validateReleaseMetadata,
  verifyDetachedManifest
} = require('../src/main/services/update-service.cjs');

const manifestPath = path.join(__dirname, 'fixtures/update-auth-manifest.json');
const signaturePath = `${manifestPath}.asc`;
const publicKeyPath = path.join(__dirname, '../SIGNING_KEY.asc');
const updaterBytes = Buffer.from('version: 9.9.9\n');

function releaseMetadata() {
  return {
    tag_name: 'v9.9.9',
    draft: false,
    prerelease: false,
    assets: [
      { name: 'release-manifest.json', browser_download_url: 'https://fixture/manifest' },
      { name: 'release-manifest.json.asc', browser_download_url: 'https://fixture/signature' },
      { name: 'latest-linux.yml', browser_download_url: 'https://fixture/latest' }
    ]
  };
}

test('signed updater manifest fixture authenticates with the bundled Aux Command key', async () => {
  const manifest = fs.readFileSync(manifestPath);
  const signature = fs.readFileSync(signaturePath, 'utf8');
  const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  assert.equal(await verifyDetachedManifest(manifest, signature, publicKey), RELEASE_SIGNING_FINGERPRINT);
  await assert.rejects(
    () => verifyDetachedManifest(Buffer.concat([manifest, Buffer.from('tampered')]), signature, publicKey),
    /signature|Signed digest did not match|Could not find valid/u
  );
});

test('release metadata validation binds version and updater bytes to signed manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const validated = validateReleaseMetadata(releaseMetadata(), manifest, 'latest-linux.yml', updaterBytes);
  assert.equal(validated.version, '9.9.9');
  assert.throws(
    () => validateReleaseMetadata(releaseMetadata(), manifest, 'latest-linux.yml', Buffer.from('tampered')),
    /does not match/u
  );
});

test('UpdateService checks electron-updater only after authenticating the published release', async () => {
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => {
    updater.emit('update-available', { version: '9.9.9' });
    return { updateInfo: { version: '9.9.9' } };
  };
  updater.downloadUpdate = async () => {};
  updater.quitAndInstall = () => {};
  const release = Buffer.from(JSON.stringify(releaseMetadata()));
  const responses = new Map([
    ['https://api.github.com/repos/Auxillo-Tech/Aux-Command/releases/latest', release],
    ['https://fixture/manifest', fs.readFileSync(manifestPath)],
    ['https://fixture/signature', fs.readFileSync(signaturePath)],
    ['https://fixture/latest', updaterBytes]
  ]);
  const fetch = async (url) => {
    const data = responses.get(String(url));
    return data
      ? new Response(data, { status: 200, headers: { 'content-length': String(data.length) } })
      : new Response('missing', { status: 404 });
  };
  const app = { isPackaged: true, getVersion: () => '1.0.0', getAppPath: () => path.join(__dirname, '..') };
  const service = new UpdateService(app, () => null, { updater, fetch, publicKeyPath });
  const status = await service.check();
  assert.equal(status.authenticated, true);
  assert.equal(status.updateAvailable, true);
  assert.equal(status.latestVersion, '9.9.9');
  assert.equal(status.error, null);
});

const os = require('node:os');
const { sha256, verifyDownloadedArtifact } = require('../src/main/services/update-service.cjs');
function downloadFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-updater-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'candidate.AppImage');
  const bytes = Buffer.from('authenticated installer'); fs.writeFileSync(filename, bytes);
  const manifest = { artifacts: [{ name: 'candidate.AppImage', kind: 'appimage', size: bytes.length, sha256: sha256(bytes) }] };
  const updater = new EventEmitter();
  updater.downloadUpdate = async () => { updater.emit('update-downloaded', { version: '9.9.9' }); return [filename]; };
  let installs = 0;
  updater.quitAndInstall = () => { installs++; };
  const app = { isPackaged: true, getVersion: () => '1.0.0', getAppPath: () => path.join(__dirname, '..') };
  const service = new UpdateService(app, () => null, { updater });
  service.verifiedRelease = { version: '9.9.9', manifest };
  Object.assign(service.status, { authenticated: true, updateAvailable: true, latestVersion: '9.9.9' });
  return { filename, manifest, updater, service, installs: () => installs };
}

test('installer verification rejects same-size tampering and unsigned artifacts', async (t) => {
  const f = downloadFixture(t);
  await verifyDownloadedArtifact(f.filename, f.manifest);
  fs.writeFileSync(f.filename, 'tampered installer data');
  assert.equal(fs.statSync(f.filename).size, f.manifest.artifacts[0].size);
  await assert.rejects(() => verifyDownloadedArtifact(f.filename, f.manifest), /does not match/);
  await assert.rejects(() => verifyDownloadedArtifact(f.filename, { artifacts: [] }), /not included/);
});

test('download event cannot bypass authentication and installation rechecks bytes', async (t) => {
  const f = downloadFixture(t);
  f.updater.emit('update-downloaded', { version: '9.9.9' });
  assert.equal(f.service.getStatus().downloaded, false);
  await assert.rejects(() => f.service.quitAndInstall(), /No authenticated/);
  await f.service.download();
  assert.equal(f.service.getStatus().downloaded, true);
  fs.writeFileSync(f.filename, 'tampered installer data');
  await assert.rejects(() => f.service.quitAndInstall(), /does not match/);
  assert.equal(f.installs(), 0);
  assert.equal(f.service.getStatus().downloaded, false);
});

test('authenticated installer completes download and installation handoff', async (t) => {
  const f = downloadFixture(t);
  await f.service.download();
  assert.equal(await f.service.quitAndInstall(), true);
  assert.equal(f.installs(), 1);
});

test('updater prevents overlapping checks and downloads and recovers from interrupted downloads', async (t) => {
  const f = downloadFixture(t);
  let rejectDownload;
  f.updater.downloadUpdate = () => new Promise((resolve, reject) => { rejectDownload = reject; });
  const download = f.service.download();
  await assert.rejects(() => f.service.check(), /already in progress/);
  rejectDownload(new Error('Connection interrupted'));
  await assert.rejects(() => download, /interrupted/);
  assert.equal(f.service.getStatus().downloaded, false);
  f.updater.downloadUpdate = async () => [f.filename];
  await f.service.download();
  assert.equal(f.service.getStatus().downloaded, true);
});
