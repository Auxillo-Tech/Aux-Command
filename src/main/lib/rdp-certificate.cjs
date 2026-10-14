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
const { createHash } = require('node:crypto');

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

function fetchRdpCertificate(host, port, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 10_000);
  return new Promise((resolve, reject) => {
    let settled = false;
    let secure = null;
    const socket = net.createConnection({ host, port });
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      secure?.destroy();
      socket.destroy();
      if (error) reject(new Error(`Could not read the RDP server certificate: ${error.message}`));
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('the server did not respond in time')), timeoutMs);
    let buffer = Buffer.alloc(0);
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt16BE(2);
      if (length < 11 || length > 512) { finish(new Error('the server did not answer like an RDP server')); return; }
      if (buffer.length < length) return;
      socket.off('data', onData);
      let selected;
      try { selected = parseConnectionConfirm(buffer.subarray(0, length)); }
      catch (error) { finish(error); return; }
      // The certificate is checked by fingerprint, not by a CA, so chain
      // validation is off here; nothing secret is sent on this connection.
      secure = tls.connect({ socket, rejectUnauthorized: false, servername: net.isIP(host) ? undefined : host });
      secure.once('secureConnect', () => {
        const certificate = secure.getPeerCertificate(false);
        if (!certificate?.raw?.length) { finish(new Error('the server presented no certificate')); return; }
        const fingerprintHex = createHash('sha256').update(certificate.raw).digest('hex');
        finish(null, {
          fingerprintHex,
          protocol: selected,
          subject: certificate.subject?.CN || '',
          issuer: certificate.issuer?.CN || '',
          validTo: certificate.valid_to || ''
        });
      });
      secure.once('error', (error) => finish(error));
    };
    socket.on('data', onData);
    socket.once('connect', () => socket.write(connectionRequest()));
    socket.once('error', (error) => finish(error));
    socket.once('close', () => finish(new Error('the server closed the connection')));
  });
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

module.exports = { colonHex, freerdpMajor, trustedCertificateArgs, connectionRequest, fetchRdpCertificate, parseConnectionConfirm, pinnedCertificateArgs };
