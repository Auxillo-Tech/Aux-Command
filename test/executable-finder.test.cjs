'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findExecutable, isExecutable } = require('../src/main/lib/executable-finder.cjs');

test('finds an executable in PATH without invoking a shell', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-path-'));
  try {
    const executable = path.join(directory, 'aux-test-tool');
    fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    assert.equal(isExecutable(executable), true);
    assert.equal(findExecutable(['missing', 'aux-test-tool'], directory), executable);
    assert.equal(findExecutable(['missing'], directory), '');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('findExecutable ignores relative PATH entries', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { findExecutable } = require('../src/main/lib/executable-finder.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-path-'));
  const previous = process.cwd();
  try {
    fs.writeFileSync(path.join(directory, 'aux-planted-tool'), '#!/bin/sh\n', { mode: 0o755 });
    process.chdir(directory);
    assert.equal(findExecutable(['aux-planted-tool'], `.${path.delimiter}bin`), '');
    assert.equal(findExecutable(['aux-planted-tool'], directory), path.join(directory, 'aux-planted-tool'));
  } finally {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
