'use strict';

// Answers the prompts of one OpenSSH process through OpenSSH's own askpass
// mechanism. The ssh process is started with SSH_ASKPASS pointing at the
// bundled helper and SSH_ASKPASS_REQUIRE=force; the helper forwards each
// prompt to a private Unix socket owned by this process and prints the reply.
// The secret therefore never appears in an argument list, in the child's
// environment (which carries only the socket path and a random token), in the
// terminal stream or in a log.
//
// A prompt is answered from the vault only when it is OpenSSH's own password
// prompt for the profile's login, or its passphrase prompt for the profile's
// key. Host-key confirmations and every other prompt go to the user: as a
// dialog for background processes, or back to the terminal for a terminal
// session. A host key is never accepted on the user's behalf.

const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { resolveHelper } = require('./command-builder.cjs');
const { findExecutable } = require('./executable-finder.cjs');
const { english, message } = require('./prompt-message.cjs');
const { expandHome } = require('./validation.cjs');

const SOCKET_ENV = 'AUX_COMMAND_ASKPASS_SOCKET';
const TOKEN_ENV = 'AUX_COMMAND_ASKPASS_TOKEN';
const MAX_REQUEST_BYTES = 16_384;
const MAX_PROMPT_CHARS = 8192;
// OpenSSH reads at most 1023 bytes from the helper and stops at a line end.
const MAX_ANSWER_BYTES = 1000;
const REQUEST_TIMEOUT_MS = 5000;
const PROMPT_TIMEOUT_MS = 120_000;
const MAX_CONNECTIONS = 8;
const MAX_REJECTED_REQUESTS = 8;
// sockaddr_un holds 108 bytes including the terminator.
const MAX_SOCKET_PATH_BYTES = 100;

const PASSWORD_SUFFIX = "'s password: ";
const PASSPHRASE_PREFIX = "Enter passphrase for key '";
const PASSPHRASE_SUFFIX = "': ";
const HOST_KEY_PREFIXES = ['The authenticity of host ', 'Warning: the '];
const HOST_KEY_QUESTIONS = [
  'Are you sure you want to continue connecting (yes/no/[fingerprint])? ',
  'Are you sure you want to continue connecting (yes/no)? '
];
const HOST_KEY_RETRIES = ["Please type 'yes', 'no' or the fingerprint: ", "Please type 'yes' or 'no': "];

// Recognises OpenSSH's own prompts by their exact wording (see sshconnect.c
// and sshconnect2.c). Prompts sent by a server for keyboard-interactive
// sign-in are shown by OpenSSH as "(user@host) text", contain a space before
// the text and so can never be taken for one of these.
function classifyPrompt(input) {
  const prompt = typeof input === 'string' ? input : '';
  if (prompt.endsWith(PASSWORD_SUFFIX)) {
    const login = prompt.slice(0, -PASSWORD_SUFFIX.length);
    const at = login.lastIndexOf('@');
    if (at > 0 && at < login.length - 1 && !/\s/u.test(login)) {
      return { type: 'password', user: login.slice(0, at), host: login.slice(at + 1) };
    }
  }
  if (prompt.startsWith(PASSPHRASE_PREFIX) && prompt.endsWith(PASSPHRASE_SUFFIX) && !/[\r\n]/u.test(prompt)) {
    const keyPath = prompt.slice(PASSPHRASE_PREFIX.length, -PASSPHRASE_SUFFIX.length);
    if (keyPath) return { type: 'passphrase', keyPath };
  }
  if (HOST_KEY_PREFIXES.some((prefix) => prompt.startsWith(prefix))) {
    const question = HOST_KEY_QUESTIONS.find((text) => prompt.endsWith(`\n${text}`));
    if (question) return { type: 'host-key', details: prompt.slice(0, -question.length).trim() };
  }
  if (HOST_KEY_RETRIES.includes(prompt)) return { type: 'host-key', details: '' };
  return { type: 'other' };
}

