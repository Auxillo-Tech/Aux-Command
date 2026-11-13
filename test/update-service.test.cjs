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
  // The architecture is given, so the test reads the same file on any machine.
  const service = new UpdateService(app, () => null, { updater, fetch, publicKeyPath, arch: 'x64' });
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

const { packageArch, updaterMetadataName } = require('../src/main/lib/release-arch.cjs');

test('each architecture reads its own updater metadata and package names', () => {
  // electron-updater's own rule: no suffix on x64, the architecture elsewhere.
  assert.equal(updaterMetadataName('x64'), 'latest-linux.yml');
  assert.equal(updaterMetadataName('arm64'), 'latest-linux-arm64.yml');
  for (const [name, arch] of [
    ['Aux-Command-0.5.0-x86_64.AppImage', 'x64'], ['Aux-Command-0.5.0-amd64.deb', 'x64'], ['Aux-Command-0.5.0-x86_64.rpm', 'x64'], ['Aux-Command-0.5.0-x64.AppImage', 'x64'],
    ['Aux-Command-0.5.0-arm64.AppImage', 'arm64'], ['Aux-Command-0.5.0-arm64.deb', 'arm64'], ['Aux-Command-0.5.0-aarch64.rpm', 'arm64'],
    ['Aux-Command-0.5.0.rpm', ''], ['candidate.AppImage', ''], ['Aux-Command-0.5.0-riscv64.deb', ''], ['Aux-Command-0.5.0-arm64.AppImage.zip', ''], ['Aux-Command-0.5.0-constructor.deb', ''], [undefined, '']
  ]) assert.equal(packageArch(name), arch, String(name));
});

test('the updater metadata authenticated is the file for the running architecture', async () => {
  const armBytes = Buffer.from('version: 9.9.9\npath: Aux-Command-9.9.9-arm64.AppImage\n');
  const metadata = releaseMetadata();
  metadata.assets.push({ name: 'latest-linux-arm64.yml', browser_download_url: 'https://fixture/latest-arm64' });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const withArm = { ...manifest, artifacts: [...manifest.artifacts, { name: 'latest-linux-arm64.yml', kind: 'updater-metadata', size: armBytes.length, sha256: sha256(armBytes) }] };
  assert.equal(validateReleaseMetadata(metadata, withArm, updaterMetadataName('arm64'), armBytes).updaterName, 'latest-linux-arm64.yml');
  // The x64 file's bytes do not pass as the arm64 file, nor the reverse.
  assert.throws(() => validateReleaseMetadata(metadata, withArm, 'latest-linux-arm64.yml', updaterBytes), /does not match/u);
  assert.throws(() => validateReleaseMetadata(metadata, withArm, 'latest-linux.yml', armBytes), /does not match/u);
  assert.throws(() => validateReleaseMetadata(releaseMetadata(), withArm, 'latest-linux-arm64.yml', armBytes), /missing required authenticated asset: latest-linux-arm64\.yml/u);

  // Through the service: which file is fetched depends only on the architecture.
  const check = async (arch, assets) => {
    const fetched = [];
    const responses = new Map([
      ['https://api.github.com/repos/Auxillo-Tech/Aux-Command/releases/latest', Buffer.from(JSON.stringify({ ...releaseMetadata(), assets }))],
      ['https://fixture/manifest', fs.readFileSync(manifestPath)],
      ['https://fixture/signature', fs.readFileSync(signaturePath)],
      ['https://fixture/latest', updaterBytes],
      ['https://fixture/latest-arm64', armBytes]
    ]);
    const fetch = async (url) => {
      fetched.push(String(url));
      const data = responses.get(String(url));
      return data ? new Response(data, { status: 200 }) : new Response('missing', { status: 404 });
    };
    const updater = Object.assign(new EventEmitter(), {
      checkForUpdates: async () => { updater.emit('update-available', { version: '9.9.9' }); return { updateInfo: { version: '9.9.9' } }; }
    });
    const app = { isPackaged: true, getVersion: () => '1.0.0', getAppPath: () => path.join(__dirname, '..') };
    const service = new UpdateService(app, () => null, { updater, fetch, publicKeyPath, arch });
    const outcome = await service.check().then((status) => status, (error) => error);
    return { fetched, outcome, status: service.getStatus() };
  };
  const onIntel = await check('x64', metadata.assets);
  assert.equal(onIntel.status.authenticated, true);
  assert.equal(onIntel.fetched.includes('https://fixture/latest'), true);
  assert.equal(onIntel.fetched.includes('https://fixture/latest-arm64'), false);
  // The signed fixture manifest lists only latest-linux.yml, so on arm64 the
  // arm64 file is fetched and then refused: it is not covered by the signature.
  const onArm = await check('arm64', metadata.assets);
  assert.equal(onArm.fetched.includes('https://fixture/latest-arm64'), true);
  assert.equal(onArm.fetched.includes('https://fixture/latest'), false);
  assert.match(onArm.outcome.message, /Signed manifest does not include latest-linux-arm64\.yml/u);
  assert.equal(onArm.status.authenticated, false);
  assert.equal(onArm.status.updateAvailable, false);
  // A release without the arm64 file offers nothing on arm64.
  const armWithoutFile = await check('arm64', releaseMetadata().assets);
  assert.match(armWithoutFile.outcome.message, /GitHub release is missing latest-linux-arm64\.yml/u);
  assert.equal(armWithoutFile.status.updateAvailable, false);
});

test('a downloaded AppImage built for another architecture is refused', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-updater-arch-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const intel = path.join(directory, 'intel.AppImage');
  const arm = path.join(directory, 'arm.AppImage');
  fs.writeFileSync(intel, 'installer for x64...');
  fs.writeFileSync(arm, 'installer for arm64.');
  const entry = (file, name, extra) => ({ name, kind: 'appimage', size: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)), ...extra });
  for (const manifest of [
    { artifacts: [entry(intel, 'Aux-Command-9.9.9-x86_64.AppImage', { arch: 'x64' }), entry(arm, 'Aux-Command-9.9.9-arm64.AppImage', { arch: 'arm64' })] },
    // Without the arch field the file name decides.
    { artifacts: [entry(intel, 'Aux-Command-9.9.9-x86_64.AppImage'), entry(arm, 'Aux-Command-9.9.9-arm64.AppImage')] }
  ]) {
    assert.equal(await verifyDownloadedArtifact(intel, manifest, 'x64'), intel);
    assert.equal(await verifyDownloadedArtifact(arm, manifest, 'arm64'), arm);
    await assert.rejects(() => verifyDownloadedArtifact(arm, manifest, 'x64'), /does not match/u);
    await assert.rejects(() => verifyDownloadedArtifact(intel, manifest, 'arm64'), /does not match/u);
  }
});
