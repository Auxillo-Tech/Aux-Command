'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const BRIDGE = path.join(__dirname, '../src/main/helpers/telnet_bridge.py');

function runParser(chunksExpression) {
  const script = [
    'import importlib.util, json, sys',
    `spec = importlib.util.spec_from_file_location('telnet_bridge', ${JSON.stringify(BRIDGE)})`,
    'mod = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(mod)',
    'parser = mod.TelnetParser()',
    'output = bytearray()',
    'replies = bytearray()',
    `for chunk in ${chunksExpression}:`,
    '    out, rep = parser.feed(bytes(chunk))',
    '    output.extend(out)',
    '    replies.extend(rep)',
    'print(json.dumps({"output": list(output), "replies": list(replies)}))'
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' }));
}

test('telnet parser handles IAC negotiation split across recv boundaries', () => {
  // IAC DO(253) option 1, split between two chunks; then plain text.
  const result = runParser('[[104, 105, 255], [253, 1, 33]]');
  assert.deepEqual(result.output, [104, 105, 33], 'text bytes survive around the split command');
  assert.deepEqual(result.replies, [255, 252, 1], 'a WONT reply is produced for the split DO');
});

test('telnet parser handles escaped IAC and subnegotiation across boundaries', () => {
  // IAC IAC (escaped 255) split across chunks → single literal 255 in output.
  const escaped = runParser('[[255], [255, 65]]');
  assert.deepEqual(escaped.output, [255, 65]);
  // Subnegotiation IAC SB ... IAC SE split across chunks → fully swallowed.
  const sub = runParser('[[255, 250, 31, 0], [80, 0, 24, 255], [240, 66]]');
  assert.deepEqual(sub.output, [66], 'subnegotiation content is stripped even when split');
});
