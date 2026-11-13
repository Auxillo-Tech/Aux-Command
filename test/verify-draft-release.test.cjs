'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { verifyDraftRelease } = require('../scripts/verify-draft-release.cjs');

const VERSION = '0.5.1';
const TAG = `v${VERSION}`;
const SCRIPT = path.join(__dirname, '../scripts/verify-draft-release.cjs');
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');

const ARTIFACTS = [
  `Aux-Command-${VERSION}-x86_64.AppImage`,
  `Aux-Command-${VERSION}-amd64.deb`,
  `Aux-Command-${VERSION}-x86_64.rpm`,
  `Aux-Command-${VERSION}-arm64.AppImage`,
  `aux-command-${VERSION}-sbom.cdx.json`,
  `aux-command-${VERSION}-source.tar.gz`,
  `aux-command-${VERSION}-source.zip`,
  'latest-linux.yml',
  'latest-linux-arm64.yml'
];

function makeTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-draft-'));
}

// A dist/ directory laid out the way scripts/release-manifest.cjs writes it.
function makeDist(root, { signed = true } = {}) {
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const artifacts = ARTIFACTS.map((name, index) => {
    const body = Buffer.from(`content of ${name} #${index}\n`.repeat(index + 1));
    fs.writeFileSync(path.join(dist, name), body);
    return { name, kind: 'artifact', size: body.length, sha256: sha(body) };
  });
  fs.writeFileSync(path.join(dist, 'SHA256SUMS'), `${artifacts.map((a) => `${a.sha256}  ${a.name}`).join('\n')}\n`);
  fs.writeFileSync(path.join(dist, 'release-manifest.json'), `${JSON.stringify({
    version: VERSION,
    signing: { status: signed ? 'signed-detached-gpg' : 'unsigned', key: signed ? 'A'.repeat(40) : null },
    artifacts
  }, null, 2)}\n`);
  if (signed) {
    fs.writeFileSync(path.join(dist, 'SHA256SUMS.asc'), 'signature of the checksum list\n');
    fs.writeFileSync(path.join(dist, 'release-manifest.json.asc'), 'signature of the manifest\n');
  }
  return dist;
}

// What `gh release view --json tagName,isDraft,assets` reports for a draft that holds
// exactly the files in dist/ (the metadata files and signatures included).
function draftFor(dist, { isDraft = true } = {}) {
  const names = [...ARTIFACTS, 'SHA256SUMS', 'release-manifest.json'];
  for (const name of ['SHA256SUMS.asc', 'release-manifest.json.asc']) if (fs.existsSync(path.join(dist, name))) names.push(name);
  return {
    tagName: TAG,
    isDraft,
    assets: names.map((name) => {
      const body = fs.readFileSync(path.join(dist, name));
      return { name, size: body.length, state: 'uploaded', digest: `sha256:${sha(body)}` };
    })
  };
}

const verify = (dist, draft, options = {}) => verifyDraftRelease({ dist, tag: TAG, draft, requireSigned: true, ...options });
const without = (draft, name) => ({ ...draft, assets: draft.assets.filter((asset) => asset.name !== name) });
const changed = (draft, name, patch) => ({ ...draft, assets: draft.assets.map((asset) => (asset.name === name ? { ...asset, ...patch } : asset)) });

function withDist(fn, options) {
  const root = makeTemp();
  try {
    return fn(makeDist(root, options), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('a draft that holds exactly the signed file set passes', () => withDist((dist) => {
  const result = verify(dist, draftFor(dist));
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.equal(result.assets.length, ARTIFACTS.length + 4);
  assert.ok(result.assets.includes('release-manifest.json.asc'));
}));

test('an unsigned release passes only when signing is not required', () => withDist((dist) => {
  const draft = draftFor(dist);
  assert.equal(verify(dist, draft, { requireSigned: false }).ok, true);
  const strict = verify(dist, draft);
  assert.equal(strict.ok, false);
  assert.match(strict.problems.join('\n'), /not signed/u);
}, { signed: false }));

test('a file missing from the draft is reported', () => withDist((dist) => {
  const result = verify(dist, without(draftFor(dist), `Aux-Command-${VERSION}-arm64.AppImage`));
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /missing from the draft: Aux-Command-0\.5\.1-arm64\.AppImage/u);
}));

test('a missing detached signature on a signed release is reported', () => withDist((dist) => {
  const result = verify(dist, without(draftFor(dist), 'SHA256SUMS.asc'));
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /missing from the draft: SHA256SUMS\.asc/u);
}));

test('a file the manifest does not list is reported, including one left by an earlier run', () => withDist((dist) => {
  const draft = draftFor(dist);
  draft.assets.push({ name: 'Aux-Command-0.5.0-x86_64.AppImage', size: 5, state: 'uploaded', digest: `sha256:${sha('stale')}` });
  const result = verify(dist, draft);
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /unexpected file on the draft: Aux-Command-0\.5\.0-x86_64\.AppImage/u);
}));

