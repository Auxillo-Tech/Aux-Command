'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Duplex } = require('node:stream');
const { Client } = require('ssh2');
const { expandHome, normalizeProfile, normalizeRemotePath } = require('../lib/validation.cjs');
const {
  connectionSignature, formatHostPort, isDirectory, modeToString, parseProxyJump, safeTimestampToIso
} = require('../lib/sftp-utils.cjs');

function callSftp(sftp, method, ...args) {
  return new Promise((resolve, reject) => {
    sftp[method](...args, (error, result) => error ? reject(error) : resolve(result));
  });
}

async function replaceRemoteFile(sftp, partialPath, targetPath) {
  if (typeof sftp.ext_openssh_rename === 'function') {
    try {
      await callSftp(sftp, 'ext_openssh_rename', partialPath, targetPath);
      return;
    } catch (error) {
      if (!/does not support this extended request/u.test(error.message)) throw error;
    }
  }
  try {
    await callSftp(sftp, 'rename', partialPath, targetPath);
  } catch (error) {
    await callSftp(sftp, 'unlink', targetPath);
    await callSftp(sftp, 'rename', partialPath, targetPath);
  }
}

function createOpenSshProxy(profile) {
  const jump = parseProxyJump(profile.proxyJump);
  const args = [
    '-T',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=15'
  ];
  if (jump.port !== 22) args.push('-p', String(jump.port));
  args.push('-W', formatHostPort(profile.host, profile.port), jump.destination);
  const child = spawn('ssh', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    env: process.env
  });

  let stderr = '';
  const socket = new Duplex({
    read() { child.stdout.resume(); },
    write(chunk, encoding, callback) {
      if (!child.stdin.writable) {
        callback(new Error('OpenSSH ProxyJump stream is not writable'));
        return;
      }
      if (child.stdin.write(chunk, encoding)) callback();
      else child.stdin.once('drain', callback);
    },
    final(callback) { child.stdin.end(callback); }
  });

  child.stdin.on('error', (error) => socket.destroy(error));
  child.stdout.on('error', (error) => socket.destroy(error));
  child.stdout.on('data', (chunk) => {
    if (!socket.push(chunk)) child.stdout.pause();
  });
  child.stdout.on('end', () => socket.push(null));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-8192); });
  child.once('error', (error) => socket.destroy(error));
  child.once('exit', (code, signal) => {
    if (code && !socket.destroyed) {
      socket.destroy(new Error(stderr.trim() || `OpenSSH ProxyJump exited with code ${code}`));
    } else if (signal && !socket.destroyed) {
      socket.destroy(new Error(`OpenSSH ProxyJump exited with signal ${signal}`));
    } else if (!socket.destroyed) {
      socket.push(null);
    }
  });
  socket.once('close', () => {
    if (!child.killed) child.kill('SIGTERM');
  });

  return { child, socket };
}

class SftpService {
  constructor(vaultService, knownHostService, promptBroker, getWindow) {
    this.vaultService = vaultService;
    this.knownHostService = knownHostService;
    this.promptBroker = promptBroker;
    this.getWindow = getWindow;
    this.connections = new Map();
  }

  async connect(profileInput) {
    const profile = normalizeProfile(profileInput, profileInput?.id);
    if (profile.protocol !== 'ssh') throw new Error('SFTP requires an SSH profile');
    const signature = connectionSignature(profile);
    const existing = this.connections.get(profile.id);
    if (existing && existing.signature !== signature) this.disconnect(profile.id);
    else if (existing?.ready) return existing;
    else if (existing?.promise) return existing.promise;

    const holder = { ready: false, client: null, sftp: null, proxy: null, profile, signature, promise: null };
    holder.promise = this.#connectInternal(holder).then(() => holder);
    this.connections.set(profile.id, holder);
    try {
      return await holder.promise;
    } catch (error) {
      if (this.connections.get(profile.id) === holder) this.connections.delete(profile.id);
      try { holder.client?.destroy?.(); } catch { /* best effort */ }
      try { holder.proxy?.socket?.destroy?.(); } catch { /* best effort */ }
      try { holder.proxy?.child?.kill?.('SIGTERM'); } catch { /* best effort */ }
      throw error;
    }
  }

