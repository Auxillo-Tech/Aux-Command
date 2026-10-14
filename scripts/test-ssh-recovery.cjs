'use strict';
// Controlled TCP reset and blackhole; only loopback fixture connections are touched.
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const { createSshdFixture } = require('./ssh-test-fixture.cjs');
const { TerminalService } = require('../src/main/services/terminal-service.cjs');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const fixture = await createSshdFixture();
  const sockets = new Set(); let blackhole = false;
  const proxy = net.createServer((client) => {
    const upstream = net.connect(fixture.port, '127.0.0.1');
    for (const socket of [client, upstream]) { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); }
    client.on('data', (data) => { if (!blackhole) upstream.write(data); });
    upstream.on('data', (data) => { if (!blackhole) client.write(data); });
    client.on('close', () => upstream.destroy()); upstream.on('close', () => client.destroy());
  });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const port = proxy.address().port;
  // Preserve the fixture host key for the proxy's distinct loopback port.
  const knownHostsFile = `${fixture.directory}/proxy_known_hosts`;
  fs.writeFileSync(knownHostsFile, `[127.0.0.1]:${port} ${fs.readFileSync(`${fixture.directory}/host_key.pub`, 'utf8')}`);
  const output = new Map(), exits = new Map();
  const terminal = new TerminalService(() => ({ isDestroyed: () => false, webContents: { send(channel, value) {
    if (channel === 'terminal:data') output.set(value.id, (output.get(value.id) || '') + value.data);
    if (channel === 'terminal:exit') exits.set(value.id, value);
  } } }));
  const profile = { id: 'fixture', name: 'Recovery fixture', protocol: 'ssh', host: '127.0.0.1', port, username: fixture.user, identityFile: fixture.clientKey, knownHostsFile, useSshConfig: false, keepAliveSeconds: 1, trackRemoteCwd: true };
  const wait = async (condition, seconds=15) => { for (let i=0;i<seconds*20;i++) { if(condition())return; await delay(50); } throw Error('Fixture condition timed out'); };
  try {
    let session = terminal.create({ profile, remoteCwd: fixture.rootDir });
    await wait(() => output.get(session.id)?.includes('$'));
    terminal.write(session.id, "printf '\\nSSH_REMOTE_CWD='; pwd\r");
    await wait(() => output.get(session.id)?.includes(`SSH_REMOTE_CWD=${fixture.rootDir}`));
    const trackedDirectory = `${fixture.rootDir}/space é`;
    fs.mkdirSync(trackedDirectory);
    terminal.write(session.id, `cd '${trackedDirectory}'\r`);
    await wait(() => terminal.list().find((item) => item.id === session.id)?.cwd === trackedDirectory);
    assert.equal('cwdTracker' in terminal.list()[0], false);
    console.log('SSH_AUTOMATIC_CWD_TRACKING_PASSED');
    for (const socket of sockets) socket.destroy();
    await wait(() => exits.has(session.id));
    assert.equal(terminal.list().length, 0); assert.notEqual(exits.get(session.id).exitCode, 0);
    console.log('SSH_RESET_EXIT_AND_REMOTE_CWD_PASSED');
    session = terminal.create({ profile });
    terminal.write(session.id, "printf '\\nRECONNECTED_91\\n'\r");
    await wait(() => output.get(session.id)?.includes('\r\nRECONNECTED_91\r\n'));
    blackhole = true;
    await wait(() => exits.has(session.id), 20);
    assert.equal(terminal.list().length, 0);
    console.log('SSH_RECONNECT_AND_KEEPALIVE_BLACKHOLE_PASSED');
    blackhole = false;
    session = terminal.create({ profile: { ...profile, username: 'aux-fixture-nonexistent-user' } });
    await wait(() => exits.has(session.id));
    assert.match(output.get(session.id), /Permission denied/);
    assert.notEqual(exits.get(session.id).exitCode, 0);
    console.log('SSH_AUTH_FAILURE_PASSED');
  } finally { terminal.closeAll(); for (const s of sockets)s.destroy(); await new Promise((r)=>proxy.close(r)); fixture.close(); }
}
main().catch((error) => { console.error(error); process.exitCode=1; });
