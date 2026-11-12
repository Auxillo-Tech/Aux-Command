'use strict';

// Reads an RDP server's TLS certificate before FreeRDP connects, so the user
// can confirm it on first use (like an SSH host key) and FreeRDP can then be
// pinned to exactly that certificate. The probe performs the X.224 connection
// request from [MS-RDPBCGR] 2.2.1.1 asking for TLS or CredSSP (both start with
// a TLS handshake), completes the handshake without sending any credentials
// and disconnects.
const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tls = require('node:tls');
const { createHash, randomBytes, X509Certificate } = require('node:crypto');

const PROTOCOL_SSL = 0x01;
const PROTOCOL_HYBRID = 0x02;
const PROTOCOL_HYBRID_EX = 0x08;
const TLS_PROTOCOLS = new Set([PROTOCOL_SSL, PROTOCOL_HYBRID, PROTOCOL_HYBRID_EX]);
const NEGOTIATION_FAILURES = {
  1: 'the server requires TLS but refused it',
  2: 'the server does not allow TLS (only legacy RDP security, which cannot be verified)',
  3: 'the server has no TLS certificate configured',
  4: 'the server refused the security negotiation',
  5: 'the server requires network level authentication',
  6: 'the server requires smart-card or RDSTLS sign-in'
};

function connectionRequest() {
  const negotiation = Buffer.alloc(8);
  negotiation[0] = 0x01; // TYPE_RDP_NEG_REQ
  negotiation.writeUInt16LE(8, 2);
  negotiation.writeUInt32LE(PROTOCOL_SSL | PROTOCOL_HYBRID | PROTOCOL_HYBRID_EX, 4);
  // X.224 CR TPDU: length indicator, CR code, DST-REF, SRC-REF, class 0.
  const x224 = Buffer.concat([Buffer.from([6 + negotiation.length, 0xe0, 0, 0, 0, 0, 0]), negotiation]);
  const tpkt = Buffer.from([3, 0, 0, 0]);
  tpkt.writeUInt16BE(tpkt.length + x224.length, 2);
  return Buffer.concat([tpkt, x224]);
}

// Returns the selected security protocol from an X.224 Connection Confirm.
function parseConnectionConfirm(packet) {
  if (packet.length < 11 || packet[0] !== 3) throw new Error('the server did not answer like an RDP server');
  if ((packet[5] & 0xf0) !== 0xd0) throw new Error('the server did not confirm the RDP connection');
  const negotiation = packet.subarray(11);
  // No negotiation response: the server only speaks legacy RDP security.
  if (negotiation.length < 8) throw new Error(NEGOTIATION_FAILURES[2]);
  const value = negotiation.readUInt32LE(4);
  if (negotiation[0] === 0x03) throw new Error(NEGOTIATION_FAILURES[value] || `the server refused the security negotiation (code ${value})`);
  if (negotiation[0] !== 0x02) throw new Error('the server sent an unexpected negotiation reply');
  if (!TLS_PROTOCOLS.has(value)) throw new Error(NEGOTIATION_FAILURES[2]);
  return value;
}

function colonHex(hex) {
  return hex.match(/../gu).join(':');
}

// Opens a connection and completes the RDP security negotiation, leaving the
// socket ready for the TLS handshake. Resolves with { socket, selected }.
function negotiateRdpSocket(host, port, deadline) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = net.createConnection({ host, port });
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      if (error) { socket.destroy(); reject(error); } else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('the server did not respond in time')), Math.max(1, deadline - Date.now()));
    let buffer = Buffer.alloc(0);
    function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt16BE(2);
      if (length < 11 || length > 512) { finish(new Error('the server did not answer like an RDP server')); return; }
      if (buffer.length < length) return;
      let selected;
      try { selected = parseConnectionConfirm(buffer.subarray(0, length)); }
      catch (error) { finish(error); return; }
      finish(null, { socket, selected });
    }
    function onError(error) { finish(error); }
    function onClose() { finish(new Error('the server closed the connection')); }
    socket.on('data', onData);
    socket.once('connect', () => socket.write(connectionRequest()));
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

function certificateDetails(raw, selected) {
  let subject = '';
  let issuer = '';
  let validTo = '';
  try {
    const parsed = new X509Certificate(raw);
    const commonName = (text) => (/(?:^|\n)CN=([^\n]*)/u.exec(String(text || '')) || [])[1] || '';
    subject = commonName(parsed.subject);
    issuer = commonName(parsed.issuer);
    validTo = parsed.validTo || '';
  } catch { /* the fingerprint alone is enough to confirm and pin */ }
  return { fingerprintHex: createHash('sha256').update(raw).digest('hex'), protocol: selected, subject, issuer, validTo };
}