test('a wrong size is reported', () => withDist((dist) => {
  const draft = draftFor(dist);
  const asset = draft.assets.find((a) => a.name === 'latest-linux.yml');
  const result = verify(dist, changed(draft, 'latest-linux.yml', { size: asset.size - 1 }));
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /wrong size for latest-linux\.yml/u);
}));

test('a wrong digest is reported', () => withDist((dist) => {
  const result = verify(dist, changed(draftFor(dist), `Aux-Command-${VERSION}-amd64.deb`, { digest: `sha256:${sha('other bytes')}` }));
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /wrong digest for Aux-Command-0\.5\.1-amd64\.deb/u);
}));

test('a draft asset with no digest fails closed', () => withDist((dist) => {
  for (const digest of [null, undefined, '', 'sha1:abc', `md5:${'a'.repeat(32)}`]) {
    const result = verify(dist, changed(draftFor(dist), 'SHA256SUMS', { digest }));
    assert.equal(result.ok, false, `digest ${String(digest)}`);
    assert.match(result.problems.join('\n'), /no sha256 digest reported for SHA256SUMS/u);
  }
}));

test('an asset that is not fully uploaded fails', () => withDist((dist) => {
  const result = verify(dist, changed(draftFor(dist), 'SHA256SUMS', { state: 'starter' }));
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /not fully uploaded/u);
}));

test('the same file attached twice is reported', () => withDist((dist) => {
  const draft = draftFor(dist);
  draft.assets.push({ ...draft.assets[0] });
  const result = verify(dist, draft);
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /carries .* twice/u);
}));

test('a release that is already published is refused', () => withDist((dist) => {
  const result = verify(dist, draftFor(dist, { isDraft: false }));
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /is not a draft/u);
}));

test('a tag that is not the manifest version is refused', () => withDist((dist) => {
  const result = verifyDraftRelease({ dist, tag: 'v0.5.2', draft: { ...draftFor(dist), tagName: 'v0.5.2' }, requireSigned: true });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /does not match manifest version/u);
}));

test('a draft listing for a different tag is refused', () => withDist((dist) => {
  const result = verify(dist, { ...draftFor(dist), tagName: 'v0.4.9' });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /release tag "v0\.4\.9" is not v0\.5\.1/u);
}));

test('a listing without an assets array fails', () => withDist((dist) => {
  const draft = draftFor(dist);
  delete draft.assets;
  assert.equal(verify(dist, draft).ok, false);
}));

test('a file in dist/ that changed after the manifest was written is reported even if the draft matches dist/', () => withDist((dist) => {
  fs.appendFileSync(path.join(dist, `Aux-Command-${VERSION}-x86_64.rpm`), 'tampered');
  const result = verify(dist, draftFor(dist));
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /dist\/Aux-Command-0\.5\.1-x86_64\.rpm does not match the manifest size/u);
}));

test('a same-size swap in dist/ is caught by the digest', () => withDist((dist) => {
  const name = `aux-command-${VERSION}-source.zip`;
  const file = path.join(dist, name);
  const original = fs.readFileSync(file);
  fs.writeFileSync(file, Buffer.alloc(original.length, 0x41));
  const result = verify(dist, draftFor(dist));
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /does not match the manifest digest/u);
}));

test('SHA256SUMS that disagrees with the manifest is reported', () => withDist((dist) => {
  const file = path.join(dist, 'SHA256SUMS');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  lines[0] = `${'0'.repeat(64)}  ${lines[0].split('  ')[1]}`;
  lines.push(`${'1'.repeat(64)}  Aux-Command-9.9.9-x86_64.deb`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  const result = verify(dist, draftFor(dist));
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /SHA256SUMS does not agree with the manifest/u);
  assert.match(result.problems.join('\n'), /SHA256SUMS lists Aux-Command-9\.9\.9-x86_64\.deb, which the manifest does not/u);
}));

