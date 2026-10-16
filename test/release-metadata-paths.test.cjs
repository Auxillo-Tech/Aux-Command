'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Supplemental CLI fixtures; the inherited release-metadata.test.cjs remains unchanged.
function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-license-paths-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'project');
  function write(relative, content) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  }
  const script = write('scripts/release-metadata.cjs', fs.readFileSync(
    path.join(__dirname, '../scripts/release-metadata.cjs')));
  write('package.json', JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  write('src/renderer/assets/fonts/LICENSE.txt', 'FONT');
  const sbomPath = write('dist/fixture-1.0.0-sbom.cdx.json', 'OLD_SBOM');
  const licensesPath = write('THIRD_PARTY_LICENSES.txt', 'OLD_LICENSES');
  write('node_modules/widget/package.json', JSON.stringify({ name: 'widget', version: '1.0.0' }));
  write('node_modules/widget/LICENSE', 'ACTUAL_WIDGET_LICENSE');
  const npm = write('bin/npm', `#!${process.execPath}\nprocess.stdout.write(require('node:fs').readFileSync('input.json'));\n`);
  fs.chmodSync(npm, 0o755);
  function run(properties, success = false) {
    write('input.json', JSON.stringify({ metadata: {}, components: [
      { name: 'widget', version: '1.0.0', properties }
    ] }));
    const result = spawnSync(process.execPath, [script], {
      cwd: root, encoding: 'utf8', timeout: 5000,
      env: { ...process.env, PATH: `${path.dirname(npm)}${path.delimiter}${process.env.PATH || ''}` }
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    if (success) {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).componentCount, 1);
      assert.match(fs.readFileSync(licensesPath, 'utf8'), /widget@1\.0\.0\n=+\nACTUAL_WIDGET_LICENSE/);
      assert.equal(JSON.parse(fs.readFileSync(sbomPath)).components.length, 1);
    } else {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /path|package|locate|escape/iu);
      assert.equal(fs.readFileSync(sbomPath, 'utf8'), 'OLD_SBOM');
      assert.equal(fs.readFileSync(licensesPath, 'utf8'), 'OLD_LICENSES');
    }
  }
  return { root, temporary, write, run };
}
const location = (value) => ({ name: 'cdx:npm:package:path', value });

for (const value of ['node_modules/widget/../widget', 'node_modules//widget', 'node_modules\\widget']) {
  test(`rejects noncanonical installation path ${value}`, (t) => {
    fixture(t).run([location(value)]);
  });
}

test('duplicate path properties are rejected instead of selecting one installation', (t) => {
  fixture(t).run([location('node_modules/widget'), location('node_modules/widget')]);
});

test('the node_modules boundary itself cannot be a symlink outside the project', (t) => {
  const f = fixture(t);
  const outside = path.join(f.temporary, 'outside');
  fs.renameSync(path.join(f.root, 'node_modules'), outside);
  fs.symlinkSync(outside, path.join(f.root, 'node_modules'), 'dir');
  f.run([location('node_modules/widget')]);
});

test('safe in-tree installation symlink retains validated license provenance', (t) => {
  const f = fixture(t);
  f.write('node_modules/parent/package.json', JSON.stringify({ name: 'parent', version: '1.0.0' }));
  fs.mkdirSync(path.join(f.root, 'node_modules/parent/node_modules'));
  fs.symlinkSync('../../widget', path.join(f.root, 'node_modules/parent/node_modules/widget'), 'dir');
  f.run([location('node_modules/parent/node_modules/widget')], true);
});

test('pathless traversal terminates on an internal dependency cycle and finds a matching package', (t) => {
  const f = fixture(t);
  f.write('node_modules/aaa/package.json', JSON.stringify({ name: 'aaa', version: '1.0.0' }));
  fs.symlinkSync('..', path.join(f.root, 'node_modules/aaa/node_modules'), 'dir');
  f.run([], true);
});