// The usual way: let the TLS library do the handshake and hand over the
// server's certificate.
function certificateFromHandshake(host, port, deadline) {
  return negotiateRdpSocket(host, port, deadline).then(({ socket, selected }) => new Promise((resolve, reject) => {
    let settled = false;
    // The certificate is checked by fingerprint, not by a CA, so chain
    // validation is off here; nothing secret is sent on this connection.
    const secure = tls.connect({ socket, rejectUnauthorized: false, servername: net.isIP(host) ? undefined : host });
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      secure.destroy();
      socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('the server did not respond in time')), Math.max(1, deadline - Date.now()));
    secure.once('secureConnect', () => {
      const certificate = secure.getPeerCertificate(false);
      if (!certificate?.raw?.length) { finish(new Error('the server presented no certificate')); return; }
      finish(null, certificateDetails(certificate.raw, selected));
    });
    secure.once('error', (error) => finish(error));
    socket.once('close', () => finish(new Error('the server closed the connection')));
  }));
}

// A TLS 1.2 ClientHello offering the common RSA and ECDSA suites. No
// supported_versions extension is sent, so the server answers with TLS 1.2 or
// lower, where the certificate travels unencrypted.
function tlsClientHello(host) {
  const u16 = (value) => { const b = Buffer.alloc(2); b.writeUInt16BE(value); return b; };
  const vector16 = (body) => Buffer.concat([u16(body.length), body]);
  const extension = (type, body) => Buffer.concat([u16(type), vector16(body)]);
  const suites = [0xc02f, 0xc030, 0xc02b, 0xc02c, 0xc013, 0xc014, 0xc027, 0xc028, 0x009c, 0x009d, 0x003c, 0x003d, 0x002f, 0x0035];
  const extensions = [];
  if (host && !net.isIP(host)) {
    const name = Buffer.from(host, 'ascii');
    extensions.push(extension(0x0000, vector16(Buffer.concat([Buffer.from([0]), vector16(name)]))));
  }
  extensions.push(extension(0x000a, vector16(Buffer.concat([0x001d, 0x0017, 0x0018].map(u16))))); // supported groups
  extensions.push(extension(0x000b, Buffer.from([1, 0]))); // uncompressed points
  extensions.push(extension(0x000d, vector16(Buffer.concat([0x0804, 0x0805, 0x0806, 0x0401, 0x0501, 0x0601, 0x0403, 0x0503, 0x0201].map(u16))))); // signature algorithms
  extensions.push(extension(0x0017, Buffer.alloc(0))); // extended master secret
  extensions.push(extension(0xff01, Buffer.from([0]))); // renegotiation info
  const body = Buffer.concat([
    Buffer.from([3, 3]), randomBytes(32), Buffer.from([0]),
    vector16(Buffer.concat(suites.map(u16))),
    Buffer.from([1, 0]),
    vector16(Buffer.concat(extensions))
  ]);
  const handshake = Buffer.concat([Buffer.from([1, 0]), u16(body.length), body]);
  return Buffer.concat([Buffer.from([22, 3, 1]), u16(handshake.length), handshake]);
}

// Pulls the server's own certificate out of the TLS records received so far.
// Returns null while more data is needed and throws on anything that is not a
// TLS 1.2 (or lower) server flight.
function certificateFromTlsRecords(received) {
  const MAX_HANDSHAKE_BYTES = 262_144;
  let offset = 0;
  const messages = [];
  while (received.length - offset >= 5) {
    const type = received[offset];
    const length = received.readUInt16BE(offset + 3);
    if (received[offset + 1] !== 3 || length > 18_432) throw new Error('the server did not answer with TLS');
    if (received.length - offset - 5 < length) break;
    const fragment = received.subarray(offset + 5, offset + 5 + length);
    if (type === 21) throw new Error('the server refused the TLS handshake');
    if (type !== 22) throw new Error('the server did not send its certificate');
    messages.push(fragment);
    offset += 5 + length;
  }
  const handshake = Buffer.concat(messages);
  if (handshake.length > MAX_HANDSHAKE_BYTES) throw new Error('the server sent too much handshake data');
  let position = 0;
  while (handshake.length - position >= 4) {
    const messageType = handshake[position];
    const messageLength = handshake.readUIntBE(position + 1, 3);
    if (messageLength > MAX_HANDSHAKE_BYTES) throw new Error('the server sent too much handshake data');
    if (handshake.length - position - 4 < messageLength) return null;
    const body = handshake.subarray(position + 4, position + 4 + messageLength);
    if (messageType === 2 && body.length >= 2 && (body[0] !== 3 || body[1] > 3)) throw new Error('the server did not answer with TLS 1.2');
    if (messageType === 11) {
      if (body.length < 6) throw new Error('the server presented no certificate');
      const first = body.readUIntBE(3, 3);
      if (!first || first > body.length - 6) throw new Error('the server presented no certificate');
      return Buffer.from(body.subarray(6, 6 + first));
    }
    if (messageType === 14) throw new Error('the server presented no certificate');
    position += 4 + messageLength;
  }
  return null;
}

