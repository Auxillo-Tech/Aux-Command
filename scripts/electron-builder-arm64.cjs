'use strict';

// electron-builder configuration for the arm64 packages: the "build" settings
// from package.json with two additions.
//
// ssh2 has optional native helpers (its cipher binding and cpu-features).
// Whether they exist in node_modules, and for which processor and runtime,
// depends on the compiler the build machine happened to have during
// `npm ci`. The arm64 packages are therefore always made without them: no
// native module is compiled or copied, and ssh2 uses its built-in fallback
// (Node's own OpenSSL ciphers). The result is the same on an arm64 machine
// and when cross-building on x86_64, and needs no compiler.
//
// scripts/check-packaged-binaries.cjs then stops the build unless everything
// in the unpacked application is an arm64 binary and no native module is in it.
const base = require('../package.json').build;

module.exports = {
  ...base,
  npmRebuild: false,
  files: [...base.files, '!**/*.node'],
  afterPack: './scripts/check-packaged-binaries.cjs'
};
