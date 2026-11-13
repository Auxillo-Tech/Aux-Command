'use strict';
// Runs the real AskpassPolicy and createAskpassSession against one real
// OpenSSH client and two kinds of loopback server, and prints one marker line
// per scenario plus one verdict line for the client.
//
//   node ssh-version-gate-probe.cjs --ssh /path/to/ssh [--repo /path/to/aux-command]
//
// Servers (ssh2, listening on 127.0.0.1 only):
//   password   a normal server that asks for a password (or a public key) the
//              way sshd does, so the prompt text is OpenSSH's own.
//   hostile    a server that offers only keyboard-interactive and sends
//              prompts worded exactly like OpenSSH's own password and
//              passphrase prompts.
//
// Required result for the client, by version (what the shipped gate promises):
//   below 8.7  the saved secret is never released: the vault is read 0 times,
//              the server never receives it, and the user is asked in a dialog.
//   8.7 up     the saved secret answers only OpenSSH's own prompt and never a
//              prompt worded by the server.
//
// "ungated" scenarios run the same servers with the gate switched off. They
// are information, not a pass or fail: they show what the version gate is
// protecting against on this client.
//
// Exit status: 0 when every required scenario passed, 1 when one failed,
// 2 when the client could not be run at all (reported as NOT RUN).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const sshPath = argument('--ssh', 'ssh');
const repo = path.resolve(argument('--repo', path.join(__dirname, '..')));
const { Server, utils } = require(require.resolve('ssh2', { paths: [repo, __dirname, process.cwd()] }));
const askpass = require(path.join(repo, 'src', 'main', 'lib', 'ssh-askpass.cjs'));

// The release from which the app may answer OpenSSH's own prompts from the
// vault. Keep equal to SAVED_CREDENTIAL_VERSION in src/main/lib/ssh-askpass.cjs:
// the probe fails when the shipped gate and this value disagree, so a change
// to either one has to be made, and qualified, on purpose.
const REQUIRED_SAVED_FROM = [8, 7];
const SECRET = 'saved-secret-4kQ9xT';
const DIALOG_ANSWER = 'typed-in-dialog-7Hn2';
const USER = 'qualify';
// A backstop only: a run that reaches it counts as a failure, never a pass.
const RUN_LIMIT_MS = 30_000;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-gate-'));
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* scratch only */ } });

const hostKey = utils.generateKeyPairSync('ed25519').private;
const clientKeyPair = utils.generateKeyPairSync('ed25519', { passphrase: SECRET, cipher: 'aes256-ctr', rounds: 16 });
const keyPath = path.join(dir, 'id_qualify');
fs.writeFileSync(keyPath, clientKeyPair.private, { mode: 0o600 });
const clientPublic = utils.parseKey(clientKeyPair.public);
if (clientPublic instanceof Error) throw clientPublic;

function versionBanner() {
  const result = spawnSync(sshPath, ['-V'], { encoding: 'utf8', timeout: 5000 });
  return `${result.stderr || ''}${result.stdout || ''}`.trim();
}

// kind: 'password' | 'publickey' | 'hostile'
function startServer(kind, promptText) {
  const seen = { answers: [], methods: [] };
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on('authentication', (ctx) => {
      seen.methods.push(ctx.method);
      if (kind === 'password' && ctx.method === 'password') {
        seen.answers.push(ctx.password);
        if (ctx.password === SECRET) ctx.accept(); else ctx.reject(['password']);
      } else if (kind === 'publickey' && ctx.method === 'publickey') {
        const same = ctx.key.algo === clientPublic.type && Buffer.compare(ctx.key.data, clientPublic.getPublicSSH()) === 0;
        if (!same) { ctx.reject(['publickey']); return; }
        if (!ctx.signature) { ctx.accept(); return; }
        if (clientPublic.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true) { seen.answers.push('(signature)'); ctx.accept(); } else ctx.reject(['publickey']);
      } else if (kind === 'hostile' && ctx.method === 'keyboard-interactive') {
        ctx.prompt([{ prompt: promptText, echo: false }], 'name', 'instructions', (answers) => { seen.answers.push(...answers); ctx.reject(); });
      } else if (kind === 'hostile') ctx.reject(['keyboard-interactive']);
      else ctx.reject([kind]);
    });
    client.on('ready', () => client.on('session', (accept) => {
      const session = accept();
      session.on('exec', (acceptExec) => { const stream = acceptExec(); stream.exit(0); stream.end(); });
    }));
    client.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, seen })));
}

