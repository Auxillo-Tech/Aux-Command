'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repository = path.resolve(__dirname, '..');
const packagePathProperty = 'cdx:npm:package:path';
const nestedSemver = 'node_modules/electron-updater/node_modules/semver';

// Match npm sbom --omit=dev --sbom-format=cyclonedx, including its path property.
function component(name, version, installation) {
  const slash = name.startsWith('@') ? name.indexOf('/') : -1;
  return {
    type: 'library',
    'bom-ref': `${name}@${version}${installation ? `:${installation}` : ''}`,
    ...(slash < 0 ? { name } : { group: name.slice(0, slash), name: name.slice(slash + 1) }),
    version,
    scope: 'required',
    properties: installation === undefined ? [] : [{ name: packagePathProperty, value: installation }]
  };
}

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-release-metadata-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'project');
  const write = (relative, content) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  };
  // Run unchanged production code with its normal __dirname-based root, never
  // writing fixture metadata into the checkout's package.json or lockfile.
  fs.mkdirSync(root);
  fs.cpSync(path.join(repository, 'scripts'), path.join(root, 'scripts'), { recursive: true });
  write('package.json', JSON.stringify({ name: 'release-fixture', version: '1.2.3' }));
  write('src/renderer/assets/fonts/LICENSE.txt', 'FONT_LICENSE_SENTINEL\n');
  const sbomPath = write('dist/release-fixture-1.2.3-sbom.cdx.json', 'PREVIOUS_GOOD_SBOM\n');
  const licensesPath = write('THIRD_PARTY_LICENSES.txt', 'PREVIOUS_GOOD_LICENSES\n');
  const originalSbom = fs.readFileSync(sbomPath);
  const originalLicenses = fs.readFileSync(licensesPath);
  const originalPackage = fs.readFileSync(path.join(root, 'package.json'));
  const bin = path.join(temporary, 'bin');
  fs.mkdirSync(bin);
  const invocation = path.join(temporary, 'npm-invocation.json');
  const sbomInput = path.join(temporary, 'npm-sbom.json');
  const npm = path.join(bin, 'npm');
  fs.writeFileSync(npm, `#!${process.execPath}\n'use strict';\n` +
    `const fs = require('node:fs');\n` +
    `fs.writeFileSync(${JSON.stringify(invocation)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));\n` +
    `process.stdout.write(fs.readFileSync(${JSON.stringify(sbomInput)}, 'utf8'));\n`);
  fs.chmodSync(npm, 0o755);

  const install = (relative, name, version, license = 'LICENSE_SENTINEL') => {
    write(`${relative}/package.json`, JSON.stringify({ name, version }));
    if (license !== null) write(`${relative}/LICENSE`, `${license}\n`);
    return path.join(root, relative);
  };
  const run = (components) => {
    const sbom = { bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
      metadata: { timestamp: '2026-10-16T00:00:00.000Z' }, components };
    fs.writeFileSync(sbomInput, JSON.stringify(sbom));
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/release-metadata.cjs')], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH || ''}` },
      encoding: 'utf8',
      timeout: 10000
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(invocation, 'utf8')), {
      args: ['sbom', '--omit=dev', '--sbom-format=cyclonedx'], cwd: root
    });
    assert.deepEqual(fs.readFileSync(path.join(root, 'package.json')), originalPackage);
    assert.equal(fs.existsSync(path.join(root, 'package-lock.json')), false);
    return result;
  };
  const succeed = (components) => {
    const result = run(components);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.componentCount, components.length);
    assert.equal(report.sbom, sbomPath);
    assert.equal(report.licenses, licensesPath);
    const sbom = JSON.parse(fs.readFileSync(sbomPath, 'utf8'));
    assert.deepEqual(sbom.components, components);
    assert.equal(sbom.metadata.timestamp, '1970-01-01T00:00:00.000Z');
    const licenses = fs.readFileSync(licensesPath, 'utf8');
    assert.ok(licenses.includes('FONT_LICENSE_SENTINEL'));
    assert.ok(!licenses.includes('PREVIOUS_GOOD_LICENSES'));
    return licenses;
  };
  const reject = (components, diagnostic) => {
    const result = run(components);
    assert.notEqual(result.status, 0, 'unsafe or incomplete license collection must fail');
    assert.match(result.stderr, diagnostic, 'failure must explain the invalid installation/license');
    assert.deepEqual(fs.readFileSync(sbomPath), originalSbom, 'failed validation must preserve the prior SBOM bytes');
    assert.deepEqual(fs.readFileSync(licensesPath), originalLicenses, 'failed validation must preserve the prior license bytes');
  };
  return { root, temporary, write, install, succeed, reject };
}

const invalidPackage = /package|metadata|name|version|mismatch|locate|install/iu;
const invalidPath = /path|outside|escape|travers|symlink|invalid|bound/iu;
const invalidLicense = /licen[cs]e|empty|ENOENT|outside|escape|symlink/iu;

