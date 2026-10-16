const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/ci-enable-electron-sandbox.sh');
const stepName = 'Enable the Electron SUID sandbox helper on the runner';
const stepCommand = 'bash scripts/ci-enable-electron-sandbox.sh';

function workflowSteps(workflow) {
  const source = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
  return source.split(/(?=^      - )/m).slice(1);
}

function sandboxStep(workflow) {
  const steps = workflowSteps(workflow);
  const matches = steps.filter(step => new RegExp(`^      - name: ${stepName}$`, 'm').test(step));
  assert.equal(matches.length, 1, `${workflow} must enable the SUID sandbox helper exactly once`);
  const step = matches[0];
  assert.equal(step.match(/^        run: (.+)$/m)?.[1], stepCommand, 'run the collected script, not inline privileged commands');
  const installIndex = steps.findIndex(s => /^      - name: Install locked Electron runtime$/m.test(s));
  const sandboxIndex = steps.indexOf(step);
  const uiIndex = steps.findIndex(s => /^        run: .*scripts\/run-ui-qualification\.py$/m.test(s));
  assert.ok(installIndex >= 0 && installIndex < sandboxIndex && sandboxIndex < uiIndex,
    'enable the helper after the Electron binary exists and before any UI startup');
  assert.doesNotMatch(step, /continue-on-error|if:/, 'the step must be unconditional and must fail the job when it fails');
  return step;
}

function runScript({ ci = 'true', helper, privileged, cwd } = {}) {
  const env = { PATH: process.env.PATH, CI: ci };
  if (helper !== undefined) env.AUX_SANDBOX_HELPER = helper;
  if (privileged !== undefined) env.AUX_SANDBOX_PRIVILEGED_COMMAND = privileged;
  return spawnSync('bash', [script], { cwd, encoding: 'utf8', timeout: 10000, env });
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ci-sandbox-'));
  const dist = path.join(dir, 'node_modules/electron/dist');
  fs.mkdirSync(dist, { recursive: true });
  const helper = path.join(dist, 'chrome-sandbox');
  fs.writeFileSync(helper, 'fixture helper');
  fs.chmodSync(helper, 0o755);
  const log = path.join(dir, 'privileged.log');
  const fake = path.join(dir, 'fake-privileged.sh');
  // Records what would have run with privileges; it cannot (and must not) make
  // the fixture root-owned, so the script's own verification has to catch that.
  fs.writeFileSync(fake, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${log}'\n`);
  fs.chmodSync(fake, 0o755);
  return { dir, helper, fake, log, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

for (const workflow of ['linux-build.yml', 'release.yml']) {
  test(`${workflow} enables the SUID sandbox helper between Electron install and UI qualification`, () => {
    sandboxStep(workflow);
  });

  test(`${workflow} never disables the Electron sandbox instead`, () => {
    const source = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
    assert.doesNotMatch(source, /no-sandbox|ELECTRON_DISABLE_SANDBOX|disable-setuid-sandbox/);
  });
}

test('the sandbox script is executable shell with strict mode and no sandbox bypass', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /^set -euo pipefail$/m);
  assert.doesNotMatch(source, /no-sandbox|ELECTRON_DISABLE_SANDBOX|disable-setuid-sandbox/);
  assert.equal(spawnSync('bash', ['-n', script], { encoding: 'utf8' }).status, 0, 'script must parse');
});

test('the sandbox script refuses to run outside CI', () => {
  const f = fixture();
  try {
    const result = runScript({ ci: '', helper: f.helper, privileged: f.fake, cwd: f.dir });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside CI/);
    assert.equal(fs.existsSync(f.log), false, 'no privileged command may run outside CI');
  } finally { f.cleanup(); }
});

test('the sandbox script fails when the helper is missing', () => {
  const f = fixture();
  try {
    fs.rmSync(f.helper);
    const result = runScript({ helper: f.helper, privileged: f.fake, cwd: f.dir });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /helper not found/);
    assert.equal(fs.existsSync(f.log), false);
  } finally { f.cleanup(); }
});

test('the sandbox script refuses a symlinked helper', () => {
  const f = fixture();
  try {
    const target = path.join(f.dir, 'elsewhere');
    fs.writeFileSync(target, 'x');
    fs.rmSync(f.helper);
    fs.symlinkSync(target, f.helper);
    const result = runScript({ helper: f.helper, privileged: f.fake, cwd: f.dir });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not be a symlink/);
    assert.equal(fs.existsSync(f.log), false);
  } finally { f.cleanup(); }
});

test('the sandbox script requests exactly chown root:root and chmod 4755, then verifies and fails closed', () => {
  const f = fixture();
  try {
    const result = runScript({ helper: f.helper, privileged: f.fake, cwd: f.dir });
    const requested = fs.readFileSync(f.log, 'utf8').trim().split('\n');
    assert.deepEqual(requested, [`chown root:root ${f.helper}`, `chmod 4755 ${f.helper}`]);
    // The fake could not change ownership, so the script's verification must
    // reject the result rather than report success.
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /verification failed: owner is/);
    assert.doesNotMatch(result.stdout, /sandbox stays enabled/);
  } finally { f.cleanup(); }
});

test('the sandbox script reports a privileged command failure instead of continuing', () => {
  const f = fixture();
  try {
    const failing = path.join(f.dir, 'failing-privileged.sh');
    fs.writeFileSync(failing, '#!/usr/bin/env bash\nexit 1\n');
    fs.chmodSync(failing, 0o755);
    const result = runScript({ helper: f.helper, privileged: failing, cwd: f.dir });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /could not make .* root-owned/);
  } finally { f.cleanup(); }
});
