'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { spawnSync } = require('node:child_process');
const { PackageUpdater, HELPER_PATH, POLICY_ACTION, artifactName, compareVersions } = require('../src/main/services/package-updater.cjs');
const { UpdateService, RELEASE_SIGNING_FINGERPRINT } = require('../src/main/services/update-service.cjs');

const body = Buffer.from('pretend this is an rpm package\n'.repeat(1000));
const sha256 = createHash('sha256').update(body).digest('hex');
const artifact = { name: 'Aux-Command-9.9.9-x86_64.rpm', kind: 'rpm', size: body.length, sha256 };
const root = path.join(__dirname, '..');
const helperSource = path.join(root, 'build/linux/aux-command-update-helper');
const policySource = path.join(root, `build/linux/${POLICY_ACTION}.policy`);
const releaseUrl = (name, version = '9.9.9') => `https://github.com/Auxillo-Tech/Aux-Command/releases/download/v${version}/${name}`;
// The signed bytes the helper verifies again as root (their content does not matter to the Node side).
const signedFiles = { manifest: Buffer.from('{"signed":"manifest"}\n'), signature: Buffer.from('-----BEGIN PGP SIGNATURE-----\nfake\n-----END PGP SIGNATURE-----\n') };
const release = (extra = {}) => ({
  version: '9.9.9',
  manifest: { artifacts: [artifact, { name: 'Aux-Command-9.9.9-amd64.deb', kind: 'deb', size: 10, sha256: 'ab'.repeat(32) }] },
  assets: { [artifact.name]: releaseUrl(artifact.name) },
  signed: signedFiles,
  ...extra
});

function updater(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-package-update-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const tools = options.tools || { rpm: '/usr/bin/rpm', pkexec: '/usr/bin/pkexec' };
  const spawned = [];
  const fetched = [];
  const instance = new PackageUpdater({
    directory: path.join(directory, 'update-packages'),
    execPath: '/opt/Aux Command/aux-command',
    // Never the test machine's own architecture: the choice must be the same everywhere.
    arch: options.arch || 'x64',
    findExecutable: ([name]) => tools[name] || '',
    run: async (command) => ({ ok: options.owner !== false && command === tools.rpm, stdout: '' }),
    helperCheck: options.helperCheck || (() => true),
    installTimeoutMs: options.installTimeoutMs,
    killGraceMs: options.killGraceMs,
    fetch: async (url, init) => {
      fetched.push({ url: String(url), init });
      return (options.fetch || (async () => new Response(body)))(url, init);
    },
    spawn: (command, args, spawnOptions) => {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = new PassThrough();
      const chunks = [];
      child.stdin.on('data', (chunk) => chunks.push(chunk));
      child.kill = options.unkillable ? () => false : () => { setImmediate(() => child.emit('exit', null)); return true; };
      const record = { command, args, spawnOptions, stdin: () => Buffer.concat(chunks) };
      spawned.push(record);
      if (!options.hang) {
        // Like the helper: it reads the whole package, then answers.
        child.stdin.once('end', () => setImmediate(() => { if (options.stderr) child.stderr.emit('data', options.stderr); child.emit('exit', options.exitCode ?? 0); }));
        child.stdin.on('error', () => {});
        child.stdin.resume();
        if (options.exitCode) {
          // A refusal comes before the package has been read.
          setImmediate(() => { if (options.stderr) child.stderr.emit('data', options.stderr); child.emit('exit', options.exitCode); });
        }
      }
      return child;
    }
  });
  return { instance, spawned, fetched, directory };
}

test('versions compare numerically and only newer releases count', () => {
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.5.0', '0.5.0'), 0);
  assert.equal(compareVersions('0.4.9', '0.5.0'), -1);
  assert.ok(Number.isNaN(compareVersions('0.5.0-beta', '0.5.0')));
});

