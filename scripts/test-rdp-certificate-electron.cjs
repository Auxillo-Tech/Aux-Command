'use strict';
// Run with the Electron binary (under xvfb-run on a machine without a display):
//   xvfb-run -a node_modules/electron/dist/electron scripts/test-rdp-certificate-electron.cjs
// Electron's TLS library is stricter than Node's own: it refuses a certificate
// whose key-usage field lacks "digital signature" when a modern cipher is
// negotiated. Every Windows machine generates exactly that kind of
// certificate for Remote Desktop, so this check must run inside Electron.
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const assert = require('node:assert/strict');
const { createHash, X509Certificate } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { app } = require('electron');
const { fetchRdpCertificate } = require('../src/main/lib/rdp-certificate.cjs');

function confirm() {
  const negotiation = Buffer.alloc(8);
  negotiation[0] = 0x02; negotiation.writeUInt16LE(8, 2); negotiation.writeUInt32LE(0x02, 4);
  const x224 = Buffer.concat([Buffer.from([14, 0xd0, 0, 0, 0, 0, 0]), negotiation]);
  const tpkt = Buffer.from([3, 0, 0, 0]); tpkt.writeUInt16BE(4 + x224.length, 2);
  return Buffer.concat([tpkt, x224]);
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-rdp-cert-electron-'));
  const key = path.join(directory, 'key.pem');
  const cert = path.join(directory, 'cert.pem');
  const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=WINDOWS-PC',
    '-addext', 'keyUsage=critical,keyEncipherment,dataEncipherment', '-addext', 'extendedKeyUsage=serverAuth', '-keyout', key, '-out', cert], { stdio: 'ignore' });
  assert.equal(generated.status, 0, 'openssl must be available');
  const context = { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
  const expected = createHash('sha256').update(new X509Certificate(context.cert).raw).digest('hex');
  const server = net.createServer((socket) => {
    socket.on('error', () => {});
    socket.once('data', () => { socket.write(confirm()); new tls.TLSSocket(socket, { isServer: true, ...context }).on('error', () => {}); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await fetchRdpCertificate('127.0.0.1', server.address().port);
    assert.equal(result.fingerprintHex, expected);
    assert.equal(result.subject, 'WINDOWS-PC');
    console.log(`RDP_WINDOWS_STYLE_CERTIFICATE_READ_IN_ELECTRON_PASSED (Electron ${process.versions.electron})`);
  } finally {
    server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

app.whenReady().then(main).then(() => app.exit(0), (error) => { console.error(error); app.exit(1); });
