'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveVncFile, vncViewerUrl, ORIGIN } = require('../src/main/lib/app-protocol.cjs');

const root = path.join(__dirname, '..');

test('VNC viewer is served from its own origin, not file://', () => {
  assert.equal(ORIGIN, 'aux-vnc://viewer');
  assert.equal(vncViewerUrl('url=x&port=5900'), 'aux-vnc://viewer/vnc.html?url=x&port=5900');
});

test('VNC protocol serves only the viewer and noVNC scripts', () => {
  assert.equal(resolveVncFile('aux-vnc://viewer/vnc.html?url=ws', root), path.join(root, 'src/renderer/vnc.html'));
  assert.equal(resolveVncFile('aux-vnc://viewer/vnc.js', root), path.join(root, 'src/renderer/vnc.js'));
  assert.equal(resolveVncFile('aux-vnc://viewer/node_modules/@novnc/novnc/core/rfb.js', root), path.join(root, 'node_modules/@novnc/novnc/core/rfb.js'));
  for (const bad of [
    'aux-vnc://viewer/index.html',
    'aux-vnc://viewer/renderer.js',
    'aux-vnc://viewer/node_modules/@novnc/novnc/../../../package.json',
    'aux-vnc://viewer/node_modules/@novnc/novnc/%2e%2e/%2e%2e/%2e%2e/src/main/index.cjs',
    'aux-vnc://viewer/node_modules/@novnc/novnc/core/rfb.js%00.js',
    'aux-vnc://viewer/node_modules/@novnc/novnc/README.md',
    'aux-vnc://other/vnc.html',
    'file:///etc/passwd',
    'not a url'
  ]) assert.equal(resolveVncFile(bad, root), null, bad);
});

test('app pages come from app://aux and only the app\'s own files are served', () => {
  const { resolveAppFile, appUrl, APP_ORIGIN } = require('../src/main/lib/app-protocol.cjs');
  assert.equal(APP_ORIGIN, 'app://aux');
  assert.equal(appUrl('src/renderer/index.html'), 'app://aux/src/renderer/index.html');
  for (const ok of ['src/renderer/index.html', 'src/renderer/detached.html', 'src/renderer/renderer.js', 'src/renderer/styles.css', 'src/renderer/assets/aux-command-logo.png', 'src/renderer/assets/fonts/inter-latin-wght-normal.woff2', 'src/shared/preferences.js', 'node_modules/@xterm/xterm/lib/xterm.js', 'node_modules/@xterm/xterm/css/xterm.css', 'node_modules/@xterm/addon-fit/lib/addon-fit.js', 'node_modules/@xterm/addon-search/lib/addon-search.js']) {
    assert.equal(resolveAppFile(appUrl(ok), root), path.join(root, ok), ok);
  }
  for (const bad of [
    'app://aux/src/main/index.cjs',
    'app://aux/src/preload/index.cjs',
    'app://aux/package.json',
    'app://aux/src/renderer/vnc.html',
    'app://aux/src/renderer/../main/ipc.cjs',
    'app://aux/src/renderer/%2e%2e/main/ipc.cjs',
    'app://aux/node_modules/ssh2/lib/index.js',
    'app://aux/src/renderer/notes.txt',
    'app://evil/src/renderer/index.html',
    'file:///etc/passwd'
  ]) assert.equal(resolveAppFile(bad, root), null, bad);
});
