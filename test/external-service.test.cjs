'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ExternalService } = require('../src/main/services/external-service.cjs');

test('waits for a native desktop client to spawn before reporting success', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-external-'));
  const executable = path.join(directory, 'xfreerdp3');
  const previousPath = process.env.PATH;
  try {
    fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    process.env.PATH = directory;
    const result = await new ExternalService({ useGuard: false }).launch({
      name: 'Desktop', protocol: 'rdp', host: 'desktop.example', port: 3389
    });
    assert.equal(result.executable, executable);
    assert.ok(Number.isInteger(result.pid));
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('reports a missing native desktop client', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-external-'));
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = directory;
    await assert.rejects(
      () => new ExternalService().launch({ name: 'Desktop', protocol: 'vnc', host: 'desktop.example', port: 5900 }),
      /No supported client found/u
    );
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('tracks and terminates guarded native clients', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-external-'));
  const executable = path.join(directory, 'xfreerdp3');
  const previousPath = process.env.PATH;
  const service = new ExternalService();
  try {
    fs.writeFileSync(executable, '#!/bin/sh\ntrap "" TERM\nsleep 30\n', { mode: 0o700 });
    process.env.PATH = `${directory}${path.delimiter}${previousPath}`;
    await service.launch({ name: 'Desktop', protocol: 'rdp', host: 'desktop.example', port: 3389 });
    assert.equal(service.children.size, 1);
    service.stopAll();
    const deadline = Date.now() + 4000;
    while (service.children.size && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(service.children.size, 0);
  } finally {
    service.stopAll();
    process.env.PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
