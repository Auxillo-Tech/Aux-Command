'use strict';
// Starts a FreeRDP shadow test server and waits until it accepts connections.
// The server opens the X display itself, and in a CPU-capped Xvfb container that
// first connection fails now and then ("failed to open display"); the display is
// fine on the next try. Retry only that early exit, never a server that is up.
const net = require('node:net');
const { spawn } = require('node:child_process');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function probe(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}
async function startShadowServer(executable, args, port, { attempts = 6, waitMs = 10000 } = {}) {
  let child;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    child = spawn(executable, args);
    let log = '';
    for (const pipe of [child.stdout, child.stderr]) pipe.on('data', (chunk) => { log = (log + chunk).slice(-8000); });
    Object.defineProperty(child, 'log', { get: () => log, configurable: true });
    const deadline = Date.now() + waitMs;
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
      if (await probe(port)) return child;
      await delay(100);
    }
    if (child.exitCode === null && child.signalCode === null) return child; // still alive: the caller asserts
    if (!/failed to open display/i.test(log) || attempt === attempts) return child;
  }
  return child;
}
module.exports = { startShadowServer };
