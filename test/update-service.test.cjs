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
