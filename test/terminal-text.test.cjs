'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { plainTerminalText } = require('../src/main/lib/terminal-text.cjs');

test('transcripts are exported as the text a reader saw, without escape codes', () => {
  const raw = '\x1b[?2004h\x1b]0;user@host: ~\x07\x1b[01;32muser@host\x1b[00m:~$ ls\r\nfile\x1b[0m\r\nprogress 10%\rprogress 100%\r\nabc\b\bXY\r\n\x1bP+q544e\x1b\\done\x07\r\n';
  assert.equal(plainTerminalText(raw), 'user@host:~$ ls\nfile\nprogress 100%\naXY\ndone\n');
  assert.equal(plainTerminalText(''), '');
  assert.equal(plainTerminalText('tab\tkept'), 'tab\tkept');
});
