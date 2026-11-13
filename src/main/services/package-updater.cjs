'use strict';

// One-click updates for deb and rpm installs.
//
// An AppImage replaces itself. A deb or rpm install belongs to the system
// package manager, so the application cannot overwrite its own files: it
// downloads the package named in the signed release manifest, checks it
// against that manifest, and asks the desktop's own administrator prompt
// (polkit, through pkexec) to run the update helper that the installed
// package ships.
//
// The helper is a root-owned file, /usr/lib/aux-command/update-helper, with
// its own polkit action (build/linux/*.policy), so the prompt says that
// Authentication is required to install the Aux Command update, and the root
// code is never text supplied by this process.
//
// Trust: the package is installed only if its size and SHA-256 match the
// OpenPGP-signed manifest. The check is made while downloading, again on the
// open file just before the prompt, and a last time by the helper as root.
// The helper trusts nothing this process says: this process hands it the
// signed release-manifest.json, its detached signature and the verified
// package as one stream on standard input (no path, no symlink, no FIFO, no
// device for root to follow), and the helper verifies the signature against
// the release key the installed package ships, then takes the name, version,
// architecture, size and SHA-256 from that signed manifest only, accepts
// exactly that many bytes, and checks that the package is strictly newer
// than what is installed.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { findExecutable } = require('../lib/executable-finder.cjs');
const { packageArch } = require('../lib/release-arch.cjs');

const RELEASE_HOST = 'github.com';
const RELEASE_PATH_PREFIX = '/Auxillo-Tech/Aux-Command/releases/download/';
// github.com hands release downloads to one of these asset hosts.
const DOWNLOAD_HOSTS = new Set([RELEASE_HOST, 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
const MAX_REDIRECTS = 5;
const MAX_PACKAGE_BYTES = 1_000_000_000;
const INSTALL_TIMEOUT_MS = 15 * 60_000;
// After the timeout pkexec gets SIGTERM; the root child behind it cannot be
// signalled by us, so the operation is released after this grace period.
const KILL_GRACE_MS = 10_000;
const HELPER_PATH = '/usr/lib/aux-command/update-helper';
const POLICY_ACTION = 'tech.auxillo.command.install-update';
const HASH_CHUNK = 1 << 20;
const FRAME_MAGIC = 'AUX-UPDATE-1';
const MAX_MANIFEST_BYTES = 2_000_000;
const MAX_SIGNATURE_BYTES = 65_536;

// How each package format spells a Node architecture in the file name.
const NAME_ARCH = { deb: { x64: 'amd64', arm64: 'arm64' }, rpm: { x64: 'x86_64', arm64: 'aarch64' } };

// The one file name a release of this version has for this kind and machine.
function artifactName(version, kind, arch) {
  const spelling = Object.hasOwn(NAME_ARCH, kind) && Object.hasOwn(NAME_ARCH[kind], arch) ? NAME_ARCH[kind][arch] : '';
  return spelling ? `Aux-Command-${version}-${spelling}.${kind}` : '';
}

// The one URL path a release asset of this version lives at.
function releasePath(version, name) {
  return `${RELEASE_PATH_PREFIX}v${version}/${name}`;
}

// Only the installed helper may run as root: a root-owned regular file that
// nobody else can write.
function defaultHelperCheck(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && stat.uid === 0 && (stat.mode & 0o022) === 0 && (stat.mode & 0o111) !== 0;
  } catch { return false; }
}

// A line of the helper's own report, safe to show.
function helperTail(stderr) {
  return String(stderr || '').trim().split('\n').slice(-2)
    .map((line) => line.replace(/^aux-command-update:\s*/u, '').replace(/[^\x20-\x7e]/gu, '?').trim().slice(0, 240))
    .filter(Boolean).join(' ');
}

function compareVersions(a, b) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(value || ''));
    return match ? match.slice(1).map(Number) : null;
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return NaN;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 10_000, windowsHide: true, ...options }, (error, stdout) => {
      resolve({ ok: !error, stdout: String(stdout || '') });
    });
  });
}

