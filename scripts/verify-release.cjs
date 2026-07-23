#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

function normalizeFingerprint(value, label = 'fingerprint') {
  const fingerprint = String(value || '').replace(/\s+/gu, '').toUpperCase();
  if (!/^(?:[0-9A-F]{40}|[0-9A-F]{64})$/u.test(fingerprint)) {
    throw new Error(`Invalid ${label}; expected a full 40- or 64-hex-character OpenPGP fingerprint`);
  }
  return fingerprint;
}

function parseArgs(argv) {
  const options = {
    dist: path.resolve(__dirname, '..', 'dist'),
    allowUnsigned: false,
    expectedFingerprint: process.env.AUX_COMMAND_GPG_FINGERPRINT || ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dist') {
      const value = argv[++index];
      if (!value) throw new Error('--dist requires a directory');
      options.dist = path.resolve(value);
    } else if (arg === '--allow-unsigned') {
      options.allowUnsigned = true;
    } else if (arg === '--expected-fingerprint') {
      const value = argv[++index];
      if (!value) throw new Error('--expected-fingerprint requires a full OpenPGP fingerprint');
      options.expectedFingerprint = value;
    } else if (arg === '--help') {
      process.stdout.write('Usage: node scripts/verify-release.cjs [--dist DIR] [--allow-unsigned] [--expected-fingerprint FINGERPRINT]\n');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.expectedFingerprint) {
    options.expectedFingerprint = normalizeFingerprint(options.expectedFingerprint, 'expected signing fingerprint');
  }
  return options;
}

function readJson(filename) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid release manifest: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid release manifest root');
  return value;
}

function safeArtifactName(name) {
  if (typeof name !== 'string' || !name || name !== path.basename(name) || /[\0\r\n]/u.test(name)) {
    throw new Error(`Invalid artifact name: ${JSON.stringify(name)}`);
  }
  return name;
}

function sha256File(filename) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filename));
  return hash.digest('hex');
}

function readChecksums(filename) {
  const entries = new Map();
  const lines = fs.readFileSync(filename, 'utf8').split('\n').filter(Boolean);
  if (lines.length === 0) throw new Error('SHA256SUMS is empty');
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  ([^\0\r\n]+)$/u.exec(line);
    if (!match) throw new Error(`Invalid SHA256SUMS line: ${line}`);
    const name = safeArtifactName(match[2]);
    if (entries.has(name)) throw new Error(`Duplicate checksum entry: ${name}`);
    entries.set(name, match[1]);
  }
  return entries;
}

function verifySignature(filename, expectedFingerprint) {
  const signature = `${filename}.asc`;
  if (!fs.existsSync(signature)) throw new Error(`Missing detached signature: ${path.basename(signature)}`);
  const result = spawnSync('gpg', ['--batch', '--status-fd=1', '--verify', signature, filename], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') throw new Error('gpg is required to verify signed releases');
  if (result.status !== 0) throw new Error(`GPG signature verification failed for ${path.basename(filename)}: ${result.stderr || result.stdout}`);

  const validSig = result.stdout.split('\n').find((line) => line.startsWith('[GNUPG:] VALIDSIG '));
  if (!validSig) throw new Error(`GPG did not report a machine-readable VALIDSIG for ${path.basename(filename)}`);
  const fields = validSig.slice('[GNUPG:] VALIDSIG '.length).trim().split(/\s+/u);
  const fingerprints = [fields[0], fields.at(-1)]
    .filter((value) => /^(?:[0-9A-F]{40}|[0-9A-F]{64})$/iu.test(value || ''))
    .map((value) => value.toUpperCase());
  if (!fingerprints.includes(expectedFingerprint)) {
    throw new Error(`Signing fingerprint mismatch for ${path.basename(filename)}: expected ${expectedFingerprint}, got ${fingerprints.join(' or ') || 'unknown'}`);
  }
  return {
    fingerprint: expectedFingerprint,
    detail: result.stderr.trim()
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.join(options.dist, 'release-manifest.json');
  const sumsPath = path.join(options.dist, 'SHA256SUMS');
  if (!fs.existsSync(manifestPath)) throw new Error('Missing release-manifest.json');
  if (!fs.existsSync(sumsPath)) throw new Error('Missing SHA256SUMS');

  const manifest = readJson(manifestPath);
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) throw new Error('Manifest has no artifacts');
  const sums = readChecksums(sumsPath);
  const seen = new Set();
  const verified = [];

  for (const artifact of manifest.artifacts) {
    if (!artifact || typeof artifact !== 'object') throw new Error('Invalid manifest artifact entry');
    const name = safeArtifactName(artifact.name);
    if (seen.has(name)) throw new Error(`Duplicate manifest artifact: ${name}`);
    seen.add(name);
    if (!/^[0-9a-f]{64}$/u.test(artifact.sha256 || '')) throw new Error(`Invalid manifest checksum for ${name}`);
    if (!Number.isSafeInteger(artifact.size) || artifact.size < 0) throw new Error(`Invalid manifest size for ${name}`);
    if (!sums.has(name)) throw new Error(`Missing checksum entry for ${name}`);
    if (sums.get(name) !== artifact.sha256) throw new Error(`Manifest/SHA256SUMS mismatch for ${name}`);

    const filename = path.join(options.dist, name);
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) throw new Error(`Missing artifact: ${name}`);
    const stat = fs.statSync(filename);
    if (stat.size !== artifact.size) throw new Error(`Size mismatch for ${name}`);
    const actual = sha256File(filename);
    if (actual !== artifact.sha256) throw new Error(`Checksum mismatch for ${name}`);
    verified.push({ name, size: stat.size, sha256: actual });
  }

  for (const name of sums.keys()) {
    if (!seen.has(name)) throw new Error(`SHA256SUMS contains artifact absent from manifest: ${name}`);
  }

  const signed = manifest.signing?.status === 'signed-detached-gpg';
  if (!signed && !options.allowUnsigned) {
    throw new Error('Release is unsigned; pass --allow-unsigned only for local engineering verification');
  }

  const signatures = [];
  if (signed) {
    if (!options.expectedFingerprint) {
      throw new Error('Signed release verification requires --expected-fingerprint or AUX_COMMAND_GPG_FINGERPRINT');
    }
    const manifestFingerprint = normalizeFingerprint(manifest.signing?.key, 'manifest signing fingerprint');
    if (manifestFingerprint !== options.expectedFingerprint) {
      throw new Error(`Manifest signing fingerprint mismatch: expected ${options.expectedFingerprint}, got ${manifestFingerprint}`);
    }
    signatures.push({ file: 'SHA256SUMS.asc', ...verifySignature(sumsPath, options.expectedFingerprint) });
    signatures.push({ file: 'release-manifest.json.asc', ...verifySignature(manifestPath, options.expectedFingerprint) });
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    dist: options.dist,
    version: manifest.version,
    signed,
    artifacts: verified,
    signatures
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
