'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RemoteDesktopGateway } = require('../src/main/services/rdp-gateway.cjs');

function script(directory, name, body) {
  const filename = path.join(directory, name);
  fs.writeFileSync(filename, `#!/bin/sh\n${body}\n`, { mode: 0o700 });
  return filename;
}

const gatewayProfile = {
  id: 'jump', name: 'Jump', protocol: 'ssh', host: '127.0.0.1', port: 22,
  username: 'test', sshAlias: 'jump', useSshConfig: true
};

test('RemoteDesktopGateway starts a verified SSH forward, launches a client, and cleans up', { timeout: 5000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-gateway-'));
  try {
    const ssh = script(directory, 'fake-ssh', "echo 'debug1: Local forwarding listening on 127.0.0.1 port 45678.' >&2; trap 'exit 0' TERM INT; while :; do sleep 1; done");
    const client = script(directory, 'fake-client', 'sleep 0.25');
    const service = new RemoteDesktopGateway({ sshExecutable: ssh, clientExecutable: client, useGuard: false });
    const result = await service.connect({
      gatewayProfile,
      targetHost: '10.0.0.10',
      targetPort: 3389,
      protocol: 'rdp',
      localPort: 45678,
      username: 'operator'
    });
    assert.equal(result.status, 'connected');
    assert.equal(result.localPort, 45678);
    assert.equal(service.list().length, 1);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(service.list().length, 0, 'client exit should close the SSH forward');
    service.disconnectAll();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('RemoteDesktopGateway validates inputs and rejects missing native clients', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-gateway-'));
  try {
    const ssh = script(directory, 'fake-ssh', "echo 'Local forwarding listening on 127.0.0.1 port 45679.' >&2; trap 'exit 0' TERM INT; while :; do sleep 1; done");
    const service = new RemoteDesktopGateway({ sshExecutable: ssh, clientExecutable: path.join(directory, 'missing'), useGuard: false });
    await assert.rejects(() => service.connect({ gatewayProfile, targetHost: '-oProxyCommand=x', protocol: 'rdp' }), /target host/u);
    await assert.rejects(() => service.connect({ gatewayProfile, targetHost: '10.0.0.10', targetPort: 70000, protocol: 'rdp' }), /target port/u);
    await assert.rejects(() => service.connect({ gatewayProfile: { protocol: 'ftp', host: 'x' }, targetHost: '10.0.0.10', protocol: 'rdp' }), /SSH gateway/u);
    await assert.rejects(
      () => service.connect({ gatewayProfile, targetHost: '10.0.0.10', targetPort: 3389, protocol: 'rdp', localPort: 45679 }),
      /native client/u
    );
    assert.equal(service.list().length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