class PackageUpdater {
  constructor(options = {}) {
    this.fetch = options.fetch || globalThis.fetch;
    this.directory = options.directory;
    this.execPath = options.execPath || process.execPath;
    this.arch = options.arch || process.arch;
    this.find = options.findExecutable || findExecutable;
    this.run = options.run || run;
    this.spawn = options.spawn || spawn;
    this.helperPath = options.helperPath || HELPER_PATH;
    this.helperCheck = options.helperCheck || defaultHelperCheck;
    this.killGraceMs = options.killGraceMs ?? KILL_GRACE_MS;
    this.installTimeoutMs = options.installTimeoutMs ?? INSTALL_TIMEOUT_MS;
    this.installKindCache = undefined;
  }

  // 'rpm' or 'deb' when the running program file is owned by that package
  // manager, otherwise ''.
  async installKind() {
    if (this.installKindCache !== undefined) return this.installKindCache;
    let kind = '';
    const rpm = this.find(['rpm']);
    const dpkg = this.find(['dpkg-query']);
    if (rpm && (await this.run(rpm, ['-qf', '--', this.execPath])).ok) kind = 'rpm';
    else if (dpkg && (await this.run(dpkg, ['-S', '--', this.execPath])).ok) kind = 'deb';
    this.installKindCache = kind;
    return kind;
  }

  // Decides whether the authenticated release can be installed from here.
  // Returns { available, kind, version, artifact, url } or { available: false, reason }.
  async plan(verifiedRelease, currentVersion) {
    const version = verifiedRelease?.version;
    const order = compareVersions(version, currentVersion);
    if (!(order > 0)) return { available: false, reason: '' };
    const manual = `Aux Command ${version} is published; this install format updates through your package manager.`;
    const kind = await this.installKind();
    if (!kind) return { available: false, reason: manual };
    if (!this.find(['pkexec'])) return { available: false, reason: `${manual} (One-click installation needs pkexec, which is not installed.)` };
    // The root helper ships inside the installed package. Without it, or if
    // anyone but root could have changed it, nothing is offered.
    if (!this.helperCheck(this.helperPath)) return { available: false, reason: manual };
    const artifacts = (verifiedRelease.manifest?.artifacts || []).filter((item) =>
      item?.kind === kind && typeof item.name === 'string' && /^[A-Za-z0-9._-]+$/u.test(item.name)
      && Number.isSafeInteger(item.size) && item.size > 0 && item.size <= MAX_PACKAGE_BYTES
      && /^[0-9a-f]{64}$/u.test(item.sha256 || ''));
    // A release has one package of each kind per architecture. The signed
    // manifest says which is which; a manifest from before it did is read by
    // file name. A package whose architecture is unknown, or stated
    // differently by the manifest and the name, makes the choice unsafe.
    const archOf = (item) => {
      const named = packageArch(item.name);
      return item.arch === undefined || item.arch === named ? named : '';
    };
    if (artifacts.some((item) => !archOf(item))) return { available: false, reason: manual };
    const matching = artifacts.filter((item) => archOf(item) === this.arch);
    if (matching.length !== 1) return { available: false, reason: manual };
    const artifact = matching[0];
    // The file is the one this version, kind and machine has, under its exact
    // release address: nothing the manifest or the release listing adds on top.
    const expectedName = artifactName(version, kind, this.arch);
    if (!expectedName || artifact.name !== expectedName) return { available: false, reason: manual };
    // The helper re-verifies the signature itself, so it needs the signed
    // bytes exactly as they were fetched.
    const signed = verifiedRelease.signed;
    if (!Buffer.isBuffer(signed?.manifest) || !Buffer.isBuffer(signed?.signature)
      || signed.manifest.length === 0 || signed.manifest.length > MAX_MANIFEST_BYTES
      || signed.signature.length === 0 || signed.signature.length > MAX_SIGNATURE_BYTES) return { available: false, reason: manual };
    const url = verifiedRelease.assets?.[artifact.name];
    let parsed;
    try { parsed = new URL(url); } catch { return { available: false, reason: manual }; }
    if (parsed.protocol !== 'https:' || parsed.hostname !== RELEASE_HOST || parsed.port || parsed.username || parsed.password
      || parsed.search || parsed.hash
      || parsed.pathname.toLowerCase() !== releasePath(version, artifact.name).toLowerCase()) return { available: false, reason: manual };
    return { available: true, kind, version, artifact: { name: artifact.name, size: artifact.size, sha256: artifact.sha256 }, url: parsed.href, signed: { manifest: signed.manifest, signature: signed.signature } };
  }

