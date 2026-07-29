'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function writeVerifierArtifacts(directory, version = packageJson.version) {
  const artifacts = {
    [`Aux-Command-${version}-x86_64.AppImage`]: 'appimage\n',
    [`Aux-Command-${version}-amd64.deb`]: 'deb\n',
    [`Aux-Command-${version}-x86_64.rpm`]: 'rpm\n',
    [`Aux-Command-${version}.tar.gz`]: 'source tarball\n',
    [`Aux-Command-${version}.zip`]: 'source zip\n',
    [`aux-command-${version}-sbom.cdx.json`]: '{"bomFormat":"CycloneDX"}\n',
    'latest-linux.yml': 'version: fixture\n'
  };
  for (const [name, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(directory, name), content);
  return artifacts;
}

test('release manifest script writes deterministic artifact metadata and checksums', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-manifest-'));
  try {
    const artifacts = {
      'Aux-Command-0.1.0-x86_64.AppImage': Buffer.from('appimage\n'),
      'Aux-Command-0.1.0-amd64.deb': Buffer.from('deb\n'),
      'Aux-Command-0.1.0-x86_64.rpm': Buffer.from('rpm\n'),
      'aux-command-0.1.0-sbom.cdx.json': Buffer.from('{"bomFormat":"CycloneDX"}\n')
    };
    for (const [name, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(directory, name), content);

    const result = spawnSync(process.execPath, [
      path.join(root, 'scripts/release-manifest.cjs'),
      '--dist', directory,
      '--version', '0.1.0',
      '--no-sign'
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release-manifest.json'), 'utf8'));
    assert.equal(manifest.productName, 'Aux Command');
    assert.equal(manifest.version, '0.1.0');
    assert.equal(manifest.signing.status, 'unsigned');
    assert.deepEqual(manifest.updatePolicy, {
      channel: 'github-releases',
      transport: 'github',
      signatureVerification: 'sha256-manifest-only'
    });
    assert.equal(manifest.artifacts.length, 4);
    assert.equal(manifest.artifacts.find((artifact) => artifact.name.endsWith('-sbom.cdx.json')).kind, 'cyclonedx-sbom');
    assert.deepEqual(manifest.artifacts.map((artifact) => artifact.name), Object.keys(artifacts).sort((a, b) => a.localeCompare(b)));
    for (const artifact of manifest.artifacts) {
      assert.equal(artifact.size, artifacts[artifact.name].length);
      assert.equal(artifact.sha256, sha256(artifacts[artifact.name]));
    }

    const sums = fs.readFileSync(path.join(directory, 'SHA256SUMS'), 'utf8').trim().split('\n');
    assert.equal(sums.length, 4);
    assert.equal(sums[0], `${sha256(artifacts['Aux-Command-0.1.0-amd64.deb'])}  Aux-Command-0.1.0-amd64.deb`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('package exposes release manifest script', () => {
  assert.equal(packageJson.scripts['release:manifest'], 'AUX_COMMAND_GPG_KEY=FAC028574B9C6875D10DA4DC6443E86108ABD2A2 node scripts/release-metadata.cjs && bash scripts/source-archives.sh && node scripts/release-manifest.cjs');
  assert.equal(packageJson.scripts['release:metadata'], 'node scripts/release-metadata.cjs');
});

test('release verifier accepts intact artifacts and rejects tampering', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-verify-'));
  try {
    writeVerifierArtifacts(directory);
    const artifact = path.join(directory, `Aux-Command-${packageJson.version}-x86_64.AppImage`);
    const manifestResult = spawnSync(process.execPath, [
      path.join(root, 'scripts/release-manifest.cjs'),
      '--dist', directory,
      '--version', packageJson.version,
      '--no-sign'
    ], { encoding: 'utf8' });
    assert.equal(manifestResult.status, 0, manifestResult.stderr || manifestResult.stdout);

    const verifyArgs = [path.join(root, 'scripts/verify-release.cjs'), '--dist', directory, '--allow-unsigned'];
    const validResult = spawnSync(process.execPath, verifyArgs, { encoding: 'utf8' });
    assert.equal(validResult.status, 0, validResult.stderr || validResult.stdout);

    fs.appendFileSync(artifact, 'tampered\n');
    const tamperedResult = spawnSync(process.execPath, verifyArgs, { encoding: 'utf8' });
    assert.notEqual(tamperedResult.status, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('release verifier pins signed releases to an external full fingerprint', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-signer-'));
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-gpg-'));
  const expected = 'A'.repeat(40);
  const attacker = 'B'.repeat(40);
  const gpg = path.join(fakeBin, 'gpg');
  const writeFakeGpg = (fingerprint) => {
    fs.writeFileSync(gpg, `#!/bin/sh\nprintf '%s\\n' '[GNUPG:] NEWSIG' '[GNUPG:] VALIDSIG ${fingerprint} 2026-07-23 1784775000 0 4 0 1 10 00 ${fingerprint}'\n`);
    fs.chmodSync(gpg, 0o755);
  };

  try {
    writeVerifierArtifacts(directory);
    const manifestResult = spawnSync(process.execPath, [
      path.join(root, 'scripts/release-manifest.cjs'),
      '--dist', directory,
      '--version', packageJson.version,
      '--no-sign'
    ], { encoding: 'utf8' });
    assert.equal(manifestResult.status, 0, manifestResult.stderr || manifestResult.stdout);

    const manifestPath = path.join(directory, 'release-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.signing = { status: 'signed-detached-gpg', key: expected, note: null };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(path.join(directory, 'SHA256SUMS.asc'), 'signature fixture\n');
    fs.writeFileSync(`${manifestPath}.asc`, 'signature fixture\n');

    const args = [
      path.join(root, 'scripts/verify-release.cjs'),
      '--dist', directory,
      '--expected-fingerprint', expected
    ];
    const env = { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}` };

    writeFakeGpg(attacker);
    const attackerResult = spawnSync(process.execPath, args, { encoding: 'utf8', env });
    assert.notEqual(attackerResult.status, 0);

    writeFakeGpg(expected);
    const validResult = spawnSync(process.execPath, args, { encoding: 'utf8', env });
    assert.equal(validResult.status, 0, validResult.stderr || validResult.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }
});

test('package exposes release verification script', () => {
  assert.equal(packageJson.scripts['release:verify'], 'AUX_COMMAND_GPG_FINGERPRINT=FAC028574B9C6875D10DA4DC6443E86108ABD2A2 node scripts/verify-release.cjs');
});
