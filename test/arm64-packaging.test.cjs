'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const { checkPackagedBinaries, elfArch } = require('../scripts/check-packaged-binaries.cjs');
const workflow = (name) => fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8');

// The text of one job: from its key under `jobs:` to the next job.
function jobSource(source, job) {
  const start = source.search(new RegExp(`^  ${job}:$`, 'm'));
  assert.ok(start >= 0, `missing job ${job}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/^  [A-Za-z0-9_-]+:$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

// A minimal ELF header: magic, 64-bit, byte order, and the machine field.
function elf(machine, { bigEndian = false } = {}) {
  const header = Buffer.alloc(64);
  header.writeUInt32BE(0x7f454c46, 0);
  header[4] = 2;
  header[5] = bigEndian ? 2 : 1;
  if (bigEndian) header.writeUInt16BE(machine, 18); else header.writeUInt16LE(machine, 18);
  return header;
}
const X64 = 62;
const ARM64 = 183;

function unpackedApp(t, files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-unpacked-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

test('the processor a binary was built for is read from its ELF header', (t) => {
  const directory = unpackedApp(t, {
    intel: elf(X64), arm: elf(ARM64), 'arm-big-endian': elf(ARM64, { bigEndian: true }), riscv: elf(243),
    script: '#!/bin/sh\nexit 0\n', short: Buffer.from([0x7f, 0x45, 0x4c, 0x46]), empty: ''
  });
  const arch = (name) => elfArch(path.join(directory, name));
  assert.equal(arch('intel'), 'x64');
  assert.equal(arch('arm'), 'arm64');
  assert.equal(arch('arm-big-endian'), 'arm64');
  assert.equal(arch('riscv'), 'other');
  assert.equal(arch('script'), '');
  assert.equal(arch('short'), '');
  assert.equal(arch('empty'), '');
});

test('an arm64 package is accepted only when everything in it is arm64 and no native module is included', (t) => {
  const good = { 'aux-command': elf(ARM64), 'libffmpeg.so': elf(ARM64), 'chrome-sandbox': elf(ARM64), 'resources/app.asar': 'not a binary', 'resources/app.asar.unpacked/src/main/helpers/process_guard.py': '#!/usr/bin/env python3\n' };
  const check = (files, arch = 'arm64') => {
    const directory = unpackedApp(t, files);
    return checkPackagedBinaries(directory, arch, path.join(directory, 'aux-command'));
  };
  assert.equal(check(good), 3);
  // The x64 Electron or one stray x64 library.
  assert.throws(() => check({ ...good, 'aux-command': elf(X64) }), /aux-command is not an arm64 program/u);
  assert.throws(() => check({ ...good, 'aux-command': '#!/bin/sh\n' }), /aux-command is not an arm64 program/u);
  assert.throws(() => check({ ...good, 'libEGL.so': elf(X64) }), /Not built for arm64: libEGL\.so \(x64\)/u);
  assert.throws(() => check({ ...good, 'swiftshader/libvk.so': elf(243) }), /Not built for arm64: swiftshader\/libvk\.so \(other\)/u);
  // A native module of any architecture: they are left out of arm64 packages.
  for (const machine of [X64, ARM64]) {
    assert.throws(
      () => check({ ...good, 'resources/app.asar.unpacked/node_modules/cpu-features/build/Release/cpufeatures.node': elf(machine) }),
      /Native Node modules must not be packaged for arm64: resources\/app\.asar\.unpacked\/node_modules\/cpu-features\/build\/Release\/cpufeatures\.node/u
    );
  }
  assert.throws(() => check(good, 'x64'), /aux-command is not an x64 program/u);
  assert.throws(() => check(good, 'riscv64'), /Unsupported target architecture/u);
});

test('the arm64 build uses the package.json settings, without native modules, and checks the result', () => {
  const config = require('../scripts/electron-builder-arm64.cjs');
  const { files, npmRebuild, afterPack, ...rest } = config;
  const { files: baseFiles, ...baseRest } = packageJson.build;
  assert.deepEqual(rest, baseRest, 'everything else is the configuration the x64 packages are built with');
  assert.deepEqual(files, [...baseFiles, '!**/*.node']);
  assert.equal(npmRebuild, false);
  assert.equal(path.resolve(root, afterPack), path.join(root, 'scripts/check-packaged-binaries.cjs'));
  assert.equal(typeof require(path.resolve(root, afterPack)), 'function');
  // package.json itself keeps building x64 only and has no arm64 additions.
  assert.equal(packageJson.build.npmRebuild, undefined);
  assert.equal(packageJson.build.afterPack, undefined);
  assert.deepEqual(packageJson.build.linux.target.map((target) => [target.target, target.arch]), [['AppImage', ['x64']], ['deb', ['x64']], ['rpm', ['x64']]]);
});

test('each architecture has its own build command and the x64 one is unchanged', () => {
  assert.equal(packageJson.scripts['dist:x64'], 'node scripts/release-metadata.cjs && bash scripts/build-linux-x64.sh');
  assert.equal(packageJson.scripts['dist:arm64'], 'node scripts/release-metadata.cjs && bash scripts/build-linux-arm64.sh');
  const x64 = fs.readFileSync(path.join(root, 'scripts/build-linux-x64.sh'), 'utf8');
  assert.match(x64, /^exec npx electron-builder --linux AppImage deb rpm --x64 "\$@"$/mu);
  assert.doesNotMatch(x64, /arm64|electron-builder-arm64/u);
  const arm64 = path.join(root, 'scripts/build-linux-arm64.sh');
  assert.match(fs.readFileSync(arm64, 'utf8'), /^exec npx electron-builder --linux AppImage deb rpm --arm64 --config scripts\/electron-builder-arm64\.cjs "\$@"$/mu);
  assert.equal(spawnSync('bash', ['-n', arm64]).status, 0);
  assert.ok(fs.statSync(arm64).mode & 0o100, 'the script is executable');
  // The container build keeps its x64 command and takes arm64 only on request.
  const container = fs.readFileSync(path.join(root, 'scripts/build-in-container.sh'), 'utf8');
  assert.match(container, /CC=clang CXX=clang\+\+ npm run dist:x64 -- --publish never/u);
  assert.match(container, /TARGET_ARCH="\$\{AUX_BUILD_ARCH:-x64\}"/u);
  assert.match(container, /npm run dist:arm64 -- --publish never/u);
});

test('every workflow action is pinned to a full commit, and arm64 uses the same commits', () => {
  const pins = new Map();
  for (const name of ['linux-build.yml', 'release.yml']) {
    const uses = workflow(name).split('\n').filter((line) => /^\s*(?:- )?uses:/u.test(line));
    assert.ok(uses.length > 0);
    for (const line of uses) {
      const match = /uses: ([A-Za-z0-9_.\/-]+)@([0-9a-f]{40}) # v\d+\.\d+\.\d+$/u.exec(line);
      assert.ok(match, `${name}: not pinned to a full commit SHA: ${line.trim()}`);
      pins.set(match[1], (pins.get(match[1]) || new Set()).add(match[2]));
    }
  }
  for (const [action, commits] of pins) assert.equal(commits.size, 1, `${action} is pinned to one commit everywhere`);
  assert.deepEqual([...pins.keys()].sort(), ['actions/attest-build-provenance', 'actions/checkout', 'actions/download-artifact', 'actions/setup-node', 'actions/upload-artifact']);
});

test('arm64 packages are built and tested natively on the hosted arm64 runner', () => {
  for (const [name, job, x64Job] of [['linux-build.yml', 'test-and-build-arm64', 'test-and-build'], ['release.yml', 'linux-arm64', 'linux-x64']]) {
    const source = workflow(name);
    const arm = jobSource(source, job);
    assert.match(arm, /^    runs-on: ubuntu-24\.04-arm$/mu);
    assert.match(jobSource(source, x64Job), /^    runs-on: ubuntu-24\.04$/mu);
    assert.doesNotMatch(source, /qemu|binfmt|--platform/u, 'nothing is emulated');
    const order = ['run: npm ci', 'run: npm run check', 'run: bash scripts/qualify-linux.sh', 'scripts/run-ui-qualification.py',
      'run: npm run dist:arm64 -- --publish never', 'run: bash scripts/test-installers.sh dist', 'actions/upload-artifact@'].map((text) => arm.indexOf(text));
    assert.ok(order.every((index) => index >= 0), `${name} ${job} is missing a step`);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'packages are built after the tests and handed on only after the installer check');
    assert.doesNotMatch(arm, /dist:x64|secrets\.|gpg|gh release/u);
  }
});

test('one release with one signed manifest covers both architectures', () => {
  const source = workflow('release.yml');
  const arm = jobSource(source, 'linux-arm64');
  const x64 = jobSource(source, 'linux-x64');
  // The arm64 job can read the repository and nothing else.
  assert.match(arm, /^    permissions:\n      contents: read$/mu);
  assert.match(x64, /^    needs: linux-arm64$/mu);
  const handOff = /name: (aux-command-linux-arm64-packages)$/mu;
  assert.equal(arm.match(handOff)?.[1], x64.match(handOff)?.[1]);
  for (const file of ['dist/Aux-Command-*-arm64.AppImage', 'dist/Aux-Command-*-arm64.deb', 'dist/Aux-Command-*-aarch64.rpm', 'dist/latest-linux-arm64.yml']) {
    assert.ok(arm.includes(`            ${file}\n`), `the arm64 job hands over ${file}`);
  }
  assert.match(arm, /if-no-files-found: error/u);

  const position = (text) => {
    const index = x64.indexOf(text);
    assert.ok(index >= 0, `release.yml linux-x64 must contain: ${text}`);
    return index;
  };
  const steps = [
    'run: npm run check',
    'run: CC=clang CXX=clang++ npm run dist:x64 -- --publish never',
    'run: bash scripts/test-installers.sh dist',
    'run: bash scripts/source-archives.sh',
    'uses: actions/download-artifact@',
    '- name: Import and verify release signing key',
    'node scripts/release-manifest.cjs --key',
    'npm run release:verify -- --require-arch x64,arm64',
    'gh release create "$tag" --verify-tag --draft',
    'gh release upload "$tag"',
    'gh release edit "$tag" --draft=false --latest'
  ].map(position);
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b),
    'x64 is built and tested, the arm64 packages are added, only then is the key imported, and the manifest is written and verified before the draft is published');
  assert.match(x64, /node scripts\/verify-release\.cjs --allow-unsigned --require-arch x64,arm64/u);
  assert.equal(source.match(/secrets\./gu).length, 1, 'the signing key is the only secret and only the x64 job reads it');
  assert.equal(source.match(/gh release edit/gu).length, 1);
  // The download places the arm64 files beside the x64 ones.
  assert.match(x64, /uses: actions\/download-artifact@[0-9a-f]{40} # v[\d.]+\n        with:\n          name: aux-command-linux-arm64-packages\n          path: dist\n/u);
  // The publish step attaches both architectures and both updater descriptions.
  for (const pattern of ['"dist/Aux-Command-${version}-"*.AppImage', '"dist/Aux-Command-${version}-"*.deb', '"dist/Aux-Command-${version}-"*.rpm', '"dist/latest"*.yml']) {
    assert.ok(x64.includes(pattern), pattern);
  }
});
