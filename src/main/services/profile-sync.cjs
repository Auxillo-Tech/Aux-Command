'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { randomUUID } = require('node:crypto');
const { JsonStore } = require('../lib/json-store.cjs');
const { expandHome } = require('../lib/validation.cjs');

const MAX_SYNC_BYTES = 5_000_000;
const MAX_SYNC_PROFILES = 1000;

class ProfileSync {
  constructor(profileStore, getWindow, options = {}) {
    this.profileStore = profileStore;
    this.getWindow = getWindow;
    this.sftpService = options.sftpService || null;
    this.dataStore = options.dataDir
      ? new JsonStore(path.join(options.dataDir, 'profile-sync.json'), {
        version: 1,
        config: null,
        lastSyncAt: null,
        lastError: null
      })
      : null;
    const persisted = this.dataStore?.get() || {};
    this.syncConfig = persisted.config || null;
    this.syncTimer = null;
    this.syncPromise = null;
    this.lastSyncAt = persisted.lastSyncAt || null;
    this.lastError = persisted.lastError || null;
    if (this.syncConfig) this.#startTimer();
  }

  configure(config) {
    if (!config || !config.type) throw new Error('Sync configuration requires a type (file, http, https, or ssh)');
    if (!['file', 'http', 'https', 'ssh'].includes(config.type)) throw new Error(`Unsupported sync type: ${config.type}`);
    const intervalMinutes = Math.max(1, Math.min(1440, Number(config.intervalMinutes) || 60));

    if (config.type === 'file') {
      const source = String(config.path || config.url || '').trim();
      if (!source) throw new Error('File sync requires a path');
      this.syncConfig = { type: 'file', url: source, intervalMinutes };
    } else if (config.type === 'ssh') {
      const profileId = String(config.profileId || '').trim();
      const remotePath = String(config.path || config.url || '').trim();
      if (!profileId || !remotePath) throw new Error('SSH sync requires a profile and remote path');
      const profile = this.profileStore.get?.(profileId) || this.profileStore.list().find((item) => item.id === profileId);
      if (!profile || profile.protocol !== 'ssh') throw new Error('SSH sync profile was not found or is not an SSH profile');
      this.syncConfig = { type: 'ssh', profileId, url: remotePath, intervalMinutes };
    } else {
      const source = String(config.url || '').trim();
      let parsed;
      try { parsed = new URL(source); } catch { throw new Error('HTTP sync requires a valid URL'); }
      if (parsed.protocol !== `${config.type}:`) throw new Error(`Sync URL must use ${config.type}`);
      if (parsed.username || parsed.password) throw new Error('Sync URL must not contain credentials');
      this.syncConfig = { type: config.type, url: parsed.toString(), intervalMinutes };
    }

    this.lastError = null;
    this.#persist();
    this.#startTimer();
    this.#emitStatus();
    return this.getConfig();
  }

  getConfig() {
    return this.syncConfig ? { ...this.syncConfig } : null;
  }

  getStatus() {
    return {
      configured: Boolean(this.syncConfig),
      type: this.syncConfig?.type || null,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      providerCount: this.syncConfig ? 1 : 0
    };
  }

  async syncNow() {
    if (!this.syncConfig) throw new Error('Sync is not configured');
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.#performSync().finally(() => { this.syncPromise = null; });
    return this.syncPromise;
  }

