'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { AiAssistService, normalizeAiConfig, buildMessages, cleanCommandReply } = require('../src/main/services/ai-assist.cjs');
const { normalizeAiSettings } = require('../src/main/lib/settings-store.cjs');

function fakeStores(config) {
  const settings = { ai: { enabled: false, endpoint: '', model: '', ...config } };
  const secrets = new Map();
  return {
    settingsStore: {
      get: () => settings,
      saveAi(input) { settings.ai = normalizeAiSettings(input); return settings; }
    },
    vaultService: {
      has: (id) => secrets.has(id),
      set: async (id, secret) => { secrets.set(id, secret); },
      get: async (id) => secrets.get(id) || '',
      delete: async (id) => { secrets.delete(id); }
    },
    secrets
  };
}

test('AI config normalization is fail-closed', () => {
  assert.deepEqual(normalizeAiSettings(undefined), { enabled: false, endpoint: '', model: '' });
  // enabling without an endpoint is impossible
  assert.equal(normalizeAiSettings({ enabled: true }).enabled, false);
  assert.equal(normalizeAiSettings({ enabled: true, endpoint: 'ftp://x' }).enabled, false);
  assert.equal(normalizeAiSettings({ enabled: true, endpoint: 'http://127.0.0.1:8080' }).enabled, true);
  assert.throws(() => normalizeAiConfig({ endpoint: 'file:///etc/passwd' }), /http\(s\)/u);
});

test('AI messages carry OS context and bounded output', () => {
  const command = buildMessages('command', 'list files', { osLabel: 'Fedora', output: 'x'.repeat(10_000) });
  assert.match(command[0].content, /Fedora/u);
  assert.match(command[0].content, /command only/u);
  assert.ok(command[1].content.length < 8000);

  const explain = buildMessages('explain', '', { output: 'error: foo' });
  assert.match(explain[0].content, /explain terminal output/iu);
  assert.match(explain[1].content, /error: foo/u);
});

test('command replies are unwrapped from fences and prompts', () => {
  assert.equal(cleanCommandReply('```bash\nls -la\n```'), 'ls -la');
  assert.equal(cleanCommandReply('$ df -h'), 'df -h');
  assert.equal(cleanCommandReply('  uptime  '), 'uptime');
});

test('ask() posts an OpenAI-compatible request with the vault key and parses the reply', async () => {
  let seen = null;
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      seen = { url: request.url, auth: request.headers.authorization, body: JSON.parse(body) };
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content: '```\ndu -sh /var/log/*\n```' } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const { settingsStore, vaultService } = fakeStores({ enabled: true, endpoint: `http://127.0.0.1:${port}` , model: 'test-model' });
    const service = new AiAssistService(settingsStore, vaultService);
    await service.configure({ enabled: true, endpoint: `http://127.0.0.1:${port}`, model: 'test-model', apiKey: 'sk-secret' });
    const result = await service.ask({ kind: 'command', prompt: 'disk usage of logs', context: { osLabel: 'Fedora' } });
    assert.equal(result.reply, 'du -sh /var/log/*');
    assert.equal(result.model, 'test-model');
    assert.equal(seen.url, '/v1/chat/completions');
    assert.equal(seen.auth, 'Bearer sk-secret');
    assert.equal(seen.body.model, 'test-model');
    assert.equal(seen.body.stream, false);
    assert.equal(seen.body.messages.length, 2);
  } finally {
    server.close();
  }
});

test('ask() refuses when disabled and surfaces endpoint errors', async () => {
  const { settingsStore, vaultService } = fakeStores({});
  const service = new AiAssistService(settingsStore, vaultService);
  await assert.rejects(() => service.ask({ kind: 'command', prompt: 'x' }), /not enabled/u);

  const failing = http.createServer((request, response) => { response.statusCode = 500; response.end('boom'); });
  await new Promise((resolve) => failing.listen(0, '127.0.0.1', resolve));
  try {
    const stores = fakeStores({ enabled: true, endpoint: `http://127.0.0.1:${failing.address().port}` });
    const failingService = new AiAssistService(stores.settingsStore, stores.vaultService);
    await assert.rejects(() => failingService.ask({ kind: 'command', prompt: 'x' }), /returned 500/u);
  } finally {
    failing.close();
  }
});

test('configure stores the key in the vault, never in settings', async () => {
  const { settingsStore, vaultService, secrets } = fakeStores({});
  const service = new AiAssistService(settingsStore, vaultService);
  const status = await service.configure({ enabled: true, endpoint: 'http://127.0.0.1:9', model: 'm', apiKey: 'topsecret' });
  assert.equal(status.hasKey, true);
  assert.equal(JSON.stringify(settingsStore.get()).includes('topsecret'), false);
  assert.equal(secrets.get('ai-assist'), 'topsecret');
  await service.configure({ enabled: false, endpoint: '', model: '', apiKey: '' });
  assert.equal(secrets.has('ai-assist'), false);
});

test('AI assist is wired renderer → preload → ipc and off by default', () => {
  const root = path.join(__dirname, '..');
  const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/preload/index.cjs'), 'utf8');
  const ipc = fs.readFileSync(path.join(root, 'src/main/ipc.cjs'), 'utf8');
  const mainIndex = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  assert.match(renderer, /async function openAiAssistModal\(\)/u);
  assert.match(renderer, /event\.key\.toLowerCase\(\) === 'a'\) run\(\(\) => openAiAssistModal\(\)\)/u);
  assert.match(renderer, /label: 'Ask AI'/u);
  assert.match(renderer, /Replies are inserted, never executed/u);
  assert.match(preload, /ask: \(request\) => invoke\('ai:ask', request\)/u);
  assert.match(ipc, /handle\('ai:ask', \(request\) => aiAssist\.ask\(request\)\)/u);
  assert.match(ipc, /aiAssist,/u);
  assert.match(mainIndex, /new AiAssistService\(settingsStore, vaultService\)/u);
  assert.match(mainIndex, /aiAssist\s*\}/u);
});