test('an rpm install is offered the signed rpm, and nothing else', async (t) => {
  const { instance } = updater(t);
  const plan = await instance.plan(release(), '0.5.0');
  assert.equal(plan.available, true);
  assert.equal(plan.kind, 'rpm');
  assert.deepEqual(plan.artifact, { name: artifact.name, size: artifact.size, sha256 });
  assert.match(plan.url, /^https:\/\/github\.com\//u);
  assert.deepEqual(plan.signed, signedFiles, 'the signed manifest and its signature travel with the plan, for the helper');
  // Without the signed bytes the helper could not verify anything, so nothing is offered.
  for (const signed of [undefined, null, { manifest: signedFiles.manifest }, { manifest: Buffer.alloc(0), signature: signedFiles.signature }, { manifest: signedFiles.manifest, signature: Buffer.alloc(70_000) }, { manifest: 'text', signature: signedFiles.signature }]) {
    assert.equal((await instance.plan(release({ signed }), '0.5.0')).available, false, String(signed && Object.keys(signed)));
  }
  // Same or older releases are never offered: no downgrade, no reinstall.
  assert.equal((await instance.plan(release(), '9.9.9')).available, false);
  assert.equal((await instance.plan(release(), '10.0.0')).available, false);
  assert.equal((await instance.plan(release({ version: 'latest' }), '0.5.0')).available, false);
});

test('one-click installation is refused whenever it cannot be done safely', async (t) => {
  const manual = /updates through your package manager/u;
  // Not owned by a package manager (run from source or an unpacked folder).
  assert.match((await updater(t, { owner: false }).instance.plan(release(), '0.5.0')).reason, manual);
  // No administrator prompt available.
  assert.match((await updater(t, { tools: { rpm: '/usr/bin/rpm' } }).instance.plan(release(), '0.5.0')).reason, /pkexec/u);
  // The download address must be the GitHub release, over HTTPS.
  for (const url of ['http://github.com/x.rpm', 'https://example.com/x.rpm', 'file:///etc/passwd', undefined]) {
    assert.equal((await updater(t).instance.plan(release({ assets: { [artifact.name]: url } }), '0.5.0')).available, false, String(url));
  }
  // The signed manifest must name exactly one usable package of this kind.
  const none = release({ manifest: { artifacts: [] } });
  const two = release({ manifest: { artifacts: [artifact, { ...artifact, name: 'Other.rpm' }] } });
  const odd = release({ manifest: { artifacts: [{ ...artifact, name: '../evil.rpm' }] } });
  const unhashed = release({ manifest: { artifacts: [{ ...artifact, sha256: 'nope' }] } });
  for (const candidate of [none, two, odd, unhashed]) assert.equal((await updater(t).instance.plan(candidate, '0.5.0')).available, false);
});

test('a release with packages for two architectures offers the one for this machine', async (t) => {
  const arm = { name: 'Aux-Command-9.9.9-aarch64.rpm', kind: 'rpm', arch: 'arm64', size: 20, sha256: 'cd'.repeat(32) };
  const intel = { ...artifact, arch: 'x64' };
  const url = (name) => `https://github.com/Auxillo-Tech/Aux-Command/releases/download/v9.9.9/${name}`;
  const both = (...artifacts) => release({ manifest: { artifacts }, assets: { [intel.name]: url(intel.name), [arm.name]: url(arm.name) } });
  const planFor = async (arch, candidate) => updater(t, { arch }).instance.plan(candidate, '0.5.0');

  for (const order of [[intel, arm], [arm, intel]]) {
    const onIntel = await planFor('x64', both(...order));
    assert.equal(onIntel.available, true);
    assert.equal(onIntel.artifact.name, intel.name);
    assert.equal(onIntel.url, url(intel.name));
    const onArm = await planFor('arm64', both(...order));
    assert.equal(onArm.available, true);
    assert.deepEqual(onArm.artifact, { name: arm.name, size: arm.size, sha256: arm.sha256 });
    assert.equal(onArm.url, url(arm.name));
  }
  // A manifest written before the arch field existed is read by file name.
  const { arch: _intelArch, ...legacyIntel } = intel;
  const { arch: _armArch, ...legacyArm } = arm;
  assert.equal((await planFor('arm64', both(legacyIntel, legacyArm))).artifact.name, arm.name);
  assert.equal((await planFor('x64', both(legacyIntel, legacyArm))).artifact.name, intel.name);

  const manual = /updates through your package manager/u;
  // No package for this architecture: never install the other one.
  assert.match((await planFor('arm64', both(intel))).reason, manual);
  assert.match((await planFor('x64', both(arm))).reason, manual);
  assert.match((await planFor('riscv64', both(intel, arm))).reason, manual);
  // Two packages for the same architecture.
  assert.match((await planFor('arm64', both(intel, arm, { ...arm, name: 'Aux-Command-9.9.9-arm64.rpm' }))).reason, manual);
  // The manifest and the file name disagree, or neither says.
  assert.match((await planFor('arm64', both(intel, { ...arm, arch: 'x64' }))).reason, manual);
  assert.match((await planFor('x64', both(intel, { ...arm, arch: 'x64' }))).reason, manual);
  assert.match((await planFor('x64', both(intel, { ...arm, name: 'Aux-Command-9.9.9.rpm', arch: 'arm64' }))).reason, manual);
  assert.match((await planFor('x64', both(intel, { ...arm, arch: '' }))).reason, manual);
  // The other kind is never considered, whatever its architecture.
  const armDeb = { name: 'Aux-Command-9.9.9-arm64.deb', kind: 'deb', arch: 'arm64', size: 30, sha256: 'ef'.repeat(32) };
  assert.equal((await planFor('arm64', both(intel, arm, armDeb))).artifact.name, arm.name);
});

test('the package is the exact file of this version, kind and machine at its exact release address', async (t) => {
  assert.equal(artifactName('9.9.9', 'rpm', 'x64'), 'Aux-Command-9.9.9-x86_64.rpm');
  assert.equal(artifactName('9.9.9', 'rpm', 'arm64'), 'Aux-Command-9.9.9-aarch64.rpm');
  assert.equal(artifactName('9.9.9', 'deb', 'x64'), 'Aux-Command-9.9.9-amd64.deb');
  assert.equal(artifactName('9.9.9', 'deb', 'arm64'), 'Aux-Command-9.9.9-arm64.deb');
  assert.equal(artifactName('9.9.9', 'deb', 'riscv64'), '');
  const plan = (candidate, options) => updater(t, options).instance.plan(candidate, '0.5.0');
  const withArtifact = (name, url = releaseUrl(name)) => release({ manifest: { artifacts: [{ ...artifact, name }] }, assets: { [name]: url } });

  // A file name that merely parses (another version, another spelling of the architecture) is not accepted.
  for (const name of ['Aux-Command-9.9.8-x86_64.rpm', 'Aux-Command-9.9.9-amd64.rpm', 'Aux-Command-9.9.9-x64.rpm', 'Aux-Command-10.9.9-x86_64.rpm']) {
    assert.equal((await plan(withArtifact(name))).available, false, name);
  }
  // The release address is exact: this version's tag, this repository, no query, no other port.
  const exact = releaseUrl(artifact.name);
  for (const url of [
    releaseUrl(artifact.name, '9.9.8'),
    `https://github.com/Other/Aux-Command/releases/download/v9.9.9/${artifact.name}`,
    `https://github.com/Auxillo-Tech/Aux-Command/releases/download/v9.9.9/other/${artifact.name}`,
    `${exact}?x=1`, `${exact}#x`, exact.replace('github.com', 'github.com:8443'), exact.replace('https://', 'https://user@'),
    `https://objects.githubusercontent.com/Auxillo-Tech/Aux-Command/releases/download/v9.9.9/${artifact.name}`,
    `https://github.com.evil.example/Auxillo-Tech/Aux-Command/releases/download/v9.9.9/${artifact.name}`
  ]) assert.equal((await plan(withArtifact(artifact.name, url))).available, false, url);
  assert.equal((await plan(withArtifact(artifact.name, exact))).available, true);
  // Without a root-owned helper installed by the package nothing is offered.
  assert.match((await plan(release(), { helperCheck: () => false })).reason, /updates through your package manager/u);
});

test('a download is kept only when it matches the signed manifest', async (t) => {
  const good = updater(t);
  const plan = await good.instance.plan(release(), '0.5.0');
  const file = await good.instance.download(plan);
  assert.equal(path.basename(file), artifact.name);
  assert.deepEqual(fs.readFileSync(file), body);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.equal(path.dirname(path.dirname(file)), path.join(good.directory, 'update-packages'));

  const tampered = updater(t, { fetch: async () => new Response(Buffer.concat([body.subarray(0, body.length - 1), Buffer.from('X')])) });
  await assert.rejects(() => tampered.instance.download(plan), /does not match the signed release manifest/u);
  const larger = updater(t, { fetch: async () => new Response(Buffer.concat([body, body])) });
  await assert.rejects(() => larger.instance.download(plan), /larger than the signed release manifest allows/u);
  const missing = updater(t, { fetch: async () => new Response('nope', { status: 404 }) });
  await assert.rejects(() => missing.instance.download(plan), /HTTP 404/u);
  for (const failed of [tampered, larger, missing]) {
    assert.deepEqual(fs.readdirSync(path.join(failed.directory, 'update-packages')), [], 'no partial or rejected file is left behind');
  }
});

test('every download has a private folder of its own and old ones are not reused', async (t) => {
  const { instance, directory } = updater(t);
  const plan = await instance.plan(release(), '0.5.0');
  const first = await instance.download(plan);
  const second = await instance.download(plan);
  assert.notEqual(path.dirname(first), path.dirname(second));
  assert.equal(fs.existsSync(first), false, 'the earlier download is removed');
  assert.deepEqual(fs.readdirSync(path.join(directory, 'update-packages')), [path.basename(path.dirname(second))]);
});

test('a symlinked update folder is refused and nothing is written through it', async (t) => {
  const { instance, directory } = updater(t);
  const plan = await instance.plan(release(), '0.5.0');
  const elsewhere = path.join(directory, 'elsewhere');
  fs.mkdirSync(elsewhere);
  fs.writeFileSync(path.join(elsewhere, 'keep.txt'), 'keep');
  fs.symlinkSync(elsewhere, path.join(directory, 'update-packages'));
  await assert.rejects(() => instance.download(plan), /not a plain directory/u);
  assert.deepEqual(fs.readdirSync(elsewhere), ['keep.txt'], 'nothing was created or removed behind the link');
  // A regular file in its place is refused too.
  fs.rmSync(path.join(directory, 'update-packages'));
  fs.writeFileSync(path.join(directory, 'update-packages'), 'x');
  await assert.rejects(() => instance.download(plan), /not a plain directory/u);
});

test('redirects are followed by hand and only inside GitHub release hosts over https', async (t) => {
  const asset = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/pkg?sig=abc';
  const hop = (location, status = 302) => new Response(null, { status, headers: { location } });
  const chain = updater(t, {
    fetch: async (url) => {
      if (String(url).startsWith('https://github.com/')) return hop('https://objects.githubusercontent.com/x', 301);
      if (String(url).startsWith('https://objects.githubusercontent.com/')) return hop(asset, 307);
      return new Response(body);
    }
  });
  const plan = await chain.instance.plan(release(), '0.5.0');
  assert.equal(fs.readFileSync(await chain.instance.download(plan)).length, body.length);
  assert.equal(chain.fetched.length, 3);
  for (const call of chain.fetched) assert.equal(call.init.redirect, 'manual', 'the fetch never follows a redirect itself');
  assert.equal(chain.fetched[2].url, asset);

  for (const target of [
    'http://objects.githubusercontent.com/x', 'https://evil.example/x', 'https://githubusercontent.com/x',
    'https://objects.githubusercontent.com.evil.example/x', 'https://objects.githubusercontent.com:8443/x',
    'https://user:pw@objects.githubusercontent.com/x', 'file:///etc/passwd', 'ftp://github.com/x', 'https://api.github.com/x'
  ]) {
    const bad = updater(t, { fetch: async (url) => (String(url).startsWith('https://github.com/') ? hop(target) : new Response(body)) });
    await assert.rejects(async () => bad.instance.download(await bad.instance.plan(release(), '0.5.0')), /redirected/u, target);
    assert.equal(bad.fetched.length, 1, `${target} is not requested`);
    assert.deepEqual(fs.readdirSync(path.join(bad.directory, 'update-packages')), []);
  }
  const loop = updater(t, { fetch: async () => hop('https://github.com/again') });
  await assert.rejects(async () => loop.instance.download(await loop.instance.plan(release(), '0.5.0')), /too many times/u);
});

test('installation re-checks the file and runs only the root-owned helper, with the package on standard input', async (t) => {
  const { instance, spawned } = updater(t);
  const plan = await instance.plan(release(), '0.5.0');
  const file = await instance.download(plan);
  await instance.install(file, plan);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].command, '/usr/bin/pkexec');
  // The only argument is the package kind: size, hash and version are the helper's to read from the signed manifest.
  assert.deepEqual(spawned[0].args, [HELPER_PATH, 'rpm']);
  assert.equal(HELPER_PATH, '/usr/lib/aux-command/update-helper');
  assert.equal(spawned[0].args.some((arg) => /^(\/bin\/|\/usr\/bin\/)?(ba|da)?sh$/u.test(arg) || arg === '-c' || arg.includes(file)), false, 'no shell, no script text, no path of ours');
  const header = Buffer.from(`AUX-UPDATE-1 ${signedFiles.manifest.length} ${signedFiles.signature.length}\n`);
  assert.deepEqual(spawned[0].stdin(), Buffer.concat([header, signedFiles.manifest, signedFiles.signature, body]), 'root receives the signed manifest, its signature and exactly the verified bytes');
  assert.deepEqual(spawned[0].spawnOptions.stdio, ['pipe', 'ignore', 'pipe']);
  assert.equal(spawned[0].spawnOptions.shell, false);
  assert.equal(fs.existsSync(path.dirname(file)), false, 'the package and its folder are removed after a successful installation');

  // A file changed after the download is refused before any prompt appears.
  const swapped = updater(t);
  const swappedFile = await swapped.instance.download(plan);
  fs.writeFileSync(swappedFile, Buffer.alloc(body.length, 0x41));
  await assert.rejects(() => swapped.instance.install(swappedFile, plan), /does not match the signed release manifest/u);
  assert.equal(swapped.spawned.length, 0);

  // The helper must be the installed, root-owned one.
  const untrusted = updater(t, { helperCheck: (candidate) => candidate !== HELPER_PATH });
  await assert.rejects(async () => untrusted.instance.install(await untrusted.instance.download(plan), plan), /update helper is missing or not owned by root/u);
  assert.equal(untrusted.spawned.length, 0);

  // Declining the administrator prompt and a package-manager failure are told apart.
  const declined = updater(t, { exitCode: 126 });
  await assert.rejects(async () => declined.instance.install(await declined.instance.download(plan), plan), /administrator permission was not given/u);
  const broken = updater(t, { exitCode: 74, stderr: 'aux-command-update: the package manager could not install the update\nError: nothing provides libfoo\n' });
  await assert.rejects(async () => broken.instance.install(await broken.instance.download(plan), plan), /could not install the update: .*nothing provides libfoo/u);
  // A plan from before the helper verified signatures itself (no signed bytes) is not installed.
  const unsigned = updater(t);
  const unsignedFile = await unsigned.instance.download(plan);
  await assert.rejects(() => unsigned.instance.install(unsignedFile, { ...plan, signed: undefined }), /signed release manifest is not available/u);
  assert.equal(unsigned.spawned.length, 0);
  const refused = updater(t, { exitCode: 66, stderr: 'aux-command-update: the package is not newer than the installed version\n' });
  await assert.rejects(async () => refused.instance.install(await refused.instance.download(plan), plan), /not newer than the installed version/u);
});