function tokenMatches(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string' || !expected) return false;
  const left = crypto.createHash('sha256').update(expected).digest();
  const right = crypto.createHash('sha256').update(received).digest();
  return crypto.timingSafeEqual(left, right);
}

// Only a value OpenSSH can read back unchanged may be handed to it.
function usableAnswer(value) {
  return typeof value === 'string' && !/[\r\n\u0000]/u.test(value) && Buffer.byteLength(value, 'utf8') <= MAX_ANSWER_BYTES;
}

// What the installed OpenSSH client can do decides how far this goes:
//
//   below 8.4     SSH_ASKPASS_REQUIRE does not exist. The client would look
//                 for a terminal instead, so callers keep their previous
//                 behaviour (BatchMode, or an untouched terminal session).
//   8.4 to 8.6    Prompts can be redirected, so background processes show
//                 dialogs, but a saved credential is never released: every
//                 prompt goes to the user, as if nothing were saved.
//   8.7 or later  The saved credential answers OpenSSH's own prompts.
//
// The saved credential depends on telling OpenSSH's own prompts apart from
// text a server sends for keyboard-interactive sign-in. That is only
// possible when the client shows server text as "(user@host) text"; the 8.4
// client passes it on unmarked, so a server or jump host could send the
// exact wording of the password or passphrase prompt and be handed the
// secret. The prefix arrived in OpenSSH 8.5 (sshconnect2.c, release notes).
// The gate stays at 8.7 on purpose: 8.5 and 8.6 have not been run as real
// binaries here, only read from source, and a gate that is too strict only
// costs a dialog, while one that is too loose hands a secret to a server.
const FORCED_ASKPASS_VERSION = [8, 4];
const SAVED_CREDENTIAL_VERSION = [8, 7];
const clientVersions = new Map();
function clientVersion(executable) {
  if (typeof executable !== 'string' || !executable) return null;
  if (clientVersions.has(executable)) return clientVersions.get(executable);
  let version = null;
  try {
    const result = spawnSync(executable, ['-V'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] });
    const match = `${result.stderr || ''}${result.stdout || ''}`.match(/OpenSSH_(\d+)\.(\d+)/u);
    if (match) version = [Number(match[1]), Number(match[2])];
  } catch { /* not a usable ssh */ }
  clientVersions.set(executable, version);
  return version;
}

function atLeast(version, [major, minor]) {
  return Boolean(version) && (version[0] > major || (version[0] === major && version[1] >= minor));
}

function supportsForcedAskpass(executable) {
  return atLeast(clientVersion(executable), FORCED_ASKPASS_VERSION);
}

// An unrecognised client counts as too old: the secret stays in the vault.
function supportsSavedCredentialAnswers(executable) {
  return atLeast(clientVersion(executable), SAVED_CREDENTIAL_VERSION);
}

function hasStoredCredential(profile, vaultService) {
  if (!profile?.credentialId || !vaultService) return false;
  try { return Boolean(vaultService.has(profile.credentialId)); } catch { return false; }
}

// The login OpenSSH will name in its password prompt, after ~/.ssh/config
// has been applied (HostName, User and HostKeyAlias can all differ from what
// the profile shows).
async function resolveLoginFromConfig(profile) {
  const { resolveSshConfig } = require('./ssh-config-resolver.cjs');
  const config = await resolveSshConfig(profile);
  return { hostname: config.hostname?.[0] || '', user: config.user?.[0] || '', hostKeyAlias: config.hostkeyalias?.[0] || '' };
}

const DENY = Object.freeze({ action: 'deny' });

// The parent of a process, read from /proc (Linux, the shipped platform).
// Anything unreadable ends the chain, which counts as "not ours".
function procParent(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    // "pid (comm) state ppid ...": comm may hold spaces and brackets.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const parent = Number(fields[1]);
    return Number.isInteger(parent) ? parent : 0;
  } catch { return 0; }
}

