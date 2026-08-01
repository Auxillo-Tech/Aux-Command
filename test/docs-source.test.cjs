'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('documentation reflects bundled Telnet and serial bridges', () => {
  const docs = [
    read('README.md'),
    read('docs/ARCHITECTURE.md'),
    read('docs/SECURITY.md'),
    read('docs/RELEASE_STATUS.md')
  ].join('\n---\n');

  assert.match(docs, /bundled Python 3 Telnet bridge/u);
  assert.match(docs, /bundled Python 3 raw serial bridge/u);
  assert.doesNotMatch(docs, /Picocom and Telnet installations/u);
  assert.doesNotMatch(docs, /Optional tools missing[^\n]*picocom[^\n]*telnet/u);
});

test('documentation captures RDP VNC X11 integration decision', () => {
  const architecture = read('docs/ARCHITECTURE.md');
  const roadmap = read('docs/ROADMAP.md');

  assert.match(architecture, /Remote desktop integration decision/u);
  assert.match(architecture, /external-client boundary kept as an automatic fallback/u);
  assert.match(architecture, /X11 forwarding uses OpenSSH -X/u);
  assert.match(architecture, /single-use 32-byte token/u);
  assert.match(roadmap, /Embedded VNC .* and embedded RDP/u);
});
