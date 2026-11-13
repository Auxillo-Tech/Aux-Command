#!/usr/bin/env node
'use strict';

// Compares the files attached to a draft GitHub release with the signed release
// manifest, and fails when they differ. The release workflow runs it after the
// upload and before the draft is published, so a missing, extra, truncated or
// swapped file stops the run with the draft still unpublished.
//
// The expected set comes only from files in dist/ that earlier steps already
// verified: release-manifest.json (signed), the artifacts it lists, SHA256SUMS
// and, for a signed release, the two detached signatures. The draft is read from
// `gh release view TAG --json tagName,isDraft,assets`; GitHub reports the size
// and the sha256 digest of each stored asset, so nothing is downloaded again.

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SIGNED = 'signed-detached-gpg';
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const HEX64 = /^[0-9a-f]{64}$/u;

function sha256File(filename) {
  const hash = createHash('sha256');
  const fd = fs.openSync(filename, 'r');
  try {
    const buffer = Buffer.alloc(1 << 20);
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function readJsonFile(filename, label) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is unreadable: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is not a JSON object`);
  return value;
}

function parseChecksums(filename, problems) {
  const entries = new Map();
  let text;
  try {
    text = fs.readFileSync(filename, 'utf8');
  } catch (error) {
    problems.push(`SHA256SUMS is unreadable: ${error.message}`);
    return entries;
  }
  for (const line of text.split('\n').filter(Boolean)) {
    const match = /^([0-9a-f]{64})  ([^\0\r\n]+)$/u.exec(line);
    if (!match) {
      problems.push(`SHA256SUMS has an invalid line: ${line}`);
    } else if (entries.has(match[2])) {
      problems.push(`SHA256SUMS lists ${match[2]} twice`);
    } else {
      entries.set(match[2], match[1]);
    }
  }
  return entries;
}

// The set of files the release must carry, each with its expected size and digest.
function expectedAssets({ dist, requireSigned }, problems) {
  const expected = new Map();
  const manifestPath = path.join(dist, 'release-manifest.json');
  const sumsPath = path.join(dist, 'SHA256SUMS');
  const manifest = readJsonFile(manifestPath, 'release-manifest.json');
  if (typeof manifest.version !== 'string' || !manifest.version) throw new Error('release-manifest.json has no version');
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) throw new Error('release-manifest.json lists no artifacts');

  const signed = manifest.signing?.status === SIGNED;
  if (requireSigned && !signed) problems.push(`release-manifest.json is not signed (signing status ${JSON.stringify(manifest.signing?.status)})`);

  const sums = parseChecksums(sumsPath, problems);
  const listed = new Set();
  for (const artifact of manifest.artifacts) {
    const name = artifact?.name;
    if (typeof name !== 'string' || !SAFE_NAME.test(name)) {
      problems.push(`manifest has an invalid artifact name: ${JSON.stringify(name)}`);
      continue;
    }
    if (listed.has(name)) {
      problems.push(`manifest lists ${name} twice`);
      continue;
    }
    listed.add(name);
    if (!HEX64.test(artifact.sha256 || '') || !Number.isSafeInteger(artifact.size) || artifact.size < 0) {
      problems.push(`manifest has an invalid size or digest for ${name}`);
      continue;
    }
    if (sums.get(name) !== artifact.sha256) problems.push(`SHA256SUMS does not agree with the manifest for ${name}`);
    expected.set(name, { size: artifact.size, sha256: artifact.sha256 });
  }
  for (const name of sums.keys()) {
    if (!listed.has(name)) problems.push(`SHA256SUMS lists ${name}, which the manifest does not`);
  }

  // The manifest cannot list itself or its own checksum list or signatures, so
  // those four are measured from the files that were signed and verified.
  const extras = ['release-manifest.json', 'SHA256SUMS'];
  if (signed) extras.push('release-manifest.json.asc', 'SHA256SUMS.asc');
  for (const name of extras) {
    const filename = path.join(dist, name);
    let stat;
    try {
      stat = fs.statSync(filename);
    } catch {
      problems.push(`dist/${name} is missing`);
      continue;
    }
    if (!stat.isFile()) {
      problems.push(`dist/${name} is not a file`);
      continue;
    }
    expected.set(name, { size: stat.size, sha256: sha256File(filename) });
  }

  // What dist/ holds must still be what the manifest says, so the upload cannot
  // have been built from a file that changed after signing.
  for (const name of listed) {
    const wanted = expected.get(name);
    if (!wanted) continue;
    let stat;
    try {
      stat = fs.statSync(path.join(dist, name));
    } catch {
      problems.push(`dist/${name} is missing`);
      continue;
    }
    if (!stat.isFile() || stat.size !== wanted.size) problems.push(`dist/${name} does not match the manifest size`);
    else if (sha256File(path.join(dist, name)) !== wanted.sha256) problems.push(`dist/${name} does not match the manifest digest`);
  }
  return { expected, version: manifest.version, signed };
}

function compareDraft({ expected, version, tag, draft }, problems) {
  if (tag !== `v${version}`) problems.push(`tag ${tag} does not match manifest version ${version}`);
  if (draft.tagName !== undefined && draft.tagName !== tag) problems.push(`release tag ${JSON.stringify(draft.tagName)} is not ${tag}`);
  if (draft.isDraft !== true) problems.push(`release ${tag} is not a draft`);
  if (!Array.isArray(draft.assets)) {
    problems.push('the release listing carries no assets array');
    return;
  }
  const seen = new Map();
  for (const asset of draft.assets) {
    const name = asset?.name;
    if (typeof name !== 'string') {
      problems.push('the draft has an asset without a name');
      continue;
    }
    if (seen.has(name)) {
      problems.push(`the draft carries ${name} twice`);
      continue;
    }
    seen.set(name, asset);
    const wanted = expected.get(name);
    if (!wanted) {
      problems.push(`unexpected file on the draft: ${name}`);
      continue;
    }
    if (asset.state !== 'uploaded') problems.push(`${name} is not fully uploaded (state ${JSON.stringify(asset.state)})`);
    if (asset.size !== wanted.size) problems.push(`wrong size for ${name}: draft has ${asset.size}, manifest says ${wanted.size}`);
    const digest = typeof asset.digest === 'string' ? /^sha256:([0-9a-f]{64})$/u.exec(asset.digest) : null;
    if (!digest) problems.push(`no sha256 digest reported for ${name}; cannot confirm its content`);
    else if (digest[1] !== wanted.sha256) problems.push(`wrong digest for ${name}: draft has ${digest[1]}, manifest says ${wanted.sha256}`);
  }
  for (const name of expected.keys()) {
    if (!seen.has(name)) problems.push(`missing from the draft: ${name}`);
  }
}

// Returns { ok, problems, assets }. Throws only when the inputs cannot be read.
function verifyDraftRelease({ dist, tag, draft, requireSigned = false }) {
  if (!dist || !tag) throw new Error('dist and tag are required');
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('draft release listing is not a JSON object');
  const problems = [];
  const { expected, version } = expectedAssets({ dist, requireSigned }, problems);
  compareDraft({ expected, version, tag, draft }, problems);
  return { ok: problems.length === 0, problems, assets: [...expected.keys()].sort() };
}

function parseArgs(argv) {
  const options = { dist: path.resolve(__dirname, '..', 'dist'), tag: '', draftJson: '', requireSigned: false };
  const value = (index, flag) => {
    const next = argv[index];
    if (!next) throw new Error(`${flag} requires a value`);
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dist') options.dist = path.resolve(value(++index, arg));
    else if (arg === '--tag') options.tag = value(++index, arg);
    else if (arg === '--draft-json') options.draftJson = value(++index, arg);
    else if (arg === '--require-signed') options.requireSigned = true;
    else if (arg === '--help') {
      process.stdout.write('Usage: node scripts/verify-draft-release.cjs --tag vX.Y.Z --draft-json FILE [--dist DIR] [--require-signed]\n'
        + 'FILE is the output of: gh release view TAG --json tagName,isDraft,assets\n');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.tag) throw new Error('--tag is required');
  if (!options.draftJson) throw new Error('--draft-json is required');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const draft = readJsonFile(options.draftJson, 'draft release listing');
  const result = verifyDraftRelease({ dist: options.dist, tag: options.tag, draft, requireSigned: options.requireSigned });
  if (!result.ok) {
    process.stderr.write(`::error::Draft release ${options.tag} does not match the signed manifest; it stays unpublished.\n`);
    for (const problem of result.problems) process.stderr.write(`  - ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, tag: options.tag, assets: result.assets }, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`::error::${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { verifyDraftRelease };
