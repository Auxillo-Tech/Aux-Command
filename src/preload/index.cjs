'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
    saveWorkspaceSettings: (workspace) => invoke('app:save-workspace-settings', workspace),
    saveSidebarSettings: (sidebar) => invoke('app:save-sidebar-settings', sidebar),
    saveHighlightSettings: (highlight) => invoke('app:save-highlight-settings', highlight),
    saveOnboardingSettings: (onboarding) => invoke('app:save-onboarding-settings', onboarding),
    saveAssistSettings: (assist) => invoke('app:save-assist-settings', assist),
    saveUiSettings: (ui) => invoke('app:save-ui-settings', ui),
    saveSessions: (sessions) => invoke('app:save-sessions', sessions),
    getSessions: () => invoke('app:get-sessions')
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
    recording: (id) => invoke('terminal:recording', id),
    saveTranscript: (id) => invoke('terminal:save-transcript', id),
    printTranscript: (id) => invoke('terminal:print-transcript', id),
    startLogging: (id) => invoke('terminal:start-logging', id),
    stopLogging: (id) => invoke('terminal:stop-logging', id),
    close: (id) => invoke('terminal:close', id),
    onData: (callback) => subscribe('terminal:data', callback),
    onExit: (callback) => subscribe('terminal:exit', callback)
  }),
  external: Object.freeze({ launch: (profile) => invoke('external:launch', profile) }),
  rdp: Object.freeze({
    capabilities: () => invoke('rdp:capabilities'),
    startEmbedded: (profile) => invoke('rdp:start-embedded', profile),
    stopEmbedded: (id) => invoke('rdp:stop-embedded', id),
    listEmbedded: () => invoke('rdp:list-embedded')
  }),
  reachability: Object.freeze({
    check: (targets) => invoke('reachability:check', targets)
  }),
  vnc: Object.freeze({
    start: (profile) => invoke('vnc:start', profile),
    stop: (id) => invoke('vnc:stop', id),
    list: () => invoke('vnc:list')
  }),
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
    uploadPaths: (profile, remoteDirectory, localPaths) => invoke('sftp:upload-paths', profile, remoteDirectory, localPaths),
    download: (profile, remotePath) => invoke('sftp:download', profile, remotePath),
    disconnect: (profileId, protocol) => invoke('sftp:disconnect', profileId, protocol),
    onProgress: (callback) => subscribe('sftp:progress', callback),
    onError: (callback) => subscribe('sftp:error', callback)
  }),
  transfer: Object.freeze({
    enqueue: (spec) => invoke('transfer:enqueue', spec),
    pause: (id) => invoke('transfer:pause', id),
    resume: (id) => invoke('transfer:resume', id),
    cancel: (id) => invoke('transfer:cancel', id),
    retry: (id) => invoke('transfer:retry', id),
    list: () => invoke('transfer:list'),
    clearCompleted: () => invoke('transfer:clear-completed'),
    onUpdate: (callback) => subscribe('transfer:update', callback),
    onList: (callback) => subscribe('transfer:list', callback)
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
    filePath: (file) => webUtils.getPathForFile(file),
    clipboardRead: () => invoke('clipboard:read-text'),
    clipboardWrite: (text) => invoke('clipboard:write-text', text),
    openWebsite: () => invoke('system:open-website'),
    osInfo: () => invoke('system:os-info'),
    stats: () => invoke('system:stats')
  }),
  ai: Object.freeze({
    status: () => invoke('ai:status'),
    configure: (config) => invoke('ai:configure', config),
    ask: (request) => invoke('ai:ask', request)
  }),
  network: Object.freeze({
    ping: (host, count) => invoke('network:ping', host, count),
    traceroute: (host) => invoke('network:traceroute', host),
    dns: (host, type) => invoke('network:dns', host, type),
    portScan: (host, ports) => invoke('network:portscan', host, ports),
    whois: (query) => invoke('network:whois', query),
    wakeOnLan: (mac) => invoke('network:wol', mac),
    cancelAll: () => invoke('network:cancel-all')
  }),
  sshKeys: Object.freeze({
    list: () => invoke('sshkey:list'),
    generate: (name, type, passphrase) => invoke('sshkey:generate', name, type, passphrase),
    getPublicKey: (name) => invoke('sshkey:pubkey', name),
    fingerprint: (name) => invoke('sshkey:fingerprint', name),
    delete: (name) => invoke('sshkey:delete', name)
  }),
  sync: Object.freeze({
    configure: (config) => invoke('sync:configure', config),
    syncNow: () => invoke('sync:now'),
    status: () => invoke('sync:status'),
    config: () => invoke('sync:config'),
    disable: () => invoke('sync:disable'),
    onStatus: (callback) => subscribe('sync:status', callback)
  }),
  monitor: Object.freeze({
    snapshot: (profile) => invoke('monitor:snapshot', profile)
  }),
  gateway: Object.freeze({
    connect: (spec) => invoke('gateway:connect', spec),
    disconnect: (id) => invoke('gateway:disconnect', id),
    list: () => invoke('gateway:list'),
    onStatus: (callback) => subscribe('gateway:status', callback)
  })
}));
