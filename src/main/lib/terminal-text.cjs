'use strict';

// Turns a raw terminal stream into the plain text a reader saw: escape
// sequences (colours, titles, cursor and mode changes) are dropped, carriage
// returns and backspaces overwrite as they do on screen, and other control
// characters are removed. Used for transcript export, save and print; the
// raw stream is kept for replay and detached windows.
function plainTerminalText(input) {
  const text = String(input || '')
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/gu, '')
    .replace(/\x1b[P^_X][\s\S]*?\x1b\\/gu, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/\x9b[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/\x1b[ -/]*[0-~]/gu, '');
  const lines = [];
  for (const raw of text.split('\n')) {
    const cells = [];
    let column = 0;
    for (const char of raw) {
      if (char === '\r') { column = 0; continue; }
      if (char === '\b') { column = Math.max(0, column - 1); continue; }
      if ((char < ' ' && char !== '\t') || char === '\x7f' || (char >= '\x80' && char <= '\x9f')) continue;
      cells[column] = char;
      column += 1;
    }
    lines.push(Array.from(cells, (cell) => cell ?? ' ').join('').replace(/\s+$/u, ''));
  }
  return lines.join('\n');
}

module.exports = { plainTerminalText };
