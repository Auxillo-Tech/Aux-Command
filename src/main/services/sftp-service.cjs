'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Duplex } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { Client } = require('ssh2');
const { resolveHelper } = require('../lib/command-builder.cjs');
const { findExecutable } = require('../lib/executable-finder.cjs');
const { expandHome, normalizeProfile, normalizeRemotePath } = require('../lib/validation.cjs');
const {
  connectionSignature, formatHostPort, formatProxyJumpHop, isDirectory, modeToString, parseProxyJumpChain, safeTimestampToIso
} = require('../lib/sftp-utils.cjs');

function spawnGuarded(command, args, stdio) {
  const python = findExecutable(['python3', 'python']);
  if (!python) throw new Error('Python 3 is required to own SSH/SCP process lifecycles');
  const executable = findExecutable([command]);
  if (!executable) throw new Error(`${command} is not installed`);
  return spawn(python, [
    resolveHelper('process_guard.py'),
    '--parent-pid', String(process.pid),
    '--ready-fd', '3',
    '--', executable, ...args
  ], { stdio: [...stdio, 'pipe'], shell: false, env: process.env });
}

function quoteRemotePath(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function scpTarget(profile, remotePath) {
  const destination = profile.useSshConfig && profile.sshAlias ? profile.sshAlias : profile.host;
  const login = profile.username ? `${profile.username}@${destination}` : destination;
  return `${login}:${quoteRemotePath(remotePath)}`;
}

function scpCommonOptions(profile, portFlag) {
  if (profile.credentialId) throw new Error('SCP fallback supports SSH agent or identity-file authentication only; stored account passwords require SFTP.');
  // StrictHostKeyChecking=yes: the headless scp fallback must never trust an
  // unverified host key on its own; the interactive SSH terminal path is where
  // keys get verified and recorded.
  const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes'];
  if (!profile.useSshConfig || profile.port !== 22) args.push(portFlag, String(profile.port));
  if (profile.identityFile) args.push('-i', expandHome(profile.identityFile));
  if (profile.knownHostsFile) args.push('-o', `UserKnownHostsFile=${expandHome(profile.knownHostsFile)}`);
  if (profile.proxyJump) args.push('-J', profile.proxyJump);
  if (profile.compression) args.push('-C');
  return args;
}

function scpArgs(profile, source, destination) {
  const args = ['-O', '-T', '-B', ...scpCommonOptions(profile, '-P')];
  args.push(source, destination);
  return args;
}

function sshCommandArgs(profile, remoteCommand) {
  const destination = profile.useSshConfig && profile.sshAlias ? profile.sshAlias : profile.host;
  const login = profile.username ? `${profile.username}@${destination}` : destination;
  return [...scpCommonOptions(profile, '-p'), '--', login, remoteCommand];
}

function describeScpError(stderr) {
  const detail = String(stderr || '').trim();
  if (/host key verification failed|no matching host key|remote host identification has changed/iu.test(detail)) {
    return `${detail}\nThe SCP fallback only connects to hosts whose keys are already trusted. Open an SSH terminal session to this host first to verify and record its key, or set a per-profile known-hosts file.`;
  }
  return detail;
}

function runScp(profile, args, options = {}, command = 'scp') {
  return new Promise((resolve, reject) => {
    const child = spawnGuarded(command, args, ['ignore', 'ignore', 'pipe']);
    let stderr = '';
    let settled = false;
    const abortError = () => {
      const error = new Error('SCP transfer aborted');
      error.name = 'AbortError';
      return error;
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => {
      try { child.kill('SIGTERM'); } catch { /* already exited */ }
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener('abort', onAbort, { once: true });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-8192); });
    child.once('error', (error) => finish(error));
    child.once('exit', (code, signal) => {
      if (options.signal?.aborted) finish(abortError());
      else if (code === 0) finish();
      else finish(new Error((describeScpError(stderr) || `${command} exited with ${signal || `code ${code}`}`).replaceAll(profile.identityFile || '\0', '[identity-file]')));
    });
  });
}

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
    return;
  } catch (initialError) {
    const backupPath = `${targetPath}.aux-backup-${randomUUID()}`;
    let backedUp = false;
    try {
      await callSftp(sftp, 'rename', targetPath, backupPath);
      backedUp = true;
    } catch (backupError) {
      const missing = backupError?.code === 2 || /no such file|not found/i.test(String(backupError?.message || ''));
      if (!missing) throw initialError;
    }

    try {
      await callSftp(sftp, 'rename', partialPath, targetPath);
    } catch (replacementError) {
      if (backedUp) {
        try { await callSftp(sftp, 'rename', backupPath, targetPath); }
        catch (rollbackError) {
          throw new AggregateError([replacementError, rollbackError], 'Remote replacement failed and the original file could not be restored');
        }
      }
      throw replacementError;
    }
    if (backedUp) {
      try { await callSftp(sftp, 'unlink', backupPath); } catch { /* a harmless backup may remain for manual recovery */ }
    }
  }
}

