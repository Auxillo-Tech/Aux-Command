'use strict';
// Test-only Electron entry point. Native file dialogs use disposable fixtures.
const { app, dialog } = require('electron');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aux-ui-recovery-'));
const home = path.join(directory, 'home'); const bin = path.join(directory, 'bin');
fs.mkdirSync(path.join(home, '.ssh'), { recursive: true }); fs.mkdirSync(bin);
fs.writeFileSync(path.join(home, '.ssh/config'), 'Host fixture-import\n HostName 127.0.0.1\n User fixture\n');
fs.writeFileSync(path.join(bin, 'ssh'), '#!/bin/sh\nprintf "hostname 127.0.0.1\\nport 22\\nuser fixture\\n"\n', { mode: 0o755 });
process.env.PATH = `${bin}:${process.env.PATH}`;
os.homedir = () => home;
app.setPath('userData', path.join(directory, 'app'));
app.getVersion = () => require('../package.json').version;
app.getAppPath = () => root;
const profiles = path.join(directory, 'profiles.json');
const workspace = path.join(directory, 'workspace.json');
fs.writeFileSync(profiles, JSON.stringify({ format: 'aux-command-profiles', version: 1, profiles: [{ id: 'json-fixture', name: 'JSON fixture', host: '127.0.0.1' }], snippets: [] }));
dialog.showOpenDialog = async (_window, options) => ({ canceled: false, filePaths: [options.title.includes('workspace') ? workspace : profiles] });
dialog.showSaveDialog = async (_window, options) => ({ canceled: false, filePath: options.title.includes('workspace') ? workspace : path.join(directory, 'exported-profiles.json') });
console.log(JSON.stringify({ fixtureDirectory: directory }));
// A UI script asks for a sign-in dialog by logging one of these lines in the
// window. The first is the application's own RDP prompt, built by the real
// code; the second is a prompt as an SSH server would send it.
app.on('web-contents-created', (_created, contents) => contents.on('console-message', (details, _level, legacyMessage) => {
  const text = typeof details?.message === 'string' ? details.message : legacyMessage;
  if (text === 'aux-ui-fixture:rdp-sign-in') {
    const { resolveRdpCredentials } = require('../src/main/lib/rdp-credentials.cjs');
    const promptBroker = { request: async (kind, payload) => { contents.send('prompt:request', { id: 'fixture-rdp-sign-in', kind, payload }); return { answers: [] }; } };
    resolveRdpCredentials({ name: 'Prompt fixture', host: 'rdp.fixture.test', username: 'ops' }, { promptBroker }).catch(() => {});
  } else if (text === 'aux-ui-fixture:server-prompt') {
    contents.send('prompt:request', { id: 'fixture-server-prompt', kind: 'keyboard-interactive', payload: {
      profileName: 'Prompt fixture', host: 'ssh.fixture.test', name: '', instructions: 'Password', language: '',
      prompts: [{ prompt: 'Password', echo: false }, { prompt: 'Verification code: ', echo: true }]
    } });
  } else if (text === 'aux-ui-fixture:askpass-saved-rejected' || text === 'aux-ui-fixture:askpass-host-key') {
    // The real askpass rules decide what to ask; only the vault and the
    // window are stand-ins, and no ssh process is started.
    const { AskpassPolicy } = require('../src/main/lib/ssh-askpass.cjs');
    const rules = new AskpassPolicy({
      profile: { id: 'askpass-fixture', name: 'Askpass fixture', host: 'ssh.fixture.test', username: 'ops', credentialId: 'fixture', credentialKind: 'password' },
      vaultService: { has: () => true, get: async () => 'fixture-only-password' },
      promptBroker: { request: async (kind, payload) => { contents.send('prompt:request', { id: 'fixture-askpass', kind, payload }); return { answers: [] }; } },
      resolveLogin: async () => ({})
    });
    const password = "ops@ssh.fixture.test's password: ";
    const hostKey = "The authenticity of host 'ssh.fixture.test (192.0.2.10)' can't be established.\nED25519 key fingerprint is SHA256:d2R4qWcIhTB2N7+FKN+mnLD5aCip+t+nxP1Oq7sXZ7s.\nThis key is not known by any other names.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? ";
    // The saved password answers the first prompt; OpenSSH asking again means it was refused.
    const asked = text.endsWith('host-key') ? rules.decide({ prompt: hostKey, pid: 1 }) : rules.decide({ prompt: password, pid: 1 }).then(() => rules.decide({ prompt: password, pid: 1 }));
    asked.catch(() => {});
  }
}));
require('../src/main/index.cjs');
