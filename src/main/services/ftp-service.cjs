'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ftp = require('basic-ftp');
const { normalizeProfile, normalizeRemotePath } = require('../lib/validation.cjs');
const { modeToString } = require('./sftp-service.cjs');

function safeDateToIso(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  return value.toISOString();
}

class FtpService {
  constructor(vaultService, getWindow) {
    this.vaultService = vaultService;
    this.getWindow = getWindow;
    this.connections = new Map();
  }

  async connect(profileInput) {
    const profile = normalizeProfile(profileInput);
    if (profile.protocol !== 'ftp' && profile.protocol !== 'ftps') throw new Error('FTP service requires an FTP or FTPS profile');
    const existing = this.connections.get(profile.id);
    if (existing?.ready && existing.signature === this.#signature(profile)) return existing;
    if (existing?.promise) return existing.promise;
    this.disconnect(profile.id);
    const holder = {
      profile,
      signature: this.#signature(profile),
      client: new ftp.Client(30_000),
      ready: false,
      promise: null
    };
    holder.client.ftp.verbose = false;
    holder.promise = this.#open(holder).then(() => holder).catch((error) => {
      this.connections.delete(profile.id);
      try { holder.client.close(); } catch { /* already closed */ }
      throw error;
    });
    this.connections.set(profile.id, holder);
    return holder.promise;
  }

  async #open(holder) {
    const { profile, client } = holder;
    const config = {
      host: profile.host,
      port: profile.port,
      user: profile.username || 'anonymous',
      secure: profile.protocol === 'ftps' ? 'implicit' : false,
      secureOptions: { rejectUnauthorized: true }
    };
    if (profile.credentialId && this.vaultService.has(profile.credentialId)) {
      config.password = await this.vaultService.get(profile.credentialId);
    } else if (profile.protocol === 'ftp' && !profile.username) {
      config.password = 'anonymous@';
    }
    await client.access(config);
    holder.ready = true;
    holder.promise = null;
  }

  #signature(profile) {
    return JSON.stringify({
      protocol: profile.protocol,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      credentialId: profile.credentialId
    });
  }

  async list(profileInput, remotePath = '/') {
    const connection = await this.connect(profileInput);
    const target = normalizeRemotePath(remotePath);
    const entries = await connection.client.list(target);
    return entries.map((entry) => ({
      name: entry.name,
      path: path.posix.join(target, entry.name),
      longname: entry.rawModifiedAt || entry.name,
      size: Number(entry.size || 0),
      modifiedAt: safeDateToIso(entry.modifiedAt),
      permissions: modeToString(entry.permissions || 0),
      directory: entry.isDirectory,
      mode: Number(entry.permissions || 0)
    })).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  }

  async mkdir(profile, remotePath) {
    const connection = await this.connect(profile);
    await connection.client.ensureDir(normalizeRemotePath(remotePath));
    return true;
  }

  async rename(profile, oldPath, newPath) {
    const connection = await this.connect(profile);
    await connection.client.rename(normalizeRemotePath(oldPath), normalizeRemotePath(newPath));
    return true;
  }

  async remove(profile, remotePath, directory = false) {
    const connection = await this.connect(profile);
    const target = normalizeRemotePath(remotePath);
    if (directory) await connection.client.removeDir(target);
    else await connection.client.remove(target);
    return true;
  }

  async readText(profileInput, remotePath, limit = 1_000_000) {
    const connection = await this.connect(profileInput);
    const source = normalizeRemotePath(remotePath);
    const localPath = path.join(os.tmpdir(), `aux-command-ftp-edit-${randomUUID()}`);
    try {
      await connection.client.downloadTo(localPath, source);
      const size = fs.statSync(localPath).size;
      if (size > limit) throw new Error(`Remote file is too large for inline editing (${size} bytes)`);
      return fs.readFileSync(localPath, 'utf8');
    } finally {
      try { fs.rmSync(localPath, { force: true }); } catch { /* best effort cleanup */ }
    }
  }

  async writeText(profileInput, remotePath, content) {
    const connection = await this.connect(profileInput);
    const target = normalizeRemotePath(remotePath);
    const text = String(content ?? '');
    if (Buffer.byteLength(text, 'utf8') > 1_000_000) throw new Error('Remote text editor refuses to save files larger than 1 MB');
    const localPath = path.join(os.tmpdir(), `aux-command-ftp-edit-${randomUUID()}`);
    try {
      fs.writeFileSync(localPath, text, { mode: 0o600 });
      await connection.client.uploadFrom(localPath, target);
    } finally {
      try { fs.rmSync(localPath, { force: true }); } catch { /* best effort cleanup */ }
    }
    return true;
  }

  async upload(profileInput, localPath, remotePath, options = {}) {
    const profile = normalizeProfile(profileInput);
    const connection = await this.connect(profile);
    if (!path.isAbsolute(localPath)) throw new Error('Local upload path must be absolute');
    const target = normalizeRemotePath(remotePath);
    const stat = fs.statSync(localPath);
    if (!stat.isFile()) throw new Error('FTP uploads regular files only');
    const partialPath = `${target}.aux-command-${options.transferId || randomUUID()}.part`;
    let offset = 0;
    if (options.offset > 0) {
      try { offset = Math.min(stat.size, Number(await connection.client.size(partialPath))); } catch { offset = 0; }
    }
    const abort = () => connection.client.close();
    options.signal?.addEventListener('abort', abort, { once: true });
    connection.client.trackProgress((info) => options.onProgress?.(offset + info.bytesOverall, stat.size));
    options.onProgress?.(offset, stat.size);
    try {
      if (offset > 0) await connection.client.appendFrom(localPath, partialPath, { localStart: offset });
      else await connection.client.uploadFrom(localPath, partialPath);
      try {
        await connection.client.rename(partialPath, target);
      } catch {
        try { await connection.client.remove(target); } catch { /* target may not exist */ }
        await connection.client.rename(partialPath, target);
      }
    } catch (error) {
      if (options.signal?.aborted) {
        this.disconnect(profile.id);
        throw new DOMException('Aborted', 'AbortError');
      }
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', abort);
      try { connection.client.trackProgress(); } catch { /* connection may be closed */ }
    }
    return true;
  }

  async download(profileInput, remotePath, localPath, options = {}) {
    const profile = normalizeProfile(profileInput);
    const connection = await this.connect(profile);
    if (!path.isAbsolute(localPath)) throw new Error('Local download path must be absolute');
    const source = normalizeRemotePath(remotePath);
    const partialPath = `${localPath}.aux-command-${options.transferId || randomUUID()}.part`;
    const total = Number(await connection.client.size(source));
    const offset = options.offset > 0 && fs.existsSync(partialPath)
      ? Math.min(total, fs.statSync(partialPath).size)
      : 0;
    const abort = () => connection.client.close();
    options.signal?.addEventListener('abort', abort, { once: true });
    connection.client.trackProgress((info) => options.onProgress?.(offset + info.bytesOverall, total));
    options.onProgress?.(offset, total);
    try {
      await connection.client.downloadTo(partialPath, source, offset);
      fs.chmodSync(partialPath, 0o600);
      fs.renameSync(partialPath, localPath);
      fs.chmodSync(localPath, 0o600);
    } catch (error) {
      if (options.signal?.aborted) {
        this.disconnect(profile.id);
        throw new DOMException('Aborted', 'AbortError');
      }
      if (!options.transferId) {
        try { fs.rmSync(partialPath, { force: true }); } catch { /* best effort cleanup */ }
      }
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', abort);
      try { connection.client.trackProgress(); } catch { /* connection may be closed */ }
    }
    return true;
  }

  async cleanupTransfer(profileInput, direction, localPath, remotePath, options = {}) {
    const transferId = options.transferId;
    if (!transferId) return false;
    if (direction === 'download') {
      try { fs.rmSync(`${localPath}.aux-command-${transferId}.part`, { force: true }); } catch { /* best effort */ }
      return true;
    }
    const profile = normalizeProfile(profileInput);
    const connection = await this.connect(profile);
    try { await connection.client.remove(`${normalizeRemotePath(remotePath)}.aux-command-${transferId}.part`); } catch { /* best effort */ }
    return true;
  }

  disconnect(profileId) {
    const connection = this.connections.get(profileId);
    if (!connection) return false;
    this.connections.delete(profileId);
    try { connection.client.close(); } catch { /* already closed */ }
    return true;
  }

  disconnectAll() {
    for (const profileId of [...this.connections.keys()]) this.disconnect(profileId);
  }
}

module.exports = { FtpService };