class AskpassPolicy {
  constructor(options = {}) {
    this.profile = options.profile || {};
    this.vaultService = options.vaultService || null;
    this.promptBroker = options.promptBroker || null;
    // 'dialog' asks the user in an application dialog; 'terminal' hands the
    // prompt back to the terminal the ssh process runs in.
    this.mode = options.mode === 'terminal' ? 'terminal' : 'dialog';
    // False for a client that cannot mark server-sent prompts (see
    // supportsSavedCredentialAnswers): the vault is then never consulted.
    this.useVault = options.useVault !== false;
    this.resolveLogin = options.resolveLogin || resolveLoginFromConfig;
    this.promptTimeoutMs = Number(options.promptTimeoutMs) > 0 ? Number(options.promptTimeoutMs) : PROMPT_TIMEOUT_MS;
    this.onAbort = options.onAbort || (() => {});
    this.onPrompting = options.onPrompting || (() => {});
    this.passwordUsed = false;
    this.passphraseUsed = new Set();
    // The ssh process this policy serves (see trackProcess) and how to find
    // a process's parent; tests replace parentOf.
    this.roots = new Set();
    this.parentOf = options.parentOf || procParent;
    // Claims that were actually answered from the vault.
    this.answered = new Set();
    this.aborted = '';
    this.loginPromise = null;
  }

  async decide(request = {}) {
    if (this.aborted) return DENY;
    const prompt = typeof request.prompt === 'string' ? request.prompt : '';
    const pid = Number.isInteger(request.pid) && request.pid > 0 ? request.pid : 0;
    const kind = classifyPrompt(prompt);
    let savedFailed = false;

    if (!this.useVault) {
      // Nothing may be answered on the user's behalf.
    } else if (kind.type === 'password' && this.profile.credentialKind === 'password') {
      if (this.passwordUsed) savedFailed = this.answered.has('password');
      else if (await this.#isOwnLogin(kind) && !this.passwordUsed) {
        // Claimed before the vault is read so two prompts cannot both get it.
        this.passwordUsed = true;
        const secret = await this.#storedSecret();
        if (secret) { this.answered.add('password'); return { action: 'answer', value: secret }; }
      }
    } else if (kind.type === 'passphrase' && this.profile.credentialKind === 'passphrase' && this.#isOwnKey(kind.keyPath)) {
      // One try per key and asking ssh process: a second request for the
      // same key means the stored passphrase did not unlock it. The pid is
      // what the client says, so it only counts when it is the process this
      // policy was started for or one of its descendants (a ProxyJump ssh
      // loading the same key). Anything else gets no release at all.
      const owner = this.#ownerOf(pid);
      if (owner !== null) {
        const claim = `${owner}:${kind.keyPath}`;
        if (this.passphraseUsed.has(claim)) savedFailed = this.answered.has(claim);
        else {
          this.passphraseUsed.add(claim);
          const secret = await this.#storedSecret();
          if (secret) { this.answered.add(claim); return { action: 'answer', value: secret }; }
        }
      }
    }
    if (this.aborted) return DENY;
    if (this.mode === 'terminal') return { action: 'terminal', echo: kind.type === 'host-key' };
    return this.#askUser(kind, prompt, savedFailed);
  }

  // Records the process this policy answers for. Requests then only count
  // as coming from it, or from a descendant (see #ownerOf).
  trackProcess(pid) {
    if (Number.isInteger(pid) && pid > 1) this.roots.add(pid);
  }

