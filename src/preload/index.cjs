'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function');
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('auxCommand', Object.freeze({
  app: Object.freeze({
    getState: () => invoke('app:get-state'),
    saveWorkspaceSettings: (workspace) => invoke('app:save-workspace-settings', workspace)
  }),
  profiles: Object.freeze({
    list: () => invoke('profiles:list'),
    save: (profile) => invoke('profiles:save', profile),
    delete: (id) => invoke('profiles:delete', id),
    importSshConfig: () => invoke('profiles:import-ssh-config'),
    export: () => invoke('profiles:export'),
    import: () => invoke('profiles:import')
  }),
  terminal: Object.freeze({
    create: (request) => invoke('terminal:create', request),
    write: (id, data) => invoke('terminal:write', id, data),
    resize: (id, cols, rows) => invoke('terminal:resize', id, cols, rows),
    exportTranscript: (id) => invoke('terminal:export-transcript', id),
    saveTranscript: (id) => invoke('terminal:save-transcript', id),
    printTranscript: (id) => invoke('terminal:print-transcript', id),
    startLogging: (id) => invoke('terminal:start-logging', id),
    stopLogging: (id) => invoke('terminal:stop-logging', id),
    close: (id) => invoke('terminal:close', id),
    onData: (callback) => subscribe('terminal:data', callback),
    onExit: (callback) => subscribe('terminal:exit', callback)
  }),
  external: Object.freeze({ launch: (profile) => invoke('external:launch', profile) }),
  snippets: Object.freeze({
    list: () => invoke('snippets:list'),
    save: (snippet) => invoke('snippets:save', snippet),
    delete: (id) => invoke('snippets:delete', id)
  }),
  tunnels: Object.freeze({
    start: (tunnel) => invoke('tunnel:start', tunnel),
    stop: (id) => invoke('tunnel:stop', id),
    list: () => invoke('tunnel:list'),
    onStatus: (callback) => subscribe('tunnel:status', callback)
  }),
  sftp: Object.freeze({
    list: (profile, remotePath) => invoke('sftp:list', profile, remotePath),
    mkdir: (profile, remotePath) => invoke('sftp:mkdir', profile, remotePath),
    rename: (profile, oldPath, newPath) => invoke('sftp:rename', profile, oldPath, newPath),
    remove: (profile, remotePath, directory) => invoke('sftp:remove', profile, remotePath, directory),
    readText: (profile, remotePath) => invoke('sftp:read-text', profile, remotePath),
    writeText: (profile, remotePath, content) => invoke('sftp:write-text', profile, remotePath, content),
    upload: (profile, remoteDirectory) => invoke('sftp:upload', profile, remoteDirectory),
    download: (profile, remotePath) => invoke('sftp:download', profile, remotePath),
    disconnect: (profileId) => invoke('sftp:disconnect', profileId),
    onProgress: (callback) => subscribe('sftp:progress', callback),
    onError: (callback) => subscribe('sftp:error', callback)
  }),
  vault: Object.freeze({
    status: () => invoke('vault:status'),
    has: (id) => invoke('vault:has', id),
    set: (id, secret, persistent) => invoke('vault:set', id, secret, persistent),
    delete: (id) => invoke('vault:delete', id)
  }),
  updates: Object.freeze({
    status: () => invoke('updates:status'),
    check: () => invoke('updates:check'),
    download: () => invoke('updates:download'),
    quitAndInstall: () => invoke('updates:quit-and-install'),
    onStatus: (callback) => subscribe('updates:status', callback)
  }),
  prompts: Object.freeze({
    respond: (id, response) => invoke('prompt:respond', id, response),
    onRequest: (callback) => subscribe('prompt:request', callback)
  }),
  system: Object.freeze({
    diagnostics: () => invoke('system:diagnostics'),
    clipboardRead: () => invoke('clipboard:read-text'),
    clipboardWrite: (text) => invoke('clipboard:write-text', text),
    openWebsite: () => invoke('system:open-website')
  })
}));
