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

// A fake RDP server whose certificate has the key-usage field Windows gives
// its self-signed Remote Desktop certificates (key and data encipherment, no
// digital signature). Electron's TLS library refuses such a certificate with
// modern ciphers, so the handshake path cannot read it.
function windowsStyleServer(t, tlsOptions = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-rdp-cert-'));
  const key = path.join(directory, 'key.pem');
  const cert = path.join(directory, 'cert.pem');
  const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=WINDOWS-PC',
    '-addext', 'keyUsage=critical,keyEncipherment,dataEncipherment', '-addext', 'extendedKeyUsage=serverAuth', '-keyout', key, '-out', cert], { stdio: 'ignore' });
  if (generated.status !== 0) { fs.rmSync(directory, { recursive: true, force: true }); return null; }
  const context = { key: fs.readFileSync(key), cert: fs.readFileSync(cert), ...tlsOptions };
  const server = net.createServer((socket) => {
    socket.on('error', () => {});
    socket.once('data', () => {
      socket.write(confirm(0x02, 0x02));
      const secure = new tls.TLSSocket(socket, { isServer: true, ...context });
      secure.on('error', () => {});
    });
  });
  t.after(() => { server.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const expected = createHash('sha256').update(new X509Certificate(context.cert).raw).digest('hex');
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, expected })));
}

test('reads a Windows-style certificate straight from the TLS records', async (t) => {
  const { certificateFromRecords } = require('../src/main/lib/rdp-certificate.cjs');
  for (const options of [{}, { maxVersion: 'TLSv1.2' }]) {
    const fixture = await windowsStyleServer(t, options);
    if (!fixture) { t.skip('openssl is not available'); return; }
    const result = await certificateFromRecords('127.0.0.1', fixture.port, Date.now() + 5000);
    assert.equal(result.fingerprintHex, fixture.expected, 'the fingerprint is that of the certificate the server sent');
    assert.equal(result.subject, 'WINDOWS-PC');
    assert.equal(result.protocol, 0x02);
    assert.ok(result.validTo);
  }
});

test('falls back to the TLS records when the handshake refuses the certificate', async (t) => {
  const fixture = await windowsStyleServer(t);
  if (!fixture) { t.skip('openssl is not available'); return; }
  // What Electron reports for a Windows Remote Desktop certificate.
  const refused = async () => { throw new Error('error:1000012e:SSL routines:OPENSSL_internal:KEY_USAGE_BIT_INCORRECT'); };
  const result = await fetchRdpCertificate('127.0.0.1', fixture.port, { certificateFromHandshake: refused });
  assert.equal(result.fingerprintHex, fixture.expected);
  // A server that is simply not there is reported as such, without a second attempt.
  let attempts = 0;
  const unreachable = async () => { attempts += 1; throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1'), { code: 'ECONNREFUSED' }); };
  await assert.rejects(() => fetchRdpCertificate('127.0.0.1', fixture.port, { certificateFromHandshake: unreachable }), /Could not read the RDP server certificate: connect ECONNREFUSED/u);
  assert.equal(attempts, 1);
});

test('the TLS record reader waits for more data and rejects anything that is not a TLS 1.2 server flight', () => {
  const { certificateFromTlsRecords, tlsClientHello } = require('../src/main/lib/rdp-certificate.cjs');
  const record = (type, body) => { const head = Buffer.from([type, 3, 3, 0, 0]); head.writeUInt16BE(body.length, 3); return Buffer.concat([head, body]); };
  const message = (type, body) => { const head = Buffer.alloc(4); head[0] = type; head.writeUIntBE(body.length, 1, 3); return Buffer.concat([head, body]); };
  const der = Buffer.from('30820100aabbccdd', 'hex');
  const length3 = (value) => { const b = Buffer.alloc(3); b.writeUIntBE(value, 0, 3); return b; };
  const certificate = message(11, Buffer.concat([length3(der.length + 3 + 5), length3(der.length), der, length3(2), Buffer.from([1, 2])]));
  const serverHello = message(2, Buffer.concat([Buffer.from([3, 3]), Buffer.alloc(40)]));
  const flight = Buffer.concat([serverHello, certificate]);
  assert.deepEqual(certificateFromTlsRecords(record(22, flight)), der, 'the first certificate in the list is the server\'s own');
  // Split across records and across reads.
  const split = Buffer.concat([record(22, flight.subarray(0, 50)), record(22, flight.subarray(50))]);
  assert.deepEqual(certificateFromTlsRecords(split), der);
  assert.equal(certificateFromTlsRecords(split.subarray(0, 30)), null);
  assert.equal(certificateFromTlsRecords(record(22, serverHello)), null);
  assert.throws(() => certificateFromTlsRecords(record(21, Buffer.from([2, 40]))), /refused the TLS handshake/u);
  assert.throws(() => certificateFromTlsRecords(Buffer.from('SSH-2.0-OpenSSH\r\n')), /did not answer with TLS/u);
  assert.throws(() => certificateFromTlsRecords(record(22, message(2, Buffer.concat([Buffer.from([3, 4]), Buffer.alloc(40)])))), /TLS 1\.2/u);
  assert.throws(() => certificateFromTlsRecords(record(22, Buffer.concat([serverHello, message(14, Buffer.alloc(0))]))), /no certificate/u);
  assert.throws(() => certificateFromTlsRecords(record(22, Buffer.concat([serverHello, message(11, length3(0))]))), /no certificate/u);
  // The hello is a well-formed TLS 1.2 record with no supported_versions extension.
  const hello = tlsClientHello('pc.example');
  assert.equal(hello[0], 22);
  assert.equal(hello.readUInt16BE(3), hello.length - 5);
  assert.equal(hello.includes(Buffer.from([0x00, 0x2b])) && hello.indexOf(Buffer.from('pc.example')) < 0, false);
  assert.ok(hello.indexOf(Buffer.from('pc.example')) > 0, 'a host name is sent as the server name');
  assert.equal(tlsClientHello('192.168.1.10').indexOf(Buffer.from('192.168.1.10')), -1, 'an IP address is not sent as a server name');
});
