'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TerminalDirectoryTracker, BASH_DIRECTORY_HOOK } = require('../src/main/lib/terminal-directory.cjs');
const { execFileSync } = require('node:child_process');
test('OSC directory reports handle chunk boundaries, escaping and invalid URIs', () => {
 const tracker = new TerminalDirectoryTracker();
 assert.equal(tracker.feed('prompt\x1b]7;file://server/tmp/a%20'), '');
 assert.equal(tracker.feed('b%23%C3%A9\x1b'), '');
 assert.equal(tracker.feed('\\$ '), '/tmp/a b#é');
 for (const uri of ['https://server/tmp','file:///tmp/%00bad','file:///tmp/%0Abad','file:///tmp/%zz','file:///tmp?query']) assert.equal(tracker.feed(`\x1b]7;${uri}\x07`),'');
 assert.equal(tracker.feed('x'.repeat(100000)), '');assert.ok(tracker.pending.length<=16390);
 assert.equal(tracker.feed('\x1b]7;file:///etc\x07'),'/etc');
});
test('Bash directory hook encodes shell metacharacters and Unicode without executing path text', () => {
 execFileSync('bash',['-n'],{input:BASH_DIRECTORY_HOOK});
 const hook=BASH_DIRECTORY_HOOK.split('\n').slice(1).join('\n');
 const out=execFileSync('bash',['--noprofile','--norc','-c',hook+'\nPWD="/tmp/a b#é"; __aux_command_report_cwd'],{encoding:'utf8'});
 assert.equal(new TerminalDirectoryTracker().feed(out),'/tmp/a b#é');
});