test('root never opens a link, a FIFO or a file of another size: the file is opened without following links', async (t) => {
  const { instance, spawned, directory } = updater(t);
  const plan = await instance.plan(release(), '0.5.0');
  const folder = path.join(directory, 'swap');
  fs.mkdirSync(folder);
  const refusals = [];
  const attempt = async (name, make) => {
    const file = path.join(folder, name);
    make(file);
    const started = Date.now();
    await assert.rejects(() => instance.install(file, plan), /does not match the signed release manifest/u, name);
    refusals.push([name, Date.now() - started]);
  };
  const real = path.join(folder, 'real.rpm');
  fs.writeFileSync(real, body);
  // A link to a device that never ends, a link to a file with the right bytes, a link to nowhere.
  await attempt('zero.rpm', (file) => fs.symlinkSync('/dev/zero', file));
  await attempt('link.rpm', (file) => fs.symlinkSync(real, file));
  await attempt('dangling.rpm', (file) => fs.symlinkSync(path.join(folder, 'nowhere'), file));
  // A FIFO nobody writes to, and a directory.
  await attempt('fifo.rpm', (file) => assert.equal(spawnSync('mkfifo', [file]).status, 0));
  await attempt('dir.rpm', (file) => fs.mkdirSync(file));
  // Right hash prefix but wrong size, and an empty file.
  await attempt('short.rpm', (file) => fs.writeFileSync(file, body.subarray(1)));
  await attempt('empty.rpm', (file) => fs.writeFileSync(file, ''));
  assert.equal(spawned.length, 0, 'the administrator prompt never appears for any of them');
  for (const [name, ms] of refusals) assert.ok(ms < 5000, `${name} was refused without blocking`);
});