  // The claim owner for a client-supplied pid: the root process or the
  // descendant itself, null when a pid does not belong to this session. Until
  // a process has been tracked nothing belongs to it, so nothing is released:
  // a missing pid fails closed and the user is asked instead.
  #ownerOf(pid) {
    if (!this.roots.size) return null;
    let current = pid;
    for (let depth = 0; depth < 32 && Number.isInteger(current) && current > 1; depth += 1) {
      if (this.roots.has(current)) return pid;
      current = this.parentOf(current);
    }
    return null;
  }

  async #storedSecret() {
    if (!this.useVault) return '';
    if (!hasStoredCredential(this.profile, this.vaultService)) return '';
    try {
      const secret = await this.vaultService.get(this.profile.credentialId);
      return usableAnswer(secret) ? secret : '';
    } catch { return ''; }
  }

  #isOwnKey(keyPath) {
    if (!this.profile.identityFile) return true;
    const expected = expandHome(this.profile.identityFile);
    if (expected === keyPath) return true;
    // OpenSSH shows at most the first 100 bytes of the key path.
    const bytes = Buffer.from(expected, 'utf8');
    return bytes.length > 100 && bytes.subarray(0, 100).equals(Buffer.from(keyPath, 'utf8'));
  }

  async #isOwnLogin({ user, host }) {
    this.loginPromise ||= this.#expectedLogin();
    const expected = await this.loginPromise;
    return expected.users.has(user) && expected.hosts.has(host);
  }

  async #expectedLogin() {
    const profile = this.profile;
    const hosts = new Set([profile.host, profile.useSshConfig ? profile.sshAlias : ''].filter(Boolean));
    const users = new Set([profile.username].filter(Boolean));
    let resolved = null;
    try { resolved = await this.resolveLogin(profile); } catch { /* the profile's own values still apply */ }
    if (resolved?.hostname) hosts.add(resolved.hostname);
    if (resolved?.hostKeyAlias) hosts.add(resolved.hostKeyAlias);
    if (!users.size) {
      if (resolved?.user) users.add(resolved.user);
      else { try { users.add(os.userInfo().username); } catch { /* no local account name */ } }
    }
    return { hosts, users };
  }

  async #askUser(kind, prompt, savedFailed) {
    if (!this.promptBroker) return this.#abort('This sign-in needs an answer and no window is available to ask for it');
    // Text written here is sent in English and also as source messages, so
    // the window can show it in the user's language. Text from OpenSSH or the
    // server (`received`, `details`) has no source message and is shown as is.
    const received = prompt.trim().replace(/:$/u, '').slice(0, 1024);
    let title = message('SSH sign-in');
    let instructions = null;
    let question = received ? null : message('Response');
    let details = '';
    if (kind.type === 'host-key') {
      title = message('Unknown SSH server');
      details = kind.details;
      instructions = message('Check the fingerprint. Type yes to trust this server and continue; anything else stops the connection.');
      // The answer OpenSSH expects is the English word, in every language.
      question = { ...message('Trust this server? Type yes to continue'), placeholder: 'yes' };
    } else if (kind.type === 'password') {
      instructions = savedFailed ? message('The saved password was not accepted.') : null;
      question = message('Password for {p0}', { p0: `${kind.user}@${kind.host}` });
    } else if (kind.type === 'passphrase') {
      instructions = message(savedFailed ? 'The saved passphrase did not unlock {p0}.' : 'The SSH key {p0} is protected by a passphrase.', { p0: kind.keyPath });
      question = message('Passphrase for {p0}', { p0: path.basename(kind.keyPath) });
    }
    const payload = {
      profileName: this.profile.name || '',
      host: this.profile.host || '',
      name: english(title),
      instructions: `${details}${details ? '\n\n' : ''}${instructions ? english(instructions) : ''}`.slice(0, 4096),
      language: '',
      prompts: [{ prompt: (question ? english(question) : received).slice(0, 1024), echo: kind.type === 'host-key' }],
      messages: { name: title, instructions, prompts: [question], details: details.slice(0, 4096) }
    };

    let response;
    this.onPrompting(true);
    try { response = await this.promptBroker.request('keyboard-interactive', payload, this.promptTimeoutMs); }
    catch { return this.#abort('The sign-in prompt was not answered'); }
    finally { this.onPrompting(false); }
    if (this.aborted) return DENY;
    const answers = Array.isArray(response?.answers) ? response.answers : [];
    if (!answers.length) return this.#abort(kind.type === 'host-key' ? 'The server was not trusted, so the connection was stopped' : 'Sign-in was cancelled');
    const answer = typeof answers[0] === 'string' ? answers[0] : '';
    if (kind.type === 'host-key') {
      if (answer.trim().toLowerCase() === 'yes') return { action: 'answer', value: 'yes' };
      return this.#abort('The server was not trusted, so the connection was stopped');
    }
    if (!usableAnswer(answer)) return this.#abort('The answer cannot be passed to OpenSSH (too long, or more than one line)');
    return { action: 'answer', value: answer };
  }

  #abort(reason) {
    if (!this.aborted) {
      this.aborted = reason;
      try { this.onAbort(reason); } catch { /* the owner handles its own failure */ }
    }
    return DENY;
  }
}