test('a manifest artifact name that is a path is rejected', () => withDist((dist) => {
  const file = path.join(dist, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.artifacts[0].name = '../escape.AppImage';
  fs.writeFileSync(file, JSON.stringify(manifest));
  const result = verify(dist, draftFor(dist));
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /invalid artifact name/u);
}));

test('unreadable inputs throw instead of passing', () => withDist((dist) => {
  fs.rmSync(path.join(dist, 'release-manifest.json'));
  assert.throws(() => verify(dist, { isDraft: true, assets: [] }), /release-manifest\.json is unreadable/u);
  assert.throws(() => verify(dist, null), /not a JSON object/u);
}));

// The command line is what the workflow runs: exit status and the draft left alone.
function runCli(dist, draft, extra = []) {
  const file = path.join(path.dirname(dist), 'draft.json');
  fs.writeFileSync(file, typeof draft === 'string' ? draft : JSON.stringify(draft));
  return spawnSync(process.execPath, [SCRIPT, '--dist', dist, '--tag', TAG, '--draft-json', file, '--require-signed', ...extra], { encoding: 'utf8' });
}

test('command line: exit 0 on a match, exit 1 with every problem listed on a mismatch', () => withDist((dist) => {
  const ok = runCli(dist, draftFor(dist));
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).ok, true);

  const draft = changed(without(draftFor(dist), 'latest-linux.yml'), 'SHA256SUMS', { digest: `sha256:${sha('x')}` });
  const bad = runCli(dist, draft);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /stays unpublished/u);
  assert.match(bad.stderr, /missing from the draft: latest-linux\.yml/u);
  assert.match(bad.stderr, /wrong digest for SHA256SUMS/u);
}));

test('command line: bad input, missing options and unknown flags exit 1', () => withDist((dist) => {
  assert.equal(runCli(dist, 'not json').status, 1);
  assert.equal(runCli(dist, '[]').status, 1);
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--tag', TAG], { encoding: 'utf8' }).status, 1);
  assert.equal(runCli(dist, draftFor(dist), ['--bogus']).status, 1);
}));

// ---- The real publish step of release.yml, run against a fake gh ----------

const workflowSource = () => fs.readFileSync(path.join(__dirname, '../.github/workflows/release.yml'), 'utf8');

function publishStepBody() {
  const workflow = workflowSource();
  const start = workflow.indexOf('- name: Publish authenticated GitHub Release');
  assert.ok(start > 0, 'the publish step exists');
  const lines = workflow.slice(start).split('\n');
  const runAt = lines.findIndex((line) => /^\s+run: \|$/u.test(line));
  assert.ok(runAt > 0, 'the publish step has a run block');
  const indent = lines[runAt + 1].match(/^ */u)[0].length;
  const body = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() !== '' && !line.startsWith(' '.repeat(indent))) break;
    body.push(line.slice(indent));
  }
  return body.join('\n').replaceAll('${{ steps.version.outputs.version }}', VERSION);
}

// state file holds none | draft | published. `release view --json ...assets` prints $DRAFT_JSON.
const FAKE_GH = `#!/usr/bin/env bash
echo "gh $*" >> "$LOG"
state=$(cat "$STATE")
case "$1 $2" in
  "release view")
    [ "$state" = none ] && { echo "release not found" >&2; exit 1; }
    case "$*" in
      *assets*) cat "$DRAFT_JSON"; exit 0;;
    esac
    [ "$state" = draft ] && echo true || echo false
    exit 0;;
  "release create") echo draft > "$STATE"; exit 0;;
  "release upload") exit 0;;
  "release edit") echo published > "$STATE"; exit 0;;
esac
exit 0
`;

