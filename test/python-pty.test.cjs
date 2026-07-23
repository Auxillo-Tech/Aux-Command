'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { PythonPty, resolvePtyHelper, serializeSpec } = require('../src/main/lib/python-pty.cjs');

function runPty(spec, interact) {
  return new Promise((resolve, reject) => {
    const terminal = new PythonPty(spec);
    let output = '';
    const timeout = setTimeout(() => {
      terminal.kill('SIGKILL');
      reject(new Error(`PTY test timed out. Output: ${JSON.stringify(output)}`));
    }, 5_000);
    timeout.unref();

    terminal.onData((data) => { output += data; });
    terminal.onExit((result) => {
      clearTimeout(timeout);
      resolve({ ...result, output });
    });
    interact?.(terminal);
  });
}

test('resolves the PTY helper outside an Electron ASAR archive', () => {
  const packaged = path.join(path.sep, 'opt', 'Aux Command', 'resources', 'app.asar', 'src', 'main', 'lib');
  assert.equal(
    resolvePtyHelper(packaged),
    path.join(path.sep, 'opt', 'Aux Command', 'resources', 'app.asar.unpacked', 'src', 'main', 'helpers', 'pty_bridge.py')
  );
  assert.equal(
    resolvePtyHelper(path.join(path.sep, 'workspace', 'src', 'main', 'lib')),
    path.join(path.sep, 'workspace', 'src', 'main', 'helpers', 'pty_bridge.py')
  );
});

test('serializes PTY specifications without shell interpolation', () => {
  const value = { command: '/bin/printf', args: ['%s', 'a;$(touch nope)'] };
  assert.deepEqual(JSON.parse(serializeSpec(value)), value);
});

test('runs an interactive command in a PTY, resizes it and preserves exit status', async () => {
  const result = await runPty({
    command: '/bin/sh',
    args: ['-c', 'sleep 0.15; stty size; IFS= read -r value; printf "INPUT:%s\\n" "$value"; exit 7'],
    cwd: os.tmpdir(),
    env: { ...process.env, TERM: 'xterm-256color' },
    cols: 80,
    rows: 24
  }, (terminal) => {
    terminal.resize(100, 40);
    setTimeout(() => terminal.write('hello from aux command\n'), 250);
  });

  assert.match(result.output, /40 100/);
  assert.match(result.output, /INPUT:hello from aux command/);
  assert.equal(result.exitCode, 7);
  assert.equal(result.signal, null);
});

test('terminates a running PTY process', async () => {
  const result = await new Promise((resolve, reject) => {
    const terminal = new PythonPty({
      command: '/bin/sh',
      args: ['-c', 'printf "READY\\n"; sleep 30'],
      cwd: os.tmpdir(),
      env: { ...process.env, TERM: 'xterm-256color' },
      cols: 80,
      rows: 24
    });
    let output = '';
    const timeout = setTimeout(() => {
      terminal.kill('SIGKILL');
      reject(new Error(`PTY termination test timed out. Output: ${JSON.stringify(output)}`));
    }, 5_000);
    terminal.onData((data) => {
      output += data;
      if (output.includes('READY')) terminal.kill();
    });
    terminal.onExit((exit) => {
      clearTimeout(timeout);
      resolve({ ...exit, output });
    });
  });

  assert.match(result.output, /READY/);
  assert.ok(result.exitCode === 143 || result.signal === 'SIGTERM');
});
