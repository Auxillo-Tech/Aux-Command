'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LiveMonitorService } = require('../src/main/services/live-monitor.cjs');

function fixtureExecutable(directory, body) {
  const filename = path.join(directory, 'fake-ssh');
  fs.writeFileSync(filename, `#!/bin/sh\n${body}\n`, { mode: 0o700 });
  return filename;
}

const profile = {
  id: 'server', name: 'Server', protocol: 'ssh', host: '127.0.0.1', port: 22,
  username: 'test', sshAlias: 'fixture', useSshConfig: true
};

test('LiveMonitorService returns parsed remote sections', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-monitor-'));
  try {
    const executable = fixtureExecutable(directory, "printf '%s\\n' '===UPTIME===' 'up 1 day' '===MEMORY===' 'Mem: 10 3 7' '===DISK===' '/dev/vda 20%' '===LOAD===' '0.1 0.2 0.3' '===PROCESSES===' '123 root test' '===NETWORK===' 'LISTEN 0 128 127.0.0.1:22'");
    const service = new LiveMonitorService({ sshExecutable: executable });
    const result = await service.snapshot(profile);
    assert.equal(result.exitCode, 0);
    assert.equal(result.sections.uptime, 'up 1 day');
    assert.match(result.sections.memory, /Mem:/u);
    assert.match(result.sections.network, /127\.0\.0\.1:22/u);
    assert.equal(service.active.size, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('LiveMonitorService validates profiles and reports non-zero exits', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-monitor-'));
  try {
    const executable = fixtureExecutable(directory, "echo 'permission denied' >&2; exit 7");
    const service = new LiveMonitorService({ sshExecutable: executable });
    await assert.rejects(() => service.snapshot({ protocol: 'ftp', host: 'x' }), /SSH profile/u);
    await assert.rejects(() => service.snapshot(profile), /permission denied/u);
    assert.equal(service.active.size, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
