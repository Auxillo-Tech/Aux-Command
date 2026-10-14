'use strict';

// Aux Command serves its own pages from private custom origins instead of
// file://. With file:// every local file shares one origin and 'self' in the
// CSP matches any file on disk; here only an allowlist of the app's own files
// can load.
//   app://aux        workspace and detached terminal windows (preload API)
//   aux-vnc://viewer embedded VNC/RDP viewer. noVNC parses data sent by the
//                    remote server, so it gets its own origin and cannot reach
//                    the workspace's preload API through window.parent.
const fs = require('node:fs/promises');
const path = require('node:path');

const SCHEME = 'aux-vnc';
const HOST = 'viewer';
const ORIGIN = `${SCHEME}://${HOST}`;
const APP_SCHEME = 'app';
const APP_HOST = 'aux';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

const APP_PREFIXES = [
  '/src/renderer/',
  '/src/shared/',
  '/node_modules/@xterm/xterm/css/',
  '/node_modules/@xterm/xterm/lib/',
  '/node_modules/@xterm/addon-fit/lib/',
  '/node_modules/@xterm/addon-search/lib/'
];
// The viewer page is reachable only on its own origin.
const VIEWER_ONLY = new Set(['/src/renderer/vnc.html', '/src/renderer/vnc.js']);

function vncViewerUrl(query) {
  return `${ORIGIN}/vnc.html?${query}`;
}

function appUrl(relative) {
  return `${APP_ORIGIN}/${relative.replace(/^\/+/u, '')}`;
}

function cleanPath(url, scheme, host) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== `${scheme}:` || parsed.host !== host) return null;
  let pathname;
  try { pathname = decodeURIComponent(parsed.pathname); } catch { return null; }
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  return path.posix.normalize(pathname);
}

function within(appRoot, relative) {
  const root = path.resolve(appRoot);
  const file = path.resolve(root, relative);
  return file.startsWith(root + path.sep) ? file : null;
}

// Maps a viewer URL to a file under appRoot. Only the viewer page, its script
// and the noVNC library are served; everything else is refused.
function resolveVncFile(url, appRoot) {
  const clean = cleanPath(url, SCHEME, HOST);
  if (!clean) return null;
  // dialog-i18n.js is plain translation data so the viewer follows the app language.
  if (clean === '/vnc.html' || clean === '/vnc.js' || clean === '/dialog-i18n.js') return within(appRoot, path.join('src', 'renderer', clean.slice(1)));
  if (clean.startsWith('/node_modules/@novnc/novnc/') && clean.endsWith('.js')) return within(appRoot, clean.slice(1));
  return null;
}

function resolveAppFile(url, appRoot) {
  const clean = cleanPath(url, APP_SCHEME, APP_HOST);
  if (!clean || VIEWER_ONLY.has(clean) || !CONTENT_TYPES[path.posix.extname(clean)]) return null;
  if (!APP_PREFIXES.some((prefix) => clean.startsWith(prefix))) return null;
  return within(appRoot, clean.slice(1));
}

function registerAppSchemes(protocol) {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true } },
    { scheme: SCHEME, privileges: { standard: true, secure: true } }
  ]);
}

function serve(resolve, appRoot) {
  return async (request) => {
    const file = request.method === 'GET' ? resolve(request.url, appRoot) : null;
    if (!file) return new Response('Not found', { status: 404 });
    try {
      const body = await fs.readFile(file);
      return new Response(body, { headers: { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  };
}

function handleAppProtocols(protocol, appRoot) {
  protocol.handle(APP_SCHEME, serve(resolveAppFile, appRoot));
  protocol.handle(SCHEME, serve(resolveVncFile, appRoot));
}

module.exports = { SCHEME, ORIGIN, APP_ORIGIN, vncViewerUrl, appUrl, resolveVncFile, resolveAppFile, registerAppSchemes, handleAppProtocols };
