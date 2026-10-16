const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const runner = path.resolve(__dirname, '../scripts/run-ui-qualification.py');

function execute({ electron, script = 'raise SystemExit(0)', env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-qualification-test-'));
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  const fakeElectron = path.join(bin, 'fake-electron');
  const server = path.join(dir, 'fake-electron.py');
  fs.writeFileSync(server, [
    'import http.server, json, os',
    'class Handler(http.server.BaseHTTPRequestHandler):',
    ' def do_GET(self):',
    '  body=json.dumps([{"title":"Aux Command"}]).encode()',
    '  self.send_response(200); self.end_headers(); self.wfile.write(body)',
    ' def log_message(self, *args): pass',
    'http.server.HTTPServer(("127.0.0.1", int(os.environ["AUX_COMMAND_CDP_PORT"])), Handler).serve_forever()'
  ].join('\n'));
  fs.writeFileSync(fakeElectron, electron ? `#!/bin/sh\n${electron}\n` : `#!/bin/sh\nexec python3 '${server}'\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'xvfb-run'), '#!/bin/sh\nshift\nexec "$@"\n', { mode: 0o755 });
  const scriptPath = path.join(dir, 'fake-ui.py');
  fs.writeFileSync(scriptPath, `import sys\n${script}\n`);
  const result = spawnSync('python3', [runner], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, AUX_PACKAGE_EXECUTABLE: fakeElectron,
      AUX_UI_SCRIPTS: scriptPath, AUX_UI_SCRIPT_TIMEOUT: '0.1', AUX_UI_READY_TIMEOUT: '0.5', ...env }
  });
  const output = result.stdout + result.stderr;
  fs.rmSync(dir, { recursive: true, force: true });
  return { ...result, output };
}

test('startup failure prints useful bounded redacted Electron log and exit code', () => {
  const r = execute({ electron: `echo 'Electron startup error café' >&2; echo '{"token":"SYNTHETIC_JSON_SECRET", "api_key":"SYNTHETIC_API_SECRET", "password":"SYNTHETIC_PASSWORD_SECRET", "authorization":"Bearer SYNTHETIC_BEARER_SECRET"}' >&2; exit 7` });
  assert.notEqual(r.status, 0); assert.match(r.output, /Electron startup error café/); assert.match(r.output, /exit code 7/i);
  for (const s of ['SYNTHETIC_JSON_SECRET', 'SYNTHETIC_API_SECRET', 'SYNTHETIC_PASSWORD_SECRET', 'SYNTHETIC_BEARER_SECRET']) assert.ok(!r.output.includes(s));
});

test('redacts quoted full values, access/refresh tokens and URL query credentials', () => {
  const r = execute({ electron: `printf '%s\\n' 'password="SYNTHETIC_FIRST SYNTHETIC_SUFFIX" access_token=SYNTHETIC_ACCESS_SECRET refresh_token:SYNTHETIC_REFRESH_SECRET https://example.invalid/?token=SYNTHETIC_URL_SECRET&api_key=SYNTHETIC_QUERY_SECRET' >&2; exit 2` });
  assert.notEqual(r.status, 0);
  for (const s of ['SYNTHETIC_FIRST', 'SYNTHETIC_SUFFIX', 'SYNTHETIC_ACCESS_SECRET', 'SYNTHETIC_REFRESH_SECRET', 'SYNTHETIC_URL_SECRET', 'SYNTHETIC_QUERY_SECRET']) assert.ok(!r.output.includes(s), s);
});

test('drops incomplete partial tail lines with or without a final newline', () => {
  const r = execute({ electron: `python3 -c 'import sys; sys.stderr.write("token="+"X"*6100+"SYNTHETIC_CUT_SECRET\\nElectron failed")'; exit 1` });
  assert.ok(!r.output.includes('SYNTHETIC_CUT_SECRET')); assert.match(r.output, /Electron failed/);
  const r2 = execute({ electron: `python3 -c 'import sys; sys.stderr.write("token="+"X"*6100+"SYNTHETIC_NO_NEWLINE_SECRET")'; exit 1` });
  assert.ok(!r2.output.includes('SYNTHETIC_NO_NEWLINE_SECRET'));
});

test('redacts standalone bearer credentials and URL user information', () => {
  const r = execute({ electron: `printf '%s\\n' 'Bearer SYNTHETIC_BARE_BEARER' 'https://demo:SYNTHETIC_URL_PASSWORD@example.invalid/failure' >&2; exit 6` });
  assert.notEqual(r.status, 0);
  assert.match(r.output, /exit code 6/);
  for (const secret of ['SYNTHETIC_BARE_BEARER', 'SYNTHETIC_URL_PASSWORD']) {
    assert.ok(!r.output.includes(secret), `credential leaked: ${secret}`);
  }
});

test('caps post-redaction UTF-8 output bytes, not only characters', () => {
  const r = execute({ electron: `python3 -c 'import sys; sys.stderr.write(("\\U0001F600 token=x\\n"*10000)+"FINAL_UTF8_LOG_LINE\\n")'; exit 8` });
  assert.notEqual(r.status, 0);
  assert.match(r.output, /FINAL_UTF8_LOG_LINE/);
  assert.ok(Buffer.byteLength(r.output, 'utf8') < 12500, `output bytes ${Buffer.byteLength(r.output, 'utf8')}`);
});

test('log reader bounds each read even if the producer keeps writing', () => {
  const code = [
    'import ast, io, pathlib, re, sys',
    'source = ast.parse(pathlib.Path(sys.argv[1]).read_text())',
    'nodes = [n for n in source.body if isinstance(n, ast.FunctionDef) and n.name in ("redact", "diagnostic")]',
    'class GrowingLog(io.BytesIO):',
    ' def read(self, size=-1):',
    '  assert 0 <= size <= 8192, "unbounded log read"',
    '  return super().read(size)',
    'scope = {"open": lambda *a, **k: GrowingLog(b"final error\\n"), "os": __import__("os"), "re": re, "LOG_TAIL_BYTES": 8192, "LOG_OUTPUT_CHARS": 12000, "LOG_OUTPUT_BYTES": 12000}',
    'exec(compile(ast.Module(body=nodes, type_ignores=[]), "runner-functions", "exec"), scope)',
    'assert scope["diagnostic"]("fixture.log") == "final error"'
  ].join('\n');
  const r = spawnSync('python3', ['-c', code, runner], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('successful desktop readiness and UI script flow remains intact', () => {
  const r = execute();
  assert.equal(r.status, 0, r.output); assert.match(r.output, /fake-ui.py: passed/);
});

test('script failure reports applicable log and preserves nonzero result', () => {
  const r = execute({ script: 'raise SystemExit(9)' });
  assert.notEqual(r.status, 0); assert.match(r.output, /fake-ui.py failed/); assert.match(r.output, /fake-ui.py.log/);
});

test('script timeout reports effective configured timeout', () => {
  const r = execute({ script: 'import time; time.sleep(2)' });
  assert.notEqual(r.status, 0); assert.match(r.output, /timed out after 0\.1 seconds/i); assert.match(r.output, /fake-ui.py.log/);
});

test('readiness timeout includes bounded Electron diagnostics', () => {
  const r = execute({ electron: 'echo "readiness diagnostic" >&2; sleep 2' });
  assert.notEqual(r.status, 0); assert.match(r.output, /did not become ready/); assert.match(r.output, /readiness diagnostic/);
  assert.match(r.output, /last readiness error: URLError/);
});

test('missing log is explicit and large log retains bounded useful complete tail', () => {
  const missing = execute({ electron: 'rm -f "$AUX_UI_LOG_PATH"; exit 4' });
  assert.notEqual(missing.status, 0); assert.match(missing.output, /log unavailable/i); assert.match(missing.output, /exit code 4/i);
  const large = execute({ electron: `python3 -c 'import sys; sys.stderr.write("prefix\\n"+"token="+"X"*20000+"SYNTHETIC_LARGE_SUFFIX\\nFinal Electron failure\\n")'; exit 3` });
  assert.notEqual(large.status, 0); assert.match(large.output, /Final Electron failure/); assert.ok(!large.output.includes('SYNTHETIC_LARGE_SUFFIX'));
  assert.ok(large.output.length < 15000, `output length ${large.output.length}`);
  const expanded = execute({ electron: `python3 -c 'import sys; sys.stderr.write("token=x\\n"*10000+"FINAL_EXPANDED_LOG_LINE\\n")'; exit 5` });
  assert.notEqual(expanded.status, 0); assert.match(expanded.output, /FINAL_EXPANDED_LOG_LINE/);
  assert.ok(expanded.output.length < 15000, `redacted output length ${expanded.output.length}`);
});