test('the installation never stays locked when the root process cannot be stopped', async (t) => {
  const { instance, spawned } = updater(t, { hang: true, unkillable: true, installTimeoutMs: 30, killGraceMs: 30 });
  const plan = await instance.plan(release(), '0.5.0');
  const file = await instance.download(plan);
  const started = Date.now();
  await assert.rejects(() => instance.install(file, plan), /did not report back in time/u);
  assert.ok(Date.now() - started < 3000);
  assert.equal(spawned.length, 1);
  assert.equal(fs.existsSync(file), true, 'the verified package is kept so the user can try again');
});

test('a timed-out installation releases the update operation of the service', async (t) => {
  const { instance } = updater(t, { hang: true, unkillable: true, installTimeoutMs: 30, killGraceMs: 30 });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-update-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const app = { isPackaged: true, getVersion: () => '0.5.0', getAppPath: () => directory, getPath: () => directory, relaunch() {}, quit() {} };
  const electronUpdater = Object.assign(new EventEmitter(), { checkForUpdates: async () => null });
  const service = new UpdateService(app, () => null, { updater: electronUpdater, packageUpdater: instance, publicKeyPath: __filename });
  const verified = release();
  Object.defineProperty(service, 'verifiedRelease', { get: () => verified, set: () => {}, configurable: true });
  service.packagePlan = await instance.plan(verified, '0.5.0');
  service.status = { ...service.status, authenticated: true, latestVersion: '9.9.9', updateAvailable: true };
  await service.download();
  await assert.rejects(() => service.quitAndInstall(), /did not report back in time/u);
  assert.equal(service.operation, null, 'the operation lock is free again');
  // The next attempt really starts (and again ends by itself), instead of "already in progress".
  await assert.rejects(() => service.quitAndInstall(), /did not report back in time/u);
});

test('a leftover download that cannot be removed after a successful installation is not a failed installation', async (t) => {
  const { instance, spawned } = updater(t);
  const plan = await instance.plan(release(), '0.5.0');
  const file = await instance.download(plan);
  const real = fs.rmSync;
  t.mock.method(fs, 'rmSync', (target, ...rest) => {
    if (String(target) === path.dirname(file)) throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
    return real(target, ...rest);
  });
  assert.equal(await instance.install(file, plan), true);
  assert.equal(spawned.length, 1);
  // The service reports success, restarts the app and does not show an installation failure.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-update-cleanup-'));
  t.after(() => real(directory, { recursive: true, force: true }));
  const calls = [];
  const app = { isPackaged: true, getVersion: () => '0.5.0', getAppPath: () => directory, getPath: () => directory, relaunch: () => calls.push('relaunch'), quit: () => calls.push('quit') };
  const service = new UpdateService(app, () => null, { updater: Object.assign(new EventEmitter(), { checkForUpdates: async () => null }), packageUpdater: updater(t).instance, publicKeyPath: __filename });
  const verified = release();
  Object.defineProperty(service, 'verifiedRelease', { get: () => verified, set: () => {}, configurable: true });
  service.packagePlan = await service.packageUpdater.plan(verified, '0.5.0');
  service.status = { ...service.status, authenticated: true, latestVersion: '9.9.9', updateAvailable: true };
  await service.download();
  assert.equal(await service.quitAndInstall(), true);
  assert.deepEqual(calls, ['relaunch', 'quit']);
  assert.equal(service.getStatus().error, null);
  assert.equal(service.getStatus().errorStage, null);
});

test('the update status says which step failed and shows busy while the administrator prompt is open', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-update-stage-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const seen = [];
  let release_ = null;
  const fake = {
    plan: async () => ({ available: true }),
    download: async () => path.join(directory, 'x.rpm'),
    install: () => new Promise((resolve, reject) => { release_ = { resolve, reject }; })
  };
  const app = { isPackaged: true, getVersion: () => '0.5.0', getAppPath: () => directory, getPath: () => directory, relaunch() {}, quit() {} };
  const service = new UpdateService(app, () => ({ isDestroyed: () => false, webContents: { send: (_c, status) => seen.push(status) } }), {
    updater: Object.assign(new EventEmitter(), { checkForUpdates: async () => null }), packageUpdater: fake, publicKeyPath: __filename
  });
  const verified = release();
  Object.defineProperty(service, 'verifiedRelease', { get: () => verified, set: () => {}, configurable: true });
  service.packagePlan = { available: true, kind: 'rpm' };
  service.status = { ...service.status, authenticated: true, latestVersion: '9.9.9', updateAvailable: true };
  fs.writeFileSync(path.join(directory, 'x.rpm'), 'x');
  await service.download();
  assert.equal(service.getStatus().installing, false);
  const pending = service.quitAndInstall();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.getStatus().installing, true, 'busy while the prompt and the package manager are working');
  assert.equal(seen.at(-1).installing, true, 'and the window is told');
  // A second click while the first is open is refused, not run twice.
  await assert.rejects(() => service.quitAndInstall(), /already in progress/u);
  release_.reject(new Error('Administrator permission was not given, so the update was not installed.'));
  await assert.rejects(() => pending, /permission was not given/u);
  const failed = service.getStatus();
  assert.equal(failed.installing, false);
  assert.equal(failed.errorStage, 'install', 'an installation failure is not labelled as a failed check');
  assert.match(failed.error, /permission was not given/u);
  assert.equal(seen.at(-1).errorStage, 'install');
  // A new check clears the stage again.
  service.updater.emit('checking-for-update');
  assert.equal(service.getStatus().errorStage, null);
  assert.equal(service.getStatus().error, null);
});

test('the package ships the helper, its signing key and its polkit action with root ownership', async () => {
  const build = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build;
  const policyDest = `/usr/share/polkit-1/actions/${POLICY_ACTION}.policy`;
  for (const [kind, user] of [['deb', '--deb-user'], ['rpm', '--rpm-user']]) {
    const args = build[kind].fpm;
    assert.ok(args.includes('build/linux/aux-command-update-helper=/usr/lib/aux-command/update-helper'), `${kind} installs the helper`);
    assert.ok(args.includes(`build/linux/${POLICY_ACTION}.policy=${policyDest}`), `${kind} installs the polkit action`);
    assert.ok(args.includes('build/linux/release-signing-key.gpg=/usr/lib/aux-command/release-signing-key.gpg'), `${kind} installs the release signing key next to the helper`);
    assert.equal(args[args.indexOf(user) + 1], 'root');
    assert.equal(args[args.indexOf(user.replace('user', 'group')) + 1], 'root');
  }
  // The helper checks signatures with gpgv, and pkexec needs polkit.
  assert.ok(build.deb.depends.includes('gpgv'), 'deb depends on gpgv');
  assert.ok(build.rpm.depends.includes('gnupg2'), 'rpm depends on gnupg2, which ships gpgv');
  assert.ok(build.deb.recommends.some((entry) => /pkexec|policykit|polkit/u.test(entry)), 'deb recommends polkit');
  assert.ok(build.rpm.fpm.some((arg, index, all) => arg === '--rpm-tag' && /^Recommends: .*polkit/u.test(all[index + 1] || '')), 'rpm recommends polkit');
  // The key in the package is the release key the application itself trusts.
  const openpgp = await import('openpgp');
  const armored = await openpgp.readKey({ armoredKey: fs.readFileSync(path.join(root, 'SIGNING_KEY.asc'), 'utf8') });
  const shipped = await openpgp.readKey({ binaryKey: fs.readFileSync(path.join(root, 'build/linux/release-signing-key.gpg')) });
  assert.equal(shipped.getFingerprint().toUpperCase(), armored.getFingerprint().toUpperCase());
  assert.equal(shipped.getFingerprint().toUpperCase(), RELEASE_SIGNING_FINGERPRINT);
  assert.equal(fs.statSync(path.join(root, 'build/linux/release-signing-key.gpg')).mode & 0o022, 0, 'the shipped key is not writable by group or others');
  assert.equal(build.appImage?.fpm, undefined, 'the AppImage is unaffected');
  assert.ok(fs.statSync(helperSource).mode & 0o100, 'the helper is executable in the repository');
  assert.equal(fs.statSync(helperSource).mode & 0o022, 0, 'and not writable by group or others');
  assert.equal(fs.readFileSync(helperSource, 'utf8').split('\n')[0], '#!/usr/bin/python3 -I');

  const policy = fs.readFileSync(policySource, 'utf8');
  assert.match(policy, new RegExp(`<action id="${POLICY_ACTION.replaceAll('.', '\\.')}">`, 'u'));
  assert.match(policy, /<message>Authentication is required to install the Aux Command update<\/message>/u);
  assert.match(policy, /<annotate key="org\.freedesktop\.policykit\.exec\.path">\/usr\/lib\/aux-command\/update-helper<\/annotate>/u);
  for (const key of ['allow_any', 'allow_inactive', 'allow_active']) assert.match(policy, new RegExp(`<${key}>auth_admin</${key}>`, 'u'));
  assert.equal((policy.match(/<action /gu) || []).length, 1);
});

