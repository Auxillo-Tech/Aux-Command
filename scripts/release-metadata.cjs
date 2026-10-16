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

const packagePathProperty = 'cdx:npm:package:path';
const packageSegment = /^[a-z0-9_~][a-z0-9._~-]*$/iu;

function componentName(component) {
  const name = component.group ? `${component.group}/${component.name}` : component.name;
  const parts = typeof name === 'string' ? name.split('/') : [];
  const valid = parts.length === 1 ? packageSegment.test(parts[0])
    : parts.length === 2 && parts[0].startsWith('@') &&
      packageSegment.test(parts[0].slice(1)) && packageSegment.test(parts[1]);
  if (!valid || typeof component.version !== 'string' || !component.version.trim()) {
    throw new Error('Invalid SBOM package name or version');
  }
  return name;
}

// Validate both the lexical installation path and every real path used for I/O.
// In particular, package.json and LICENSE may themselves be escaping symlinks.
function dependencyPath(target) {
  const boundary = path.join(fs.realpathSync(root), 'node_modules');
  const relative = path.relative(boundary, fs.realpathSync(target));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Dependency path escapes node_modules: ${target}`);
  }
  return target;
}

function explicitDirectory(location, name) {
  if (typeof location !== 'string' || location.includes('\\')) {
    throw new Error('Invalid npm package path');
  }
  const parts = location.split('/');
  let lastName;
  for (let i = 0; i < parts.length;) {
    if (parts[i++] !== 'node_modules') throw new Error(`Invalid npm package path: ${location}`);
    let segment = parts[i++];
    if (segment?.startsWith('@')) {
      if (!packageSegment.test(segment.slice(1)) || !packageSegment.test(parts[i] || '')) {
        throw new Error(`Invalid scoped package path: ${location}`);
      }
      segment += `/${parts[i++]}`;
    } else if (!packageSegment.test(segment || '')) {
      throw new Error(`Invalid npm package path: ${location}`);
    }
    lastName = segment;
    dependencyPath(path.join(root, ...parts.slice(0, i)));
  }
  if (lastName !== name) throw new Error(`Package name mismatch in path: ${location}`);
  return dependencyPath(path.join(root, location));
}

function installedIdentity(directory) {
  return JSON.parse(fs.readFileSync(dependencyPath(path.join(directory, 'package.json')), 'utf8'));
}

function* installedDirectories(modules, visited = new Set()) {
  // Only an absent node_modules is optional; broken links and other errors fail.
  try { fs.lstatSync(modules); } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  dependencyPath(modules);
  const real = fs.realpathSync(modules);
  if (visited.has(real)) return;
  visited.add(real);
  for (const entry of fs.readdirSync(modules).sort()) {
    if (entry.startsWith('.')) continue;
    const target = dependencyPath(path.join(modules, entry));
    if (!fs.statSync(target).isDirectory()) continue;
    const packages = entry.startsWith('@')
      ? fs.readdirSync(target).sort().map((child) => path.join(target, child)) : [target];
    for (const directory of packages) {
      dependencyPath(directory);
      if (!fs.statSync(directory).isDirectory()) continue;
      yield directory;
      yield* installedDirectories(path.join(directory, 'node_modules'), visited);
    }
  }
}

function packageDirectory(component) {
  const name = componentName(component);
  const properties = component.properties ?? [];
  if (!Array.isArray(properties)) throw new Error('Invalid npm package path properties');
  const locations = properties.filter((property) => property?.name === packagePathProperty);
  if (locations.length) {
    if (locations.length !== 1) throw new Error('Ambiguous npm package path metadata');
    const directory = explicitDirectory(locations[0].value, name);
    const installed = installedIdentity(directory);
    if (installed.name !== name || installed.version !== component.version) {
      throw new Error(`Installed package metadata mismatch: ${name}@${component.version} at ${directory}`);
    }
    return directory;
  }
  // Older SBOMs lack installation paths. Search only the dependency tree and
  // accept an exact installed name/version, never an unchecked root dev copy.
  for (const directory of installedDirectories(path.join(root, 'node_modules'))) {
    const suffix = name.split('/').join(path.sep);
    if (!directory.endsWith(`${path.sep}node_modules${path.sep}${suffix}`)) continue;
    const installed = installedIdentity(directory);
    if (installed.name === name && installed.version === component.version) return directory;
  }
  throw new Error(`Cannot locate runtime package for license collection: ${name}@${component.version}`);
}

function findLicenseFile(directory) {
  const candidates = fs.readdirSync(directory)
    .filter((name) => /^(?:licen[cs]e|copying|notice)(?:\..*)?$/iu.test(name))
    .sort((a, b) => a.localeCompare(b));
  if (candidates.length === 0) throw new Error(`No license file found in ${directory}`);
  return dependencyPath(path.join(directory, candidates[0]));
}

function renderLicenses(components) {
  const sections = components
    .map((component) => {
      const directory = packageDirectory(component);
      const licenseFile = findLicenseFile(directory);
      const name = component.group ? `${component.group}/${component.name}` : component.name;
      const text = fs.readFileSync(licenseFile, 'utf8').trim();
      if (!text) throw new Error(`Empty license file: ${licenseFile}`);
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
  ].join('\n')).join('\n')}\n${fs.readFileSync(path.join(root, 'src/renderer/assets/fonts/LICENSE.txt'), 'utf8')}`;
}

function main() {
  fs.mkdirSync(dist, { recursive: true });
  const sbom = runNpmSbom();
  const components = sbom.components || [];
  if (components.length === 0) throw new Error('Production SBOM contains no components');
  const sbomPath = path.join(dist, `${packageJson.name}-${packageJson.version}-sbom.cdx.json`);
  const licensesPath = path.join(root, 'THIRD_PARTY_LICENSES.txt');
  const licenses = renderLicenses(components);
  const sbomText = `${JSON.stringify(sbom, null, 2)}\n`;
  fs.writeFileSync(sbomPath, sbomText, { mode: 0o644 });
  fs.writeFileSync(licensesPath, licenses, { mode: 0o644 });
  process.stdout.write(`${JSON.stringify({ sbom: sbomPath, licenses: licensesPath, componentCount: components.length }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
