const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const installerCommand = 'node node_modules/electron/install.js';

function installationStep(workflow) {
  const source = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
  const steps = source.split(/(?=^      - )/m).slice(1);
  const installs = steps.filter(step => /^      - name: Install locked Electron runtime$/m.test(step));
  assert.equal(installs.length, 1, `${workflow} must explicitly install its locked Electron binary`);
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

for (const workflow of ['linux-build.yml', 'release.yml']) {
  test(`${workflow} installs locked Electron before UI qualification`, () => {
    installationStep(workflow);
  });

  test(`${workflow} installation command invokes the local package installer`, () => {
    const result = executeInstallation(installationStep(workflow), false);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.installed, true);
  });

  test(`${workflow} installation failure remains a failing step`, () => {
    const result = executeInstallation(installationStep(workflow), true);
    assert.equal(result.status, 17, result.stderr);
    assert.equal(result.installed, false);
    assert.match(result.stderr, /fixture download failed/);
  });
}
