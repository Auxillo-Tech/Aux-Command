'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const RELEASE_REPOSITORY = 'Auxillo-Tech/Aux-Command';
const RELEASE_SIGNING_FINGERPRINT = 'FAC028574B9C6875D10DA4DC6443E86108ABD2A2';

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function verifyDetachedManifest(manifestBytes, signatureText, publicKeyText, expectedFingerprint = RELEASE_SIGNING_FINGERPRINT) {
  const openpgp = await import('openpgp');
  const publicKey = await openpgp.readKey({ armoredKey: publicKeyText });
  const fingerprint = publicKey.getFingerprint().toUpperCase();
  if (fingerprint !== expectedFingerprint) {
    throw new Error(`Bundled update signing key fingerprint mismatch: expected ${expectedFingerprint}, got ${fingerprint}`);
  }
  const message = await openpgp.createMessage({ binary: manifestBytes });
  const signature = await openpgp.readSignature({ armoredSignature: signatureText });
  const verification = await openpgp.verify({ message, signature, verificationKeys: publicKey });
  if (!verification.signatures.length) throw new Error('Release manifest has no OpenPGP signature');
  await verification.signatures[0].verified;
  return fingerprint;
}

function validateReleaseMetadata(release, manifest, updaterName, updaterBytes) {
  if (!release || typeof release !== 'object' || release.draft || release.prerelease) throw new Error('GitHub did not return a stable published release');
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.artifacts)) throw new Error('Signed release manifest is invalid');
  const version = String(release.tag_name || '').replace(/^v/u, '');
  if (!version || manifest.version !== version) throw new Error('Signed manifest version does not match the GitHub release tag');
  if (manifest.signing?.status !== 'signed-detached-gpg' || String(manifest.signing?.key || '').toUpperCase() !== RELEASE_SIGNING_FINGERPRINT) {
    throw new Error('Release manifest is not signed by the trusted Aux Command key');
  }
  const updater = manifest.artifacts.find((artifact) => artifact?.name === updaterName);
  if (!updater || updater.kind !== 'updater-metadata') throw new Error(`Signed manifest does not include ${updaterName}`);
  if (updater.size !== updaterBytes.length || updater.sha256 !== sha256(updaterBytes)) {
    throw new Error(`${updaterName} does not match the signed release manifest`);
  }
  const assetNames = new Set((release.assets || []).map((asset) => asset?.name));
  for (const required of ['release-manifest.json', 'release-manifest.json.asc', updaterName]) {
    if (!assetNames.has(required)) throw new Error(`GitHub release is missing required authenticated asset: ${required}`);
  }
  return { version, updaterName, manifest };
}

class UpdateService {
  constructor(app, getWindow, options = {}) {
    this.app = app;
    this.getWindow = getWindow;
    this.updater = options.updater || require('electron-updater').autoUpdater;
    this.fetch = options.fetch || globalThis.fetch;
    this.repository = options.repository || RELEASE_REPOSITORY;
    this.publicKeyPath = options.publicKeyPath || path.join(app.getAppPath(), 'SIGNING_KEY.asc');
    this.verifiedRelease = null;
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
      authenticated: false,
      signingFingerprint: RELEASE_SIGNING_FINGERPRINT,
      error: null
    };

    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.logger = {
      info: (msg) => process.stderr.write(`[updater] ${msg}\n`),
      warn: (msg) => process.stderr.write(`[updater:WARN] ${msg}\n`),
      error: (msg) => process.stderr.write(`[updater:ERROR] ${msg}\n`)
    };

