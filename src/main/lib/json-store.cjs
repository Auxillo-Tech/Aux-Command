'use strict';

const fs = require('node:fs');
const path = require('node:path');

class JsonStore {
  constructor(filename, defaults) {
    this.filename = filename;
    this.defaults = structuredClone(defaults);
    this.recovery = null;
    this.value = this.#read();
  }

  #read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('JSON store root must be an object');
      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') return structuredClone(this.defaults);
      if (!(error instanceof SyntaxError)) throw error;
      const quarantineFilename = `${this.filename}.corrupt-${Date.now()}`;
      fs.renameSync(this.filename, quarantineFilename);
      this.recovery = {
        reason: error.message,
        quarantineFilename,
        recoveredAt: new Date().toISOString()
      };
      process.stderr.write(`Aux Command quarantined malformed JSON store ${this.filename} as ${quarantineFilename}: ${error.message}\n`);
      return structuredClone(this.defaults);
    }
  }

  get() {
    return structuredClone(this.value);
  }

  replace(nextValue) {
    const next = structuredClone(nextValue);
    this.#write(next);
    this.value = next;
    return this.get();
  }

  update(mutator) {
    const draft = this.get();
    const result = mutator(draft) || draft;
    return this.replace(result);
  }

  #write(value) {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    const temp = `${this.filename}.${process.pid}.${Date.now()}.tmp`;
    try {
      // Flush the new contents before the rename and the rename itself after
      // it: without this a power cut can leave an empty or missing store.
      const fd = fs.openSync(temp, 'w', 0o600);
      try {
        fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      fs.renameSync(temp, this.filename);
      try {
        const directory = fs.openSync(path.dirname(this.filename), 'r');
        try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      } catch { /* directory sync is unsupported on some filesystems */ }
      try { fs.chmodSync(this.filename, 0o600); } catch { /* best effort on non-POSIX filesystems */ }
    } catch (error) {
      try { fs.rmSync(temp, { force: true }); } catch { /* best effort cleanup */ }
      throw error;
    }
  }
}

module.exports = { JsonStore };