function runPublishStep(mutate) {
  const root = makeTemp();
  try {
    const work = path.join(root, 'work');
    fs.mkdirSync(work);
    const dist = makeDist(work);
    fs.mkdirSync(path.join(work, 'scripts'));
    fs.copyFileSync(SCRIPT, path.join(work, 'scripts/verify-draft-release.cjs'));
    fs.mkdirSync(path.join(root, 'bin'));
    fs.mkdirSync(path.join(root, 'tmp'));
    fs.writeFileSync(path.join(root, 'bin/gh'), FAKE_GH, { mode: 0o755 });
    fs.writeFileSync(path.join(root, 'state'), 'draft\n');
    fs.writeFileSync(path.join(root, 'draft.json'), JSON.stringify(mutate(draftFor(dist), dist)));
    const result = spawnSync('bash', ['-c', publishStepBody()], {
      cwd: work,
      encoding: 'utf8',
      env: {
        PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
        RUNNER_TEMP: path.join(root, 'tmp'),
        LOG: path.join(root, 'log'),
        STATE: path.join(root, 'state'),
        DRAFT_JSON: path.join(root, 'draft.json')
      }
    });
    const log = fs.readFileSync(path.join(root, 'log'), 'utf8').trim().split('\n');
    return { status: result.status, stderr: result.stderr, log, state: fs.readFileSync(path.join(root, 'state'), 'utf8').trim() };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const callsTo = (result, verb) => result.log.filter((line) => line.startsWith(`gh release ${verb}`));

test('publish step: a draft that matches the manifest is verified after upload and then published', () => {
  const result = runPublishStep((draft) => draft);
  assert.equal(result.status, 0, result.stderr);
  const verbs = result.log.map((line) => line.split(' ').slice(1, 3).join(' '));
  const lastView = verbs.lastIndexOf('release view');
  assert.ok(verbs.indexOf('release upload') < lastView && lastView < verbs.indexOf('release edit'), result.log.join('\n'));
  assert.match(result.log[lastView], /--json .*assets/u);
  assert.equal(result.state, 'published');
});

for (const [label, mutate, pattern] of [
  ['an extra file', (draft) => ({ ...draft, assets: [...draft.assets, { name: 'Aux-Command-0.4.9-x86_64.deb', size: 3, state: 'uploaded', digest: `sha256:${sha('old')}` }] }), /unexpected file on the draft/u],
  ['a missing file', (draft) => without(draft, 'SHA256SUMS.asc'), /missing from the draft: SHA256SUMS\.asc/u],
  ['a wrong digest', (draft) => changed(draft, 'release-manifest.json', { digest: `sha256:${sha('nope')}` }), /wrong digest for release-manifest\.json/u],
  ['a wrong size', (draft) => changed(draft, 'latest-linux.yml', { size: 1 }), /wrong size for latest-linux\.yml/u],
  ['no digest', (draft) => changed(draft, 'latest-linux.yml', { digest: null }), /no sha256 digest reported/u]
]) {
  test(`publish step: ${label} on the draft stops the run with the draft unpublished`, () => {
    const result = runPublishStep(mutate);
    assert.equal(result.status, 1);
    assert.match(result.stderr, pattern);
    assert.equal(callsTo(result, 'upload').length, 1, 'the upload ran');
    assert.equal(callsTo(result, 'edit').length, 0, 'the draft is never published');
    assert.equal(result.state, 'draft');
  });
}

test('publish step: a lookup failure when reading the draft assets stops the run unpublished', () => {
  const result = runPublishStep(() => ({}));
  assert.equal(result.status, 1);
  assert.equal(callsTo(result, 'edit').length, 0);
  assert.equal(result.state, 'draft');
});

test('release.yml reads the draft back and verifies it between the upload and the publish, once', () => {
  const workflow = workflowSource();
  const upload = workflow.indexOf('gh release upload "$tag"');
  const readBack = workflow.indexOf('gh release view "$tag" --json tagName,isDraft,assets');
  const verifyAt = workflow.indexOf('node scripts/verify-draft-release.cjs --dist dist --tag "$tag" --draft-json');
  const publish = workflow.indexOf('gh release edit "$tag" --draft=false --latest');
  assert.ok(upload > 0 && upload < readBack && readBack < verifyAt && verifyAt < publish, 'upload, read back, verify, then publish');
  assert.equal(workflow.match(/verify-draft-release\.cjs/gu).length, 1);
  assert.match(workflow.slice(verifyAt, publish), /--require-signed/u, 'a release that is not signed is never published');
  assert.doesNotMatch(workflow.slice(readBack, publish), /\|\| true/u, 'the verifier result is never swallowed');
});