  async #performSync() {
    this.lastError = null;
    try {
      const remoteProfiles = await this.#fetchRemote();
      if (!remoteProfiles.length) {
        this.lastSyncAt = new Date().toISOString();
        this.#persist();
        this.#emitStatus();
        return { added: 0, updated: 0, total: 0 };
      }

      const localProfiles = [...this.profileStore.list()];
      let added = 0;
      let updated = 0;
      for (const remote of remoteProfiles) {
        if (!remote || typeof remote !== 'object' || Array.isArray(remote)) throw new Error('Sync profile entries must be objects');
        const {
          credentialId: _credentialId,
          credentialKind: _credentialKind,
          password: _password,
          passphrase: _passphrase,
          secret: _secret,
          privateKey: _privateKey,
          ...cleanRemote
        } = remote;
        const existing = localProfiles.find((profile) =>
          profile.name === cleanRemote.name
          && profile.host === cleanRemote.host
          && profile.protocol === cleanRemote.protocol
        );
        const saved = this.profileStore.save({
          ...(existing || {}),
          ...cleanRemote,
          id: existing?.id || randomUUID(),
          credentialId: existing?.credentialId || '',
          credentialKind: existing?.credentialKind || 'password'
        });
        if (existing) {
          Object.assign(existing, saved);
          updated += 1;
        } else {
          localProfiles.push(saved);
          added += 1;
        }
      }

      this.lastSyncAt = new Date().toISOString();
      this.#persist();
      this.#emitStatus();
      return { added, updated, total: remoteProfiles.length };
    } catch (error) {
      this.lastError = error?.message || String(error);
      this.#persist();
      this.#emitStatus();
      throw error;
    }
  }

  disable() {
    this.stop();
    this.syncConfig = null;
    this.lastSyncAt = null;
    this.lastError = null;
    this.#persist();
    this.#emitStatus();
    return this.getStatus();
  }

  stop() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  #startTimer() {
    this.stop();
    const milliseconds = this.syncConfig.intervalMinutes * 60 * 1000;
    this.syncTimer = setInterval(() => { this.syncNow().catch(() => {}); }, milliseconds);
    this.syncTimer.unref();
  }

  async #fetchRemote() {
    const config = this.syncConfig;
    let text;
    if (config.type === 'file') {
      const filename = path.resolve(expandHome(config.url));
      try { text = fs.readFileSync(filename, 'utf8'); } catch (error) { throw new Error(`Cannot read sync file: ${error.message}`); }
    } else if (config.type === 'http' || config.type === 'https') {
      text = await this.#fetchHttp(config.url);
    } else if (config.type === 'ssh') {
      if (!this.sftpService) throw new Error('SSH sync service is unavailable');
      const profile = this.profileStore.get?.(config.profileId) || this.profileStore.list().find((item) => item.id === config.profileId);
      if (!profile) throw new Error('SSH sync profile no longer exists');
      text = await this.sftpService.readText(profile, config.url, MAX_SYNC_BYTES);
    } else {
      throw new Error(`Unsupported sync type: ${config.type}`);
    }
    return this.#parsePayload(text);
  }

  #parsePayload(text) {
    if (typeof text !== 'string') throw new Error('Sync source did not return text');
    if (Buffer.byteLength(text, 'utf8') > MAX_SYNC_BYTES) throw new Error('Sync payload exceeds 5 MB');
    let parsed;
    try { parsed = JSON.parse(text); } catch (error) { throw new Error(`Invalid sync file format: ${error.message}`); }
    const profiles = Array.isArray(parsed) ? parsed : parsed?.profiles;
    if (!Array.isArray(profiles)) throw new Error('Sync payload must be a profile array or an object with profiles');
    if (profiles.length > MAX_SYNC_PROFILES) throw new Error(`Sync payload exceeds ${MAX_SYNC_PROFILES} profiles`);
    return profiles;
  }

  #fetchHttp(url, redirects = 0) {
    if (redirects > 3) return Promise.reject(new Error('Sync HTTP redirect limit exceeded'));
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;
      const request = client.get(parsed, { timeout: 15_000 }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          const next = new URL(response.headers.location, parsed).toString();
          this.#fetchHttp(next, redirects + 1).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Sync HTTP ${response.statusCode}`));
          return;
        }
        let data = '';
        let bytes = 0;
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          bytes += Buffer.byteLength(chunk, 'utf8');
          if (bytes > MAX_SYNC_BYTES) response.destroy(new Error('Sync payload exceeds 5 MB'));
          else data += chunk;
        });
        response.on('end', () => resolve(data));
        response.on('error', reject);
      });
      request.on('error', reject);
      request.on('timeout', () => request.destroy(new Error('Sync HTTP request timed out')));
    });
  }

  #persist() {
    if (!this.dataStore) return;
    this.dataStore.replace({
      version: 1,
      config: this.syncConfig ? { ...this.syncConfig } : null,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError
    });
  }

  #emitStatus() {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('sync:status', this.getStatus());
  }
}

module.exports = { ProfileSync };
