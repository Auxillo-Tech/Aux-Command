#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function parseArgs(argv) {
  const options = {
    dist: path.join(root, 'dist'),
    version: packageJson.version,
    sign: true,
    key: process.env.AUX_COMMAND_GPG_KEY || ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dist') options.dist = path.resolve(argv[++index]);
    else if (arg === '--version') options.version = argv[++index];
    else if (arg === '--key') options.key = argv[++index];
    else if (arg === '--no-sign') options.sign = false;
    else if (arg === '--help') {
      process.stdout.write('Usage: node scripts/release-manifest.cjs [--dist DIR] [--version VERSION] [--key GPG_KEY] [--no-sign]\n');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.version || /[\0\n\r]/u.test(options.version)) throw new Error('Invalid version');
  return options;
}

function sha256File(filename) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filename));
  return hash.digest('hex');
}

function artifactKind(name) {
  if (name.endsWith('.AppImage')) return 'appimage';
  if (name.endsWith('.deb')) return 'deb';
  if (name.endsWith('.rpm')) return 'rpm';
  if (name.endsWith('.tar.gz')) return 'source-tarball';
  if (name.endsWith('.zip')) return 'source-zip';
  if (name.endsWith('-sbom.cdx.json')) return 'cyclonedx-sbom';
  return 'artifact';
}

function collectArtifacts(distDir) {
  const allowed = /(?:\.(?:AppImage|deb|rpm|tar\.gz|zip)|-sbom\.cdx\.json)$/u;
  return fs.readdirSync(distDir)
    .filter((name) => allowed.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const filename = path.join(distDir, name);
      const stat = fs.statSync(filename);
      if (!stat.isFile()) return null;
      return {
        name,
        kind: artifactKind(name),
        size: stat.size,
        sha256: sha256File(filename)
      };
    })
    .filter(Boolean);
}

function writeJsonStable(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function signFile(filename, key) {
  const args = ['--batch', '--yes', '--armor', '--detach-sign'];
  if (key) args.push('--local-user', key);
  args.push(filename);
  const result = spawnSync('gpg', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`gpg failed for ${path.basename(filename)}: ${result.stderr || result.stdout}`);
  }
  return `${filename}.asc`;
}

function resolveSigningFingerprint(key) {
  const result = spawnSync('gpg', [
    '--batch',
    '--with-colons',
    '--fingerprint',
    '--list-secret-keys',
    key
  ], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') throw new Error('gpg is required to resolve the release signing fingerprint');
  if (result.status !== 0) throw new Error(`Unable to resolve release signing key ${key}: ${result.stderr || result.stdout}`);
  const fingerprint = result.stdout
    .split('\n')
    .map((line) => line.split(':'))
    .find((fields) => fields[0] === 'fpr')?.[9]
    ?.toUpperCase();
  if (!/^(?:[0-9A-F]{40}|[0-9A-F]{64})$/u.test(fingerprint || '')) {
    throw new Error(`GPG did not return a full fingerprint for release signing key ${key}`);
  }
  return fingerprint;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.dist, { recursive: true });
  const artifacts = collectArtifacts(options.dist);
  if (artifacts.length === 0) throw new Error(`No release artifacts found in ${options.dist}`);
  const signingFingerprint = options.sign && options.key ? resolveSigningFingerprint(options.key) : null;

  const sumsPath = path.join(options.dist, 'SHA256SUMS');
  fs.writeFileSync(sumsPath, artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join('\n') + '\n');

  const manifestPath = path.join(options.dist, 'release-manifest.json');
  const manifest = {
    productName: packageJson.build?.productName || 'Aux Command',
    packageName: packageJson.name,
    version: options.version,
    generatedAt: new Date().toISOString(),
    updatePolicy: {
      channel: 'github-releases',
      transport: 'github',
      signatureVerification: options.sign && Boolean(options.key) ? 'detached-gpg' : 'sha256-manifest-only'
    },
    signing: {
      status: options.sign && options.key ? 'signed-detached-gpg' : 'unsigned',
      key: signingFingerprint,
      note: options.sign && !options.key ? 'Set AUX_COMMAND_GPG_KEY or pass --key to produce detached GPG signatures.' : null
    },
    artifacts
  };
  writeJsonStable(manifestPath, manifest);

  const signatures = [];
  if (options.sign && options.key) {
    signatures.push(path.basename(signFile(sumsPath, options.key)));
    signatures.push(path.basename(signFile(manifestPath, options.key)));
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    dist: options.dist,
    manifest: manifestPath,
    checksums: sumsPath,
    artifactCount: artifacts.length,
    signatures
  }, null, 2) + '\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