    this.updater.on('checking-for-update', () => this.#merge({ checking: true, error: null }));
    this.updater.on('update-available', (info) => {
      const version = info?.version || null;
      if (!this.verifiedRelease || version !== this.verifiedRelease.version) {
        this.#merge({ checking: false, updateAvailable: false, downloaded: false, authenticated: false, error: 'Updater metadata version did not match the authenticated release.' });
        return;
      }
      this.#merge({ checking: false, updateAvailable: true, downloaded: false, latestVersion: version, authenticated: true, error: null });
    });
    this.updater.on('update-not-available', (info) => this.#merge({
      checking: false,
      updateAvailable: false,
      downloaded: false,
      latestVersion: info?.version || this.app.getVersion(),
      authenticated: Boolean(this.verifiedRelease),
      error: null
    }));
    this.updater.on('update-downloaded', (info) => this.#merge({
      checking: false,
      updateAvailable: true,
      downloaded: true,
      latestVersion: info?.version || this.status.latestVersion,
      authenticated: true,
      error: null
    }));
    this.updater.on('error', (error) => this.#merge({ checking: false, error: error?.message || String(error) }));
  }

  getStatus() {
    return { ...this.status };
  }

  async check() {
    if (!this.app.isPackaged) {
      this.#merge({ supported: false, checking: false, authenticated: false, error: 'Update checks are only enabled in packaged releases.' });
      return this.getStatus();
    }
    this.#merge({ supported: true, checking: true, authenticated: false, lastCheckedAt: new Date().toISOString(), error: null });
    try {
      this.verifiedRelease = await this.#authenticateLatestRelease();
      this.#merge({ authenticated: true, latestVersion: this.verifiedRelease.version });
      const result = await this.updater.checkForUpdates();
      const discovered = result?.updateInfo?.version;
      if (discovered && discovered !== this.verifiedRelease.version) throw new Error('electron-updater discovered a version different from the authenticated release');
      return this.getStatus();
    } catch (error) {
      this.verifiedRelease = null;
      this.#merge({ checking: false, updateAvailable: false, downloaded: false, authenticated: false, error: error?.message || String(error) });
      throw error;
    }
  }

  async download() {
    if (!this.app.isPackaged) throw new Error('Update downloads are only enabled in packaged releases.');
    if (!this.status.updateAvailable) throw new Error('No update is currently available.');
    if (!this.status.authenticated || this.verifiedRelease?.version !== this.status.latestVersion) {
      throw new Error('The available update has not passed signed release authentication.');
    }
    await this.updater.downloadUpdate();
    return this.getStatus();
  }

  quitAndInstall() {
    if (!this.status.downloaded || !this.status.authenticated) throw new Error('No authenticated downloaded update is ready to install.');
    this.updater.quitAndInstall(false, true);
    return true;
  }

  async #fetchBytes(url, maximumBytes) {
    const response = await this.fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Aux-Command-Updater' },
      signal: AbortSignal.timeout(20_000),
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(`Update authentication request failed with HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maximumBytes) throw new Error('Update authentication response is too large');
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maximumBytes) throw new Error('Update authentication response is too large');
    return data;
  }

  async #authenticateLatestRelease() {
    if (typeof this.fetch !== 'function') throw new Error('Secure update authentication requires the Fetch API');
    const publicKeyText = fs.readFileSync(this.publicKeyPath, 'utf8');
    const releaseBytes = await this.#fetchBytes(`https://api.github.com/repos/${this.repository}/releases/latest`, 5_000_000);
    let release;
    try { release = JSON.parse(releaseBytes.toString('utf8')); }
    catch { throw new Error('GitHub release metadata was not valid JSON'); }
    const asset = (name) => {
      const found = (release.assets || []).find((item) => item?.name === name && item?.browser_download_url);
      if (!found) throw new Error(`GitHub release is missing ${name}`);
      return found;
    };
    const manifestBytes = await this.#fetchBytes(asset('release-manifest.json').browser_download_url, 2_000_000);
    const signatureBytes = await this.#fetchBytes(asset('release-manifest.json.asc').browser_download_url, 1_000_000);
    await verifyDetachedManifest(manifestBytes, signatureBytes.toString('utf8'), publicKeyText);
    let manifest;
    try { manifest = JSON.parse(manifestBytes.toString('utf8')); }
    catch { throw new Error('Signed release manifest was not valid JSON'); }
    const updaterName = 'latest-linux.yml';
    const updaterBytes = await this.#fetchBytes(asset(updaterName).browser_download_url, 2_000_000);
    return validateReleaseMetadata(release, manifest, updaterName, updaterBytes);
  }

  #merge(patch) {
    this.status = { ...this.status, ...patch };
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('updates:status', this.getStatus());
  }
}

module.exports = {
  UpdateService,
  RELEASE_SIGNING_FINGERPRINT,
  sha256,
  validateReleaseMetadata,
  verifyDetachedManifest
};
