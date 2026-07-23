'use strict';

const fs = require('node:fs');
const path = require('node:path');

function isExecutable(filename) {
  try {
    const stat = fs.statSync(filename);
    if (!stat.isFile()) return false;
    fs.accessSync(filename, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findExecutable(candidates, pathValue = process.env.PATH || '') {
  if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate) continue;
    if (candidate.includes(path.sep)) {
      const absolute = path.resolve(candidate);
      if (isExecutable(absolute)) return absolute;
      continue;
    }
    for (const directory of directories) {
      const filename = path.join(directory, candidate);
      if (isExecutable(filename)) return filename;
    }
  }
  return '';
}

module.exports = { findExecutable, isExecutable };
