'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RdpEmbedService, validateRdpTarget } = require('../src/main/services/rdp-embed.cjs');

test('validateRdpTarget accepts valid targets and rejects malformed ones', () => {
  assert.deepEqual(validateRdpTarget({ protocol: 'rdp', host: 'desktop.example', port: 3389 }), {
    host: 'desktop.example',
    port: 3389
  });
  assert.deepEqual(validateRdpTarget({ protocol: 'rdp', host: '10.0.0.5' }), { host: '10.0.0.5', port: 3389 });
  assert.throws(() => validateRdpTarget({ protocol: 'vnc', host: 'x' }), /requires an RDP profile/u);
  assert.throws(() => validateRdpTarget({ protocol: 'rdp', host: '' }), /host is invalid/u);
  assert.throws(() => validateRdpTarget({ protocol: 'rdp', host: 'a b' }), /host is invalid/u);
  assert.throws(() => validateRdpTarget({ protocol: 'rdp', host: 'h', port: 70000 }), /port is invalid/u);
});

test('capabilities reports each pipeline tool and overall availability', () => {
  const service = new RdpEmbedService({ vncBridge: {} });
  const caps = service.capabilities();
  assert.deepEqual(Object.keys(caps.tools).sort(), ['x11vnc', 'xfreerdp', 'xvfb']);
  assert.equal(typeof caps.available, 'boolean');
  assert.equal(caps.available, Object.values(caps.tools).every(Boolean));
});

test('start fails clearly and cleans up when required tools are missing', async () => {
  const service = new RdpEmbedService({ vncBridge: { start: async () => ({ id: 'x', url: 'ws://127.0.0.1:1/vnc' }) } });
  const originalPath = process.env.PATH;
  process.env.PATH = '';
  try {
    await assert.rejects(
      () => service.start({ protocol: 'rdp', host: 'desktop.example', port: 3389 }),
      /Embedded RDP needs .* installed/u
    );
    // A failed start must not leave the session tracked.
    assert.equal(service.list().length, 0);
  } finally {
    process.env.PATH = originalPath;
  }
});

test('start requires the VNC bridge dependency', async () => {
  const service = new RdpEmbedService({});
  await assert.rejects(
    () => service.start({ protocol: 'rdp', host: 'desktop.example', port: 3389 }),
    /requires the VNC bridge/u
  );
});

test('stop and stopAll are safe on unknown or empty sessions', () => {
  const service = new RdpEmbedService({ vncBridge: {} });
  assert.equal(service.stop('nope'), false);
  assert.doesNotThrow(() => service.stopAll());
  assert.deepEqual(service.list(), []);
});
