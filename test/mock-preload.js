'use strict';

(() => {
  const listeners = new Map();
  const on = (channel, callback) => {
    if (!listeners.has(channel)) listeners.set(channel, []);
    listeners.get(channel).push(callback);
    return () => {};
  };
  const emit = (channel, payload) => (listeners.get(channel) || []).forEach((callback) => callback(payload));
  let counter = 0;
  const profiles = [
    { id: 'local-shell', name: 'jd@aux-workstation', protocol: 'local', group: 'Local', host: '', port: 0, favorite: false },
    { id: 'prod-gateway', name: 'Production Gateway', protocol: 'ssh', group: 'Auxillo Cloud', host: 'gateway.eu-west.auxillo.internal', port: 22, username: 'jd', favorite: true, useSshConfig: true, sftpRoot: '/srv/auxillo', keepAliveSeconds: 30 },
    { id: 'edge-lisbon', name: 'Lisbon Edge', protocol: 'ssh', group: 'Auxillo Cloud', host: 'edge-lis-01.auxillo.internal', port: 2222, username: 'ops', favorite: false, useSshConfig: true, sftpRoot: '/var/log', keepAliveSeconds: 30 },
    { id: 'client-rdp', name: 'Client Windows Host', protocol: 'rdp', group: 'Customer Systems', host: '10.40.10.20', port: 3389, username: 'administrator', favorite: false }
  ];
  const diagnostics = {
    platform: 'linux', architecture: 'x64', hostname: 'aux-workstation', shell: '/bin/bash', sshAgent: true,
    tools: ['ssh', 'sftp', 'scp', 'Mosh', 'RDP', 'VNC', 'Serial bridge', 'Telnet bridge'].map((name) => ({ name, available: true, executable: `/usr/bin/${name.toLowerCase().split(' ')[0]}`, candidates: [name.toLowerCase()] })),
    protocols: [
      { protocol: 'local', mode: 'builtin-python-pty', available: true, detail: 'Local shells run through the bundled Python PTY bridge.' },
      { protocol: 'ssh', mode: 'builtin-node-ssh2-and-openssh', available: true, detail: 'Terminal SSH uses OpenSSH.' },
      { protocol: 'sftp', mode: 'builtin-node-ssh2', available: true, detail: 'Graphical SFTP uses bundled ssh2.' },
      { protocol: 'telnet', mode: 'bundled-python-bridge', available: true, detail: 'No host telnet binary required.' },
      { protocol: 'serial', mode: 'bundled-python-bridge', available: true, detail: 'No host picocom binary required.' },
      { protocol: 'rdp', mode: 'external-client', available: true, detail: 'Launches FreeRDP.' },
      { protocol: 'vnc', mode: 'external-client', available: true, detail: 'Launches VNC viewer.' },
      { protocol: 'x11-forwarding', mode: 'openssh-x11-forwarding', available: true, detail: 'Uses OpenSSH -X.' }
    ]
  };
  window.addEventListener('error', (event) => { document.documentElement.dataset.previewError = event.message; });
  window.addEventListener('unhandledrejection', (event) => { document.documentElement.dataset.previewError = String(event.reason?.message || event.reason); });

  window.auxCommand = {
    app: { getState: async () => ({ version: '0.1.0', name: 'Aux Command', profiles, snippets: [], sessions: [], tunnels: [], vault: { persistentEncryptionAvailable: true }, diagnostics }) },
    profiles: {
      list: async () => profiles,
      save: async (profile) => profile,
      delete: async () => true,
      importSshConfig: async () => ({ found: 0, added: 0, profiles }),
      export: async () => ({ canceled: false, filePath: '/home/jd/aux-command-profiles.json' }),
      import: async () => ({ canceled: true })
    },
    terminal: {
      create: async ({ profile }) => {
        const id = `preview-session-${++counter}`;
        setTimeout(() => emit('terminal:data', { id, data: `Aux Command secure session\\nConnecting to ${profile.username || 'jd'}@${profile.host}...\\nAuthenticated with SSH agent.\\n\\n${profile.username || 'jd'}@prod-gw:~$ systemctl --failed\\n  UNIT LOAD ACTIVE SUB DESCRIPTION\\n0 loaded units listed.\\n${profile.username || 'jd'}@prod-gw:~$ _` }), 180);
        return { id, title: profile.name, protocol: profile.protocol, profileId: profile.id };
      },
      write: async () => true,
      resize: async () => true,
      close: async () => true,
      onData: (callback) => on('terminal:data', callback),
      onExit: (callback) => on('terminal:exit', callback)
    },
    external: { launch: async () => ({ executable: '/usr/bin/xfreerdp3', pid: 1000 }) },
    tunnels: { start: async (tunnel) => ({ ...tunnel, status: 'running', startedAt: new Date().toISOString() }), stop: async () => true, list: async () => [], onStatus: (callback) => on('tunnel:status', callback) },
    sftp: {
      list: async (_profile, path) => path === '/srv/auxillo/releases'
        ? [{ name: 'aux-api-2026.07.22.tar.zst', path: '/srv/auxillo/releases/aux-api-2026.07.22.tar.zst', permissions: '-rw-r-----', size: 24800000, modifiedAt: new Date().toISOString(), directory: false }]
        : [
            { name: 'releases', path: `${path}/releases`.replace('//', '/'), permissions: 'drwxr-x---', size: 4096, modifiedAt: new Date().toISOString(), directory: true },
            { name: 'backups', path: `${path}/backups`.replace('//', '/'), permissions: 'drwx------', size: 4096, modifiedAt: new Date().toISOString(), directory: true },
            { name: 'deploy.log', path: `${path}/deploy.log`.replace('//', '/'), permissions: '-rw-r-----', size: 184200, modifiedAt: new Date().toISOString(), directory: false },
            { name: 'compose.yaml', path: `${path}/compose.yaml`.replace('//', '/'), permissions: '-rw-r-----', size: 4216, modifiedAt: new Date().toISOString(), directory: false }
          ],
      mkdir: async () => true, rename: async () => true, remove: async () => true,
      upload: async () => ({ canceled: true }), download: async () => ({ canceled: true }), disconnect: async () => true,
      onProgress: (callback) => on('sftp:progress', callback), onError: (callback) => on('sftp:error', callback)
    },
    vault: { status: async () => ({ persistentEncryptionAvailable: true }), has: async () => false, set: async () => ({ persistent: true }), delete: async () => true },
    prompts: { respond: async () => true, onRequest: (callback) => on('prompt:request', callback) },
    system: { diagnostics: async () => diagnostics, clipboardRead: async () => '', clipboardWrite: async () => true, openWebsite: async () => true }
  };
})();
