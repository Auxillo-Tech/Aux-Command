'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { JsonStore } = require('../lib/json-store.cjs');
async function hashFile(filename) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
class UpdateRecovery {
  constructor(directory) {
    this.directory = directory;
    this.store = new JsonStore(path.join(directory, 'previous.json'), {});
  }
  status() {
    const value = this.store.get();
    return { recoveryAvailable: Boolean(value.file && /^[a-f0-9-]+\.AppImage$/u.test(value.file) && fs.existsSync(path.join(this.directory, value.file))), recoveryVersion: value.version || null };
  }
  async prepare(filename, version) {
    const stat = await fs.promises.stat(filename);
    if (!stat.isFile()) throw new Error('Current AppImage is not a regular file');
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const file = `${randomUUID()}.AppImage`, destination = path.join(this.directory, file);
    const previous = this.store.get();
    try {
      await fs.promises.copyFile(filename, destination, fs.constants.COPYFILE_EXCL);
      await fs.promises.chmod(destination, 0o700);
      const digest = await hashFile(destination);
      if (digest !== await hashFile(filename)) throw new Error('Current AppImage changed while creating recovery copy');
      this.store.replace({ file, version, sha256: digest, createdAt: new Date().toISOString() });
    } catch (error) { fs.rmSync(destination, { force: true }); throw error; }
    if (previous.file && /^[a-f0-9-]+\.AppImage$/u.test(previous.file)) fs.rmSync(path.join(this.directory, previous.file), { force: true });
    return this.status();
  }
  async restore(filename) {
    const value = this.store.get();
    if (!this.status().recoveryAvailable) throw new Error('No previous AppImage is available');
    const source = path.join(this.directory, value.file);
    if (await hashFile(source) !== value.sha256) throw new Error('Recovery AppImage checksum does not match');
    if (!path.isAbsolute(filename)) throw new Error('AppImage restore path must be absolute');
    const temporary = path.join(path.dirname(filename), `.aux-restore-${randomUUID()}.AppImage`);
    try {
      await fs.promises.copyFile(source, temporary, fs.constants.COPYFILE_EXCL);
      await fs.promises.chmod(temporary, 0o755);
      if (await hashFile(temporary) !== value.sha256) throw new Error('Restored AppImage checksum does not match');
      await fs.promises.rename(temporary, filename);
    } finally { await fs.promises.rm(temporary, { force: true }); }
    return { restored: true, version: value.version, filePath: filename };
  }
}
module.exports = { UpdateRecovery };