async function scenario({ id, kind, promptText, credentialKind, gated, expect }) {
  const { server, port, seen } = await startServer(kind, promptText);
  let vaultReads = 0;
  const vaultService = { has: () => true, get: async () => { vaultReads += 1; return SECRET; } };
  const dialogs = [];
  const promptBroker = { request: async (_kind, payload) => { dialogs.push(payload.prompts[0].prompt); return { answers: [DIALOG_ANSWER] }; } };
  const profile = {
    id: 'p', name: 'p', host: '127.0.0.1', port, username: USER, credentialId: 'c', credentialKind, useSshConfig: false,
    ...(credentialKind === 'passphrase' ? { identityFile: keyPath } : {})
  };
  const useVault = gated ? askpass.supportsSavedCredentialAnswers(sshPath) : true;
  const session = askpass.createAskpassSession({
    profile, vaultService, promptBroker, mode: 'dialog', useVault, resolveLogin: async () => ({})
  });
  const args = [
    '-F', '/dev/null', '-p', String(port), '-l', USER,
    '-o', 'StrictHostKeyChecking=no', '-o', `UserKnownHostsFile=${path.join(dir, 'known_hosts')}`,
    '-o', 'NumberOfPasswordPrompts=1', '-o', 'LogLevel=ERROR', '-o', 'BatchMode=no',
    '-o', `PreferredAuthentications=${kind === 'publickey' ? 'publickey' : kind === 'hostile' ? 'keyboard-interactive' : 'password'}`,
    ...(kind === 'publickey' || credentialKind === 'passphrase' ? ['-i', keyPath, '-o', 'IdentitiesOnly=yes'] : []),
    '--', '127.0.0.1', 'true'
  ];
  const child = spawn(sshPath, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: dir, ...session.env } });
  session.trackProcess(child.pid);
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
  const outcome = await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ timedOut: true, status: null }); }, RUN_LIMIT_MS);
    child.on('error', (error) => { clearTimeout(timer); resolve({ timedOut: false, status: null, error: error.message }); });
    child.on('exit', (status) => { clearTimeout(timer); resolve({ timedOut: false, status }); });
  });
  const promptShown = dialogs.slice();
  session.close();
  server.close();

  // A passphrase unlocks the key on this computer and is never sent to the
  // server, so for the public-key server only the vault read and the sign-in
  // show whether it was released.
  const facts = {
    vaultReads,
    dialogs: promptShown.length,
    serverGotSecret: seen.answers.includes(SECRET),
    signedIn: outcome.status === 0
  };
  let verdict = 'PASS';
  const reasons = [];
  if (outcome.timedOut || outcome.error) { verdict = 'FAIL'; reasons.push(outcome.timedOut ? 'run hit the time limit' : `could not run: ${outcome.error}`); }
  else {
    if (expect.vaultReads !== undefined && facts.vaultReads !== expect.vaultReads) reasons.push(`vault read ${facts.vaultReads} times, expected ${expect.vaultReads}`);
    if (expect.leak !== undefined && facts.serverGotSecret !== expect.leak) reasons.push(`server ${facts.serverGotSecret ? 'received' : 'did not receive'} the secret, expected ${expect.leak ? 'received' : 'not received'}`);
    if (expect.dialog === true && facts.dialogs < 1) reasons.push('no dialog was shown');
    if (expect.dialog === false && facts.dialogs > 0) reasons.push(`${facts.dialogs} dialog(s) shown, expected none`);
    if (expect.signedIn !== undefined && facts.signedIn !== expect.signedIn) reasons.push(`signed in = ${facts.signedIn}, expected ${expect.signedIn}`);
    if (reasons.length) verdict = 'FAIL';
  }
  return { id, gated, expect, facts, verdict: expect.info ? 'INFO' : verdict, reasons, stderr: stderr.trim().split('\n').slice(-2).join(' | ') };
}

