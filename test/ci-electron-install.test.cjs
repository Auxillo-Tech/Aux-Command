const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const installerCommand = 'node node_modules/electron/install.js';

// Every job that builds and tests the application, on either architecture.
const jobs = [
  ['linux-build.yml', 'test-and-build'], ['linux-build.yml', 'test-and-build-arm64'],
  ['release.yml', 'linux-x64'], ['release.yml', 'linux-arm64']
];

// The text of one job: from its key under `jobs:` to the next job.
function jobSource(workflow, job) {
  const source = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
  const start = source.search(new RegExp(`^  ${job}:$`, 'm'));
  assert.ok(start >= 0, `${workflow} must have a ${job} job`);
  const rest = source.slice(start + 1);
  const next = rest.search(/^  [A-Za-z0-9_-]+:$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

function installationStep(workflow, job) {
  const steps = jobSource(workflow, job).split(/(?=^      - )/m).slice(1);
  const installs = steps.filter(step => /^      - name: Install locked Electron runtime$/m.test(step));
  assert.equal(installs.length, 1, `${workflow} ${job} must explicitly install its locked Electron binary`);
  const command = installs[0].match(/^        run: (.+)$/m)?.[1];
  assert.equal(command, installerCommand, 'use the installed package, without fetching an unpinned npm command');
  const npmIndex = steps.findIndex(step => /^        run: npm ci$/m.test(step));
  const installIndex = steps.indexOf(installs[0]);
  const uiIndex = steps.findIndex(step => /^        run: .*scripts\/run-ui-qualification\.py$/m.test(step));
  assert.ok(npmIndex >= 0 && npmIndex < installIndex && installIndex < uiIndex,
    'install the binary after npm ci and before direct-path UI startup');
  assert.doesNotMatch(installs[0], /continue-on-error|no-sandbox|disable.*sandbox/);
  return command;
}

function executeInstallation(command, fail) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-electron-install-'));
  try {
    const electron = path.join(dir, 'node_modules/electron');
    fs.mkdirSync(electron, { recursive: true });
    fs.writeFileSync(path.join(electron, 'install.js'), [
      "const fs = require('node:fs'); const path = require('node:path');",
      "if (process.env.AUX_INSTALL_FIXTURE_FAIL === '1') { console.error('fixture download failed'); process.exit(17); }",
      "fs.mkdirSync(path.join(__dirname, 'dist'));",
      "fs.writeFileSync(path.join(__dirname, 'dist/electron'), 'fixture binary');"
    ].join('\n'));
    const result = spawnSync('bash', ['-e', '-c', command], {
      cwd: dir, encoding: 'utf8', timeout: 5000,
      env: { PATH: process.env.PATH, AUX_INSTALL_FIXTURE_FAIL: fail ? '1' : '0' }
    });
    return { ...result, installed: fs.existsSync(path.join(electron, 'dist/electron')) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const [workflow, job] of jobs) {
  test(`${workflow} ${job} installs locked Electron before UI qualification`, () => {
    installationStep(workflow, job);
  });

  test(`${workflow} ${job} installation command invokes the local package installer`, () => {
    const result = executeInstallation(installationStep(workflow, job), false);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.installed, true);
  });

  test(`${workflow} ${job} installation failure remains a failing step`, () => {
    const result = executeInstallation(installationStep(workflow, job), true);
    assert.equal(result.status, 17, result.stderr);
    assert.equal(result.installed, false);
    assert.match(result.stderr, /fixture download failed/);
  });
}