  // The private folder for one download. The folder under the application
  // data must be a real directory of ours, never a symlink somebody put there,
  // and each download gets a fresh random folder of its own inside it.
  #workspace() {
    const parent = this.directory;
    let stat = null;
    try { stat = fs.lstatSync(parent); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error('The update folder is not a plain directory; refusing to use it');
    if (!stat) fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    const checked = fs.lstatSync(parent);
    if (!checked.isDirectory() || checked.isSymbolicLink()
      || (typeof process.getuid === 'function' && checked.uid !== process.getuid())) throw new Error('The update folder is not a plain directory of this user; refusing to use it');
    fs.chmodSync(parent, 0o700);
    // Leftovers from earlier attempts are never reused. Links are removed as
    // links; nothing they point to is followed.
    for (const name of fs.readdirSync(parent)) fs.rmSync(path.join(parent, name), { recursive: true, force: true });
    return fs.mkdtempSync(path.join(parent, 'download-'));
  }

  // Follows the release download by hand: every hop must stay on https and on
  // GitHub's own release hosts.
  async #fetchRelease(url) {
    let current = url;
    for (let hops = 0; hops <= MAX_REDIRECTS; hops += 1) {
      const response = await this.fetch(current, {
        headers: { 'User-Agent': 'Aux-Command-Updater', Accept: 'application/octet-stream' },
        redirect: 'manual',
        signal: AbortSignal.timeout(INSTALL_TIMEOUT_MS)
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      await response.body?.cancel?.().catch(() => {});
      const location = response.headers?.get?.('location');
      let next;
      try { next = new URL(location, current); } catch { throw new Error('The package download was redirected to an invalid address'); }
      if (next.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(next.hostname) || next.port || next.username || next.password) {
        throw new Error('The package download was redirected away from the GitHub release hosts');
      }
      current = next.href;
    }
    throw new Error('The package download was redirected too many times');
  }

  // Opens the downloaded file without following a link, and checks it is a
  // regular file of exactly the signed size and hash. Returns the open
  // descriptor; the caller closes it.
  async #openVerified(filename, artifact) {
    const mismatch = () => new Error('Downloaded package does not match the signed release manifest');
    let handle;
    try {
      handle = await fs.promises.open(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    } catch (error) {
      // A link in the file's place (ELOOP) or a missing file is a refusal like any other.
      if (error.code === 'ELOOP' || error.code === 'ENXIO' || error.code === 'ENOENT') throw mismatch();
      throw error;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== artifact.size) throw mismatch();
      const hash = createHash('sha256');
      const chunk = Buffer.allocUnsafe(HASH_CHUNK);
      let position = 0;
      while (position < artifact.size) {
        const { bytesRead } = await handle.read(chunk, 0, Math.min(HASH_CHUNK, artifact.size - position), position);
        if (!bytesRead) throw mismatch();
        hash.update(chunk.subarray(0, bytesRead));
        position += bytesRead;
      }
      if (hash.digest('hex') !== artifact.sha256) throw mismatch();
      return handle;
    } catch (error) {
      await handle.close().catch(() => {});
      throw error;
    }
  }

  // Downloads the package into a private folder next to the application data
  // and returns its path once its size and SHA-256 match the signed manifest.
  async download(plan, onProgress = () => {}) {
    if (!plan?.available || !this.directory) throw new Error('No package update is available');
    const folder = this.#workspace();
    const target = path.join(folder, plan.artifact.name);
    const partial = `${target}.part`;
    try {
      const response = await this.#fetchRelease(plan.url);
      if (!response.ok || !response.body) throw new Error(`Package download failed with HTTP ${response.status}`);
      const hash = createHash('sha256');
      const handle = await fs.promises.open(partial, 'wx', 0o600);
      let received = 0;
      try {
        for await (const chunk of response.body) {
          received += chunk.length;
          if (received > plan.artifact.size) throw new Error('Downloaded package is larger than the signed release manifest allows');
          hash.update(chunk);
          await handle.write(chunk);
          onProgress(received, plan.artifact.size);
        }
        await handle.sync();
      } finally {
        await handle.close().catch(() => {});
      }
      if (received !== plan.artifact.size || hash.digest('hex') !== plan.artifact.sha256) {
        throw new Error('Downloaded package does not match the signed release manifest');
      }
      fs.renameSync(partial, target);
      return target;
    } catch (error) {
      fs.rmSync(folder, { recursive: true, force: true });
      throw error;
    }
  }