// The helper itself, run through its own main() with root faked and the package
// managers replaced by recording stand-ins. The real package managers and the
// real pkexec run in scripts/test-installers.sh. Signatures are real: gpgv
// verifies manifests signed here with throwaway keys that exist only for the
// test, and the helper is pointed at the matching public key.
const python = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const haveGpg = spawnSync('sh', ['-c', 'command -v gpg && command -v gpgv'], { encoding: 'utf8' }).status === 0;
const canRunHelper = Boolean(python) && haveGpg;
const FRAME = 'AUX-UPDATE-1';
const frame = (manifest, signature, bytes = Buffer.alloc(0)) => Buffer.concat([Buffer.from(`${FRAME} ${manifest.length} ${signature.length}\n`), manifest, signature, bytes]);

function throwawayKey(directory, name) {
  const home = path.join(directory, `gnupg-${name}`);
  fs.mkdirSync(home, { mode: 0o700 });
  const gpg = (...args) => spawnSync('gpg', ['--homedir', home, '--batch', '--yes', '--no-tty', ...args], { encoding: null });
  assert.equal(gpg('--passphrase', '', '--quick-generate-key', `${name} <${name}@example.invalid>`, 'ed25519', 'sign', 'never').status, 0);
  const listing = gpg('--with-colons', '--list-keys').stdout.toString();
  const fingerprint = listing.split('\n').find((line) => line.startsWith('fpr:')).split(':')[9];
  const keyring = path.join(directory, `${name}.gpg`);
  fs.writeFileSync(keyring, gpg('--export').stdout);
  return {
    fingerprint, keyring,
    sign: (data) => {
      const file = path.join(directory, `.signme-${name}`);
      fs.writeFileSync(file, data);
      return gpg('--armor', '--detach-sign', '--output', '-', file).stdout;
    }
  };
}

function helperRig(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-helper-rig-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  const work = path.join(dir, 'work');
  fs.mkdirSync(bin);
  fs.mkdirSync(work);
  const state = path.join(dir, 'installed');
  const epochFile = path.join(dir, 'installed-epoch');
  const statusFile = path.join(dir, 'installed-status');
  const failFile = path.join(dir, 'install-fails');
  const log = path.join(dir, 'calls.log');
  const machine = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const script = (name, text) => fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${text}\n`, { mode: 0o755 });
  const newer = 'a=$1; b=$2; [ "$a" != "$b" ] && [ "$(printf "%s\\n%s\\n" "$a" "$b" | sort -V | tail -n 1)" = "$a" ]';
  // The "package" is a text file naming itself: Package, Version, Architecture and, for an rpm, Epoch.
  const field = (name, fallback) => `v=$(grep "^${name}: " "$f" | cut -d" " -f2-); echo "\${v:-${fallback}}"`;
  script('dpkg-deb', `f=$2; ${field('$3', '')}`);
  script('dpkg', `case "$1" in --print-architecture) echo amd64;; --compare-versions) shift; set -- "$1" "$3"; ${newer};; esac`);
  script('dpkg-query', `[ -s "${state}" ] && printf "%s\\t%s" "$(cat "${statusFile}" 2>/dev/null || echo "install ok installed")" "$(cat "${state}")"`);
  // A failing installation leaves what dpkg leaves behind when a postinst script fails.
  const record = `echo "$0 $*" >> "${log}"; echo "$(sha256sum "$last" | cut -d" " -f1) $(stat -c "%a %u" "$last") $(stat -c "%a" "$(dirname "$last")")" >> "${log}"`;
  const finish = `if [ -e "${failFile}" ]; then echo "install ok half-configured" > "${statusFile}"; grep "^Version: " "$last" | cut -d" " -f2 > "${state}"; echo "E: Sub-process /usr/bin/dpkg returned an error code (1)"; exit 100; fi; grep "^Version: " "$last" | cut -d" " -f2 > "${state}"; rm -f "${statusFile}"`;
  script('apt-get', `for last; do :; done; ${record}; ${finish}`);
  script('rpm', `case "$1" in
  -qp) for f; do :; done; for k in Package Version Architecture Epoch; do v=$(grep "^$k: " "$f" | cut -d" " -f2-); [ "$k" = Epoch ] && v=\${v:-(none)}; echo "$v"; done;;
  -q) [ -s "${state}" ] && { cat "${state}"; cat "${epochFile}" 2>/dev/null || echo "(none)"; } || exit 1;;
