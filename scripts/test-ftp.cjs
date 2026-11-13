'use strict';
// AUX_FTP_TEST_PYTHON must provide pyftpdlib and pyOpenSSL.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { FtpService, isTlsProtocolMismatch } = require('../src/main/services/ftp-service.cjs');
async function main() {
  if (!process.env.AUX_FTP_TEST_ROOT) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ftp-integration-'));
    try {
      const cert = path.join(directory, 'cert.pem'), key = path.join(directory, 'key.pem');
      const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert], { stdio: 'ignore' });
      assert.equal(generated.status, 0, 'test certificate generation');
      const child = spawnSync(process.execPath, [__filename], { env: { ...process.env, AUX_FTP_TEST_ROOT: directory, NODE_EXTRA_CA_CERTS: cert }, stdio: 'inherit', timeout: 60000 });
      assert.equal(child.status, 0, 'FTP integration worker');
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    return;
  }
  const directory = process.env.AUX_FTP_TEST_ROOT;
  // 'ftps-explicit' is an FTPS profile whose server expects AUTH TLS (the
  // form most hosting providers use) instead of TLS from the first byte.
  for (const mode of ['ftp', 'ftps', 'ftps-explicit']) {
    const protocol = mode === 'ftp' ? 'ftp' : 'ftps';
    const root = path.join(directory, mode); fs.mkdirSync(root);
    const server = spawn(process.env.AUX_FTP_TEST_PYTHON || 'python3', [path.join(__dirname, 'ftp-test-server.py'), root, path.join(directory, 'cert.pem'), path.join(directory, 'key.pem'), mode]);
    let errors = ''; server.stderr.on('data', (chunk) => { errors = (errors + chunk).slice(-4000); });
    const service = new FtpService({ has: () => true, get: async () => 'test-only-password' }, () => null);
    try {
      const port = await new Promise((resolve, reject) => {
        let output = '';
        server.stdout.on('data', (chunk) => { output += chunk; if (output.includes('\n')) resolve(JSON.parse(output.split('\n')[0]).port); });
        server.once('error', reject); server.once('exit', () => reject(new Error(errors)));
      });
      const profile = { id: mode, name: mode, protocol, host: '127.0.0.1', port, username: 'fixture', credentialId: 'test' };
      const original = Buffer.from('round-trip content\n');
      const local = path.join(directory, `${mode}-upload`); fs.writeFileSync(local, original);
      await service.mkdir(profile, '/remote');
      await service.upload(profile, local, '/remote/file');
      assert.equal((await service.list(profile, '/remote')).some((entry) => entry.name === 'file'), true);
      assert.equal(await service.readText(profile, '/remote/file'), original.toString());
      await service.writeText(profile, '/remote/file', 'edited');
      const downloaded = path.join(directory, `${mode}-download`);
      await service.download(profile, '/remote/file', downloaded);
      assert.equal(fs.readFileSync(downloaded, 'utf8'), 'edited');
      assert.equal(fs.statSync(downloaded).mode & 0o777, 0o600);
      await service.rename(profile, '/remote/file', '/remote/renamed');
      service.disconnect(profile.id);
      assert.equal(await service.readText(profile, '/remote/renamed'), 'edited');
      const controller = new AbortController(); controller.abort();
      await assert.rejects(() => service.download(profile, '/remote/renamed', downloaded, { signal: controller.signal }), { name: 'AbortError' });
      if (protocol === 'ftps') {
        await assert.rejects(() => service.list({ ...profile, id: 'untrusted', host: 'localhost' }, '/'), /certificate|altname|Hostname|IP does not match/i);
      }
      await service.remove(profile, '/remote/renamed'); await service.remove(profile, '/remote', true);
      if (mode === 'ftps-explicit') {
        // The login was refused in plain text and accepted only after AUTH TLS.
        assert.equal(service.connections.get(profile.id).client.ftp.hasTLS, true, 'explicit FTPS must be encrypted');
      }
      console.log(`${mode.toUpperCase().replace('-', '_')}_ROUNDTRIP_RECONNECT_CANCELLATION_PASSED`);
    } finally {
      service.disconnectAll(); server.kill('SIGTERM');
      if (server.exitCode === null) await once(server, 'exit');
    }
  }
  // The same servers with the profile's FTPS mode forced: the matching form
  // connects on a port that is neither 21 nor 990, and the wrong form fails
  // at once without trying the other one.
  for (const [serverMode, ftpsMode, works] of [
    ['ftps-explicit', 'explicit', true],
    ['ftps-explicit', 'implicit', false],
    ['ftps', 'implicit', true]
  ]) {
    const label = `forced-${ftpsMode}-on-${serverMode}`;
    const root = path.join(directory, label); fs.mkdirSync(root);
    const server = spawn(process.env.AUX_FTP_TEST_PYTHON || 'python3', [path.join(__dirname, 'ftp-test-server.py'), root, path.join(directory, 'cert.pem'), path.join(directory, 'key.pem'), serverMode]);
    let errors = ''; server.stderr.on('data', (chunk) => { errors = (errors + chunk).slice(-4000); });
    const service = new FtpService({ has: () => true, get: async () => 'test-only-password' }, () => null);
    try {
      const port = await new Promise((resolve, reject) => {
        let output = '';
        server.stdout.on('data', (chunk) => { output += chunk; if (output.includes('\n')) resolve(JSON.parse(output.split('\n')[0]).port); });
        server.once('error', reject); server.once('exit', () => reject(new Error(errors)));
      });
      const profile = { id: label, name: label, protocol: 'ftps', host: '127.0.0.1', port, username: 'fixture', credentialId: 'test', ftpsMode };
      if (works) {
        fs.writeFileSync(path.join(root, 'present'), 'forced mode\n');
        assert.equal((await service.list(profile, '/')).some((entry) => entry.name === 'present'), true);
        assert.equal(await service.readText(profile, '/present'), 'forced mode\n');
        const client = service.connections.get(profile.id).client;
        assert.equal(client.ftp.hasTLS, true, 'a forced FTPS mode must be encrypted');
      } else {
        const started = Date.now();
        const failure = await service.list(profile, '/').then(() => null, (error) => error);
        assert.ok(failure, 'the wrong FTPS form must not connect');
        assert.equal(isTlsProtocolMismatch(failure), true, `expected a TLS mismatch, got: ${failure.message}`);
        assert.ok(Date.now() - started < 10_000, 'the wrong FTPS form must fail promptly');
        assert.equal(service.connections.has(profile.id), false, 'a failed connection is not kept');
        // The same profile in automatic mode still reaches this server.
        assert.deepEqual(await service.list({ ...profile, ftpsMode: 'auto' }, '/'), []);
      }
      console.log(`${label.toUpperCase().replaceAll('-', '_')}_${works ? 'CONNECTED' : 'FAILED_CLEANLY'}`);
    } finally {
      service.disconnectAll(); server.kill('SIGTERM');
      if (server.exitCode === null) await once(server, 'exit');
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