  // Installs the verified package through the desktop's administrator prompt:
  // pkexec runs the root-owned update helper, which receives the signed
  // manifest, its signature and the package bytes on standard input and checks
  // all of it again. The only argument is the package kind.
  async install(filename, plan) {
    if (!plan?.available || !['rpm', 'deb'].includes(plan.kind)) throw new Error('No package update is available');
    if (!Buffer.isBuffer(plan.signed?.manifest) || !Buffer.isBuffer(plan.signed?.signature)) throw new Error('The signed release manifest is not available for the installation');
    const pkexec = this.find(['pkexec']);
    if (!pkexec) throw new Error('pkexec is required to install the update');
    if (!this.helperCheck(this.helperPath)) throw new Error('The Aux Command update helper is missing or not owned by root; update through your package manager instead');
    const source = await this.#openVerified(filename, plan.artifact);
    try {
      const { manifest, signature } = plan.signed;
      const header = Buffer.from(`${FRAME_MAGIC} ${manifest.length} ${signature.length}\n`, 'ascii');
      await this.#runHelper(pkexec, [this.helperPath, plan.kind], Buffer.concat([header, manifest, signature]), source, plan.artifact.size);
    } finally {
      await source.close().catch(() => {});
    }
    // The update is installed. A leftover download that cannot be removed is
    // not a failed update: the next download clears the folder anyway.
    try { fs.rmSync(path.dirname(filename), { recursive: true, force: true }); } catch { /* cleaned up next time */ }
    return true;
  }

  #runHelper(pkexec, args, prefix, source, size) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let stderr = '';
      let killTimer = null;
      let graceTimer = null;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        clearTimeout(graceTimer);
        if (error) reject(error); else resolve();
      };
      let child;
      try {
        child = this.spawn(pkexec, args, { stdio: ['pipe', 'ignore', 'pipe'], shell: false });
      } catch (error) {
        finish(new Error(`Could not start the administrator prompt: ${error.message}`));
        return;
      }
      child.stderr?.setEncoding?.('utf8');
      child.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
      // Feed exactly the verified bytes. The helper may refuse before reading
      // them all (a downgrade, a wrong package): that closes the pipe, which is
      // not an error of ours; its exit code says why.
      const input = child.stdin;
      if (input) {
        input.on('error', () => {});
        input.write(prefix);
        const stream = fs.createReadStream('', { fd: source.fd, start: 0, end: size - 1, autoClose: false, emitClose: false });
        stream.on('error', () => { try { input.destroy(); } catch { /* already closed */ } });
        stream.pipe(input);
      }
      child.once('error', (error) => finish(new Error(`Could not start the administrator prompt: ${error.message}`)));
      child.once('exit', (code) => {
        if (code === 0) finish();
        // pkexec: 126 = the prompt was dismissed, 127 = not authorised.
        else if (code === 126 || code === 127) finish(new Error('The update was not installed: administrator permission was not given.'));
        else {
          const detail = helperTail(stderr);
          finish(new Error(`The package manager could not install the update${detail ? `: ${detail}` : ` (exit code ${code})`}`));
        }
      });
      // pkexec runs as root, so this process usually cannot signal it. Ask
      // politely at the time limit, then stop waiting: the update operation
      // must never stay locked because a root process ignores us.
      killTimer = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch { /* not ours to signal */ }
        graceTimer = setTimeout(() => finish(new Error('The installation did not report back in time. It may still be running as administrator; check your package manager before trying again.')), this.killGraceMs);
      }, this.installTimeoutMs);
    });
  }
}

module.exports = { PackageUpdater, HELPER_PATH, POLICY_ACTION, RELEASE_PATH_PREFIX, artifactName, compareVersions };
