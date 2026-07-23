'use strict';

const { spawn } = require('node:child_process');
const { buildExternalCommand } = require('../lib/command-builder.cjs');
const { findExecutable } = require('../lib/executable-finder.cjs');

class ExternalService {
  async launch(profile) {
    const spec = buildExternalCommand(profile);
    const executable = findExecutable(spec.candidates);
    if (!executable) {
      throw new Error(`No supported client found. Install one of: ${spec.candidates.join(', ')}`);
    }
    return new Promise((resolve, reject) => {
      const child = spawn(executable, spec.args, {
        detached: true,
        stdio: 'ignore',
        shell: false
      });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve({ pid: child.pid, executable });
      });
    });
  }
}

module.exports = { ExternalService, findExecutable };
