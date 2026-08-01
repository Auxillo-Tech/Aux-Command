'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/**
 * Managed SFTP/FTP transfer queue with serialized execution and resumable offsets.
 * Progress is emitted as transfer:update events to the renderer.
 */
class TransferQueue {
  constructor(getWindow, transferService = null) {
    this.getWindow = getWindow;
    this.entries = new Map();
    this.transferService = transferService;
    this.processing = false;
  }

  enqueue(spec) {
    this.#validateSpec(spec);
    const id = randomUUID();
    const stat = spec.direction === 'upload' && fs.existsSync(spec.localPath)
      ? fs.statSync(spec.localPath)
      : null;
    if (stat && !stat.isFile()) throw new Error('Transfer queue uploads regular files only');

    const entry = {
      id,
      profile: structuredClone(spec.profile),
      profileId: spec.profile.id,
      direction: spec.direction,
      localPath: spec.localPath,
      remotePath: spec.remotePath,
      fileName: path.basename(spec.direction === 'upload' ? spec.localPath : spec.remotePath),
      status: 'queued',
      transferred: 0,
      total: stat?.size || 0,
      error: '',
      startedAt: '',
      completedAt: '',
      abortController: null
    };
    this.entries.set(id, entry);
    this.#emit(entry);
    void this.#processQueue();
    return this.#sanitize(entry);
  }

  pause(id) {
    const entry = this.entries.get(id);
    if (!entry || !['queued', 'transferring'].includes(entry.status)) return false;
    if (entry.profile.transferMode === 'scp') return false;
    if (entry.status === 'transferring') {
      entry.status = 'pausing';
      this.#emit(entry);
      entry.abortController?.abort();
    } else if (entry.status === 'queued') {
      entry.status = 'paused';
      this.#emit(entry);
    }
    return true;
  }

  resume(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (entry.status === 'paused' || entry.status === 'failed') {
      entry.status = 'queued';
      entry.error = '';
      entry.completedAt = '';
      this.#emit(entry);
      void this.#processQueue();
    }
    return true;
  }

  retry(id) {
    return this.resume(id);
  }

  cancel(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    const active = entry.status === 'transferring' || entry.status === 'pausing';
    entry.status = 'cancelled';
    this.#emit(entry);
    entry.abortController?.abort();
    if (!active) {
      // Paused/failed entries never reach #runEntry's finally block, so their
      // partial files are cleaned up here instead.
      this.entries.delete(id);
      void Promise.resolve(this.transferService?.cleanup?.(
        entry.profile,
        entry.direction,
        entry.localPath,
        entry.remotePath,
        { transferId: entry.id }
      )).catch(() => { /* best effort partial-transfer cleanup */ });
    }
    void this.#processQueue();
    return true;
  }

  list() {
    const order = { transferring: 0, queued: 1, pausing: 2, paused: 3, failed: 4, completed: 5 };
    return [...this.entries.values()]
      .filter((entry) => entry.status !== 'cancelled')
      .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
        || (b.startedAt || '').localeCompare(a.startedAt || ''))
      .map((entry) => this.#sanitize(entry));
  }

  clearCompleted() {
    for (const [id, entry] of this.entries) {
      if (entry.status === 'completed') this.entries.delete(id);
    }
    this.#batchEmit();
    return this.list();
  }

  cancelAll() {
    for (const id of [...this.entries.keys()]) this.cancel(id);
  }

  #validateSpec(spec) {
    if (!spec?.profile || typeof spec.profile !== 'object' || !spec.profile.id) {
      throw new Error('Transfer profile is required');
    }
    if (spec.direction !== 'upload' && spec.direction !== 'download') {
      throw new Error('Transfer direction must be upload or download');
    }
    if (typeof spec.localPath !== 'string' || !path.isAbsolute(spec.localPath)) {
      throw new Error('Transfer local path must be absolute');
    }
    if (typeof spec.remotePath !== 'string' || !spec.remotePath.trim()) {
      throw new Error('Transfer remote path is required');
    }
  }

  async #processQueue() {
    if (this.processing) return;
    this.processing = true;
    try {
      let next = [...this.entries.values()].find((entry) => entry.status === 'queued');
      while (next) {
        await this.#runEntry(next);
        next = [...this.entries.values()].find((entry) => entry.status === 'queued');
      }
    } finally {
      this.processing = false;
      if ([...this.entries.values()].some((entry) => entry.status === 'queued')) void this.#processQueue();
    }
  }

  async #runEntry(entry) {
    if (!this.transferService) {
      this.#failEntry(entry, 'Transfer service not available');
      return;
    }

    entry.status = 'transferring';
    entry.startedAt ||= new Date().toISOString();
    const abortController = new AbortController();
    entry.abortController = abortController;
    this.#emit(entry);

    const options = {
      signal: abortController.signal,
      offset: entry.transferred,
      transferId: entry.id,
      onProgress: (transferred, total) => {
        if (!this.entries.has(entry.id) || entry.status !== 'transferring') return;
        entry.transferred = Math.max(0, Number(transferred) || 0);
        entry.total = Math.max(entry.total, Number(total) || 0);
        this.#emit(entry);
      }
    };

    try {
      if (entry.direction === 'upload') {
        await this.transferService.upload(entry.profile, entry.localPath, entry.remotePath, options);
      } else {
        await this.transferService.download(entry.profile, entry.remotePath, entry.localPath, options);
      }
      if (!this.entries.has(entry.id) || entry.status === 'cancelled') return;
      if (entry.status === 'pausing') {
        entry.status = 'paused';
      } else {
        entry.status = 'completed';
        if (entry.total > 0) entry.transferred = entry.total;
        entry.completedAt = new Date().toISOString();
      }
      this.#emit(entry);
    } catch (error) {
      if (!this.entries.has(entry.id) || entry.status === 'cancelled') return;
      if (entry.status === 'pausing' || error?.name === 'AbortError') {
        entry.status = 'paused';
        this.#emit(entry);
      } else {
        this.#failEntry(entry, error?.message || String(error));
      }
    } finally {
      entry.abortController = null;
      if (entry.status === 'cancelled') {
        try {
          await this.transferService.cleanup?.(
            entry.profile,
            entry.direction,
            entry.localPath,
            entry.remotePath,
            { transferId: entry.id }
          );
        } catch { /* best effort partial-transfer cleanup */ }
        this.entries.delete(entry.id);
      }
    }
  }

  #failEntry(entry, message) {
    if (!this.entries.has(entry.id)) return;
    entry.status = 'failed';
    entry.error = String(message).slice(0, 500);
    this.#emit(entry);
  }

  #emit(entry) {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send('transfer:update', this.#sanitize(entry));
    }
  }

  #batchEmit() {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send('transfer:list', this.list());
    }
  }

  #sanitize(entry) {
    return {
      id: entry.id,
      profileId: entry.profileId,
      direction: entry.direction,
      pausable: entry.profile.transferMode !== 'scp',
      fileName: entry.fileName,
      localPath: entry.localPath,
      remotePath: entry.remotePath,
      status: entry.status,
      transferred: entry.transferred,
      total: entry.total,
      error: entry.error,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt
    };
  }
}

module.exports = { TransferQueue };
