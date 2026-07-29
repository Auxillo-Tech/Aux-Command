#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function runNpmSbom() {
  const result = spawnSync('npm', ['sbom', '--omit=dev', '--sbom-format=cyclonedx'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`npm sbom failed: ${result.stderr || result.stdout}`);
  const sbom = JSON.parse(result.stdout);
  sbom.metadata.timestamp = '1970-01-01T00:00:00.000Z';
  return sbom;
}

function packageDirectory(component) {
  const name = component.group ? `${component.group}/${component.name}` : component.name;
  const direct = path.join(root, 'node_modules', ...name.split('/'));
  if (fs.existsSync(path.join(direct, 'package.json'))) return direct;
  throw new Error(`Cannot locate runtime package for license collection: ${name}@${component.version}`);
}

function findLicenseFile(directory) {
  const candidates = fs.readdirSync(directory)
    .filter((name) => /^(?:licen[cs]e|copying|notice)(?:\..*)?$/iu.test(name))
    .sort((a, b) => a.localeCompare(b));
  if (candidates.length === 0) throw new Error(`No license file found in ${directory}`);
  return path.join(directory, candidates[0]);
}

function renderLicenses(components) {
  const sections = components
    .map((component) => {
      const directory = packageDirectory(component);
      const licenseFile = findLicenseFile(directory);
      const name = component.group ? `${component.group}/${component.name}` : component.name;
      const text = fs.readFileSync(licenseFile, 'utf8').trim();
      return { name, version: component.version, text };
    })
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

  const header = [
    `Third-party licenses bundled with ${packageJson.build?.productName || packageJson.name} ${packageJson.version}`,
    '',
    'Generated from the production dependency graph. Aux Command itself is free',
    'and open-source software under AGPL-3.0-or-later; see LICENSE.',
    ''
  ].join('\n');
  return `${header}${sections.map((item) => [
    '='.repeat(78),
    `${item.name}@${item.version}`,
    '='.repeat(78),
    item.text,
    ''
  ].join('\n')).join('\n')}`;
}

function main() {
  fs.mkdirSync(dist, { recursive: true });
  const sbom = runNpmSbom();
  const components = sbom.components || [];
  if (components.length === 0) throw new Error('Production SBOM contains no components');
  const sbomPath = path.join(dist, `${packageJson.name}-${packageJson.version}-sbom.cdx.json`);
  const licensesPath = path.join(root, 'THIRD_PARTY_LICENSES.txt');
  fs.writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`, { mode: 0o644 });
  fs.writeFileSync(licensesPath, renderLicenses(components), { mode: 0o644 });
  process.stdout.write(`${JSON.stringify({ sbom: sbomPath, licenses: licensesPath, componentCount: components.length }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
