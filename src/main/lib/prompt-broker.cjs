'use strict';

const { randomUUID } = require('node:crypto');

class PromptBroker {
  constructor(getWindow) {
    this.getWindow = getWindow;
    this.pending = new Map();
  }

  request(kind, payload, timeoutMs = 120_000) {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return Promise.reject(new Error('No application window available for prompt'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${kind} prompt timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      window.webContents.send('prompt:request', { id, kind, payload });
    });
  }

  respond(id, response) {
    const pending = this.pending.get(id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(response);
    return true;
  }

  cancelAll(reason = 'Application is closing') {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pending.delete(id);
    }
  }
}

module.exports = { PromptBroker };
