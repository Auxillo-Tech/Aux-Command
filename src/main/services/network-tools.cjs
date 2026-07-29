'use strict';

const { spawn } = require('node:child_process');
const dgram = require('node:dgram');
const net = require('node:net');

const HOST_PATTERN = /^[A-Za-z0-9._:%-]+$/u;
const DNS_TYPES = new Set(['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'PTR', 'CAA', 'SRV']);
const MAX_OUTPUT_BYTES = 2_000_000;

function validateHost(value, label = 'host') {
  const host = String(value || '').trim();
  if (!host || host.length > 253 || host.startsWith('-') || !HOST_PATTERN.test(host)) {
    throw new Error(`Invalid ${label}`);
  }
  return host;
}

class NetworkToolService {
  constructor(options = {}) {
    this.active = new Map();
    this.wakeAddress = options.wakeAddress || '255.255.255.255';
    this.wakePort = Number(options.wakePort || 9);
  }

  async ping(hostInput, count = 4) {
    const host = validateHost(hostInput);
    const boundedCount = Number(count);
    if (!Number.isInteger(boundedCount) || boundedCount < 1 || boundedCount > 20) throw new Error('Ping count must be between 1 and 20');
    return this.#spawnCapture('ping', ['-c', String(boundedCount), '--', host]);
  }

  async traceroute(hostInput) {
    const host = validateHost(hostInput);
    return this.#spawnCapture('traceroute', ['-n', '--', host]);
  }

  async dnsLookup(hostnameInput, type = 'A') {
    const hostname = validateHost(hostnameInput, 'DNS name');
    const recordType = String(type || 'A').toUpperCase();
    if (!DNS_TYPES.has(recordType)) throw new Error('Unsupported DNS record type');
    return this.#spawnCapture('dig', ['+short', hostname, recordType]);
  }

  async portScan(hostInput, ports = [22, 80, 443, 8080, 3306, 8443]) {
    const host = validateHost(hostInput);
    if (!Array.isArray(ports) || !ports.length) throw new Error('Port scan requires ports');
    if (ports.length > 1024) throw new Error('Port scan has too many ports');
    const normalized = [...new Set(ports.map(Number))];
    if (normalized.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error('Port scan ports must be integers from 1 to 65535');
    }

    const results = new Array(normalized.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < normalized.length) {
        const index = cursor;
        cursor += 1;
        const port = normalized[index];
        results[index] = { port, open: await this.#probePort(host, port) };
      }
    };
    await Promise.all(Array.from({ length: Math.min(32, normalized.length) }, () => worker()));
    return results;
  }

  async whois(queryInput) {
    const query = validateHost(queryInput, 'whois query');
    return this.#spawnCapture('whois', ['--', query]);
  }

  async wakeOnLan(macAddress) {
    const mac = String(macAddress || '').replace(/[^0-9a-fA-F]/gu, '');
    if (mac.length !== 12) throw new Error('Invalid MAC address');
    const packet = Buffer.alloc(102);
    packet.fill(0xFF, 0, 6);
    const bytes = Buffer.from(mac, 'hex');
    for (let offset = 6; offset < packet.length; offset += 6) bytes.copy(packet, offset);

    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        try { socket.close(); } catch { /* already closed */ }
        if (error) reject(error);
        else resolve({ sent: true, mac: macAddress, address: this.wakeAddress, port: this.wakePort });
      };
      socket.once('error', finish);
      socket.bind(0, () => {
        try { socket.setBroadcast(true); } catch { /* not required for unicast test targets */ }
        socket.send(packet, this.wakePort, this.wakeAddress, finish);
      });
    });
  }

  cancel(id) {
    const entry = this.active.get(id);
    if (!entry) return false;
    entry.cancelled = true;
    try { entry.child.kill('SIGTERM'); } catch { /* already exited */ }
    entry.killTimer ||= setTimeout(() => { try { entry.child.kill('SIGKILL'); } catch { /* already exited */ } }, 3000);
    entry.killTimer.unref();
    return true;
  }

  cancelAll() {
    let cancelled = 0;
    for (const id of [...this.active.keys()]) cancelled += this.cancel(id) ? 1 : 0;
    return cancelled;
  }

  #probePort(host, port, timeout = 1200) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const finish = (open) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(open);
      };
      socket.setTimeout(timeout);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, host);
    });
  }

  #spawnCapture(command, args, timeout = 30_000) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      const id = `${command}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry = { child, cancelled: false, timedOut: false, killTimer: null };
      this.active.set(id, entry);
      let stdout = '';
      let stderr = '';
      let settled = false;

      const append = (current, chunk) => {
        const combined = current + chunk;
        return combined.length > MAX_OUTPUT_BYTES ? combined.slice(-MAX_OUTPUT_BYTES) : combined;
      };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });

      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (entry.killTimer) clearTimeout(entry.killTimer);
        this.active.delete(id);
        if (error) reject(error);
        else resolve(result);
      };
      const timer = setTimeout(() => {
        entry.timedOut = true;
        try { child.kill('SIGTERM'); } catch { /* already exited */ }
        entry.killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already exited */ } }, 3000);
        entry.killTimer.unref();
      }, timeout);
      timer.unref();

      child.once('error', (error) => finish(error));
      child.once('exit', (code, signal) => {
        if (entry.cancelled) finish(new Error(`${command} was cancelled`));
        else if (entry.timedOut) finish(new Error(`${command} timed out`));
        else finish(null, { id, command, args, exitCode: code, signal: signal || null, stdout, stderr });
      });
    });
  }
}

module.exports = { NetworkToolService, validateHost };