(async () => {
  const banner = versionBanner();
  const match = banner.match(/OpenSSH_(\d+\.\d+)p?(\d*)/u);
  if (!match) {
    console.log(`NOT RUN ssh=${sshPath} reason="no OpenSSH version banner (${JSON.stringify(banner).slice(0, 80)})"`);
    process.exit(2);
  }
  const version = match[1];
  const [major, minor] = version.split('.').map(Number);
  const savedAllowed = major > REQUIRED_SAVED_FROM[0] || (major === REQUIRED_SAVED_FROM[0] && minor >= REQUIRED_SAVED_FROM[1]);
  const gateSaved = askpass.supportsSavedCredentialAnswers(sshPath);
  const gateForced = askpass.supportsForcedAskpass(sshPath);
  console.log(`CLIENT ${banner} | gate: forced=${gateForced} saved=${gateSaved} | expected saved=${savedAllowed}`);

  const ownPassword = savedAllowed ? { vaultReads: 1, dialog: false, leak: true, signedIn: true } : { vaultReads: 0, dialog: true, leak: false, signedIn: false };
  const ownPassphrase = savedAllowed ? { vaultReads: 1, dialog: false, signedIn: true } : { vaultReads: 0, dialog: true, signedIn: false };
  const refused = { vaultReads: 0, dialog: true, leak: false, signedIn: false };
  const passwordImitation = `${USER}@127.0.0.1's password: `;
  const passphraseImitation = `Enter passphrase for key '${keyPath}': `;

  const required = [
    { id: 'own-password-prompt', kind: 'password', credentialKind: 'password', gated: true, expect: ownPassword },
    { id: 'own-passphrase-prompt', kind: 'publickey', credentialKind: 'passphrase', gated: true, expect: ownPassphrase },
    { id: 'server-imitates-password-prompt', kind: 'hostile', promptText: passwordImitation, credentialKind: 'password', gated: true, expect: refused },
    { id: 'server-plain-Password-prompt', kind: 'hostile', promptText: 'Password: ', credentialKind: 'password', gated: true, expect: refused },
    { id: 'server-imitates-passphrase-prompt', kind: 'hostile', promptText: passphraseImitation, credentialKind: 'passphrase', gated: true, expect: refused }
  ];
  // Without the gate: informational only.
  const info = [
    { id: 'own-password-prompt', kind: 'password', credentialKind: 'password', gated: false, expect: { info: true } },
    { id: 'own-passphrase-prompt', kind: 'publickey', credentialKind: 'passphrase', gated: false, expect: { info: true } },
    { id: 'server-imitates-password-prompt', kind: 'hostile', promptText: passwordImitation, credentialKind: 'password', gated: false, expect: { ...refused, info: true } },
    { id: 'server-imitates-passphrase-prompt', kind: 'hostile', promptText: passphraseImitation, credentialKind: 'passphrase', gated: false, expect: { ...refused, info: true } }
  ];

  const results = [];
  for (const item of [...required, ...info]) {
    let result;
    try { result = await scenario(item); } catch (error) { result = { id: item.id, gated: item.gated, facts: {}, verdict: item.expect.info ? 'INFO' : 'FAIL', reasons: [`probe error: ${error.message}`], stderr: '' }; }
    results.push(result);
    const f = result.facts;
    const label = result.gated ? 'gated' : 'ungated';
    const leakNote = !result.gated && result.id.startsWith('server-') && f.serverGotSecret ? ' LEAKED-TO-SERVER' : '';
    console.log(`SCENARIO ${version} ${label} ${result.id}: ${result.verdict} vaultReads=${f.vaultReads} dialogs=${f.dialogs} serverGotSecret=${f.serverGotSecret} signedIn=${f.signedIn}${leakNote}${result.reasons.length && result.verdict !== 'INFO' ? ` reasons="${result.reasons.join('; ')}"` : ''}`);
  }

  const failed = results.filter((r) => r.verdict === 'FAIL');
  const ungatedLeak = results.some((r) => !r.gated && r.id.startsWith('server-') && r.facts.serverGotSecret);
  const gateAgrees = gateSaved === savedAllowed;
  if (!gateAgrees) failed.push({ id: 'gate-value', reasons: [`shipped gate says saved=${gateSaved}, required ${savedAllowed}`] });
  if (failed.length) {
    console.log(`VERDICT ${version}: FAIL (${failed.map((r) => r.id).join(', ')})`);
    process.exit(1);
  }
  const text = savedAllowed
    ? 'the saved secret answers only OpenSSH\'s own prompt and never a prompt worded by the server'
    : 'the saved secret is never released (vault read 0 times) and the user gets a dialog';
  console.log(`VERDICT ${version}: PASS ${text}; without the gate a server-worded prompt ${ungatedLeak ? 'WOULD get the secret' : 'still does not get the secret'}`);
  process.exit(0);
})();