function socketRoot(preferred) {
  const candidates = [preferred, process.env.XDG_RUNTIME_DIR, os.tmpdir(), '/tmp'];
  const uid = typeof process.getuid === 'function' ? process.getuid() : -1;
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) continue;
    // "aux-command-askpass-XXXXXX/s" is appended to the root.
    if (Buffer.byteLength(candidate, 'utf8') + 30 > MAX_SOCKET_PATH_BYTES) continue;
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isDirectory()) continue;
      // A shared directory is fine (the socket lives in a private
      // subdirectory); a private one must be this user's.
      if ((stat.mode & 0o022) === 0 && uid >= 0 && stat.uid !== uid) continue;
      fs.accessSync(candidate, fs.constants.W_OK | fs.constants.X_OK);
      return candidate;
    } catch { /* try the next location */ }
  }
  throw new Error('No private runtime directory is available for SSH sign-in');
}

function quoteShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

// OpenSSH executes SSH_ASKPASS directly. The bundled helper is used when it
// kept its executable bit; otherwise a launcher is written next to the socket.
function askpassProgram(directory, helper = resolveHelper('ssh_askpass.py')) {
  try { fs.accessSync(helper, fs.constants.X_OK); return helper; } catch { /* use a launcher */ }
  const python = findExecutable(['python3']);
  if (!python) throw new Error('Python 3 is required for SSH sign-in');
  const launcher = path.join(directory, 'askpass');
  fs.writeFileSync(launcher, `#!/bin/sh\nexec ${quoteShell(python)} ${quoteShell(helper)} "$@"\n`, { mode: 0o700 });
  return launcher;
}

const openSessions = new Set();
let exitHookInstalled = false;

const SESSION_DIRECTORY = /^aux-command-askpass-[A-Za-z0-9]{6}$/u;

// A session removes its directory on close and at normal exit, but a crash or
// SIGKILL leaves "aux-command-askpass-XXXXXX/" behind (with a socket and no
// secret in it). Run once at start-up: a directory that is this user's, not a
// symlink, not one of this process's sessions and whose socket no longer
// accepts connections is stale. A running second instance keeps its socket
// open, so its directory is left alone.
async function sweepStaleAskpassDirectories(options = {}) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : -1;
  const roots = options.roots || [options.runtimeDir, process.env.XDG_RUNTIME_DIR, os.tmpdir(), '/tmp'];
  const own = new Set([...openSessions].map((session) => session.directory));
  const removed = [];
  for (const root of new Set(roots.filter((root) => typeof root === 'string' && path.isAbsolute(root)))) {
    let names = [];
    try { names = fs.readdirSync(root).filter((name) => SESSION_DIRECTORY.test(name)); } catch { continue; }
    for (const name of names) {
      const directory = path.join(root, name);
      try {
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || (uid >= 0 && stat.uid !== uid) || own.has(directory)) continue;
        if (await socketAccepts(path.join(directory, 's'))) continue;
        fs.rmSync(directory, { recursive: true, force: true });
        removed.push(directory);
      } catch { /* not ours to remove, or already gone */ }
    }
  }
  return removed;
}

function socketAccepts(socketPath, timeoutMs = 500) {
  return new Promise((resolve) => {
    const client = net.createConnection(socketPath);
    const done = (live) => { client.destroy(); resolve(live); };
    client.setTimeout(timeoutMs, () => done(true));
    client.once('connect', () => done(true));
    client.once('error', () => done(false));
  });
}

