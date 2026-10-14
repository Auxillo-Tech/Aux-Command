'use strict';

// Optional AI command assist. Strictly off by default and bring-your-own
// endpoint: the app never bundles or contacts any AI service on its own.
// Works with any OpenAI-compatible chat-completions server (llama.cpp,
// Ollama, vLLM, OpenAI, …). The API key lives encrypted in the vault and
// never travels to the renderer.

const MAX_PROMPT_CHARS = 4000;
const MAX_CONTEXT_CHARS = 6000;
const REQUEST_TIMEOUT_MS = 60_000;
const KEY_VAULT_ID = 'ai-assist';
const MAX_RESPONSE_BYTES = 1_000_000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

// The API key and terminal output travel with every request, so remote
// endpoints must use HTTPS. Plain HTTP is accepted only for a model server on
// this computer (llama.cpp, Ollama) or one reached through an SSH tunnel.
function assertEndpoint(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('AI endpoint must be an http(s) URL'); }
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return;
  if (url.protocol === 'http:') throw new Error('AI endpoints on other machines must use HTTPS (plain HTTP is allowed only for localhost; an SSH tunnel also works)');
  throw new Error('AI endpoint must be an http(s) URL');
}

async function readLimited(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new Error('AI endpoint reply is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

function normalizeAiConfig(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const endpoint = String(source.endpoint || '').trim().slice(0, 500);
  if (endpoint) assertEndpoint(endpoint);
  return {
    enabled: Boolean(source.enabled) && Boolean(endpoint),
    endpoint,
    model: String(source.model || '').trim().slice(0, 200)
  };
}

function buildMessages(kind, prompt, context) {
  const osLabel = context?.osLabel ? ` The target operating system is ${context.osLabel}.` : '';
  const output = String(context?.output || '').slice(-MAX_CONTEXT_CHARS);
  if (kind === 'explain') {
    return [
      { role: 'system', content: 'You explain terminal output for a system operator. Be concise and concrete: what happened, whether it is an error, and what to check next. Plain text only.' },
      { role: 'user', content: `${prompt ? `${prompt}\n\n` : ''}Terminal output:\n${output}` }
    ];
  }
  return [
    { role: 'system', content: `You convert natural-language requests into a single shell command.${osLabel} Reply with the command only — no markdown fences, no commentary, no leading $. If the request is destructive, still answer but keep it as safe as possible.` },
    { role: 'user', content: output ? `${prompt}\n\nRecent session output for context:\n${output}` : prompt }
  ];
}

// Model replies sometimes arrive fenced despite instructions; unwrap them.
function cleanCommandReply(text) {
  let reply = String(text || '').trim();
  const fenced = reply.match(/^```[a-z]*\n([\s\S]*?)```$/u);
  if (fenced) reply = fenced[1].trim();
  if (reply.startsWith('$ ')) reply = reply.slice(2);
  // A command reply is inserted into a terminal, so control characters that
  // would act as keypresses (Enter, Ctrl chords, escapes) are removed.
  return reply.replace(/\r\n?/gu, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/gu, '');
}

class AiAssistService {
  constructor(settingsStore, vaultService) {
    this.settingsStore = settingsStore;
    this.vaultService = vaultService;
  }

  status() {
    const config = this.settingsStore.get().ai;
    return { ...config, hasKey: this.vaultService.has(KEY_VAULT_ID) };
  }

  async configure(input = {}) {
    const config = normalizeAiConfig(input);
    this.settingsStore.saveAi(config);
    if (typeof input.apiKey === 'string') {
      if (input.apiKey) await this.vaultService.set(KEY_VAULT_ID, input.apiKey, true);
      else await this.vaultService.delete(KEY_VAULT_ID);
    }
    return this.status();
  }

  async ask(request = {}) {
    const config = this.settingsStore.get().ai;
    if (!config.enabled || !config.endpoint) throw new Error('AI assist is not enabled');
    assertEndpoint(config.endpoint);
    const kind = request.kind === 'explain' ? 'explain' : 'command';
    const prompt = String(request.prompt || '').slice(0, MAX_PROMPT_CHARS);
    if (kind === 'command' && !prompt.trim()) throw new Error('Describe what the command should do');

    const url = `${config.endpoint.replace(/\/+$/u, '')}/v1/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    const apiKey = await this.vaultService.get(KEY_VAULT_ID).catch(() => '');
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    let payload;
    try {
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          signal: controller.signal,
          redirect: 'error',
          body: JSON.stringify({
            model: config.model || 'default',
            messages: buildMessages(kind, prompt, request.context),
            temperature: kind === 'command' ? 0.2 : 0.4,
            max_tokens: 700,
            stream: false
          })
        });
      } catch (error) {
        throw new Error(error?.name === 'AbortError' ? 'AI endpoint timed out after 60 s' : `AI endpoint unreachable: ${error?.message || error}`);
      }
      if (!response.ok) {
        const body = await readLimited(response, 16_384).catch(() => '');
        throw new Error(`AI endpoint returned ${response.status}: ${body.slice(0, 300)}`);
      }
      // The timeout also covers reading the body, and the body is capped.
      let body;
      try { body = await readLimited(response, MAX_RESPONSE_BYTES); }
      catch (error) { throw new Error(error?.name === 'AbortError' ? 'AI endpoint timed out after 60 s' : error.message); }
      try { payload = JSON.parse(body); } catch { throw new Error('AI endpoint returned invalid JSON'); }
    } finally {
      clearTimeout(timer);
    }
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('AI endpoint returned an empty reply');
    return {
      kind,
      reply: kind === 'command' ? cleanCommandReply(text) : text.trim(),
      model: payload.model || config.model || ''
    };
  }
}

module.exports = { AiAssistService, normalizeAiConfig, buildMessages, cleanCommandReply };
