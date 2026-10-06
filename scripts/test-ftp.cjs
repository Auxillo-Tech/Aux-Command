'use strict';
// AUX_FTP_TEST_PYTHON must provide pyftpdlib and pyOpenSSL.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { FtpService } = require('../src/main/services/ftp-service.cjs');
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
  for (const protocol of ['ftp', 'ftps']) {
    const root = path.join(directory, protocol); fs.mkdirSync(root);
    const server = spawn(process.env.AUX_FTP_TEST_PYTHON || 'python3', [path.join(__dirname, 'ftp-test-server.py'), root, path.join(directory, 'cert.pem'), path.join(directory, 'key.pem'), protocol]);
    let errors = ''; server.stderr.on('data', (chunk) => { errors = (errors + chunk).slice(-4000); });
    const service = new FtpService({ has: () => true, get: async () => 'test-only-password' }, () => null);
    try {
      const port = await new Promise((resolve, reject) => {
        let output = '';
        server.stdout.on('data', (chunk) => { output += chunk; if (output.includes('\n')) resolve(JSON.parse(output.split('\n')[0]).port); });
        server.once('error', reject); server.once('exit', () => reject(new Error(errors)));
      });
      const profile = { id: protocol, name: protocol, protocol, host: '127.0.0.1', port, username: 'fixture', credentialId: 'test' };
      const original = Buffer.from('round-trip content\n');
      const local = path.join(directory, `${protocol}-upload`); fs.writeFileSync(local, original);
      await service.mkdir(profile, '/remote');
      await service.upload(profile, local, '/remote/file');
      assert.equal((await service.list(profile, '/remote')).some((entry) => entry.name === 'file'), true);
      assert.equal(await service.readText(profile, '/remote/file'), original.toString());
      await service.writeText(profile, '/remote/file', 'edited');
      const downloaded = path.join(directory, `${protocol}-download`);
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
      console.log(`${protocol.toUpperCase()}_ROUNDTRIP_RECONNECT_CANCELLATION_PASSED`);
    } finally {
      service.disconnectAll(); server.kill('SIGTERM');
      if (server.exitCode === null) await once(server, 'exit');
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
