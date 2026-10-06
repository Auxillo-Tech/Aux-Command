'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');

function registerIpc({
  ipcMain,
  BrowserWindow,
  dialog,
  clipboard,
  shell,
  app,
  profileStore,
  recoveryService,
  settingsStore,
  terminalService,
  externalService,
  tunnelService,
  sftpService,
  ftpService,
  vaultService,
  promptBroker,
  systemService,
  updateService,
  transferQueue,
  vncBridge,
  rdpEmbed,
  networkTools,
  reachabilityService,
  sshKeyService,
  profileSync,
  liveMonitor,
  remoteDesktopGateway,
  aiAssist,
  getWindow
}) {
  const handle = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      const window = getWindow();
      if (
        !window
        || event.sender !== window.webContents
        || event.senderFrame !== window.webContents.mainFrame
      ) throw new Error('Untrusted IPC sender');
      return handler(...args);
    });
  };

  handle('app:get-state', () => ({
    version: app.getVersion(),
    name: app.getName(),
    profiles: profileStore.list(),
    settings: settingsStore.get(),
    snippets: profileStore.snippets(),
    sessions: terminalService.list(),
    tunnels: tunnelService.list(),
    vault: vaultService.status(),
    updates: updateService.getStatus(),
    diagnostics: systemService.diagnostics()
  }));

  handle('profiles:list', () => profileStore.list());
  handle('profiles:save', (profile) => profileStore.save(profile));
  handle('profiles:delete', (id) => profileStore.delete(id));
  handle('profiles:import-ssh-config', async () => {
    recoveryService.snapshot('Before SSH config import');
    return profileStore.importSshConfig();
  });
  handle('profiles:export', async () => {
    const result = await dialog.showSaveDialog(getWindow(), {
      title: 'Export Aux Command profiles',
      defaultPath: path.join(app.getPath('documents'), 'aux-command-profiles.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    systemService.writeTextFile(result.filePath, `${JSON.stringify(profileStore.exportSafe(), null, 2)}\n`);
    return { canceled: false, filePath: result.filePath };
  });
  handle('profiles:import', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Import Aux Command profiles',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const payload = readImport(result.filePaths[0]);
    const token = rememberImport('profiles', payload);
    return { canceled: false, token, preview: Object.fromEntries(['merge', 'update', 'copy'].map(mode => [mode, profileStore.previewImport(payload, mode)])) };
  });
  handle('profiles:apply-import', (token, mode) => {
    const payload = takeImport(token, 'profiles');
    profileStore.previewImport(payload, mode);
    const recoveryId = recoveryService.snapshot('Before profile JSON import');
    return { ...profileStore.importSafe(payload, mode), recoveryId };
  });
  const pendingImports = new Map();
  function readImport(filename) {
    try { return JSON.parse(systemService.readTextFile(filename).replace(/^\uFEFF/u, '')); }
    catch (error) { throw new Error(`Could not read import file: ${error.message}`); }
  }
  function rememberImport(kind, payload) {
    pendingImports.clear();
    const token = randomUUID(); pendingImports.set(token, { kind, payload, expires: Date.now() + 600000 }); return token;
  }
  function takeImport(token, kind) {
    const pending = pendingImports.get(token);
    if (!pending || pending.kind !== kind || pending.expires < Date.now()) throw new Error('Import preview expired; choose the file again');
    pendingImports.delete(token); return pending.payload;
  }
  handle('recovery:list', () => recoveryService.list());
  handle('recovery:restore-local', (id) => recoveryService.restoreLocal(id));
  handle('recovery:export', async () => {
    const result = await dialog.showSaveDialog(getWindow(), { title: 'Back up workspace', defaultPath: path.join(app.getPath('documents'), 'aux-command-workspace.json'), filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    systemService.writeTextFile(result.filePath, JSON.stringify(recoveryService.exportWorkspace(), null, 2) + '\n');
    return { canceled: false, filePath: result.filePath };
  });
  handle('recovery:preview', async () => {
    const result = await dialog.showOpenDialog(getWindow(), { title: 'Restore workspace backup', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const payload = readImport(result.filePaths[0]);
    const validated = recoveryService.validateWorkspace(payload);
    return { canceled: false, token: rememberImport('workspace', payload), profiles: validated.profiles.profiles.length, snippets: validated.profiles.snippets.length };
  });
  handle('recovery:restore', (token) => recoveryService.restoreWorkspace(takeImport(token, 'workspace')));

  handle('app:save-workspace-settings', (workspace) => settingsStore.saveWorkspace(workspace));
  handle('app:save-sidebar-settings', (sidebar) => settingsStore.saveSidebar(sidebar));
  handle('app:save-highlight-settings', (highlight) => settingsStore.saveHighlight(highlight));
  handle('app:save-onboarding-settings', (onboarding) => settingsStore.saveOnboarding(onboarding));
  handle('app:save-assist-settings', (assist) => settingsStore.saveAssist(assist));
  handle('app:save-ui-settings', (ui) => settingsStore.saveUi(ui));
  handle('system:os-info', () => systemService.osInfo());
  handle('system:stats', () => systemService.stats());
  handle('ai:status', () => aiAssist.status());
  handle('ai:configure', (config) => aiAssist.configure(config));
  handle('ai:ask', (request) => aiAssist.ask(request));
  handle('app:save-sessions', (sessions) => settingsStore.saveSessions(sessions));
  handle('app:get-sessions', () => settingsStore.getSessions());

  handle('snippets:list', () => profileStore.snippets());
  handle('snippets:save', (snippet) => profileStore.saveSnippet(snippet));
  handle('snippets:delete', (id) => profileStore.deleteSnippet(id));

  handle('terminal:create', (request) => terminalService.create(request));
  handle('terminal:write', (id, data) => terminalService.write(id, data));
  handle('terminal:resize', (id, cols, rows) => terminalService.resize(id, cols, rows));
  handle('terminal:export-transcript', (id) => terminalService.exportTranscript(id));
  handle('terminal:recording', (id) => terminalService.exportRecording(id));
  handle('terminal:save-transcript', async (id) => {
    const transcript = terminalService.exportTranscript(id);
    const safeTitle = String(transcript.title || 'terminal').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'terminal';
    const result = await dialog.showSaveDialog(getWindow(), {
      title: 'Save terminal transcript',
      defaultPath: path.join(app.getPath('documents'), `${safeTitle}-transcript.txt`),
      filters: [{ name: 'Text files', extensions: ['txt', 'log'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    systemService.writeTextFile(result.filePath, transcript.text || '');
    return { canceled: false, filePath: result.filePath, bytes: Buffer.byteLength(transcript.text || '', 'utf8') };
  });
  handle('terminal:print-transcript', async (id) => {
    const transcript = terminalService.exportTranscript(id);
    const title = `${transcript.title || 'Terminal'} transcript`;
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    try {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.4}header{border-bottom:1px solid #ccc;margin-bottom:16px;padding-bottom:8px}h1{font-size:18px;margin:0 0 4px}.meta{font-size:12px;color:#555}</style></head><body><header><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(transcript.exportedAt || new Date().toISOString())}</div></header><pre>${escapeHtml(transcript.text || '')}</pre></body></html>`;
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const printed = await win.webContents.print({ silent: false, printBackground: true });
      return { printed: Boolean(printed) };
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  });
  handle('terminal:start-logging', async (id) => {
    const session = terminalService.exportTranscript(id);
    const safeTitle = String(session.title || 'terminal').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'terminal';
    const result = await dialog.showSaveDialog(getWindow(), {
      title: 'Start terminal log',
      defaultPath: path.join(app.getPath('documents'), `${safeTitle}.log`),
      filters: [{ name: 'Terminal logs', extensions: ['log', 'txt'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    return { canceled: false, ...terminalService.startLogging(id, result.filePath) };
  });
  handle('terminal:stop-logging', (id) => terminalService.stopLogging(id));
  handle('terminal:close', (id) => terminalService.close(id));

  handle('external:launch', (profile) => externalService.launch(profile));
  handle('vnc:start', async (profile) => {
    if (profile.protocol !== 'vnc') throw new Error('VNC bridge requires a VNC profile');
    const result = await vncBridge.start(profile);
    return {
      ...result,
      vncUrl: `vnc.html?url=${encodeURIComponent(result.url)}&host=${encodeURIComponent(result.host)}&port=${result.port}`
    };
  });
  handle('vnc:stop', (id) => vncBridge.stop(id));
  handle('vnc:list', () => vncBridge.list());
  handle('rdp:capabilities', () => rdpEmbed.capabilities());
  handle('rdp:start-embedded', async (profile) => {
    if (profile.protocol !== 'rdp') throw new Error('Embedded RDP requires an RDP profile');
    return rdpEmbed.start(profile);
  });
  handle('rdp:stop-embedded', (id) => rdpEmbed.stop(id));
  handle('rdp:list-embedded', () => rdpEmbed.list());
  handle('reachability:check', (targets) => reachabilityService.check(targets));
  handle('tunnel:start', (tunnel) => tunnelService.start(tunnel));
  handle('tunnel:stop', (id) => tunnelService.stop(id));
  handle('tunnel:list', () => tunnelService.list());

  handle('sftp:list', (profile, remotePath) => fileTransferServiceFor(profile, sftpService, ftpService).list(profile, remotePath));
  handle('sftp:mkdir', (profile, remotePath) => fileTransferServiceFor(profile, sftpService, ftpService).mkdir(profile, remotePath));
  handle('sftp:rename', (profile, oldPath, newPath) => fileTransferServiceFor(profile, sftpService, ftpService).rename(profile, oldPath, newPath));
  handle('sftp:remove', (profile, remotePath, directory) => fileTransferServiceFor(profile, sftpService, ftpService).remove(profile, remotePath, directory));
  handle('sftp:read-text', (profile, remotePath) => fileTransferServiceFor(profile, sftpService, ftpService).readText(profile, remotePath));
  handle('sftp:write-text', (profile, remotePath, content) => fileTransferServiceFor(profile, sftpService, ftpService).writeText(profile, remotePath, content));
  handle('sftp:upload', async (profile, remoteDirectory) => {
    const result = await dialog.showOpenDialog(getWindow(), { title: 'Select file to upload', properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const localPath = result.filePaths[0];
    const remotePath = path.posix.join(remoteDirectory || '/', path.basename(localPath));
    const transfer = transferQueue.enqueue({ profile, direction: 'upload', localPath, remotePath });
    return { canceled: false, localPath, remotePath, transfer };
  });
  handle('sftp:upload-paths', async (profile, remoteDirectory, localPaths) => {
    if (!Array.isArray(localPaths) || !localPaths.length) return { uploaded: [] };
    const uploaded = [];
    for (const localPath of localPaths.slice(0, 32)) {
      if (typeof localPath !== 'string' || !path.isAbsolute(localPath)) throw new Error('Dropped upload paths must be absolute local files');
      const remotePath = path.posix.join(remoteDirectory || '/', path.basename(localPath));
      const transfer = transferQueue.enqueue({ profile, direction: 'upload', localPath, remotePath });
      uploaded.push({ localPath, remotePath, transferId: transfer.id });
    }
    return { uploaded };
  });
  handle('sftp:download', async (profile, remotePath) => {
    const result = await dialog.showSaveDialog(getWindow(), {
      title: 'Save remote file',
      defaultPath: path.join(app.getPath('downloads'), path.posix.basename(remotePath))
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const transfer = transferQueue.enqueue({
      profile,
      direction: 'download',
      remotePath,
      localPath: result.filePath
    });
    return { canceled: false, localPath: result.filePath, remotePath, transfer };
  });
  handle('sftp:disconnect', (profileId, protocol) => protocol === 'ftp' || protocol === 'ftps' ? ftpService.disconnect(profileId) : sftpService.disconnect(profileId));

  handle('transfer:enqueue', (spec) => transferQueue.enqueue(spec));
  handle('transfer:pause', (id) => transferQueue.pause(id));
  handle('transfer:resume', (id) => transferQueue.resume(id));
  handle('transfer:cancel', (id) => transferQueue.cancel(id));
  handle('transfer:retry', (id) => transferQueue.retry(id));
  handle('transfer:list', () => transferQueue.list());
  handle('transfer:clear-completed', () => transferQueue.clearCompleted());

  handle('vault:status', () => vaultService.status());
  handle('vault:has', (id) => vaultService.has(id));
  handle('vault:set', (id, secret, persistent) => vaultService.set(id, secret, persistent));
  handle('vault:delete', (id) => vaultService.delete(id));

  handle('prompt:respond', (id, response) => promptBroker.respond(id, response));
  handle('system:diagnostics', () => systemService.diagnostics());
  handle('network:ping', (host, count) => networkTools.ping(host, count));
  handle('network:traceroute', (host) => networkTools.traceroute(host));
  handle('network:dns', (host, type) => networkTools.dnsLookup(host, type));
  handle('network:portscan', (host, ports) => networkTools.portScan(host, ports));
  handle('network:whois', (query) => networkTools.whois(query));
  handle('network:wol', (mac) => networkTools.wakeOnLan(mac));
  handle('network:cancel-all', () => networkTools.cancelAll());
  const keyMetadata = (key) => ({ name: key.name, fingerprint: key.fingerprint, type: key.type, comment: key.comment || '' });
  handle('sshkey:list', () => sshKeyService.listKeys().map(keyMetadata));
  handle('sshkey:generate', (name, type, passphrase) => keyMetadata(sshKeyService.generateKey(name, type, passphrase)));
  handle('sshkey:pubkey', (name) => sshKeyService.getPublicKey(name));
  handle('sshkey:fingerprint', (name) => sshKeyService.getFingerprint(name));
  handle('sshkey:delete', (name) => sshKeyService.deleteKey(name));
  handle('sync:configure', (config) => profileSync.configure(config));
  handle('sync:now', () => profileSync.syncNow());
  handle('sync:status', () => profileSync.getStatus());
  handle('sync:config', () => profileSync.getConfig());
  handle('sync:disable', () => profileSync.disable());
  handle('monitor:snapshot', (profile) => liveMonitor.snapshot(profile));
  handle('gateway:connect', (spec) => remoteDesktopGateway.connect(spec));
  handle('gateway:disconnect', (id) => remoteDesktopGateway.disconnect(id));
  handle('gateway:list', () => remoteDesktopGateway.list());
  handle('updates:status', () => updateService.getStatus());
  handle('updates:check', () => updateService.check());
  handle('updates:download', () => updateService.download());
  handle('updates:quit-and-install', () => updateService.quitAndInstall());
  handle('updates:restore-previous', () => updateService.restorePrevious());

  handle('clipboard:read-text', () => clipboard.readText());
  handle('clipboard:write-text', (text) => {
    if (typeof text !== 'string' || text.length > 10_000_000) throw new Error('Invalid clipboard text');
    clipboard.writeText(text);
    return true;
  });
  handle('system:open-website', () => shell.openExternal('https://auxillo.tech'));
}

function fileTransferServiceFor(profile, sftpService, ftpService) {
  return profile?.protocol === 'ftp' || profile?.protocol === 'ftps' ? ftpService : sftpService;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

module.exports = { registerIpc };
