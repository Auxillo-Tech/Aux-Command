'use strict';

const net = require('node:net');

const DEFAULT_TIMEOUT = 2500;
const MAX_CONCURRENT = 8;
const MAX_TARGETS = 200;

// Probes whether the TCP endpoint behind a saved connection is currently
// reachable. This is a best-effort liveness signal for the sidebar, not an
// authentication or service-level health check.
class ReachabilityService {
  constructor(options = {}) {
    this.timeout = Math.max(500, Number(options.timeout) || DEFAULT_TIMEOUT);
    this.concurrency = Math.max(1, Number(options.concurrency) || MAX_CONCURRENT);
  }

  #probe(host, port) {
    return new Promise((resolve) => {
      const started = Date.now();
      const socket = new net.Socket();
      let settled = false;
      const finish = (reachable, error) => {
        if (settled) return;
        settled = true;
        try { socket.destroy(); } catch { /* already destroyed */ }
        resolve({ reachable, latencyMs: reachable ? Date.now() - started : null, error: error || null });
      };
      socket.setTimeout(this.timeout);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false, 'timeout'));
      socket.once('error', (err) => finish(false, err?.code || 'error'));
      try {
        socket.connect(port, host);
      } catch (err) {
        finish(false, err?.code || 'error');
      }
    });
  }

  // targets: [{ id, host, port }]. Returns [{ id, reachable, latencyMs, error, checkedAt }].
  async check(targets) {
    const list = (Array.isArray(targets) ? targets : [])
      .filter((target) => target && target.id && target.host && Number.isInteger(Number(target.port)))
      .slice(0, MAX_TARGETS);
    const results = new Array(list.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        const target = list[index];
        const outcome = await this.#probe(String(target.host), Number(target.port));
        results[index] = {
          id: target.id,
          reachable: outcome.reachable,
          latencyMs: outcome.latencyMs,
          error: outcome.error,
          checkedAt: new Date().toISOString()
        };
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, list.length) }, () => worker()));
    return results;
  }
}

module.exports = { ReachabilityService };
