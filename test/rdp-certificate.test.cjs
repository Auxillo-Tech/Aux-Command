'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const { createHash, X509Certificate } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
  colonHex, connectionRequest, fetchRdpCertificate, parseConnectionConfirm, pinnedCertificateArgs, trustedCertificateArgs
} = require('../src/main/lib/rdp-certificate.cjs');
const { KnownHostService } = require('../src/main/services/known-host-service.cjs');

function confirm(type, value) {
  const negotiation = Buffer.alloc(8);
  negotiation[0] = type;
  negotiation.writeUInt16LE(8, 2);
  negotiation.writeUInt32LE(value, 4);
  const x224 = Buffer.concat([Buffer.from([14, 0xd0, 0, 0, 0, 0, 0]), negotiation]);
  const tpkt = Buffer.from([3, 0, 0, 0]);
  tpkt.writeUInt16BE(4 + x224.length, 2);
  return Buffer.concat([tpkt, x224]);
}

test('builds an X.224 connection request asking for TLS or CredSSP', () => {
  const packet = connectionRequest();
  assert.equal(packet.length, 19);
  assert.equal(packet.readUInt16BE(2), 19);
  assert.equal(packet[5], 0xe0);
  assert.equal(packet[11], 0x01);
  assert.equal(packet.readUInt32LE(15), 0x0b);
});

test('accepts only TLS-based security from the connection confirm', () => {
  assert.equal(parseConnectionConfirm(confirm(0x02, 0x01)), 0x01);
  assert.equal(parseConnectionConfirm(confirm(0x02, 0x02)), 0x02);
  assert.equal(parseConnectionConfirm(confirm(0x02, 0x08)), 0x08);
  assert.throws(() => parseConnectionConfirm(confirm(0x02, 0x00)), /legacy RDP security/u);
  assert.throws(() => parseConnectionConfirm(confirm(0x03, 0x02)), /legacy RDP security/u);
  assert.throws(() => parseConnectionConfirm(confirm(0x03, 0x05)), /network level authentication/u);
  // A confirm without a negotiation response means legacy RDP security only.
  assert.throws(() => parseConnectionConfirm(Buffer.from([3, 0, 0, 11, 6, 0xd0, 0, 0, 0, 0, 0])), /legacy RDP security/u);
  assert.throws(() => parseConnectionConfirm(Buffer.from('SSH-2.0-OpenSSH_9.2\r\n')), /RDP server/u);
});

test('pins the certificate for FreeRDP 2 and 3 and never allows legacy RDP security', () => {
  const hex = 'ab'.repeat(32);
  assert.equal(colonHex('a1b2c3'), 'a1:b2:c3');
  assert.deepEqual(pinnedCertificateArgs(hex, 2), [`/cert:deny,fingerprint:sha256:${'ab:'.repeat(31)}ab`, '-sec-rdp']);
  assert.deepEqual(pinnedCertificateArgs(hex, 3), [`/cert:deny,fingerprint:sha256:${'ab:'.repeat(31)}ab`, '/sec:rdp:off']);
  assert.throws(() => pinnedCertificateArgs('ab,ignore', 3), /Invalid/u);
});

test('reads the server certificate over the RDP TLS upgrade', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-rdp-cert-'));
  const key = path.join(directory, 'key.pem');
  const cert = path.join(directory, 'cert.pem');
  const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=rdp-fixture', '-keyout', key, '-out', cert], { stdio: 'ignore' });
  if (generated.status !== 0) { fs.rmSync(directory, { recursive: true, force: true }); t.skip('openssl is not available'); return; }
  const context = { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
  const expected = createHash('sha256').update(new X509Certificate(context.cert).raw).digest('hex');
  const received = [];
  const server = net.createServer((socket) => {
    socket.once('data', (chunk) => {
      received.push(chunk);
      socket.write(confirm(0x02, 0x01));
      const secure = new tls.TLSSocket(socket, { isServer: true, ...context });
      secure.on('error', () => {});
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await fetchRdpCertificate('127.0.0.1', server.address().port);
    assert.equal(result.fingerprintHex, expected);
    assert.equal(result.subject, 'rdp-fixture');
    assert.equal(received[0].length, 19);
  } finally {
    server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('reports servers that are not RDP or do not answer', async () => {
  const silent = net.createServer(() => {});
  const banner = net.createServer((socket) => socket.end('SSH-2.0-OpenSSH_9.2\r\n'));
  await Promise.all([silent, banner].map((server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))));
  try {
    await assert.rejects(() => fetchRdpCertificate('127.0.0.1', banner.address().port), /RDP server/u);
    await assert.rejects(() => fetchRdpCertificate('127.0.0.1', silent.address().port, { timeoutMs: 1000 }), /did not respond/u);
  } finally {
    silent.close(); banner.close();
  }
});

test('asks once per RDP certificate, remembers it and flags a changed one', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-rdp-trust-'));
  const prompts = [];
  let answer = { accept: true, remember: true };
  const service = new KnownHostService(directory, { request: async (kind, payload) => { prompts.push({ kind, payload }); return answer; } });
  const target = { host: 'desktop.example', port: 3389, name: 'Desktop' };
  try {
    assert.equal(await service.verifyRdpCertificate(target, { fingerprintHex: '11'.repeat(32), subject: 'desktop' }), true);
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].kind, 'host-key');
    assert.equal(prompts[0].payload.kind, 'rdp');
    assert.equal(prompts[0].payload.changed, false);
    assert.equal(prompts[0].payload.subject, 'desktop');
    assert.match(prompts[0].payload.fingerprint, /^SHA-256 11:11:/u);
    assert.equal(await service.verifyRdpCertificate(target, { fingerprintHex: '11'.repeat(32) }), true);
    assert.equal(prompts.length, 1);
    // Kept apart from an SSH host key on the same host and port.
    assert.equal(service.store.get().hosts['desktop.example:3389'], undefined);
    answer = { accept: false };
    assert.equal(await service.verifyRdpCertificate(target, { fingerprintHex: '22'.repeat(32) }), false);
    assert.equal(prompts[1].payload.changed, true);
    assert.match(prompts[1].payload.previousFingerprint, /^SHA-256 11:/u);
    await assert.rejects(
      () => trustedCertificateArgs({ probeHost: '127.0.0.1', probePort: 1 }, null, 'xfreerdp'),
      /not available/u
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
