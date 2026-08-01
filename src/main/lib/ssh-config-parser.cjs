'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeProfile } = require('./validation.cjs');

function stripInlineComment(line) {
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && (!quote || quote === char)) quote = quote ? '' : char;
    if (char === '#' && !quote && (index === 0 || /\s/u.test(line[index - 1]))) return line.slice(0, index);
  }
  return line;
}

function tokenize(value) {
  const result = [];
  let current = '';
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/u.test(char)) {
      if (current) result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) result.push(current);
  return result;
}

// Resolve one Include pattern the way OpenSSH does for user configs:
// "~" expands to the home directory, relative paths are relative to ~/.ssh,
// and glob characters are supported in the final path segment.
function resolveIncludePattern(pattern, baseDir) {
  let candidate = String(pattern || '').trim();
  if (!candidate) return [];
  if (candidate.startsWith('~')) candidate = path.join(os.homedir(), candidate.slice(1));
  if (!path.isAbsolute(candidate)) candidate = path.join(baseDir, candidate);
  const directory = path.dirname(candidate);
  const base = path.basename(candidate);
  const hasGlob = /[*?]/u.test(base);
  if (/[*?]/u.test(directory)) return []; // mid-path globs are not supported
  try {
    if (!hasGlob) {
      return fs.statSync(candidate).isFile() ? [candidate] : [];
    }
    const matcher = new RegExp(`^${base
      .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
      .replace(/\*/gu, '.*')
      .replace(/\?/gu, '.')}$`, 'u');
    return fs.readdirSync(directory)
      .filter((name) => matcher.test(name))
      .sort()
      .map((name) => path.join(directory, name))
      .filter((file) => {
        try { return fs.statSync(file).isFile(); } catch { return false; }
      });
  } catch {
    return [];
  }
}

// Inline Include directives so the sequential parser sees one flat document,
// which matches how OpenSSH treats included content at the include point.
function expandIncludes(content, baseDir, visited = new Set(), depth = 0) {
  if (depth > 8) return '';
  const output = [];
  for (const rawLine of String(content).split(/\r?\n/u)) {
    const line = stripInlineComment(rawLine).trim();
    const match = line.match(/^include\s*(?:=\s*)?(.+)$/iu);
    if (!match) {
      output.push(rawLine);
      continue;
    }
    for (const pattern of tokenize(match[1])) {
      for (const file of resolveIncludePattern(pattern, baseDir)) {
        const key = path.resolve(file);
        if (visited.has(key)) continue;
        visited.add(key);
        try {
          output.push(expandIncludes(fs.readFileSync(file, 'utf8'), path.dirname(file), visited, depth + 1));
        } catch {
          // Unreadable include files are skipped, matching a permissive import.
        }
      }
    }
  }
  return output.join('\n');
}

function parseSshConfig(content) {
  const records = [];
  let currentRecords = [];

  for (const rawLine of String(content).split(/\r?\n/u)) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;
    const match = line.match(/^([^\s=]+)\s*(?:=\s*)?(.*)$/u);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    const scalarValue = tokenize(value)[0] || '';

    if (key === 'match') {
      currentRecords = [];
      continue;
    }

    if (key === 'host') {
      currentRecords = tokenize(value)
        .filter((alias) => alias && !alias.includes('*') && !alias.includes('?') && !alias.startsWith('!'))
        .map((alias) => ({ alias }));
      records.push(...currentRecords);
      continue;
    }
    if (!currentRecords.length) continue;

    for (const current of currentRecords) {
      // OpenSSH uses the first obtained value for most keywords. Preserve that behavior.
      if (key === 'hostname' && current.host === undefined) current.host = scalarValue;
      else if (key === 'user' && current.username === undefined) current.username = scalarValue;
      else if (key === 'port' && current.port === undefined) current.port = Number(scalarValue);
      else if (key === 'identityfile' && current.identityFile === undefined) current.identityFile = scalarValue.replace(/^~(?=\/)/u, os.homedir());
      else if (key === 'proxyjump' && current.proxyJump === undefined) current.proxyJump = scalarValue;
      else if (key === 'compression' && current.compression === undefined) current.compression = /^yes$/iu.test(scalarValue);
      else if (key === 'forwardagent' && current.agentForwarding === undefined) current.agentForwarding = /^yes$/iu.test(scalarValue);
    }
  }

  const profiles = [];
  for (const record of records) {
    try {
      profiles.push(normalizeProfile({
        name: record.alias,
        protocol: 'ssh',
        group: 'Imported from SSH config',
        host: record.host || record.alias,
        sshAlias: record.alias,
        port: Number.isInteger(record.port) && record.port >= 1 && record.port <= 65535 ? record.port : 22,
        username: record.username || '',
        identityFile: record.identityFile || '',
        proxyJump: record.proxyJump || '',
        compression: record.compression || false,
        agentForwarding: record.agentForwarding || false,
        useSshConfig: true
      }));
    } catch {
      // Skip malformed or option-like aliases without blocking valid imports.
    }
  }
  return profiles;
}

function readDefaultSshConfig() {
  const sshDir = path.join(os.homedir(), '.ssh');
  const filename = path.join(sshDir, 'config');
  if (!fs.existsSync(filename)) return [];
  const visited = new Set([path.resolve(filename)]);
  return parseSshConfig(expandIncludes(fs.readFileSync(filename, 'utf8'), sshDir, visited));
}

module.exports = { expandIncludes, parseSshConfig, readDefaultSshConfig, resolveIncludePattern, stripInlineComment, tokenize };