esac`);
  script('dnf', `for last; do :; done; ${record}; grep "^Version: " "$last" | cut -d" " -f2 > "${state}"`);
  const wrapper = [
    'import importlib.machinery, importlib.util, os, sys',
    'loader = importlib.machinery.SourceFileLoader("helper", sys.argv[1])',
    'module = importlib.util.module_from_spec(importlib.util.spec_from_loader("helper", loader))',
    'loader.exec_module(module)',
    'module.os.geteuid = lambda: 0',
    'module.TOOL_DIRS = (sys.argv[2], "/usr/bin", "/bin")',
    'module.WORK_PARENT = sys.argv[3]',
    'module.IDLE_TIMEOUT = float(sys.argv[4])',
    'module.EOF_TIMEOUT = 1.0',
    'module.machine_rpm_arch = lambda: sys.argv[5]',
    'module.KEYRING_PATH = sys.argv[6]',
    'module.TRUSTED_UID = int(sys.argv[7])',
    'sys.exit(module.main(sys.argv[8:]))'
  ].join('\n');
  const trusted = throwawayKey(dir, 'release');
  const attacker = throwawayKey(dir, 'attacker');
  const uid = process.getuid();
  const pkgBytes = (name, version, arch, epoch) => Buffer.from(`Package: ${name}\nVersion: ${version}\nArchitecture: ${arch}\n${epoch ? `Epoch: ${epoch}\n` : ''}${'x'.repeat(2000)}\n`);
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const arch = { deb: 'amd64', rpm: machine };
  // The signed manifest the way scripts/release-manifest.cjs writes it.
  const manifestFor = (kind, bytes, version = '9.9.9', overrides = {}, entry = {}) => {
    const name = `Aux-Command-${version}-${arch[kind]}.${kind}`;
    return {
      productName: 'Aux Command', packageName: 'aux-command', version,
      signing: { status: 'signed-detached-gpg', key: trusted.fingerprint },
      artifacts: [{ name, kind, arch: kind === 'deb' ? 'x64' : (machine === 'aarch64' ? 'arm64' : 'x64'), size: bytes.length, sha256: sha(bytes), ...entry }],
      ...overrides
    };
  };
  const sealed = (manifest, key = trusted) => {
    const bytes = Buffer.from(JSON.stringify(manifest));
    return { manifest: bytes, signature: key.sign(bytes) };
  };
  // One complete, correctly signed update: bytes in, frame out.
  const update = (kind, bytes, version, overrides, entry, key) => {
    const signed = sealed(manifestFor(kind, bytes, version, overrides, entry), key);
    return { ...signed, bytes, frame: frame(signed.manifest, signed.signature, bytes) };
  };
  const run = (args, input, options = {}) => spawnSync(python, ['-c', wrapper, helperSource, bin, work, String(options.idle ?? 5), machine,
    options.keyring ?? trusted.keyring, String(options.trustedUid ?? uid), ...args], {
    input, encoding: 'utf8', timeout: 30_000, stdio: options.stdio, env: { PATH: '/usr/bin:/bin' }
  });
  const installed = (version, { epoch, status } = {}) => {
    if (version === undefined) return fs.existsSync(state) ? fs.readFileSync(state, 'utf8').trim() : '';
    for (const file of [epochFile, statusFile, failFile]) fs.rmSync(file, { force: true });
    if (version === '') fs.rmSync(state, { force: true }); else fs.writeFileSync(state, `${version}\n`);
    if (epoch) fs.writeFileSync(epochFile, `${epoch}\n`);
    if (status) fs.writeFileSync(statusFile, `${status}\n`);
    return undefined;
  };
  const installFails = () => fs.writeFileSync(failFile, '');
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []);
  return { dir, work, run, pkgBytes, sha, installed, installFails, calls, machine, trusted, attacker, update, sealed, manifestFor };
}

const helperTest = (name, body) => test(name, { skip: !canRunHelper && 'needs python3, gpg and gpgv' }, body);

helperTest('the update helper takes the package kind and nothing else, and a frame it can read', (t) => {
  const rig = helperRig(t);
  const good = rig.update('deb', rig.pkgBytes('aux-command', '9.9.9', 'amd64'));
  rig.installed('0.5.0');
  const bad = [
    [[], good.frame, 'no arguments'],
    [['sh'], good.frame, 'unknown kind'],
    [['deb', 'extra'], good.frame, 'extra argument'],
    // The old protocol, where the caller chose the version, size and hash, is gone.
    [['deb', '9.9.9', String(good.bytes.length), rig.sha(good.bytes)], good.frame, 'caller-chosen version, size and hash'],
    [['deb'], Buffer.from(`AUX-UPDATE-2 ${good.manifest.length} ${good.signature.length}\n`), 'other frame version'],
    [['deb'], Buffer.from(`${FRAME} 0 ${good.signature.length}\n`), 'empty manifest'],
    [['deb'], Buffer.from(`${FRAME} ${good.manifest.length} 0\n`), 'empty signature'],
    [['deb'], Buffer.from(`${FRAME} +${good.manifest.length} ${good.signature.length}\n`), 'signed length'],
    [['deb'], Buffer.from(`${FRAME} 2000001 ${good.signature.length}\n`), 'manifest over its limit'],
    [['deb'], Buffer.from(`${FRAME} ${good.manifest.length} 65537\n`), 'signature over its limit'],
    [['deb'], Buffer.from(`${FRAME} ${good.manifest.length}\n`), 'missing field'],
    [['deb'], Buffer.from(`${FRAME} ${good.manifest.length} ${good.signature.length} 5\n`), 'extra field'],
    [['deb'], Buffer.from(`${'A'.repeat(200)}\n`), 'header that never ends'],
    [['deb'], Buffer.from(FRAME), 'no header line'],
    [['deb'], Buffer.alloc(0), 'nothing at all']
  ];
  for (const [args, input, what] of bad) {
    const result = rig.run(args, input);
    assert.equal(result.status, 64, `${what}: ${result.stderr}`);
  }
  assert.deepEqual(rig.calls(), []);
  assert.equal(rig.installed(), '0.5.0');
  assert.deepEqual(fs.readdirSync(rig.work), []);
});

helperTest('the update helper installs only what a manifest signed by the installed release key describes', (t) => {
  const rig = helperRig(t);
  const bytes = rig.pkgBytes('aux-command', '9.9.9', 'amd64');
  rig.installed('0.5.0');
  const good = rig.update('deb', bytes);
  const refused = (what, input, status = 65) => {
    const result = rig.run(['deb'], input);
    assert.equal(result.status, status, `${what}: ${result.stderr}`);
    assert.deepEqual(rig.calls(), [], `${what}: nothing was installed`);
    assert.equal(rig.installed(), '0.5.0');
    assert.deepEqual(fs.readdirSync(rig.work), [], `${what}: no private copy is left behind`);
  };

  // A higher-version package that somebody built, with the size and hash the caller chose,
  // described by a manifest of their own. This is what the helper used to accept: size, hash
  // and version came from the caller. Now the manifest has to be signed by the release key.
  const mine = rig.pkgBytes('aux-command', '99.0.0', 'amd64');
  const forged = rig.sealed(rig.manifestFor('deb', mine, '99.0.0', { signing: { status: 'signed-detached-gpg', key: rig.trusted.fingerprint } }), rig.attacker);
  refused('manifest signed with another key', frame(forged.manifest, forged.signature, mine));
  const unsigned = Buffer.from(JSON.stringify(rig.manifestFor('deb', mine, '99.0.0')));
  refused('manifest with a made-up signature', frame(unsigned, Buffer.from('-----BEGIN PGP SIGNATURE-----\n\nnope\n-----END PGP SIGNATURE-----\n'), mine));
  refused('manifest with a garbage signature', frame(unsigned, Buffer.from('not a signature'), mine));
  const ownKey = rig.sealed(rig.manifestFor('deb', mine, '99.0.0', { signing: { status: 'signed-detached-gpg', key: rig.attacker.fingerprint } }), rig.attacker);
  refused('manifest and package signed by a key the package does not ship', frame(ownKey.manifest, ownKey.signature, mine));

  // A real signature, then the manifest changed afterwards (a higher version, a smaller size).
  const tampered = Buffer.from(good.manifest.toString().replace('9.9.9', '99.9.9'));
  refused('manifest edited after it was signed', frame(tampered, good.signature, bytes));
  refused('signature of another manifest', frame(Buffer.from(JSON.stringify(rig.manifestFor('deb', mine, '99.0.0'))), good.signature, mine));
  // The release key signed this manifest, but the caller's bytes are not the ones it lists.
  refused('right manifest, other package bytes', frame(good.manifest, good.signature, rig.pkgBytes('aux-command', '99.0.0', 'amd64')));
  refused('right manifest, same size, other bytes', frame(good.manifest, good.signature, Buffer.alloc(bytes.length, 0x41)));
  refused('one byte short', frame(good.manifest, good.signature, bytes.subarray(0, bytes.length - 1)));
  refused('one byte more', frame(good.manifest, good.signature, Buffer.concat([bytes, Buffer.from('x')])));
  refused('manifest and signature but no package', good.frame.subarray(0, good.frame.length - bytes.length));
  refused('frame cut inside the signature', good.frame.subarray(0, good.manifest.length + 60));

  // Signed by the right key, but not an Aux Command release for this machine.
  const signedRefusals = {
    'another product': rig.update('deb', bytes, '9.9.9', { packageName: 'other-product' }),
    'another signing key named inside': rig.update('deb', bytes, '9.9.9', { signing: { status: 'signed-detached-gpg', key: rig.attacker.fingerprint } }),
    'unsigned-looking status': rig.update('deb', bytes, '9.9.9', { signing: { status: 'unsigned', key: rig.trusted.fingerprint } }),
    'a version with a release part': rig.update('deb', bytes, '9.9.9-1'),
    'no usable version': rig.update('deb', bytes, '9.9', {}),
    'two packages of one name': rig.update('deb', bytes, '9.9.9', { artifacts: [rig.manifestFor('deb', bytes).artifacts[0], rig.manifestFor('deb', bytes).artifacts[0]] }),
    'no package for this machine': rig.update('deb', bytes, '9.9.9', { artifacts: [] }),
    'package of another kind': rig.update('deb', bytes, '9.9.9', {}, { kind: 'rpm' }),
    'package for another architecture': rig.update('deb', bytes, '9.9.9', {}, { arch: 'arm64' }),
    'size zero': rig.update('deb', bytes, '9.9.9', {}, { size: 0 }),
    'size as text': rig.update('deb', bytes, '9.9.9', {}, { size: String(bytes.length) }),
    'size over a gigabyte': rig.update('deb', bytes, '9.9.9', {}, { size: 1_000_000_001 }),
    'upper case hash': rig.update('deb', bytes, '9.9.9', {}, { sha256: rig.sha(bytes).toUpperCase() }),
    'short hash': rig.update('deb', bytes, '9.9.9', {}, { sha256: rig.sha(bytes).slice(1) })
  };
  for (const [what, signed] of Object.entries(signedRefusals)) {
    const result = rig.run(['deb'], signed.frame);
    assert.ok([65, 66].includes(result.status), `${what}: ${result.status} ${result.stderr}`);
    assert.deepEqual(rig.calls(), [], what);
  }
  assert.equal(rig.run(['deb'], rig.update('deb', bytes, '9.9.9', {}, { name: 'x' }).frame).status, 66, 'file name other than the one for this version and machine');
  assert.deepEqual(fs.readdirSync(rig.work), []);

  // The properly signed update installs, from a private root-only copy that is the verified file.
  const ok = rig.run(['deb'], good.frame);
  assert.equal(ok.status, 0, ok.stderr);
  const calls = rig.calls();
  assert.equal(calls.length, 2);
  assert.match(calls[0], /^\S+\/apt-get install -y --no-install-recommends .*\/aux-command-update\.[^/]+\/aux-command\.deb$/u);
  assert.equal(calls[1], `${rig.sha(bytes)} 644 ${String(process.getuid())} 755`);
  assert.equal(rig.installed(), '9.9.9');
  assert.deepEqual(fs.readdirSync(rig.work), []);
});

helperTest('the update helper uses only a release key that root owns, and never a path it could be led through', (t) => {
  const rig = helperRig(t);
  const good = rig.update('deb', rig.pkgBytes('aux-command', '9.9.9', 'amd64'));
  rig.installed('0.5.0');
  const nokey = path.join(rig.dir, 'no-such-key.gpg');
  assert.equal(rig.run(['deb'], good.frame, { keyring: nokey }).status, 70, 'key missing');
  const link = path.join(rig.dir, 'key-link.gpg');
  fs.symlinkSync(rig.trusted.keyring, link);
  assert.equal(rig.run(['deb'], good.frame, { keyring: link }).status, 70, 'key reached through a link');
  assert.equal(rig.run(['deb'], good.frame, { trustedUid: process.getuid() + 1 }).status, 70, 'key owned by somebody else');
  const writable = path.join(rig.dir, 'writable.gpg');
  fs.copyFileSync(rig.trusted.keyring, writable);
  fs.chmodSync(writable, 0o666);
  assert.equal(rig.run(['deb'], good.frame, { keyring: writable }).status, 70, 'key writable by others');
  const empty = path.join(rig.dir, 'empty.gpg');
  fs.writeFileSync(empty, '');
  assert.equal(rig.run(['deb'], good.frame, { keyring: empty }).status, 70, 'empty key file');
  const fifo = path.join(rig.dir, 'key.fifo');
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
  const started = Date.now();
  assert.equal(rig.run(['deb'], good.frame, { keyring: fifo }).status, 70, 'key that is a FIFO');
  assert.ok(Date.now() - started < 10_000);
  // A key that is not the one the manifest names is no key at all.
  assert.equal(rig.run(['deb'], good.frame, { keyring: rig.attacker.keyring }).status, 65, 'the other key does not verify the release');
  assert.deepEqual(rig.calls(), []);
  assert.equal(rig.installed(), '0.5.0');
  assert.deepEqual(fs.readdirSync(rig.work), []);
});

helperTest('the update helper accepts exactly the signed package bytes and nothing else on standard input', (t) => {
  const rig = helperRig(t);
  const bytes = rig.pkgBytes('aux-command', '9.9.9', 'amd64');
  const good = rig.update('deb', bytes);
  rig.installed('0.5.0');
  // A device that never ends: root only ever sees standard input, and a header of zeros is no frame.
  const zero = fs.openSync('/dev/zero', 'r');
  assert.equal(rig.run(['deb'], undefined, { stdio: [zero, 'pipe', 'pipe'] }).status, 64);
  fs.closeSync(zero);
  // A FIFO nobody ever writes to: the helper gives up by itself instead of blocking for ever.
  const fifo = path.join(rig.dir, 'fifo');
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
  const reader = fs.openSync(fifo, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  const writer = fs.openSync(fifo, fs.constants.O_WRONLY);
  let started = Date.now();
  assert.equal(rig.run(['deb'], undefined, { stdio: [reader, 'pipe', 'pipe'], idle: 0.5 }).status, 65, 'silent FIFO');
  assert.ok(Date.now() - started < 10_000, 'bounded wait');
  // A writer that sent the frame and half the package and then stalls, keeping the stream open.
  fs.writeSync(writer, good.frame.subarray(0, good.frame.length - 500));
  started = Date.now();
  assert.equal(rig.run(['deb'], undefined, { stdio: [reader, 'pipe', 'pipe'], idle: 0.5 }).status, 65, 'stalled writer');
  assert.ok(Date.now() - started < 10_000, 'bounded wait');
  fs.closeSync(writer);
  fs.closeSync(reader);
  // A writer that sends the whole frame and then keeps the stream open.
  const fifo2 = path.join(rig.dir, 'fifo2');
  assert.equal(spawnSync('mkfifo', [fifo2]).status, 0);
  const reader2 = fs.openSync(fifo2, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  const writer2 = fs.openSync(fifo2, fs.constants.O_WRONLY);
  fs.writeSync(writer2, good.frame);
  assert.equal(rig.run(['deb'], undefined, { stdio: [reader2, 'pipe', 'pipe'], idle: 0.5 }).status, 65, 'stream that stays open after the package');
  fs.closeSync(writer2);
  fs.closeSync(reader2);
  assert.deepEqual(rig.calls(), []);
  assert.equal(rig.installed(), '0.5.0');
  assert.deepEqual(fs.readdirSync(rig.work), [], 'no private copy is left behind');
});

helperTest('the update helper installs only an aux-command that is the signed version, for this machine, and strictly newer', (t) => {
  const rig = helperRig(t);
  // The signed manifest names `version`; the package file says `declared`.
  const attempt = (name, declared, arch, version = declared, { kind = 'deb', epoch } = {}) => {
    const bytes = rig.pkgBytes(name, declared, arch, epoch);
    return rig.run([kind], rig.update(kind, bytes, version).frame);
  };
  rig.installed('0.5.0');
  assert.equal(attempt('aux-command', '0.4.9', 'amd64').status, 66, 'downgrade');
  assert.equal(attempt('aux-command', '0.5.0', 'amd64').status, 66, 'reinstall of the installed version');
  assert.equal(attempt('aux-command', '0.10.0', 'amd64', '0.9.0').status, 66, 'version other than the signed one');
  assert.equal(attempt('other-package', '9.9.9', 'amd64').status, 66, 'another package name');
  assert.equal(attempt('aux-command', '9.9.9', 'riscv64').status, 66, 'another architecture');
  // A deb for every architecture is refused too: the signed release names one build per
  // architecture, and "all" would slip past the check that the package is built for this machine.
  assert.equal(attempt('aux-command', '9.9.9', 'all').status, 66, 'architecture all');
  assert.deepEqual(rig.calls(), []);
  rig.installed('');
  assert.equal(attempt('aux-command', '9.9.9', 'amd64').status, 66, 'nothing installed through this manager');
  assert.deepEqual(rig.calls(), []);
  rig.installed('0.9.0');
  assert.equal(attempt('aux-command', '0.10.0', 'amd64').status, 0, 'a numerically newer version installs');
  assert.equal(rig.installed(), '0.10.0');
});

helperTest('the update helper never downgrades an rpm install, and compares no epoch it cannot read', (t) => {
  const rig = helperRig(t);
  const rpmRun = (version, installed, { installedEpoch, epoch } = {}) => {
    rig.installed(installed, { epoch: installedEpoch });
    const bytes = rig.pkgBytes('aux-command', version, rig.machine, epoch);
    return rig.run(['rpm'], rig.update('rpm', bytes, version).frame);
  };
  assert.equal(rpmRun('0.4.9', '0.5.0').status, 66, 'older rpm over a newer install');
  assert.equal(rpmRun('0.5.0', '0.5.0').status, 66, 'same rpm again');
  assert.deepEqual(rig.calls(), [], 'dnf was never started');
  // An installed 2:0.10.5 is newer than 0.11.0 for rpm; a version-only comparison would call it older.
  assert.equal(rpmRun('0.11.0', '0.10.5', { installedEpoch: '2' }).status, 66, 'installed epoch 2:0.10.5 against 0.11.0');
  assert.equal(rpmRun('0.11.0', '0.10.5', { installedEpoch: '0' }).status, 66, 'a zero epoch is still an epoch this helper does not compare');
  assert.equal(rpmRun('0.11.0', '0.10.5', { epoch: '1' }).status, 66, 'candidate with an epoch');
  assert.deepEqual(rig.calls(), []);
  assert.equal(rpmRun('9.9.9', '0.5.0').status, 0);
  assert.match(rig.calls()[0], /^\S+\/dnf upgrade -y .*aux-command\.rpm$/u);
});

helperTest('the update helper says when the package manager is half-configured, and how to repair it', (t) => {
  const rig = helperRig(t);
  const bytes = rig.pkgBytes('aux-command', '9.9.9', 'amd64');
  const good = rig.update('deb', bytes);
  // A failed postinst of an earlier update left aux-command half-configured: no new update, and the way out.
  rig.installed('0.5.0', { status: 'install ok half-configured' });
  const stuck = rig.run(['deb'], good.frame);
  assert.equal(stuck.status, 66, stuck.stderr);
  assert.match(stuck.stderr, /half-configured/u);
  assert.match(stuck.stderr, /sudo apt-get install -f/u);
  assert.doesNotMatch(stuck.stderr, /not installed through this package manager/u);
  assert.deepEqual(rig.calls(), []);
  // The installation itself fails in its configure step: the same words, and a failure status.
  rig.installed('0.5.0');
  rig.installFails();
  const failed = rig.run(['deb'], good.frame);
  assert.equal(failed.status, 74, failed.stderr);
  assert.match(failed.stderr, /left aux-command half-configured/u);
  assert.match(failed.stderr, /sudo apt-get install -f/u);
  assert.doesNotMatch(failed.stderr, /not installed through this package manager/u);
  assert.match(failed.stderr, /Sub-process \/usr\/bin\/dpkg returned an error code/u, 'the package manager\'s own last lines are kept');
  assert.deepEqual(fs.readdirSync(rig.work), []);
});

helperTest('the update helper script is directly executable, validates before it needs root and refuses non-root', () => {
  const run = (args) => spawnSync(helperSource, args, { encoding: 'utf8', timeout: 10_000, input: '' });
  assert.equal(run([]).status, 64);
  assert.equal(run(['deb', '9.9.9', '1', 'x']).status, 64);
  if (process.getuid && process.getuid() !== 0) assert.equal(run(['deb']).status, 77);
});

test('the Update button drives a package install end to end and then restarts', async (t) => {
  const { instance, spawned } = updater(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-update-service-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const app = {
    isPackaged: true, getVersion: () => '0.5.0', getAppPath: () => directory, getPath: () => directory,
    relaunch: () => calls.push('relaunch'), quit: () => calls.push('quit')
  };
  const electronUpdater = Object.assign(new EventEmitter(), { checkForUpdates: async () => null });
  const service = new UpdateService(app, () => null, { updater: electronUpdater, packageUpdater: instance, publicKeyPath: __filename });
  // Stand in for the signed-manifest check, which has its own tests.
  service.fetch = async () => { throw new Error('not used'); };
  const verified = release();
  Object.defineProperty(service, 'verifiedRelease', { get: () => verified, set: () => {}, configurable: true });
  service.status = { ...service.status, authenticated: true, latestVersion: '9.9.9' };
  const plan = await instance.plan(verified, '0.5.0');
  service.packagePlan = plan;
  service.status = { ...service.status, updateAvailable: true };

  const downloaded = await service.download();
  assert.equal(downloaded.downloaded, true);
  assert.equal(await service.quitAndInstall(), true);
  assert.equal(spawned.length, 1);
  assert.deepEqual(calls, ['relaunch', 'quit']);
  assert.equal(service.getStatus().updateAvailable, false);
});