test('nested SBOM package uses its installation license, never the root dev copy', (t) => {
  const f = fixture(t);
  f.install('node_modules/semver', 'semver', '7.8.5', 'ROOT_DEV_785_SENTINEL');
  f.install('node_modules/electron-updater', 'electron-updater', '6.8.9', 'UPDATER_SENTINEL');
  f.install(nestedSemver, 'semver', '7.7.4', 'NESTED_RUNTIME_774_SENTINEL');
  const licenses = f.succeed([
    component('electron-updater', '6.8.9', 'node_modules/electron-updater'),
    component('semver', '7.7.4', nestedSemver)
  ]);
  assert.ok(licenses.includes('semver@7.7.4'));
  assert.ok(licenses.includes('UPDATER_SENTINEL'));
  assert.ok(licenses.includes('NESTED_RUNTIME_774_SENTINEL'));
  assert.ok(!licenses.includes('ROOT_DEV_785_SENTINEL'));
  assert.ok(!licenses.includes('semver@7.8.5'));
});

test('scoped packages and repeated names/versions retain each explicit installation provenance', (t) => {
  const f = fixture(t);
  const installations = [
    ['node_modules/@scope/widget', '1.0.0', 'SCOPED_ROOT_SENTINEL'],
    ['node_modules/parent/node_modules/@scope/widget', '2.0.0', 'SCOPED_NESTED_A_SENTINEL'],
    ['node_modules/other/node_modules/@scope/widget', '2.0.0', 'SCOPED_NESTED_B_SENTINEL']
  ];
  f.install('node_modules/parent', 'parent', '1.0.0');
  f.install('node_modules/other', 'other', '1.0.0');
  for (const [location, version, sentinel] of installations) f.install(location, '@scope/widget', version, sentinel);
  const licenses = f.succeed(installations.map(([location, version]) => component('@scope/widget', version, location)));
  for (const [, version, sentinel] of installations) {
    assert.equal(licenses.split(sentinel).length - 1, 1, `must render exactly the license from ${sentinel}`);
    assert.ok(licenses.includes(`@scope/widget@${version}\n${'='.repeat(78)}\n${sentinel}`),
      `license ${sentinel} must be labelled with its actual name and version`);
  }
  assert.ok(licenses.includes('@scope/widget@1.0.0'));
  assert.ok(licenses.includes('@scope/widget@2.0.0'));
});

test('absent path metadata permits a validated root name/version fallback', (t) => {
  const f = fixture(t);
  f.install('node_modules/semver', 'semver', '7.7.4', 'VALIDATED_ROOT_SENTINEL');
  const c = component('semver', '7.7.4');
  delete c.properties;
  assert.ok(f.succeed([c]).includes('VALIDATED_ROOT_SENTINEL'));
});

test('absent path fallback finds matching nested and scoped versions instead of wrong root versions', (t) => {
  const f = fixture(t);
  f.install('node_modules/parent', 'parent', '1.0.0');
  f.install('node_modules/semver', 'semver', '7.8.5', 'WRONG_ROOT_SEMVER');
  f.install('node_modules/@scope/widget', '@scope/widget', '3.0.0', 'WRONG_ROOT_SCOPED');
  f.install('node_modules/parent/node_modules/semver', 'semver', '7.7.4', 'MATCHED_NESTED_SEMVER');
  f.install('node_modules/parent/node_modules/@scope/widget', '@scope/widget', '2.0.0', 'MATCHED_NESTED_SCOPED');
  const licenses = f.succeed([component('semver', '7.7.4'), component('@scope/widget', '2.0.0')]);
  assert.ok(licenses.includes('MATCHED_NESTED_SEMVER'));
  assert.ok(licenses.includes('MATCHED_NESTED_SCOPED'));
  assert.ok(!licenses.includes('WRONG_ROOT_'));
});

for (const [label, metadata] of [
  ['name mismatch', { name: 'not-semver', version: '7.7.4' }],
  ['version mismatch', { name: 'semver', version: '7.8.5' }],
  ['missing name', { version: '7.7.4' }],
  ['missing version', { name: 'semver' }]
]) {
  test(`explicit path rejects ${label} even with a matching root installation`, (t) => {
    const f = fixture(t);
    f.install('node_modules/semver', 'semver', '7.7.4', 'ROOT_MUST_NOT_BE_FALLBACK');
    f.install(nestedSemver, 'semver', '7.7.4');
    f.write(`${nestedSemver}/package.json`, JSON.stringify(metadata));
    f.reject([component('semver', '7.7.4', nestedSemver)], invalidPackage);
  });
}