  async #connectInternal(holder) {
    const profile = holder.profile;
    const client = new Client();
    holder.client = client;
    const config = {
      host: profile.host,
      port: profile.port,
      username: profile.username || process.env.USER,
      agent: process.env.SSH_AUTH_SOCK || undefined,
      keepaliveInterval: Math.max(0, profile.keepAliveSeconds * 1000),
      keepaliveCountMax: 3,
      readyTimeout: 20_000,
      tryKeyboard: true,
      algorithms: {
        compress: profile.compression ? ['zlib@openssh.com', 'zlib', 'none'] : ['none', 'zlib@openssh.com', 'zlib']
      },
      hostHash: 'sha256',
      hostVerifier: (fingerprint, callback) => {
        this.knownHostService.verify(profile, fingerprint)
          .then((accepted) => callback(accepted))
          .catch(() => callback(false));
      }
    };

    if (profile.proxyJump) {
      holder.proxy = createOpenSshProxy(profile);
      config.sock = holder.proxy.socket;
      delete config.host;
      delete config.port;
    }

    if (profile.identityFile) {
      try { config.privateKey = fs.readFileSync(expandHome(profile.identityFile)); }
      catch (error) { throw new Error(`Could not read SSH identity file: ${error.message}`); }
    }
    if (profile.credentialId && this.vaultService.has(profile.credentialId)) {
      const secret = await this.vaultService.get(profile.credentialId);
      if (profile.credentialKind === 'passphrase') config.passphrase = secret;
      else config.password = secret;
    }