// Reads the certificate straight from the server's TLS 1.2 handshake messages
// without completing the handshake. Electron's TLS library refuses
// certificates whose key-usage field does not fit the negotiated cipher,
// which includes the self-signed certificate every Windows machine generates
// for Remote Desktop. Only the fingerprint is needed here: FreeRDP performs
// the real handshake afterwards and is pinned to that fingerprint, so a
// certificate presented by someone without its key gains nothing.
function certificateFromRecords(host, port, deadline) {
  return negotiateRdpSocket(host, port, deadline).then(({ socket, selected }) => new Promise((resolve, reject) => {
    let settled = false;
    let received = Buffer.alloc(0);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('the server did not respond in time')), Math.max(1, deadline - Date.now()));
    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.length > 400_000) { finish(new Error('the server sent too much handshake data')); return; }
      let raw;
      try { raw = certificateFromTlsRecords(received); }
      catch (error) { finish(error); return; }
      if (raw) finish(null, certificateDetails(raw, selected));
    });
    socket.once('error', (error) => finish(error));
    socket.once('close', () => finish(new Error('the server closed the connection')));
    socket.write(tlsClientHello(host));
  }));
}

async function fetchRdpCertificate(host, port, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 10_000);
  const deadline = Date.now() + timeoutMs;
  const fromHandshake = options.certificateFromHandshake || certificateFromHandshake;
  try {
    try {
      return await fromHandshake(host, port, deadline);
    } catch (error) {
      // A server that is not there, or is not an RDP server, will not behave
      // differently the second time.
      if (/did not respond in time|did not answer like an RDP server|did not confirm|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/u.test(`${error?.code || ''} ${error?.message || ''}`)
        || Object.values(NEGOTIATION_FAILURES).includes(error?.message)) throw error;
      try { return await certificateFromRecords(host, port, Date.now() + timeoutMs); }
      catch { throw error; }
    }
  } catch (error) {
    throw new Error(`Could not read the RDP server certificate: ${error.message}`);
  }
}

// FreeRDP arguments that accept only the confirmed certificate and never fall
// back to legacy RDP security, which has no certificate to check.
function pinnedCertificateArgs(fingerprintHex, freerdpMajor) {
  if (!/^[0-9a-f]{64}$/u.test(fingerprintHex)) throw new Error('Invalid RDP certificate fingerprint');
  return [
    `/cert:deny,fingerprint:sha256:${colonHex(fingerprintHex)}`,
    freerdpMajor >= 3 ? '/sec:rdp:off' : '-sec-rdp'
  ];
}

// FreeRDP 3 changed the security-option syntax. Its /version works without a
// display; FreeRDP 2's X11 client refuses to start without one, so a failed
// probe means FreeRDP 2 unless the binary is named for version 3.
const majorCache = new Map();
function freerdpMajor(executable, env = process.env) {
  if (majorCache.has(executable)) return majorCache.get(executable);
  let major = /3$/u.test(path.basename(executable)) ? 3 : 2;
  try {
    const result = spawnSync(executable, ['/version'], { encoding: 'utf8', timeout: 5000, env, shell: false });
    const match = /FreeRDP version (\d+)\./u.exec(`${result.stdout || ''}${result.stderr || ''}`);
    if (match) major = Number(match[1]);
  } catch { /* keep the name-based guess */ }
  majorCache.set(executable, major);
  return major;
}

// Reads the certificate at probeHost:probePort, asks the user to confirm it
// (stored as trustHost:trustPort, which differs when connecting through an
// SSH gateway) and returns the FreeRDP arguments that pin it.
async function trustedCertificateArgs({ probeHost, probePort, trustHost = probeHost, trustPort = probePort, name = '' }, knownHostService, executable, env) {
  if (!knownHostService) throw new Error('RDP certificate checking is not available');
  const certificate = await fetchRdpCertificate(probeHost, probePort);
  const accepted = await knownHostService.verifyRdpCertificate({ host: trustHost, port: trustPort, name }, certificate);
  if (!accepted) throw new Error('The RDP server certificate was not trusted');
  return pinnedCertificateArgs(certificate.fingerprintHex, freerdpMajor(executable, env));
}

module.exports = { colonHex, freerdpMajor, trustedCertificateArgs, connectionRequest, fetchRdpCertificate, certificateFromRecords, certificateFromTlsRecords, tlsClientHello, parseConnectionConfirm, pinnedCertificateArgs };