for (const [name, version] of [['not-semver', '7.7.4'], ['semver', '7.8.5']]) {
  test(`pathless fallback validates installed identity (${name}@${version})`, (t) => {
    const f = fixture(t);
    f.install('node_modules/semver', name, version);
    f.reject([component('semver', '7.7.4')], invalidPackage);
  });
}

test('missing explicit installation is not replaced by a matching root package', (t) => {
  const f = fixture(t);
  f.install('node_modules/semver', 'semver', '7.7.4');
  f.reject([component('semver', '7.7.4', nestedSemver)], invalidPackage);
});

for (const value of ['', null]) {
  test(`present but invalid path metadata (${JSON.stringify(value)}) must not enable fallback`, (t) => {
    const f = fixture(t);
    f.install('node_modules/semver', 'semver', '7.7.4');
    f.reject([component('semver', '7.7.4', value)], invalidPath);
  });
}

for (const kind of ['missing', 'malformed']) {
  test(`${kind} package metadata at an explicit installation rejects without root fallback`, (t) => {
    const f = fixture(t);
    f.install('node_modules/semver', 'semver', '7.7.4');
    f.install(nestedSemver, 'semver', '7.7.4');
    const metadata = path.join(f.root, nestedSemver, 'package.json');
    if (kind === 'missing') fs.unlinkSync(metadata);
    else fs.writeFileSync(metadata, '{not-json');
    f.reject([component('semver', '7.7.4', nestedSemver)], /package|metadata|JSON|parse|ENOENT|locate/iu);
  });
}

test('missing pathless installation fails explicitly and preserves both outputs', (t) => {
  const f = fixture(t);
  f.reject([component('semver', '7.7.4')], invalidPackage);
});

test('missing nested license cannot fall back to the root license', (t) => {
  const f = fixture(t);
  f.install('node_modules/semver', 'semver', '7.7.4', 'ROOT_NOT_A_LICENSE_FALLBACK');
  f.install(nestedSemver, 'semver', '7.7.4', null);
  f.reject([component('semver', '7.7.4', nestedSemver)], invalidLicense);
});

test('late license lookup failure leaves pre-existing SBOM and licenses byte-for-byte unchanged', (t) => {
  const f = fixture(t);
  f.install('node_modules/good', 'good', '1.0.0', 'GOOD_FIRST_LICENSE');
  f.install('node_modules/bad', 'bad', '1.0.0', null);
  f.reject([
    component('good', '1.0.0', 'node_modules/good'),
    component('bad', '1.0.0', 'node_modules/bad')
  ], invalidLicense);
});

test('empty license content fails validation before replacing outputs', (t) => {
  const f = fixture(t);
  f.install('node_modules/semver', 'semver', '7.7.4', ' \n\t ');
  f.reject([component('semver', '7.7.4', 'node_modules/semver')], invalidLicense);
});

for (const kind of ['traversal', 'absolute outside', 'project non-dependency']) {
  test(`rejects ${kind} package path even when target metadata matches`, (t) => {
    const f = fixture(t);
    f.install('node_modules/semver', 'semver', '7.7.4', 'ROOT_CANNOT_MASK_UNSAFE_PATH');
    const outside = f.install('../outside/semver', 'semver', '7.7.4', 'OUTSIDE_LICENSE');
    f.install('vendor/semver', 'semver', '7.7.4', 'NON_DEPENDENCY_LICENSE');
    const location = kind === 'traversal' ? 'node_modules/../../outside/semver'
      : kind === 'absolute outside' ? outside : 'vendor/semver';
    f.reject([component('semver', '7.7.4', location)], invalidPath);
  });
}

test('pathless fallback rejects traversal in the component name', (t) => {
  const f = fixture(t);
  f.install('vendor/semver', '../vendor/semver', '7.7.4', 'TRAVERSAL_NAME_LICENSE');
  f.reject([component('../vendor/semver', '7.7.4')], /name|path|invalid|travers|package/iu);
});

for (const kind of ['package directory', 'license file', 'package metadata', 'pathless package directory']) {
  test(`rejects ${kind} symlink escaping the fixture dependency tree`, (t) => {
    const f = fixture(t);
    const outside = f.install('../outside/semver', 'semver', '7.7.4', 'ESCAPED_LICENSE');
    const installed = f.install('node_modules/semver', 'semver', '7.7.4', 'LOCAL_LICENSE');
    if (kind.endsWith('directory')) {
      fs.rmSync(installed, { recursive: true });
      fs.symlinkSync(outside, installed, 'dir');
    } else {
      const filename = kind === 'license file' ? 'LICENSE' : 'package.json';
      fs.unlinkSync(path.join(installed, filename));
      fs.symlinkSync(path.join(outside, filename), path.join(installed, filename));
    }
    f.reject([component('semver', '7.7.4', kind.startsWith('pathless') ? undefined : 'node_modules/semver')], invalidPath);
  });
}
