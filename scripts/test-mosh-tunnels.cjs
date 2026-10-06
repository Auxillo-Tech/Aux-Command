'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');
const { createSshdFixture, freePort } = require('./ssh-test-fixture.cjs');
const { TerminalService } = require('../src/main/services/terminal-service.cjs');
const { TunnelService } = require('../src/main/services/tunnel-service.cjs');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const fixture = await createSshdFixture();
  const profile = { id: 'fixture', name: 'Fixture', protocol: 'ssh', host: '127.0.0.1', port: fixture.port, username: fixture.user, identityFile: fixture.clientKey, knownHostsFile: `${fixture.directory}/known_hosts`, useSshConfig: false };
  const echo = net.createServer((socket) => socket.on('data', (chunk) => socket.write(chunk)));
  await new Promise((resolve) => echo.listen(0, '127.0.0.1', resolve));
  let output = '';
  const terminal = new TerminalService(() => ({ isDestroyed: () => false, webContents: { send(channel, value) { if (channel === 'terminal:data') output += value.data; } } }));
  const tunnels = new TunnelService({ get: () => profile }, () => null);
  try {
    const session = terminal.create({ profile: { ...profile, protocol: 'mosh', startupCommand: "printf AUX_MOSH_OK; sleep 1" }, cols: 80, rows: 24 });
    for (let i = 0; i < 100 && !output.includes('AUX_MOSH_OK'); i++) await delay(100);
    terminal.close(session.id);
    assert.match(output, /AUX_MOSH_OK/, output);
    console.log('MOSH_STARTUP_COMMAND_PASSED');
    for (const type of ['local', 'remote', 'dynamic']) {
      const port = await freePort();
      tunnels.start({ id: type, name: type, type, profileId: profile.id, bindHost: '127.0.0.1', bindPort: port, targetHost: '127.0.0.1', targetPort: echo.address().port });
      for (let i = 0; i < 100 && !tunnels.list().some((item) => item.status === 'running'); i++) await delay(50);
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(5000, () => socket.destroy(new Error('Tunnel fixture timed out')));
      const next = () => new Promise((resolve, reject) => { socket.once('data', resolve); socket.once('error', reject); });
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
      try {
        if (type === 'dynamic') {
          let reply = next(); socket.write(Buffer.from([5, 1, 0])); assert.deepEqual(await reply, Buffer.from([5, 0]));
          reply = next(); const target = echo.address().port;
          socket.write(Buffer.from([5, 1, 0, 1, 127, 0, 0, 1, target >> 8, target & 255]));
          assert.equal((await reply)[1], 0);
        }
        const reply = next(); socket.write('AUX_TUNNEL_OK'); assert.equal((await reply).toString(), 'AUX_TUNNEL_OK');
      } finally { socket.destroy(); tunnels.stop(type); }
      console.log(`${type.toUpperCase()}_TUNNEL_DATA_PASSED`);
    }
  } finally {
    terminal.closeAll(); tunnels.stopAll(); fixture.close();
    await new Promise((resolve) => echo.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
