'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { UpdateRecovery } = require('./update-recovery.cjs');
const { PackageUpdater } = require('./package-updater.cjs');
const { packageArch, updaterMetadataName } = require('../lib/release-arch.cjs');

const RELEASE_REPOSITORY = 'Auxillo-Tech/Aux-Command';
const RELEASE_SIGNING_FINGERPRINT = 'FAC028574B9C6875D10DA4DC6443E86108ABD2A2';

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

// `arch`: an AppImage the manifest or its file name assigns to another
// architecture is never acceptable here.
async function verifyDownloadedArtifact(filename, manifest, arch = process.arch) {
  const builtFor = (item) => item.arch ?? packageArch(item.name);
  const stat = await fs.promises.stat(filename);
  if (!stat.isFile()) throw new Error('Downloaded update is not a regular file');
  const candidates = (manifest?.artifacts || []).filter((item) =>
    item.kind === 'appimage' && item.size === stat.size && /^[0-9a-f]{64}$/u.test(item.sha256 || '')
    && (!builtFor(item) || builtFor(item) === arch));
  if (!candidates.length) throw new Error('Downloaded installer is not included in the signed release manifest');
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  const digest = hash.digest('hex');
  const after = await fs.promises.stat(filename);
  if (stat.ino !== after.ino || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs ||
      !candidates.some((item) => item.sha256 === digest)) {
    throw new Error('Downloaded installer does not match the signed release manifest');
  }
  return filename;
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

function validateReleaseMetadata(release, manifest, updaterName, updaterBytes, signedFiles = null) {
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
  // Download addresses of the release files, for installs that fetch a
  // package named in the signed manifest (deb and rpm).
  const assets = Object.create(null);
  for (const asset of release.assets || []) {
    if (typeof asset?.name === 'string' && typeof asset.browser_download_url === 'string') assets[asset.name] = asset.browser_download_url;
  }
  // The signed bytes themselves, for the root helper that verifies them again.
  const signed = signedFiles ? { manifest: signedFiles.manifest, signature: signedFiles.signature } : null;
  return { version, updaterName, manifest, assets, signed };
}

class UpdateService {
  constructor(app, getWindow, options = {}) {
    this.app = app;
    this.getWindow = getWindow;
    this.workspaceRecovery = options.recoveryService || null;
    this.updater = options.updater || require('electron-updater').autoUpdater;
    this.fetch = options.fetch || globalThis.fetch;
    this.repository = options.repository || RELEASE_REPOSITORY;
    this.arch = options.arch || process.arch;
    this.publicKeyPath = options.publicKeyPath || path.join(app.getAppPath(), 'SIGNING_KEY.asc');
    this.verifiedRelease = null;
    this.downloadedFile = null;
    this.operation = null;
    this.recovery = app.getPath ? new UpdateRecovery(path.join(app.getPath('userData'), 'update-recovery')) : null;
    // deb and rpm installs cannot replace themselves; they install the signed
    // package through the system's administrator prompt instead.
    this.packageUpdater = options.packageUpdater
      || (app.getPath ? new PackageUpdater({ fetch: this.fetch, arch: this.arch, directory: path.join(app.getPath('userData'), 'update-packages') }) : null);
    this.packagePlan = null;
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
      // True while the administrator prompt or the package manager is working.
      installing: false,
      // 'check', 'download' or 'install': which step `error` belongs to.
      errorStage: null,
      error: null
    };

    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.logger = {
      info: (msg) => process.stderr.write(`[updater] ${msg}\n`),
      warn: (msg) => process.stderr.write(`[updater:WARN] ${msg}\n`),
      error: (msg) => process.stderr.write(`[updater:ERROR] ${msg}\n`)
    };

    this.updater.on('checking-for-update', () => this.#merge({ checking: true, error: null, errorStage: null }));
    this.updater.on('update-available', (info) => {
      const version = info?.version || null;
      if (!this.verifiedRelease || version !== this.verifiedRelease.version) {
        this.#merge({ checking: false, updateAvailable: false, downloaded: false, authenticated: false, error: 'Updater metadata version did not match the authenticated release.', errorStage: 'check' });
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
    // An updater event alone cannot authorize installation. download() verifies
    // the actual installer bytes against the independently signed manifest.
    this.updater.on('error', (error) => this.#merge({ checking: false, downloaded: false, error: error?.message || String(error), errorStage: 'check' }));
  }

  getStatus() {
    return { ...this.status, ...(this.recovery?.status() || {}) };
  }

  async #exclusive(name, task) {
    if (this.operation) throw new Error(`An update ${this.operation} is already in progress.`);
    this.operation = name;
    try { return await task(); }
    finally { this.operation = null; }
  }

  check() { return this.#exclusive('check', () => this.#check()); }
  download() { return this.#exclusive('download', () => this.#download()); }
  quitAndInstall() { return this.#exclusive('installation', () => this.#install()); }
  restorePrevious() {
    return this.#exclusive('recovery', async () => {
      if (!this.recovery || !process.env.APPIMAGE) throw new Error('Previous-version recovery is available for AppImage installs only');
      return this.recovery.restore(process.env.APPIMAGE);
    });
  }

  async #check() {
    if (!this.app.isPackaged) {
      this.#merge({ supported: false, checking: false, authenticated: false, error: 'Update checks are only enabled in packaged releases.', errorStage: 'check' });
      return this.getStatus();
    }
    this.verifiedRelease = null;
    this.downloadedFile = null;
    this.packagePlan = null;
    this.#merge({ supported: true, checking: true, updateAvailable: false, downloaded: false, authenticated: false, lastCheckedAt: new Date().toISOString(), error: null, errorStage: null });
    try {
      this.verifiedRelease = await this.#authenticateLatestRelease();
      this.#merge({ authenticated: true, latestVersion: this.verifiedRelease.version });
      const result = await this.updater.checkForUpdates();
      if (!result) {
        // electron-updater is inactive on deb/rpm installs (no APPIMAGE): it
        // resolves null without firing any state events, so the checking flag
        // must be cleared here or the Updates UI spins forever.
        // A deb or rpm install is offered the signed package for its own
        // format; when that is not possible the reason is shown instead.
        const plan = this.packageUpdater
          ? await this.packageUpdater.plan(this.verifiedRelease, this.app.getVersion())
          : { available: false, reason: '' };
        this.packagePlan = plan.available ? plan : null;
        this.#merge({
          checking: false,
          updateAvailable: Boolean(plan.available),
          downloaded: false,
          error: plan.available ? null : (plan.reason || null),
          errorStage: plan.available || !plan.reason ? null : 'check'
        });
        return this.getStatus();
      }
      const discovered = result?.updateInfo?.version;
      if (discovered && discovered !== this.verifiedRelease.version) throw new Error('electron-updater discovered a version different from the authenticated release');
      if (this.status.checking) this.#merge({ checking: false });
      return this.getStatus();
    } catch (error) {
      this.verifiedRelease = null;
      this.#merge({ checking: false, updateAvailable: false, downloaded: false, authenticated: false, error: error?.message || String(error), errorStage: 'check' });
      throw error;
    }
  }

  async #download() {
    if (!this.app.isPackaged) throw new Error('Update downloads are only enabled in packaged releases.');
    if (!this.status.updateAvailable) throw new Error('No update is currently available.');
    if (!this.status.authenticated || this.verifiedRelease?.version !== this.status.latestVersion) {
      throw new Error('The available update has not passed signed release authentication.');
    }
    this.downloadedFile = null;
    this.#merge({ downloaded: false, error: null, errorStage: null });
    if (this.packagePlan) {
      try {
        this.downloadedFile = await this.packageUpdater.download(this.packagePlan);
        this.#merge({ downloaded: true, error: null });
        return this.getStatus();
      } catch (error) {
        this.#merge({ downloaded: false, error: error?.message || String(error), errorStage: 'download' });
        throw error;
      }
    }
    try {
      const files = await this.updater.downloadUpdate();
      if (!Array.isArray(files) || files.length !== 1) throw new Error('Updater did not return one downloaded installer');
      this.downloadedFile = await verifyDownloadedArtifact(files[0], this.verifiedRelease.manifest, this.arch);
      this.#merge({ downloaded: true, error: null });
      return this.getStatus();
    } catch (error) {
      this.#merge({ downloaded: false, error: error?.message || String(error), errorStage: 'download' });
      throw error;
    }
  }

  async #install() {
    if (!this.status.downloaded || !this.status.authenticated) throw new Error('No authenticated downloaded update is ready to install.');
    if (this.packagePlan) {
      this.workspaceRecovery?.snapshot('Before application update');
      this.#merge({ installing: true, error: null, errorStage: null });
      try {
        await this.packageUpdater.install(this.downloadedFile, this.packagePlan);
      } catch (error) {
        // The verified file is kept only when it can be tried again.
        const kept = this.downloadedFile && fs.existsSync(this.downloadedFile);
        if (!kept) this.downloadedFile = null;
        this.#merge({ installing: false, downloaded: Boolean(kept), error: error?.message || String(error), errorStage: 'install' });
        throw error;
      }
      this.downloadedFile = null;
      this.packagePlan = null;
      this.#merge({ installing: false, downloaded: false, updateAvailable: false, error: null, errorStage: null });
      // The files on disk are now the new version; start it.
      this.app.relaunch?.();
      this.app.quit?.();
      return true;
    }
    try {
      await verifyDownloadedArtifact(this.downloadedFile, this.verifiedRelease?.manifest, this.arch);
    } catch (error) {
      this.downloadedFile = null;
      this.#merge({ downloaded: false, error: error?.message || String(error), errorStage: 'install' });
      throw error;
    }
    this.workspaceRecovery?.snapshot('Before application update');
    const image = process.env.APPIMAGE;
    if (image && this.recovery) await this.recovery.prepare(image, this.app.getVersion());
    this.#merge({ error: null });
    try {
      this.updater.quitAndInstall(false, true);
      if (this.status.error) throw new Error(this.status.error);
    } catch (error) {
      if (image && this.recovery) {
        try { await this.recovery.restore(image); }
        catch (recoveryError) { throw new AggregateError([error, recoveryError], 'Update failed; restore the previous AppImage using Updates → Restore previous version'); }
      }
      throw error;
    }
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
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body || []) {
      length += chunk.length;
      if (length > maximumBytes) throw new Error('Update authentication response is too large');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, length);
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
    // electron-updater reads a different description on each architecture;
    // the one it will read here is the one checked against the signed manifest.
    const updaterName = updaterMetadataName(this.arch);
    const updaterBytes = await this.#fetchBytes(asset(updaterName).browser_download_url, 2_000_000);
    return validateReleaseMetadata(release, manifest, updaterName, updaterBytes, { manifest: manifestBytes, signature: signatureBytes });
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
  verifyDetachedManifest,
  verifyDownloadedArtifact
};
