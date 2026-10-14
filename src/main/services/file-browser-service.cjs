'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID, createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { normalizeProfile } = require('../lib/validation.cjs');
function absolute(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0') || value.length > 4096) throw new Error('An absolute file path is required');
  return path.normalize(value);
}
async function statOrNull(filename) {
  try { return await fs.lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function signature(entry) { return entry?.directory ? 'directory' : entry ? `file:${entry.size || 0}:${entry.modifiedAt || ''}` : ''; }
class FileBrowserService {
  constructor(serviceFor, queue) { this.serviceFor = serviceFor; this.queue = queue; this.plans = new Map(); }
  async localList(directory = os.homedir()) {
    const resolved = await fs.realpath(absolute(directory || os.homedir()));
    const names = await fs.readdir(resolved, { withFileTypes: true });
    if (names.length > 10000) throw new Error('This directory exceeds the 10,000-entry browser limit');
    const entries = [];
    for (let offset = 0; offset < names.length; offset += 32) {
      const rows = await Promise.all(names.slice(offset, offset + 32).map(async (name) => {
        try {
          const filename = path.join(resolved, name.name), stat = await fs.stat(filename);
          if (!stat.isFile() && !stat.isDirectory()) return null;
          return { name: name.name, path: filename, directory: stat.isDirectory(), size: stat.size, modifiedAt: stat.mtime.toISOString(), symlink: name.isSymbolicLink() };
        } catch { return null; }
      }));
      entries.push(...rows.filter(Boolean));
    }
    return { path: resolved, parent: path.dirname(resolved), entries };
  }
  async plan({ profile: input, direction, paths, directory }, rootLimit = 256) {
    const profile = normalizeProfile(input);
    if (!['ssh', 'ftp', 'ftps'].includes(profile.protocol)) throw new Error('Select a file-transfer connection');
    if (!['upload', 'download'].includes(direction)) throw new Error('Invalid transfer direction');
    if (!Array.isArray(paths) || !paths.length || paths.length > rootLimit) throw new Error(`Select between 1 and ${rootLimit} files or folders`);
    const destination = direction === 'download' ? await fs.realpath(absolute(directory)) : absolute(directory);
    const service = this.serviceFor(profile);
    const remoteCache = new Map(), missing = new Set(), items = [], targets = new Set();
    const started = Date.now();
    const list = async (parent) => {
      if (!remoteCache.has(parent)) remoteCache.set(parent, await service.list(profile, parent));
      return remoteCache.get(parent);
    };
    if (direction === 'upload') await list(destination);
    else if (!(await fs.stat(destination)).isDirectory()) throw new Error('Choose a local destination directory');
    const localEntry = async (filename) => {
      const stat = await statOrNull(filename);
      return stat ? { directory: stat.isDirectory(), symlink: stat.isSymbolicLink(), regular: stat.isFile(), size: stat.size, modifiedAt: stat.mtime.toISOString() } : null;
    };
    const targetEntry = async (filename) => {
      if (direction === 'download') return localEntry(filename);
      const parent = path.dirname(filename);
      if (missing.has(parent)) return null;
      return (await list(parent)).find((entry) => entry.name === path.basename(filename));
    };
    const visit = async (source, relative, depth) => {
      if (depth > 32 || items.length >= 4096 || Date.now() - started > 60000) throw new Error('Folder review limit exceeded (4,096 entries, 32 levels or 60 seconds); select a smaller folder');
      const name = path.basename(source);
      if (!name || name === '.' || name === '..') throw new Error('Invalid source name');
      const entry = direction === 'upload' ? await localEntry(source) : (await list(path.dirname(source))).find((row) => row.name === name);
      if (!entry) throw new Error(`Source is unavailable: ${source}`);
      assertRegularOrDirectory(entry, source);
      const targetPath = path.join(destination, relative);
      if (targets.has(targetPath)) throw new Error(`Multiple sources have the destination name ${relative}`);
      targets.add(targetPath);
      const target = await targetEntry(targetPath);
      if (target) {
        assertRegularOrDirectory(target, targetPath);
        if (Boolean(target.directory) !== Boolean(entry.directory)) throw new Error(`File/folder type conflict at destination: ${relative}`);
      }
      if (entry.directory && !target) missing.add(targetPath);
      items.push({ name: relative, directory: Boolean(entry.directory),
        localPath: direction === 'upload' ? source : targetPath,
        remotePath: direction === 'upload' ? targetPath : source,
        size: entry.directory ? 0 : entry.size, conflict: Boolean(target && !entry.directory),
        destinationSignature: signature(target), sourceSignature: signature(entry) });
      if (entry.directory) {
        const children = direction === 'upload' ? (await fs.readdir(source)).map((name) => ({ name })) : await list(source);
        for (const child of children) {
          if (!child.name || ['.', '..'].includes(child.name) || child.name.includes('/') || child.name.includes('\0')) throw new Error('Unsafe name in directory listing');
          await visit(path.join(source, child.name), path.join(relative, child.name), depth + 1);
        }
      }
    };
    for (const source of [...new Set(paths)]) { const clean = absolute(source); await visit(clean, path.basename(clean), 0); }
    for (const [token, plan] of this.plans) if (plan.expires < Date.now()) this.plans.delete(token);
    if (this.plans.size >= 10) this.plans.delete(this.plans.keys().next().value);
    const token = randomUUID();
    this.plans.set(token, { profile, direction, directory: destination, items, expires: Date.now() + 300000 });
    return { token, direction, directory: destination, items: items.map(({ destinationSignature, sourceSignature, ...item }) => item) };
  }
  async checksum({ profile, localPath, remotePath }) {
    const local = absolute(localPath), remote = absolute(remotePath);
    const stat = await fs.lstat(local);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Choose a regular local file');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(local)) hash.update(chunk);
    const localHash = hash.digest('hex');
    const remoteHash = await this.serviceFor(normalizeProfile(profile)).checksum(profile, remote);
    return { algorithm: 'SHA-256', localHash, remoteHash, equal: localHash === remoteHash };
  }
  async search({ profile, directory, query }) {
    const service = this.serviceFor(normalizeProfile(profile));
    const root = absolute(directory), term = String(query || '').trim().toLocaleLowerCase();
    if (!term || term.length > 200) throw new Error('Enter a filename search of 1–200 characters');
    const pending = [{ directory: root, depth: 0 }], results = [];
    let visited = 0; const started = Date.now();
    while (pending.length && visited < 10000 && results.length < 500 && Date.now() - started < 30000) {
      const current = pending.shift();
      for (const entry of await service.list(profile, current.directory)) {
        if (++visited > 10000) break;
        if (!entry.name || entry.name.includes('/') || entry.name.includes('\0') || ['.', '..'].includes(entry.name)) continue;
        if (entry.symlink) continue;
        const filename = path.join(current.directory, entry.name);
        if (entry.name.toLocaleLowerCase().includes(term) && results.length < 500) results.push({ ...entry, path: filename });
        if (entry.directory && current.depth < 31) pending.push({ directory: filename, depth: current.depth + 1 });
      }
    }
    return { results, visited, limited: pending.length > 0 || visited >= 10000 || results.length >= 500 };
  }
  async compare({ profile, localDirectory, remoteDirectory, direction = 'upload', verify = false }) {
    if(!['upload','download'].includes(direction))throw new Error('Invalid comparison direction');
    const service = this.serviceFor(normalizeProfile(profile));
    const local = await this.localList(localDirectory), remote = absolute(remoteDirectory);
    const roots = direction === 'upload' ? local.entries : await service.list(profile, remote);
    if (!roots.length) return { items: [], unchanged: 0, token: '', direction, directory: direction === 'upload' ? remote : local.path };
    const plan = await this.plan({ profile, direction, paths: roots.map(e => direction === 'upload' ? e.path : path.join(remote, e.name)), directory: direction === 'upload' ? remote : local.path }, 4096);
    const internal = this.plans.get(plan.token); let unchanged = 0;
    for (const item of internal.items) {
      if (item.directory || !item.conflict) continue;
      const matches = verify ? (await this.checksum({ profile, localPath: item.localPath, remotePath: item.remotePath })).equal : item.sourceSignature === item.destinationSignature;
      if (matches) { item.unchanged = true; unchanged++; }
    }
    const reviewed = internal.items.map(({ destinationSignature, sourceSignature, ...item }) => item);
    internal.items = internal.items.filter(item => !item.unchanged);
    return { ...plan, items: internal.items.map(({ destinationSignature, sourceSignature, ...item }) => item), comparison: reviewed, unchanged, verified: Boolean(verify) };
  }
  async apply(token, policy = 'skip') {
    const plan = this.plans.get(token);
    if (!plan || plan.expires < Date.now()) { this.plans.delete(token); throw new Error('Transfer review expired; select the files again'); }
    if (!['skip', 'replace', 'rename'].includes(policy)) throw new Error('Invalid conflict policy');
    this.plans.delete(token);
    const service = this.serviceFor(plan.profile), cache = new Map(), absent = new Set(), prepared = [], directories = [];
    const list = async (parent) => { if (!cache.has(parent)) cache.set(parent, await service.list(plan.profile, parent)); return cache.get(parent); };
    const localEntry = async (filename) => {
      const stat = await statOrNull(filename);
      return stat ? { directory: stat.isDirectory(), symlink: stat.isSymbolicLink(), regular: stat.isFile(), size: stat.size, modifiedAt: stat.mtime.toISOString() } : null;
    };
    const remoteEntry = async (filename) => (await list(path.dirname(filename))).find((row) => row.name === path.basename(filename));
    // Check the chosen root again before checking descendants; never follow a substituted local link.
    if (plan.direction === 'download') {
      const root = await localEntry(plan.directory);
      if (!root || !root.directory || root.symlink || await fs.realpath(plan.directory) !== plan.directory) throw new Error('Destination directory changed since review');
    } else await list(plan.directory);
    for (const source of plan.items) {
      const item = { ...source };
      const sourcePath = plan.direction === 'upload' ? item.localPath : item.remotePath;
      const sourceNow = plan.direction === 'upload' ? await localEntry(sourcePath) : await remoteEntry(sourcePath);
      if (!sourceNow) throw new Error(`Source changed since review: ${item.name}`);
      assertRegularOrDirectory(sourceNow, sourcePath);
      if (signature(sourceNow) !== item.sourceSignature) throw new Error(`Source changed since review: ${item.name}`);
      const targetPath = plan.direction === 'upload' ? item.remotePath : item.localPath;
      const target = absent.has(path.dirname(targetPath)) ? null : plan.direction === 'upload' ? await remoteEntry(targetPath) : await localEntry(targetPath);
      if (target) assertRegularOrDirectory(target, targetPath);
      if (signature(target) !== item.destinationSignature) throw new Error(`Destination changed since review: ${item.name}`);
      if (item.directory) {
        if (!target) { absent.add(targetPath); directories.push(item); }
        continue;
      }
      if (item.conflict && policy === 'skip') continue;
      if (item.conflict && policy === 'rename') {
        const extension = path.extname(targetPath), base = targetPath.slice(0, targetPath.length - extension.length);
        const renamed = `${base}-${randomUUID().slice(0, 8)}${extension}`;
        if (plan.direction === 'upload') item.remotePath = renamed; else item.localPath = renamed;
      }
      prepared.push(item);
    }
    // Complete preflight before creating folders or enqueueing file writes.
    for (const item of directories) {
      if (plan.direction === 'upload') await service.mkdir(plan.profile, item.remotePath);
      else await fs.mkdir(item.localPath); // parents precede children; no recursive link following
    }
    const transfers = prepared.map((item) => this.queue.enqueue({ profile: plan.profile, direction: plan.direction, localPath: item.localPath, remotePath: item.remotePath }));
    return { queued: transfers.length, directories: directories.length, skipped: plan.items.filter((item) => !item.directory).length - transfers.length, transfers };
  }
}
function assertRegularOrDirectory(entry, filename) {
  const kind = (entry.mode || 0) & 0o170000;
  if (entry.symlink || kind === 0o120000) throw new Error(`Symbolic links are not followed in transfers: ${filename}`);
  if (!entry.directory && (entry.regular === false || (kind && kind !== 0o100000))) throw new Error(`Source or destination is not a regular file: ${filename}`);
}
module.exports = { FileBrowserService };
