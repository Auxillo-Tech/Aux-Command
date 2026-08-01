'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SystemService } = require('../src/main/services/system-service.cjs');

test('diagnostics exposes protocol capability matrix with bundled and external boundaries', () => {
  const diagnostics = new SystemService().diagnostics();
  assert.ok(Array.isArray(diagnostics.protocols));
  const byProtocol = new Map(diagnostics.protocols.map((entry) => [entry.protocol, entry]));
  assert.equal(byProtocol.get('ssh').mode, 'builtin-node-ssh2-and-openssh');
  assert.equal(byProtocol.get('sftp').mode, 'builtin-node-ssh2');
  assert.equal(byProtocol.get('ftp').mode, 'builtin-basic-ftp-insecure');
  assert.equal(byProtocol.get('ftp').available, true);
  assert.equal(byProtocol.get('ftps').mode, 'builtin-basic-ftp-tls');
  assert.equal(byProtocol.get('ftps').available, true);
  assert.equal(byProtocol.get('telnet').mode, 'bundled-python-bridge');
  assert.equal(byProtocol.get('telnet').available, true);
  assert.equal(byProtocol.get('serial').mode, 'bundled-python-bridge');
  assert.equal(byProtocol.get('serial').available, true);
  assert.equal(byProtocol.get('x11-forwarding').mode, 'openssh-x11-forwarding');
  // RDP is embedded when Xvfb + x11vnc + FreeRDP are present, else external.
  assert.match(byProtocol.get('rdp').mode, /^(embedded-freerdp-x11vnc|external-client)$/u);
  assert.equal(byProtocol.get('vnc').mode, 'embedded-novnc-bridge');
  assert.equal(byProtocol.get('vnc').available, true);
});
