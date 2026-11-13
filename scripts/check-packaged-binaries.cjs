'use strict';

// electron-builder afterPack hook for the arm64 build (see
// scripts/electron-builder-arm64.cjs). Before any package is made from the
// unpacked application it checks that every program and library in it was
// built for the target processor, and that it contains no native Node module:
// the arm64 packages are made without them, whatever compiler the build
// machine has.
const fs = require('node:fs');
const path = require('node:path');

// ELF e_machine values.
const MACHINE = { x64: 62, arm64: 183 };

// 'x64', 'arm64', 'other', or '' when the file is not an ELF binary.
function elfArch(filename) {
  const header = Buffer.alloc(20);
  const handle = fs.openSync(filename, 'r');
  try { if (fs.readSync(handle, header, 0, 20, 0) < 20) return ''; }
  finally { fs.closeSync(handle); }
  if (header.readUInt32BE(0) !== 0x7f454c46) return '';
  const machine = header[5] === 2 ? header.readUInt16BE(18) : header.readUInt16LE(18);
  return Object.keys(MACHINE).find((arch) => MACHINE[arch] === machine) || 'other';
}

function regularFiles(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...regularFiles(target));
    else if (entry.isFile()) found.push(target);
  }
  return found.sort();
}

// Throws unless `executable` is an ELF program for `arch`, every other ELF
// file under `appOutDir` is for `arch` too, and there is no .node file.
// Returns the number of binaries checked.
function checkPackagedBinaries(appOutDir, arch, executable) {
  if (!Object.hasOwn(MACHINE, arch)) throw new Error(`Unsupported target architecture: ${arch}`);
  const name = (filename) => path.relative(appOutDir, filename);
  if (elfArch(executable) !== arch) throw new Error(`${name(executable)} is not an ${arch} program`);
  const files = regularFiles(appOutDir);
  const modules = files.filter((filename) => filename.endsWith('.node'));
  if (modules.length) throw new Error(`Native Node modules must not be packaged for ${arch}: ${modules.map(name).join(', ')}`);
  const binaries = files.map((filename) => [filename, elfArch(filename)]).filter(([, found]) => found);
  const wrong = binaries.filter(([, found]) => found !== arch);
  if (wrong.length) throw new Error(`Not built for ${arch}: ${wrong.map(([filename, found]) => `${name(filename)} (${found})`).join(', ')}`);
  return binaries.length;
}

async function afterPack(context) {
  const arch = require('electron-builder').Arch[context.arch];
  const count = checkPackagedBinaries(context.appOutDir, arch, path.join(context.appOutDir, context.packager.executableName));
  process.stdout.write(`  • checked packaged binaries  arch=${arch} count=${count} nativeNodeModules=0\n`);
}

module.exports = afterPack;
module.exports.default = afterPack;
module.exports.checkPackagedBinaries = checkPackagedBinaries;
module.exports.elfArch = elfArch;