function createOpenSshProxy(profile) {
  // OpenSSH performs the hop-to-hop chaining itself: earlier hops ride the -J
  // option while the final hop carries the -W stream to the destination.
  const hops = parseProxyJumpChain(profile.proxyJump);
  const finalHop = hops[hops.length - 1];
  const args = [
    '-T',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=15'
  ];
  if (profile.knownHostsFile) args.push('-o', `UserKnownHostsFile=${expandHome(profile.knownHostsFile)}`);
  if (hops.length > 1) args.push('-J', hops.slice(0, -1).map(formatProxyJumpHop).join(','));
  if (finalHop.port !== 22) args.push('-p', String(finalHop.port));
  args.push('-W', formatHostPort(profile.host, profile.port), finalHop.destination);
  const child = spawnGuarded('ssh', args, ['pipe', 'pipe', 'pipe']);

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
    if (profile.transferMode === 'scp') throw new Error('SCP transfer mode does not support directory browsing; use upload/download fallback actions only.');
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
    const profile = normalizeProfile(profileInput, profileInput?.id);
    if (profile.transferMode === 'scp') throw new Error('SCP transfer mode does not support directory browsing');
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
    // A private 0700 staging directory keeps remote file contents away from
    // other local users while the download lands in the shared temp root.
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-command-remote-edit-'));
    const localPath = path.join(tempDir, 'remote-edit');
    try {
      await new Promise((resolve, reject) => {
        connection.sftp.fastGet(source, localPath, (error) => error ? reject(error) : resolve());
      });
      return fs.readFileSync(localPath, 'utf8');
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort cleanup */ }
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

  async upload(profileInput, localPath, remotePath, options = {}) {
    const profile = normalizeProfile(profileInput, profileInput?.id);
    if (profile.transferMode === 'scp') return this.#scpUpload(profile, localPath, remotePath, options);
    const connection = await this.connect(profileInput);
    if (!path.isAbsolute(localPath)) throw new Error('Local upload path must be absolute');
    const target = normalizeRemotePath(remotePath);
    const stat = fs.statSync(localPath);
    if (!stat.isFile()) throw new Error('SFTP uploads regular files only');
    const partialPath = `${target}.aux-command-${options.transferId || randomUUID()}.part`;
    let offset = 0;
    if (options.offset > 0) {
      try {
        const remoteStat = await callSftp(connection.sftp, 'stat', partialPath);
        offset = Math.min(stat.size, Number(remoteStat?.size || 0));
      } catch { offset = 0; }
    }
    let transferred = offset;
    const source = fs.createReadStream(localPath, { start: offset });
    const destination = connection.sftp.createWriteStream(partialPath, {
      flags: offset > 0 ? 'r+' : 'w',
      start: offset,
      mode: stat.mode & 0o777
    });
    const report = () => {
      options.onProgress?.(transferred, stat.size);
      this.#emit('sftp:progress', {
        profileId: connection.profile.id,
        direction: 'upload',
        path: target,
        transferred,
        total: stat.size
      });
    };
    report();
    source.on('data', (chunk) => { transferred += chunk.length; report(); });
    try {
      await pipeline(source, destination, { signal: options.signal });
      await replaceRemoteFile(connection.sftp, partialPath, target);
    } catch (error) {
      if (!options.transferId) {
        try { await callSftp(connection.sftp, 'unlink', partialPath); } catch { /* best effort cleanup */ }
      }
      throw error;
    }
    return true;
  }

  async download(profileInput, remotePath, localPath, options = {}) {
    const profile = normalizeProfile(profileInput, profileInput?.id);
    if (profile.transferMode === 'scp') return this.#scpDownload(profile, remotePath, localPath, options);
    const connection = await this.connect(profileInput);
    if (!path.isAbsolute(localPath)) throw new Error('Local download path must be absolute');
    const source = normalizeRemotePath(remotePath);
    const partialPath = `${localPath}.aux-command-${options.transferId || randomUUID()}.part`;
    const remoteStat = await callSftp(connection.sftp, 'stat', source);
    const total = Number(remoteStat?.size || 0);
    const offset = options.offset > 0 && fs.existsSync(partialPath)
      ? Math.min(total, fs.statSync(partialPath).size)
      : 0;
    let transferred = offset;
    try {
      const remote = connection.sftp.createReadStream(source, { start: offset });
      const local = fs.createWriteStream(partialPath, {
        flags: offset > 0 ? 'r+' : 'w',
        start: offset,
        mode: 0o600
      });
      const report = () => {
        options.onProgress?.(transferred, total);
        this.#emit('sftp:progress', {
          profileId: connection.profile.id,
          direction: 'download',
          path: source,
          transferred,
          total
        });
      };
      report();
      remote.on('data', (chunk) => { transferred += chunk.length; report(); });
      await pipeline(remote, local, { signal: options.signal });
      fs.chmodSync(partialPath, 0o600);
      fs.renameSync(partialPath, localPath);
      fs.chmodSync(localPath, 0o600);
    } catch (error) {
      if (!options.transferId) {
        try { fs.rmSync(partialPath, { force: true }); } catch { /* best effort cleanup */ }
      }
      throw error;
    }
    return true;
  }

  async #scpUpload(profile, localPath, remotePath, options = {}) {
    if (!path.isAbsolute(localPath)) throw new Error('Local upload path must be absolute');
    const target = normalizeRemotePath(remotePath);
    const stat = fs.statSync(localPath);
    if (!stat.isFile()) throw new Error('SCP fallback uploads regular files only');
    // Upload to a remote .part path and move into place so a cancelled or
    // failed transfer never leaves a truncated file at the destination.
    const partialPath = `${target}.aux-command-${randomUUID()}.part`;
    await runScp(profile, scpArgs(profile, localPath, scpTarget(profile, partialPath)), options);
    try {
      await runScp(
        profile,
        sshCommandArgs(profile, `mv -f -- ${quoteRemotePath(partialPath)} ${quoteRemotePath(target)}`),
        options,
        'ssh'
      );
    } catch (error) {
      try {
        await runScp(profile, sshCommandArgs(profile, `rm -f -- ${quoteRemotePath(partialPath)}`), {}, 'ssh');
      } catch { /* best effort cleanup */ }
      throw error;
    }
    this.#emit('sftp:progress', {
      profileId: profile.id,
      direction: 'upload',
      path: target,
      transferred: stat.size,
      total: stat.size
    });
    return true;
  }

  async #scpDownload(profile, remotePath, localPath, options = {}) {
    if (!path.isAbsolute(localPath)) throw new Error('Local download path must be absolute');
    const source = normalizeRemotePath(remotePath);
    const partialPath = `${localPath}.aux-command-${randomUUID()}.part`;
    // Stage next to the destination: os.tmpdir() is routinely a different
    // filesystem (tmpfs), where the final rename would fail with EXDEV.
    const tempDir = fs.mkdtempSync(path.join(path.dirname(localPath), '.aux-command-scp-download-'));
    const fetchedPath = path.join(tempDir, path.posix.basename(source));
    try {
      await runScp(profile, scpArgs(profile, scpTarget(profile, source), tempDir), options);
      fs.renameSync(fetchedPath, partialPath);
      fs.renameSync(partialPath, localPath);
      fs.chmodSync(localPath, 0o600);
      const size = fs.statSync(localPath).size;
      this.#emit('sftp:progress', {
        profileId: profile.id,
        direction: 'download',
        path: source,
        transferred: size,
        total: size
      });
    } catch (error) {
      try { fs.rmSync(partialPath, { force: true }); } catch { /* best effort cleanup */ }
      throw error;
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort cleanup */ }
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
    const profile = normalizeProfile(profileInput, profileInput?.id);
    if (profile.transferMode === 'scp') return false;
    const connection = await this.connect(profile);
    const partialPath = `${normalizeRemotePath(remotePath)}.aux-command-${transferId}.part`;
    try { await callSftp(connection.sftp, 'unlink', partialPath); } catch { /* best effort */ }
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

module.exports = { SftpService, createOpenSshProxy, isDirectory, modeToString, replaceRemoteFile };