// One broker for one ssh process. `close()` must be called when that process
// exits (or as soon as it has signed in).
function createAskpassSession(options = {}) {
  const policy = options.policy || new AskpassPolicy(options);
  const requestTimeoutMs = Number(options.requestTimeoutMs) > 0 ? Number(options.requestTimeoutMs) : REQUEST_TIMEOUT_MS;
  const directory = fs.mkdtempSync(path.join(socketRoot(options.runtimeDir), 'aux-command-askpass-'));
  let server = null;
  let closed = false;
  let rejected = 0;
  const sockets = new Set();

  const session = {
    directory,
    socketPath: path.join(directory, 's'),
    policy,
    env: null,
    get closed() { return closed; },
    // The pid of the process started with `env`; passphrase claims are tied
    // to it and its descendants.
    trackProcess(pid) { policy.trackProcess?.(pid); },
    close() {
      if (closed) return;
      closed = true;
      openSessions.delete(session);
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      try { server?.close(); } catch { /* not listening */ }
      try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    }
  };

  try {
    fs.chmodSync(directory, 0o700);
    const token = crypto.randomBytes(32).toString('hex');
    const program = askpassProgram(directory, options.helper);

    const handle = async (socket, line) => {
      let request = null;
      try { request = JSON.parse(line.toString('utf8')); } catch { /* rejected below */ }
      const valid = request && typeof request === 'object' && !Array.isArray(request)
        && tokenMatches(token, request.token)
        && typeof request.prompt === 'string' && request.prompt.length <= MAX_PROMPT_CHARS;
      if (!valid) {
        rejected += 1;
        socket.destroy();
        // Repeated bad requests can only be guessing; stop answering at all.
        if (rejected >= MAX_REJECTED_REQUESTS) session.close();
        return;
      }
      let reply = DENY;
      try { reply = await policy.decide({ prompt: request.prompt, pid: request.pid }); } catch { reply = DENY; }
      if (closed || socket.destroyed) return;
      socket.end(`${JSON.stringify(reply)}\n`);
    };

    server = net.createServer((socket) => {
      if (closed || sockets.size >= MAX_CONNECTIONS) { socket.destroy(); return; }
      sockets.add(socket);
      let received = Buffer.alloc(0);
      let handled = false;
      const timer = setTimeout(() => socket.destroy(), requestTimeoutMs);
      timer.unref?.();
      socket.on('data', (chunk) => {
        if (handled) return;
        if (received.length + chunk.length > MAX_REQUEST_BYTES) { clearTimeout(timer); socket.destroy(); return; }
        received = Buffer.concat([received, chunk]);
        const end = received.indexOf(0x0a);
        if (end < 0) return;
        handled = true;
        clearTimeout(timer);
        handle(socket, received.subarray(0, end));
      });
      socket.on('error', () => { /* the helper went away */ });
      socket.on('close', () => { clearTimeout(timer); sockets.delete(socket); });
    });
    server.on('error', () => session.close());
    server.listen(session.socketPath);
    fs.chmodSync(session.socketPath, 0o600);
    server.unref();

    session.env = {
      SSH_ASKPASS: program,
      SSH_ASKPASS_REQUIRE: 'force',
      [SOCKET_ENV]: session.socketPath,
      [TOKEN_ENV]: token
    };
  } catch (error) {
    session.close();
    throw error;
  }

  openSessions.add(session);
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.once('exit', () => { for (const open of [...openSessions]) open.close(); });
  }
  return session;
}

module.exports = {
  AskpassPolicy,
  MAX_ANSWER_BYTES,
  MAX_PROMPT_CHARS,
  MAX_REQUEST_BYTES,
  SOCKET_ENV,
  TOKEN_ENV,
  askpassProgram,
  classifyPrompt,
  createAskpassSession,
  hasStoredCredential,
  supportsForcedAskpass,
  supportsSavedCredentialAnswers,
  sweepStaleAskpassDirectories,
  tokenMatches,
  usableAnswer
};
