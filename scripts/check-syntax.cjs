'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', 'dist', 'release', '.git']);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (/\.(?:cjs|js)$/u.test(entry.name)) files.push(filename);
  }
}

walk(root);
let failures = 0;
for (const filename of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    process.stderr.write(`\nSyntax error in ${path.relative(root, filename)}\n${result.stderr || result.stdout}\n`);
  }
}

if (failures) {
  process.stderr.write(`\n${failures} file(s) failed syntax validation.\n`);
  process.exit(1);
}
process.stdout.write(`Syntax validated for ${files.length} JavaScript files.\n`);

const pythonFiles = [
  path.join(root, 'src/main/helpers/pty_bridge.py'),
  path.join(root, 'src/main/helpers/serial_bridge.py'),
  path.join(root, 'src/main/helpers/telnet_bridge.py')
];
for (const filename of fs.readdirSync(path.join(root, 'scripts'))) {
  if (filename.endsWith('.py')) pythonFiles.push(path.join(root, 'scripts', filename));
}
for (const filename of pythonFiles) {
  const pythonResult = spawnSync('python3', [
    '-c',
    'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"), filename=sys.argv[1])',
    filename
  ], { encoding: 'utf8' });
  if (pythonResult.status !== 0) {
    process.stderr.write(`Python syntax error in ${path.relative(root, filename)}\n${pythonResult.stderr || pythonResult.stdout}\n`);
    process.exit(1);
  }
}
process.stdout.write(`Syntax validated for ${pythonFiles.length} Python files.\n`);

const shellFiles = fs.readdirSync(path.join(root, 'scripts'))
  .filter((filename) => filename.endsWith('.sh'))
  .map((filename) => path.join(root, 'scripts', filename));
for (const filename of shellFiles) {
  const result = spawnSync('bash', ['-n', filename], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(`Shell syntax error in ${path.relative(root, filename)}
${result.stderr || result.stdout}
`);
    process.exit(1);
  }
}
process.stdout.write(`Syntax validated for ${shellFiles.length} shell scripts.
`);
