'use strict';

const path = require('node:path');

function registerIpc({
  ipcMain,
  dialog,
  clipboard,
  shell,
  app,
  profileStore,
  settingsStore,
  terminalService,
  externalService,
  tunnelService,
  sftpService,
  vaultService,
  promptBroker,
  systemService,
  updateService,
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
  handle('profiles:import-ssh-config', () => profileStore.importSshConfig());
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
    const payload = JSON.parse(systemService.readTextFile(result.filePaths[0]));
    return { canceled: false, ...profileStore.importSafe(payload) };
  });

  handle('app:save-workspace-settings', (workspace) => settingsStore.saveWorkspace(workspace));

  handle('snippets:list', () => profileStore.snippets());
  handle('snippets:save', (snippet) => profileStore.saveSnippet(snippet));
  handle('snippets:delete', (id) => profileStore.deleteSnippet(id));

  handle('terminal:create', (request) => terminalService.create(request));
  handle('terminal:write', (id, data) => terminalService.write(id, data));
  handle('terminal:resize', (id, cols, rows) => terminalService.resize(id, cols, rows));
  handle('terminal:close', (id) => terminalService.close(id));

  handle('external:launch', (profile) => externalService.launch(profile));
  handle('tunnel:start', (tunnel) => tunnelService.start(tunnel));
  handle('tunnel:stop', (id) => tunnelService.stop(id));
  handle('tunnel:list', () => tunnelService.list());

  handle('sftp:list', (profile, remotePath) => sftpService.list(profile, remotePath));
  handle('sftp:mkdir', (profile, remotePath) => sftpService.mkdir(profile, remotePath));
  handle('sftp:rename', (profile, oldPath, newPath) => sftpService.rename(profile, oldPath, newPath));
  handle('sftp:remove', (profile, remotePath, directory) => sftpService.remove(profile, remotePath, directory));
  handle('sftp:read-text', (profile, remotePath) => sftpService.readText(profile, remotePath));
  handle('sftp:write-text', (profile, remotePath, content) => sftpService.writeText(profile, remotePath, content));
  handle('sftp:upload', async (profile, remoteDirectory) => {
    const result = await dialog.showOpenDialog(getWindow(), { title: 'Select file to upload', properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const localPath = result.filePaths[0];
    const remotePath = path.posix.join(remoteDirectory || '/', path.basename(localPath));
    await sftpService.upload(profile, localPath, remotePath);
    return { canceled: false, localPath, remotePath };
  });
  handle('sftp:download', async (profile, remotePath) => {
    const result = await dialog.showSaveDialog(getWindow(), {
      title: 'Save remote file',
      defaultPath: path.join(app.getPath('downloads'), path.posix.basename(remotePath))
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await sftpService.download(profile, remotePath, result.filePath);
    return { canceled: false, localPath: result.filePath };
  });
  handle('sftp:disconnect', (profileId) => sftpService.disconnect(profileId));

  handle('vault:status', () => vaultService.status());
  handle('vault:has', (id) => vaultService.has(id));
  handle('vault:set', (id, secret, persistent) => vaultService.set(id, secret, persistent));
  handle('vault:delete', (id) => vaultService.delete(id));

  handle('prompt:respond', (id, response) => promptBroker.respond(id, response));
  handle('system:diagnostics', () => systemService.diagnostics());
  handle('updates:status', () => updateService.getStatus());
  handle('updates:check', () => updateService.check());
  handle('updates:download', () => updateService.download());
  handle('updates:quit-and-install', () => updateService.quitAndInstall());

  handle('clipboard:read-text', () => clipboard.readText());
  handle('clipboard:write-text', (text) => {
    if (typeof text !== 'string' || text.length > 10_000_000) throw new Error('Invalid clipboard text');
    clipboard.writeText(text);
    return true;
  });
  handle('system:open-website', () => shell.openExternal('https://auxillo.tech'));
}

module.exports = { registerIpc };