    client.on('keyboard-interactive', async (name, instructions, language, prompts, finish) => {
      const requestedPrompts = Array.isArray(prompts) ? prompts : [];
      if (requestedPrompts.length > 32) {
        this.#emit('sftp:error', { profileId: profile.id, message: 'SSH server requested too many authentication prompts' });
        finish([]);
        return;
      }
      try {
        const response = await this.promptBroker.request('keyboard-interactive', {
          profileName: profile.name,
          host: profile.host,
          name: String(name || '').slice(0, 256),
          instructions: String(instructions || '').slice(0, 4096),
          language: String(language || '').slice(0, 64),
          prompts: requestedPrompts.map((prompt) => ({
            prompt: String(prompt?.prompt || '').slice(0, 1024),
            echo: Boolean(prompt?.echo)
          }))
        });
        const answers = Array.isArray(response?.answers) ? response.answers : [];
        finish(requestedPrompts.map((_, index) => String(answers[index] || '').slice(0, 32_768)));
      } catch {
        finish([]);
      }
    });
    client.on('error', (error) => this.#emit('sftp:error', { profileId: profile.id, message: error.message }));

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        client.off('ready', onReady);
        reject(error);
      };
      const onReady = () => {
        client.off('error', onError);
        resolve();
      };
      client.once('error', onError);
      client.once('ready', onReady);
      client.connect(config);
    });

    const sftp = await new Promise((resolve, reject) => {
      client.sftp((error, channel) => error ? reject(error) : resolve(channel));
    });
    holder.sftp = sftp;
    holder.ready = true;
    holder.promise = null;

    client.on('close', () => {
      if (this.connections.get(profile.id) === holder) this.connections.delete(profile.id);
      try { holder.proxy?.socket?.destroy?.(); } catch { /* best effort */ }
    });
  }

  async list(profileInput, remotePath = '/') {
    const connection = await this.connect(profileInput);
    const target = normalizeRemotePath(remotePath);
    const entries = await callSftp(connection.sftp, 'readdir', target);
    return entries
      .filter((entry) => entry.filename !== '.' && entry.filename !== '..')
      .map((entry) => ({
        name: entry.filename,
        path: path.posix.join(target, entry.filename),
        longname: entry.longname || '',
        size: Number(entry.attrs?.size || 0),
        modifiedAt: safeTimestampToIso(entry.attrs?.mtime),
        permissions: modeToString(entry.attrs?.mode || 0),
        directory: isDirectory(entry.attrs),
        mode: Number(entry.attrs?.mode || 0)
      }))
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  }

  async mkdir(profile, remotePath) {
    const connection = await this.connect(profile);
    await callSftp(connection.sftp, 'mkdir', normalizeRemotePath(remotePath));
    return true;
  }

  async rename(profile, oldPath, newPath) {
    const connection = await this.connect(profile);
    await callSftp(connection.sftp, 'rename', normalizeRemotePath(oldPath), normalizeRemotePath(newPath));
    return true;
  }

  async remove(profile, remotePath, directory = false) {
    const connection = await this.connect(profile);
    await callSftp(connection.sftp, directory ? 'rmdir' : 'unlink', normalizeRemotePath(remotePath));
    return true;
  }

  async readText(profileInput, remotePath, limit = 1_000_000) {
    const connection = await this.connect(profileInput);
    const source = normalizeRemotePath(remotePath);
    const stat = await callSftp(connection.sftp, 'stat', source);
    if (isDirectory(stat)) throw new Error('Remote text editor can only open files');
    const size = Number(stat?.size || 0);
    if (size > limit) throw new Error(`Remote file is too large for inline editing (${size} bytes)`);
    const localPath = path.join(os.tmpdir(), `aux-command-remote-edit-${randomUUID()}`);
    try {
      await new Promise((resolve, reject) => {
        connection.sftp.fastGet(source, localPath, (error) => error ? reject(error) : resolve());
      });
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
    const partialPath = `${target}.aux-command-${randomUUID()}.part`;
    const localPath = path.join(os.tmpdir(), `aux-command-remote-edit-${randomUUID()}`);
    try {
      fs.writeFileSync(localPath, text, { mode: 0o600 });
      await new Promise((resolve, reject) => {
        connection.sftp.fastPut(localPath, partialPath, (error) => error ? reject(error) : resolve());
      });
      await replaceRemoteFile(connection.sftp, partialPath, target);
    } catch (error) {
      try { await callSftp(connection.sftp, 'unlink', partialPath); } catch { /* best effort cleanup */ }
      throw error;
    } finally {
      try { fs.rmSync(localPath, { force: true }); } catch { /* best effort cleanup */ }
    }
    return true;
  }

  async upload(profileInput, localPath, remotePath) {
    const connection = await this.connect(profileInput);
    if (!path.isAbsolute(localPath)) throw new Error('Local upload path must be absolute');
    const target = normalizeRemotePath(remotePath);
    await new Promise((resolve, reject) => {
      connection.sftp.fastPut(localPath, target, {
        step: (transferred, chunk, total) => this.#emit('sftp:progress', {
          profileId: connection.profile.id,
          direction: 'upload',
          path: target,
          transferred,
          total
        })
      }, (error) => error ? reject(error) : resolve());
    });
    return true;
  }

  async download(profileInput, remotePath, localPath) {
    const connection = await this.connect(profileInput);
    if (!path.isAbsolute(localPath)) throw new Error('Local download path must be absolute');
    const source = normalizeRemotePath(remotePath);
    const partialPath = `${localPath}.aux-command-${randomUUID()}.part`;
    try {
      await new Promise((resolve, reject) => {
        connection.sftp.fastGet(source, partialPath, {
          mode: 0o600,
          step: (transferred, chunk, total) => this.#emit('sftp:progress', {
            profileId: connection.profile.id,
            direction: 'download',
            path: source,
            transferred,
            total
          })
        }, (error) => error ? reject(error) : resolve());
      });
      fs.chmodSync(partialPath, 0o600);
      fs.renameSync(partialPath, localPath);
      fs.chmodSync(localPath, 0o600);
    } catch (error) {
      try { fs.rmSync(partialPath, { force: true }); } catch { /* best effort cleanup */ }
      throw error;
    }
    return true;
  }

  disconnect(profileId) {
    const connection = this.connections.get(profileId);
    if (!connection) return false;
    this.connections.delete(profileId);
    try { connection.sftp?.end?.(); } catch { /* already closed */ }
    try { connection.client?.end?.(); } catch { /* already closed */ }
    try { connection.proxy?.socket?.destroy?.(); } catch { /* already closed */ }
    try { connection.proxy?.child?.kill?.('SIGTERM'); } catch { /* already closed */ }
    return true;
  }

  disconnectAll() {
    for (const profileId of [...this.connections.keys()]) this.disconnect(profileId);
  }

  #emit(channel, payload) {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

module.exports = { SftpService, createOpenSshProxy, isDirectory, modeToString };
