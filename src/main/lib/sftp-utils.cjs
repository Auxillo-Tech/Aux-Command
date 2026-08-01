'use strict';

function modeToString(mode = 0) {
  const numericMode = Number(mode) || 0;
  const type = (numericMode & 0o170000) === 0o040000 ? 'd' : (numericMode & 0o170000) === 0o120000 ? 'l' : '-';
  const bits = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001];
  const chars = ['r', 'w', 'x', 'r', 'w', 'x', 'r', 'w', 'x'];
  return type + bits.map((bit, index) => (numericMode & bit ? chars[index] : '-')).join('');
}

function isDirectory(attrs = {}) {
  if (typeof attrs.isDirectory === 'function') return Boolean(attrs.isDirectory());
  return (Number(attrs.mode) & 0o170000) === 0o040000;
}

function safeTimestampToIso(seconds) {
  const numeric = Number(seconds);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  const date = new Date(numeric * 1000);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function connectionSignature(profile) {
  return JSON.stringify({
    host: profile.host,
    port: profile.port,
    username: profile.username,
    identityFile: profile.identityFile,
    proxyJump: profile.proxyJump,
    credentialId: profile.credentialId,
    credentialKind: profile.credentialKind,
    keepAliveSeconds: profile.keepAliveSeconds,
    compression: profile.compression
  });
}

function parseProxyJump(value) {
  const source = String(value || '');
  if (!source || /\s/u.test(source) || source.startsWith('-')) throw new Error('Invalid ProxyJump target');
  if (source.includes(',')) throw new Error('parseProxyJump takes a single hop; use parseProxyJumpChain for chains');

  const at = source.lastIndexOf('@');
  const username = at >= 0 ? source.slice(0, at) : '';
  let hostPart = at >= 0 ? source.slice(at + 1) : source;
  if (!hostPart || (at >= 0 && !username)) throw new Error('Invalid ProxyJump target');

  let host = hostPart;
  let port = 22;
  if (hostPart.startsWith('[')) {
    const closing = hostPart.indexOf(']');
    if (closing < 2) throw new Error('Invalid ProxyJump IPv6 target');
    host = hostPart.slice(1, closing);
    const suffix = hostPart.slice(closing + 1);
    if (suffix) {
      if (!/^:\d+$/u.test(suffix)) throw new Error('Invalid ProxyJump port');
      port = Number(suffix.slice(1));
    }
  } else {
    const colonCount = (hostPart.match(/:/gu) || []).length;
    if (colonCount === 1) {
      const separator = hostPart.lastIndexOf(':');
      const possiblePort = hostPart.slice(separator + 1);
      if (/^\d+$/u.test(possiblePort)) {
        host = hostPart.slice(0, separator);
        port = Number(possiblePort);
      }
    }
  }

  if (!host || port < 1 || port > 65535) throw new Error('Invalid ProxyJump target');
  return { host, port, username, destination: username ? `${username}@${host}` : host };
}

// A ProxyJump chain in OpenSSH -J form: "hop1,user@hop2:2222,hop3".
function parseProxyJumpChain(value) {
  const source = String(value || '').trim();
  if (!source) return [];
  const parts = source.split(',').map((part) => part.trim());
  if (parts.some((part) => !part)) throw new Error('Invalid ProxyJump chain');
  if (parts.length > 8) throw new Error('ProxyJump chains support at most 8 hops');
  return parts.map((part) => parseProxyJump(part));
}

// Rebuild a hop for OpenSSH -J syntax, restoring IPv6 brackets and ports.
function formatProxyJumpHop(hop) {
  const host = hop.host.includes(':') ? `[${hop.host}]` : hop.host;
  const withPort = hop.port === 22 ? host : `${host}:${hop.port}`;
  return hop.username ? `${hop.username}@${withPort}` : withPort;
}

function formatHostPort(host, port) {
  const value = String(host || '');
  if (!value) throw new Error('Host is required');
  return `${value.includes(':') && !value.startsWith('[') ? `[${value}]` : value}:${port}`;
}

module.exports = {
  connectionSignature,
  formatHostPort,
  formatProxyJumpHop,
  isDirectory,
  modeToString,
  parseProxyJumpChain,
  parseProxyJump,
  safeTimestampToIso
};
