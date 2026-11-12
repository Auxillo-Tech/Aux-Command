'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const status = read('docs/RELEASE_STATUS.md');
const published = status.match(/latest published release is \*\*v(\d+\.\d+\.\d+)\*\*/u)?.[1];
assert.ok(published, 'release status must identify a published version');
const supportedSeries = published.split('.').slice(0, 2).join('.');

for (const language of ['de', 'es', 'fr', 'it', 'ja', 'pt', 'ru', 'zh']) {
  test(`published downloads in ${language} use the published release`, () => {
    const text = read(`README.${language}.md`);
    assert.ok(text.includes(`**${published}**`), 'current version must be the published version');
    const versions = [...text.matchAll(/Aux-Command-(\d+\.\d+\.\d+)-/gu)].map((match) => match[1]);
    assert.ok(versions.length >= 4, 'expected packaged installation examples');
    assert.deepEqual([...new Set(versions)], [published]);
  });
}

test('website download examples use only the published release', () => {
  const versions = [...read('website/index.html').matchAll(/Aux-Command-(\d+\.\d+\.\d+)-/gu)].map((match) => match[1]);
  assert.ok(versions.length >= 3, 'expected website installation examples');
  assert.deepEqual([...new Set(versions)], [published]);
});

test('both security policies support the currently published series', () => {
  for (const name of ['SECURITY.md', '.github/SECURITY.md']) {
    assert.ok(read(name).includes(`| ${supportedSeries}.x | Active |`), name);
    assert.ok(read(name).includes(`| < ${supportedSeries} | Not supported; upgrade to the latest release |`), name);
  }
});


test('binary AUR package pins the published AppImage version and digest', () => {
  const recipe = read('packaging/aur/aux-command-bin/PKGBUILD');
  assert.equal(recipe.match(/^pkgver=(\S+)$/mu)?.[1], published);
  const digest = read('packaging/flatpak/tech.auxillo.command.yml').match(/sha256: ([a-f0-9]{64})/u)?.[1];
  assert.ok(digest, 'the published AppImage digest is recorded');
  assert.ok(recipe.includes(`sha256sums=('${digest}')`));
});

test('the release workflow publishes only after every asset is attached', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/release.yml'), 'utf8');
  const create = workflow.indexOf('gh release create "$tag" --verify-tag --draft');
  const upload = workflow.indexOf('gh release upload "$tag"');
  const publish = workflow.indexOf('gh release edit "$tag" --draft=false --latest');
  assert.ok(create > 0, 'the release must be created as a draft');
  assert.ok(upload > create && publish > upload, 'assets are uploaded to the draft before it is published');
  // An already published release is refused rather than edited in place; the
  // behavioural test below runs the step to prove it.
  assert.match(workflow, /isDraft/u);
  assert.doesNotMatch(workflow, /gh release create "\$tag" --verify-tag --title/u);
});

// Run the real "Publish authenticated GitHub Release" step against a fake gh.
const publishStep = () => {
  const workflow = read('.github/workflows/release.yml');
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
  return body.join('\n').replaceAll('${{ steps.version.outputs.version }}', '0.5.1');
};

const FAKE_GH = `#!/usr/bin/env bash
# state: none | draft | published. FAIL_CALL=n makes the n-th call fail with an API error.
echo "gh $*" >> "$LOG"
n=$(( $(cat "$COUNT" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$COUNT"
if [ "\${FAIL_CALL:-0}" = "$n" ]; then echo "HTTP 502: Bad Gateway" >&2; exit 1; fi
state=$(cat "$STATE")
case "$1 $2" in
  "release view")
    [ "$state" = none ] && { echo "release not found" >&2; exit 1; }
    [ "$state" = draft ] && echo true || echo false
    exit 0;;
  "release create") echo draft > "$STATE"; exit 0;;
  "release upload") [ "\${UPLOAD_FAIL:-0}" = 1 ] && { echo "upload failed" >&2; exit 1; }; exit 0;;
  "release edit") echo published > "$STATE"; exit 0;;
esac
exit 0
`;

const runPublish = (state, env = {}) => {
  const { spawnSync } = require('node:child_process');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-step-'));
  try {
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.mkdirSync(path.join(dir, 'work/dist'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tmp'));
    fs.writeFileSync(path.join(dir, 'bin/gh'), FAKE_GH, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'work/dist/SHA256SUMS'), 'x\n');
    fs.writeFileSync(path.join(dir, 'work/dist/release-manifest.json'), '{}\n');
    fs.writeFileSync(path.join(dir, 'state'), `${state}\n`);
    const result = spawnSync('bash', ['-c', publishStep()], {
      cwd: path.join(dir, 'work'),
      encoding: 'utf8',
      env: {
        PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
        RUNNER_TEMP: path.join(dir, 'tmp'),
        LOG: path.join(dir, 'log'),
        COUNT: path.join(dir, 'count'),
        STATE: path.join(dir, 'state'),
        ...env,
      },
    });
    const log = fs.existsSync(path.join(dir, 'log'))
      ? fs.readFileSync(path.join(dir, 'log'), 'utf8').trim().split('\n').map((line) => line.replace(/^gh /u, ''))
      : [];
    return { status: result.status, stderr: result.stderr, log, state: fs.readFileSync(path.join(dir, 'state'), 'utf8').trim() };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const calls = (result, verb) => result.log.filter((line) => line.startsWith(`release ${verb}`));

test('publish step: no release creates a draft, uploads, then publishes', () => {
  const result = runPublish('none');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls(result, 'view').length, 1);
  assert.equal(calls(result, 'create').length, 1);
  assert.match(calls(result, 'create')[0], /--verify-tag --draft /u);
  assert.equal(calls(result, 'upload').length, 1);
  assert.equal(calls(result, 'edit').length, 1);
  assert.match(calls(result, 'edit')[0], /--draft=false --latest/u);
  assert.equal(result.state, 'published');
});

test('publish step: an existing draft is reused without creating another', () => {
  const result = runPublish('draft');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls(result, 'create').length, 0);
  assert.equal(calls(result, 'upload').length, 1);
  assert.equal(calls(result, 'edit').length, 1);
});

test('publish step: an already published release is refused untouched', () => {
  const result = runPublish('published');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already published/u);
  assert.equal(calls(result, 'create').length, 0);
  assert.equal(calls(result, 'upload').length, 0);
  assert.equal(calls(result, 'edit').length, 0);
});

test('publish step: a failed upload leaves the draft unpublished', () => {
  const result = runPublish('draft', { UPLOAD_FAIL: '1' });
  assert.equal(result.status, 1);
  assert.equal(calls(result, 'upload').length, 1);
  assert.equal(calls(result, 'edit').length, 0);
  assert.equal(result.state, 'draft');
});

test('publish step: a lookup error is never treated as no release', () => {
  // The first gh call fails with an API error while the release is already published.
  const result = runPublish('published', { FAIL_CALL: '1' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HTTP 502/u);
  assert.equal(calls(result, 'create').length, 0);
  assert.equal(calls(result, 'upload').length, 0);
  assert.equal(calls(result, 'edit').length, 0);
  assert.equal(result.state, 'published');
});
