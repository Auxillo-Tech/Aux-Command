'use strict';

(() => {
  const api = window.auxCommand;
  if (!api) {
    document.body.textContent = uiText('Aux Command preload API is unavailable.');
    return;
  }

  function uiText(source, values) { return window.AuxI18n?.message(source, values) || source; }
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    appShell: $('#app-shell'),
    sidebarToggle: $('#sidebar-toggle'),
    brandButton: $('#brand-button'),
    quickInput: $('#quick-input'),
    quickProtocol: $('#quick-protocol'),
    quickButton: $('#quick-button'),
    localButton: $('#local-button'),
    snippetsButton: $('#snippets-button'),
    tunnelsButton: $('#tunnels-button'),
    tunnelStatusCluster: $('#tunnel-status-cluster'),
    tunnelStatusSummary: $('#tunnel-status-summary'),
    tunnelStatusDots: $('#tunnel-status-dots'),
    updatesButton: $('#updates-button'),
    diagnosticsButton: $('#diagnostics-button'),
    sshKeysButton: $('#sshkeys-button'),
    monitorButton: $('#monitor-button'),
    gatewayButton: $('#gateway-button'),
    syncButton: $('#sync-button'),
    websiteButton: $('#website-button'),
    statusbarWebsite: $('#statusbar-website'),
    paletteButton: $('#palette-button'),
    newProfileButton: $('#new-profile-button'),
    newGroupButton: $('#new-group-button'),
    profileSearch: $('#profile-search'),
    importSshButton: $('#import-ssh-button'),
    profileMenuButton: $('#profile-menu-button'),
    assistButton: $('#assist-button'),
    hostStats: $('#host-stats'),
    languageSelect: $('#language-select'),
    profileList: $('#profile-list'),
    connectionCount: $('#connection-count'),
    agentStatus: $('#agent-status'),
    tabbar: $('#session-tabs'),
    tabbarSpacer: $('.tabbar-spacer'),
    layoutToggle: $('#layout-toggle'),
    maximizeTerminal: $('#maximize-terminal'),
    broadcastToggle: $('#broadcast-toggle'),
    broadcastWarning: $('#broadcast-warning'),
    terminalSearchToggle: $('#terminal-search-toggle'),
    highlightToggle: $('#highlight-toggle'),
    exportTranscriptButton: $('#export-transcript-button'),
    terminalLogButton: $('#terminal-log-button'),
    macroRecordButton: $('#macro-record-button'),
    terminalSearchHost: $('#terminal-search-host'),
    duplicateSessionButton: $('#duplicate-session-button'),
    reconnectSessionButton: $('#reconnect-session-button'),
    paneShrinkButton: $('#pane-shrink-button'),
    paneGrowButton: $('#pane-grow-button'),
    sftpToggle: $('#sftp-toggle'),
    welcome: $('#welcome'),
    welcomeLocal: $('#welcome-local'),
    welcomeProfile: $('#welcome-profile'),
    welcomeImport: $('#welcome-import'),
    terminalStack: $('#terminal-stack'),
    initializationError: $('#initialization-error'),
    initializationErrorDetail: $('#initialization-error-detail'),
    retryInitialization: $('#retry-initialization'),
    errorDiagnostics: $('#error-diagnostics'),
    sftpPanel: $('#sftp-panel'),
    sftpTitle: $('#sftp-title'),
    sftpClose: $('#sftp-close'),
    sftpUp: $('#sftp-up'),
    sftpPath: $('#sftp-path'),
    sftpRefresh: $('#sftp-refresh'),
    sftpUpload: $('#sftp-upload'),
    sftpDownload: $('#sftp-download'),
    sftpEdit: $('#sftp-edit'),
    sftpMkdir: $('#sftp-mkdir'),
    sftpMore: $('#sftp-more'),
    fileList: $('#file-list'),
    sftpEmpty: $('#sftp-empty'),
    transferStatus: $('#transfer-status'),
    globalStatusDot: $('#global-status-dot'),
    globalStatus: $('#global-status'),
    activeSessionLabel: $('#active-session-label'),
    appVersion: $('#app-version'),
    toastRegion: $('#toast-region'),
    welcomeTour: $('#welcome-tour'),
    tourRoot: $('#tour-root'),
    tourBackdrop: $('#tour-backdrop'),
    tourHighlight: $('#tour-highlight'),
    tourPopover: $('#tour-popover'),
    tourStepCount: $('#tour-step-count'),
    tourTitle: $('#tour-title'),
    tourBody: $('#tour-body'),
    tourSkip: $('#tour-skip'),
    tourPrev: $('#tour-prev'),
    tourNext: $('#tour-next'),
    modalRoot: $('#modal-root')
  };

  const state = {
    focusMode: false,
    fullscreen: false,
    namedWorkspaces: [],
    restoringSessions: false,
    profileView: 'all',
    ui: { density: 'comfortable', sidebarHidden: false },
    profiles: [],
    snippets: [],
    customGroups: [],
    collapsedGroups: new Set(),
    highlight: { enabled: false, rules: [], version: 0 },
    assist: {
      enabled: true,
      suggestions: true,
      autocorrect: true,
      dangerGuard: true,
      osDetection: true,
      localOsInfo: null,
      history: new Map()
    },
    health: new Map(),
    healthTimer: null,
    healthChecking: false,
    tabs: new Map(),
    activeTabId: '',
    layout: 'single',
    paneMinWidth: 320,
    paneMinHeight: 220,
    initializing: true,
    workspacePersistTimer: null,
    broadcastInput: false,
    terminalSearchOpen: false,
    terminalSearchQuery: '',
    macroRecording: null,
    multiRun: null,
    ai: null,
    selectedProfileId: '',
    diagnostics: null,
    updates: null,
    vault: null,
    tunnels: new Map(),
    pendingTerminalData: new Map(),
    promptQueue: [],
    promptActive: false,
    sftp: {
      open: false,
      profile: null,
      ownerTabId: '',
      detached: false,
      syncToken: 0,
      path: '/',
      entries: [],
      filter: { query: '', hidden: true, sort: 'name' },
      selectedPath: '',
      selection: new Set(),
      selectionAnchor: '',
      requestToken: 0,
      lastError: ''
    },
    transferQueue: {
      entries: [],
      expanded: false
    }
  };

  const defaultTerminalFont = 'JetBrains Mono, Fira Code, Cascadia Code, DejaVu Sans Mono, monospace';
  const terminalThemes = Object.freeze({
    'aux-dark': Object.freeze({
      background: '#050b10',
      foreground: '#dcecf4',
      cursor: '#59dfff',
      cursorAccent: '#050b10',
      selectionBackground: '#24576b',
      selectionInactiveBackground: '#183744',
      black: '#061016',
      red: '#ff7185',
      green: '#55efb5',
      yellow: '#ffca6a',
      blue: '#66a9ff',
      magenta: '#c28cff',
      cyan: '#59dfff',
      white: '#dcecf4',
      brightBlack: '#748d9b',
      brightRed: '#ff9aa8',
      brightGreen: '#83f7cb',
      brightYellow: '#ffdc98',
      brightBlue: '#91c2ff',
      brightMagenta: '#d9b5ff',
      brightCyan: '#94ecff',
      brightWhite: '#ffffff'
    }),
    light: Object.freeze({
      background: '#f6fafc',
      foreground: '#152833',
      cursor: '#007399',
      cursorAccent: '#f6fafc',
      selectionBackground: '#b8e7f5',
      selectionInactiveBackground: '#d8e8ee',
      black: '#0d1c26',
      red: '#b4233c',
      green: '#087b52',
      yellow: '#8a5a00',
      blue: '#155db1',
      magenta: '#7047a8',
      cyan: '#007399',
      white: '#e7eef2',
      brightBlack: '#637985',
      brightRed: '#d93452',
      brightGreen: '#0a9f6a',
      brightYellow: '#a66f00',
      brightBlue: '#2476d6',
      brightMagenta: '#8e62cf',
      brightCyan: '#0096c7',
      brightWhite: '#ffffff'
    }),
    'high-contrast': Object.freeze({
      background: '#000000',
      foreground: '#f7fbff',
      cursor: '#00ffff',
      cursorAccent: '#000000',
      selectionBackground: '#005f73',
      selectionInactiveBackground: '#263238',
      black: '#000000',
      red: '#ff4d6d',
      green: '#00ff99',
      yellow: '#ffe066',
      blue: '#66b3ff',
      magenta: '#d28cff',
      cyan: '#00ffff',
      white: '#f7fbff',
      brightBlack: '#8a99a6',
      brightRed: '#ff879b',
      brightGreen: '#78ffc4',
      brightYellow: '#fff1a8',
      brightBlue: '#a8d4ff',
      brightMagenta: '#e6c7ff',
      brightCyan: '#9cffff',
      brightWhite: '#ffffff'
    }),
    'nord': Object.freeze({
      background: '#2e3440', foreground: '#d8dee9', cursor: '#88c0d0', cursorAccent: '#2e3440',
      selectionBackground: '#434c5e', selectionInactiveBackground: '#3b4252',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4'
    }),
    'dracula': Object.freeze({
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36',
      selectionBackground: '#44475a', selectionInactiveBackground: '#363849',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff'
    }),
    'solarized-dark': Object.freeze({
      background: '#002b36', foreground: '#839496', cursor: '#839496', cursorAccent: '#002b36',
      selectionBackground: '#073642', selectionInactiveBackground: '#04313d',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#859900', brightYellow: '#b58900', brightBlue: '#268bd2', brightMagenta: '#d33682', brightCyan: '#2aa198', brightWhite: '#fdf6e3'
    }),
    'solarized-light': Object.freeze({
      background: '#fdf6e3', foreground: '#586e75', cursor: '#586e75', cursorAccent: '#fdf6e3',
      selectionBackground: '#eee8d5', selectionInactiveBackground: '#e8e2cf',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#859900', brightYellow: '#b58900', brightBlue: '#268bd2', brightMagenta: '#d33682', brightCyan: '#2aa198', brightWhite: '#fdf6e3'
    }),
    'one-dark': Object.freeze({
      background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', cursorAccent: '#282c34',
      selectionBackground: '#3e4451', selectionInactiveBackground: '#323843',
      black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
      brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#c8ccd4'
    }),
    'catppuccin-mocha': Object.freeze({
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', cursorAccent: '#1e1e2e',
      selectionBackground: '#45475a', selectionInactiveBackground: '#363849',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8'
    }),
    'tokyo-night': Object.freeze({
      background: '#1a1b26', foreground: '#a9b1d6', cursor: '#c0caf5', cursorAccent: '#1a1b26',
      selectionBackground: '#33467c', selectionInactiveBackground: '#293a6c',
      black: '#32344a', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
      brightBlack: '#444b6a', brightRed: '#ff9eae', brightGreen: '#b4f07a', brightYellow: '#f8c572', brightBlue: '#94b4fc', brightMagenta: '#cba8ff', brightCyan: '#92e2ff', brightWhite: '#c0caf5'
    }),
    'gruvbox-dark': Object.freeze({
      background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', cursorAccent: '#282828',
      selectionBackground: '#504945', selectionInactiveBackground: '#3c3836',
      black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921', blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
      brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2'
    }),
    'monokai': Object.freeze({
      background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#272822',
      selectionBackground: '#49483e', selectionInactiveBackground: '#3b3a32',
      black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75', blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
      brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75', brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5'
    }),
    'oceanic-next': Object.freeze({
      background: '#1b2b34', foreground: '#cdd3de', cursor: '#cdd3de', cursorAccent: '#1b2b34',
      selectionBackground: '#343d46', selectionInactiveBackground: '#2c3540',
      black: '#1b2b34', red: '#ec5f67', green: '#99c794', yellow: '#fac863', blue: '#6699cc', magenta: '#c594c5', cyan: '#5fb3b3', white: '#cdd3de',
      brightBlack: '#65737e', brightRed: '#ec5f67', brightGreen: '#99c794', brightYellow: '#fac863', brightBlue: '#6699cc', brightMagenta: '#c594c5', brightCyan: '#5fb3b3', brightWhite: '#d8dee9'
    }),
    'material': Object.freeze({
      background: '#263238', foreground: '#eeffff', cursor: '#80cbc4', cursorAccent: '#263238',
      selectionBackground: '#37474f', selectionInactiveBackground: '#2e3c43',
      black: '#000000', red: '#e53935', green: '#91b859', yellow: '#ffb62c', blue: '#6182b8', magenta: '#9c3eda', cyan: '#39adb5', white: '#eeffff',
      brightBlack: '#546e7a', brightRed: '#e53935', brightGreen: '#91b859', brightYellow: '#ffb62c', brightBlue: '#6182b8', brightMagenta: '#9c3eda', brightCyan: '#39adb5', brightWhite: '#ffffff'
    })
  });

  function node(tag, options = {}, children = []) {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = String(options.text);
    if (options.type) element.type = options.type;
    if (options.value !== undefined) element.value = String(options.value);
    if (options.name) element.name = options.name;
    if (options.placeholder) element.placeholder = options.placeholder;
    if (options.title) element.title = options.title;
    if (options.id) element.id = options.id;
    if (options.attrs) {
      for (const [name, value] of Object.entries(options.attrs)) {
        if (value === false || value === null || value === undefined) continue;
        element.setAttribute(name, value === true ? '' : String(value));
      }
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined) continue;
      element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
  }

  function errorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error || 'Unknown error');
    return raw.replace(/^Error invoking remote method '[^']+':\s*/u, '').replace(/^Error:\s*/u, '');
  }

  // Informational status text returns to "Ready" after a while so it never
  // describes something that happened long ago; busy and error states stay.
  let statusResetTimer = 0;
  function setStatus(message, kind = 'ready') {
    window.clearTimeout(statusResetTimer);
    if (kind === 'ready' && message !== window.AuxI18n?.t('status.ready')) {
      statusResetTimer = window.setTimeout(() => setStatus(window.AuxI18n.t('status.ready')), 15_000);
    }
    elements.globalStatus.textContent = message;
    elements.globalStatusDot.className = 'status-dot';
    if (kind === 'busy') elements.globalStatusDot.classList.add('busy');
    if (kind === 'error') elements.globalStatusDot.classList.add('error');
  }

  function updateUpdateState(status = {}) {
    state.updates = { ...(state.updates || {}), ...(status || {}) };
    if (status.error) toast(uiText('Update check failed'), status.error, 'error');
    else if (status.downloaded) toast(uiText('Update ready'), uiText("Aux Command {p0} is ready to install.", { p0: status.latestVersion || '' }), 'success');
    else if (status.updateAvailable) toast(uiText('Update available'), uiText("Aux Command {p0} is available.", { p0: status.latestVersion || '' }), 'success');
  }

  function describeUpdateState(status = state.updates || {}) {
    if (!status.supported) return status.error || 'Update checks are enabled only in packaged GitHub releases.';
    if (status.checking) return 'Checking GitHub Releases...';
    if (status.downloaded) return `Authenticated update ${status.latestVersion || ''} downloaded; restart to install.`;
    if (status.updateAvailable) return `${status.authenticated ? 'Authenticated' : 'Unverified'} update available: ${status.latestVersion || 'new version'}`;
    if (status.latestVersion) return `Current: ${status.latestVersion}`;
    return 'Manual check available.';
  }

  function updateActionButtons(updateStatus = state.updates || {}, afterAction = () => {}) {
    const checkUpdateButton = node('button', { type: 'button', className: 'mini-button', text: updateStatus.checking ? uiText('Checking…') : uiText('Check for updates') });
    checkUpdateButton.disabled = Boolean(updateStatus.checking);
    checkUpdateButton.addEventListener('click', async () => {
      try {
        updateUpdateState(await api.updates.check());
        setStatus(describeUpdateState(), state.updates?.error ? 'error' : 'ready');
      } catch (error) {
        updateUpdateState({ error: errorMessage(error), checking: false });
      }
      afterAction();
    });
    const updateActions = [checkUpdateButton];
    if (updateStatus.updateAvailable && !updateStatus.downloaded) {
      const downloadButton = node('button', { type: 'button', className: 'mini-button primary', text: uiText('Download update') });
      downloadButton.addEventListener('click', async () => {
        try { updateUpdateState(await api.updates.download()); }
        catch (error) { updateUpdateState({ error: errorMessage(error), checking: false }); }
        afterAction();
      });
      updateActions.push(downloadButton);
    }
    if (updateStatus.downloaded) {
      const installButton = node('button', { type: 'button', className: 'mini-button primary', text: uiText('Restart and install') });
      installButton.addEventListener('click', () => api.updates.quitAndInstall().catch((error) => updateUpdateState({ error: errorMessage(error) })));
      updateActions.push(installButton);
    }
    if (updateStatus.recoveryAvailable) {
      const restore = node('button', { type: 'button', className: 'mini-button', text: uiText("Restore previous version ({p0})", { p0: updateStatus.recoveryVersion }) });
      restore.addEventListener('click', () => showModal({ title: uiText('Restore previous AppImage?'), description: uiText('This replaces the AppImage on disk with the saved previous version. Your current sessions keep running until you close the application.'), body: node('p', { text: uiText('After restoring, close Aux Command when your work is finished and reopen the AppImage. The previous version may lack recent fixes. Workspace settings are retained.') }), actions: [{ label: uiText('Cancel'), busy: false }, { label: uiText('Restore previous version'), className: 'primary', run: async () => { const result = await api.updates.restorePrevious(); toast(uiText('Previous version restored'), result.filePath + ' — close and reopen when ready.', 'success'); return true; } }] }));
      updateActions.push(restore);
    }
    return updateActions;
  }

  function updateReleaseSection(updateStatus = state.updates || {}, afterAction = () => {}) {
    return node('div', {}, [
      node('div', { className: 'section-title', text: uiText('GitHub release updates') }),
      node('div', { className: `diagnostic-row${updateStatus.error ? '' : ' available'}` }, [
        node('span', { className: 'indicator' }),
        node('div', {}, [node('strong', { text: uiText('Update channel') }), node('small', { text: describeUpdateState(updateStatus) })]),
        node('span', { className: 'diagnostic-state', text: updateStatus.supported ? (updateStatus.authenticated ? uiText('Signed') : 'GitHub') : uiText('Source') })
      ]),
      node('div', { className: 'button-row' }, updateActionButtons(updateStatus, afterAction))
    ]);
  }

  function openUpdatesModal() {
    let controller;
    const body = node('div', { className: 'modal-sections' }, [
      updateReleaseSection(state.updates || { supported: false }, () => {
        controller?.close();
        openUpdatesModal();
      }),
      node('div', { className: 'warning-box', text: uiText('Updates install only after the published manifest and updater metadata pass OpenPGP verification with the bundled Aux Command signing key.') })
    ]);
    controller = showModal({
      title: uiText('Aux Command updates'),
      description: uiText('Check the configured GitHub release channel and install downloaded updates.'),
      body,
      className: 'narrow',
      actions: [{ label: uiText('Close'), busy: false }]
    });
  }

  async function runTask(message, task, successMessage = '') {
    setStatus(message, 'busy');
    try {
      const result = await task();
      setStatus(successMessage || 'Ready');
      return result;
    } catch (error) {
      const detail = errorMessage(error);
      setStatus(detail, 'error');
      toast(uiText('Operation failed'), detail, 'error');
      throw error;
    }
  }

  function toast(title, detail = '', kind = '') {
    if (kind !== 'error') {
      setStatus(detail ? `${title} · ${detail}` : title, kind === 'success' ? 'ready' : '');
      return;
    }
    const content = node('div', {}, [
      node('strong', { text: title }),
      detail ? node('span', { text: detail }) : null
    ]);
    const visibleToasts = [...elements.toastRegion.querySelectorAll('.toast')];
    const existing = visibleToasts.find((candidate) => candidate.dataset.toastTitle === title);
    if (existing) existing.remove();
    const toasts = visibleToasts.filter((candidate) => candidate !== existing && candidate.isConnected);
    for (const stale of toasts.slice(0, Math.max(0, toasts.length - 2))) stale.remove();
    const item = node('div', {
      className: `toast ${kind}`.trim(),
      attrs: { role: kind === 'error' ? 'alert' : 'status' }
    }, content);
    item.dataset.toastTitle = title;
    elements.toastRegion.append(item);
    window.setTimeout(() => item.remove(), kind === 'error' ? 6500 : 3200);
  }

  function formatTarget(profile) {
    if (profile.protocol === 'local') return uiText('Local machine');
    if (profile.protocol === 'serial') return `${profile.device} · ${profile.baudRate}`;
    const user = profile.username ? `${profile.username}@` : '';
    return `${user}${profile.host}${profile.port ? `:${profile.port}` : ''}`;
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let amount = bytes;
    let unit = -1;
    do {
      amount /= 1024;
      unit += 1;
    } while (amount >= 1024 && unit < units.length - 1);
    return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
  }

  function isFileTransferProfile(profile) {
    return profile?.protocol === 'ssh' || profile?.protocol === 'ftp' || profile?.protocol === 'ftps';
  }

  function normalizeRemotePath(raw) {
    const parts = String(raw || '/').replaceAll('\\', '/').split('/');
    const stack = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    return `/${stack.join('/')}` || '/';
  }

  // A new or renamed entry is a single name in the current folder. Slashes,
  // '.', '..' and control characters are refused instead of being silently
  // rewritten, so what the user typed is exactly what gets created.
  function validEntryName(input) {
    const name = String(input || '').trim();
    if (!name) throw new Error(uiText('Enter a name.'));
    if (name === '.' || name === '..' || name.includes('/') || /[\x00-\x1f\x7f]/u.test(name)) throw new Error(uiText('Names cannot contain "/", control characters, or be "." or "..".'));
    return name;
  }

  function joinRemote(base, name) {
    return normalizeRemotePath(`${normalizeRemotePath(base)}/${validEntryName(name)}`);
  }

  function parentRemote(remotePath) {
    const path = normalizeRemotePath(remotePath);
    if (path === '/') return '/';
    return normalizeRemotePath(path.split('/').slice(0, -1).join('/'));
  }

  // One list of readable theme names for Settings and the connection editor.
  const THEME_LABELS = {
    'aux-dark': 'Aux dark', light: 'Light', 'high-contrast': 'High contrast', nord: 'Nord', dracula: 'Dracula',
    'solarized-dark': 'Solarized dark', 'solarized-light': 'Solarized light', 'one-dark': 'One dark',
    'catppuccin-mocha': 'Catppuccin mocha', 'tokyo-night': 'Tokyo night', 'gruvbox-dark': 'Gruvbox dark',
    monokai: 'Monokai', 'oceanic-next': 'Oceanic next', material: 'Material'
  };
  function themeLabel(key) { return THEME_LABELS[key] ? uiText(THEME_LABELS[key]) : key; }

  function terminalOptionsForProfile(profile) {
    if (profile?.inheritTerminalDefaults || !profile?.terminalFontSize) profile = { ...profile, ...state.ui.terminalDefaults };
    const themeName = terminalThemes[profile?.terminalTheme] ? profile.terminalTheme : 'aux-dark';
    const cursorStyle = ['block', 'underline', 'bar'].includes(profile?.terminalCursorStyle) ? profile.terminalCursorStyle : 'block';
    const fontSize = Number.isInteger(Number(profile?.terminalFontSize)) ? Math.min(32, Math.max(8, Number(profile.terminalFontSize))) : 13;
    const scrollback = Number.isInteger(Number(profile?.terminalScrollback)) ? Math.min(200_000, Math.max(1_000, Number(profile.terminalScrollback))) : 20_000;
    return {
      allowProposedApi: false,
      allowTransparency: false,
      convertEol: true,
      cursorBlink: profile?.terminalCursorBlink !== false,
      cursorStyle,
      drawBoldTextInBrightColors: true,
      fontFamily: String(profile?.terminalFontFamily || defaultTerminalFont).trim().slice(0, 240) || defaultTerminalFont,
      fontSize,
      fontWeight: '400',
      fontWeightBold: '700',
      letterSpacing: 0,
      lineHeight: 1.12,
      minimumContrastRatio: 4.5,
      // Selecting the word under the pointer on right-click replaced the
      // user's highlight and made right-click paste impossible over text.
      rightClickSelectsWord: false,
      // OSC 8 hyperlinks from remote output follow the same rule as plain
      // links: Ctrl+click, http and https only (enforced again in main).
      linkHandler: {
        allowNonHttpProtocols: false,
        activate: (event, uri) => {
          if (!(event.ctrlKey || event.metaKey)) return;
          api.system.openUrl(uri).catch((error) => toast(uiText('Could not open link'), errorMessage(error), 'error'));
        }
      },
      scrollback,
      smoothScrollDuration: 80,
      theme: terminalThemes[themeName]
    };
  }

  // Clipboard text is untrusted. An embedded ESC[201~ would end bracketed
  // paste early and run the rest as typed input, so escape and control
  // characters are removed (tabs and line breaks stay), as VTE and kitty do.
  function sanitizePasteText(text) {
    return String(text || '').replace(/\r\n?/gu, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/gu, '');
  }

  // Multi-line pastes run each line immediately in shells without bracketed
  // paste (sh, busybox, network devices), and broadcast sends them to every
  // tab, so both are confirmed first unless the user turned the check off.
  async function confirmTerminalPaste(tab, text) {
    const multiline = /\n/u.test(text.replace(/\n$/u, ''));
    const targets = state.broadcastInput ? [...state.tabs.values()].filter((candidate) => candidate.terminal && !candidate.closed) : [tab];
    if (state.ui.terminalPasteWarning === false || (!multiline && targets.length < 2)) return true;
    const lines = text.replace(/\n$/u, '').split('\n');
    const preview = lines.slice(0, 20).join('\n') + (lines.length > 20 ? `\n… ${uiText('{p0} more lines', { p0: lines.length - 20 })}` : '');
    const confirmed = await confirmAction({
      title: multiline ? uiText('Paste {p0} lines?', { p0: lines.length }) : uiText('Paste into {p0} sessions?', { p0: targets.length }),
      description: `${targets.length > 1 ? uiText('Broadcast is on. This goes to: {p0}', { p0: targets.map((target) => target.title).join(', ') }) + '\n\n' : ''}${preview}`,
      confirmLabel: uiText('Paste')
    });
    tab.terminal.focus();
    return confirmed;
  }

  // Web links in terminal output open in the browser on Ctrl+click, as in
  // GNOME Terminal and Konsole. A plain click keeps selecting text.
  const terminalLinkPattern = /\bhttps?:\/\/[^\s"'<>`]+/giu;
  function registerTerminalLinks(terminal) {
    terminal.registerLinkProvider({
      provideLinks(lineNumber, callback) {
        const line = terminal.buffer.active.getLine(lineNumber - 1)?.translateToString(true) || '';
        const links = [];
        for (const match of line.matchAll(terminalLinkPattern)) {
          const text = match[0].replace(/[.,;:!?)\]}]+$/u, '');
          links.push({
            text,
            range: { start: { x: match.index + 1, y: lineNumber }, end: { x: match.index + text.length, y: lineNumber } },
            decorations: { underline: true, pointerCursor: true },
            activate(event, uri) {
              if (!(event.ctrlKey || event.metaKey)) return;
              api.system.openUrl(uri).catch((error) => toast(uiText('Could not open link'), errorMessage(error), 'error'));
            }
          });
        }
        callback(links.length ? links : undefined);
      }
    });
  }

  function field(labelText, control, help = '', className = '') {
    const label = node('label', { className: `field ${className}`.trim() }, [
      node('span', { text: labelText }),
      control,
      help ? node('small', { text: help }) : null
    ]);
    return label;
  }

  function textInput(name, value = '', options = {}) {
    return node('input', {
      type: options.type || 'text',
      name,
      value,
      placeholder: options.placeholder || '',
      attrs: {
        autocomplete: options.autocomplete || 'off',
        spellcheck: options.spellcheck === true ? 'true' : 'false',
        min: options.min,
        max: options.max,
        maxlength: options.maxlength,
        required: options.required
      }
    });
  }

  function selectInput(name, options, current) {
    const select = node('select', { name });
    for (const [value, label] of options) {
      const option = node('option', { value, text: label });
      option.selected = value === current;
      select.append(option);
    }
    return select;
  }

  function checkbox(name, text, checked = false, disabled = false) {
    const input = node('input', { type: 'checkbox', name });
    input.checked = Boolean(checked);
    input.disabled = Boolean(disabled);
    return node('label', {}, [input, node('span', { text })]);
  }

  function modalFocusableElements(modal) {
    return [...modal.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
  }

  function isEditableShortcutTarget(target) {
    if (!(target instanceof Element)) return false;
    // xterm's hidden helper textarea carries terminal focus; workspace chords
    // are still dispatched for it via the terminal's custom key handler.
    if (target.classList.contains('xterm-helper-textarea')) return false;
    if (target.closest('[contenteditable=""], [contenteditable="true"]')) return true;
    return target.matches('input, textarea, select');
  }

  function showModal({ title, description = '', body, className = '', closeable = true, actions = [] }) {
    const previousFocus = document.activeElement;
    const backdrop = node('div', { className: 'modal-backdrop' });
    const modal = node('section', {
      className: `modal ${className}`.trim(),
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' }
    });
    const headerCopy = node('div', {}, [
      node('h2', { text: title }),
      description ? node('p', { text: description }) : null
    ]);
    const closeButton = node('button', { type: 'button', className: 'modal-close', text: '×', title: uiText('Close'), attrs: { 'aria-label': uiText('Close dialog') } });
    if (!closeable) closeButton.hidden = true;
    const header = node('header', { className: 'modal-header' }, [headerCopy, closeButton]);
    const bodyElement = node('div', { className: 'modal-body' }, body);
    const footer = node('footer', { className: 'modal-footer' });
    modal.append(header, bodyElement, footer);
    backdrop.append(modal);
    for (const existingBackdrop of elements.modalRoot.querySelectorAll('.modal-backdrop')) {
      existingBackdrop.inert = true;
      existingBackdrop.setAttribute('aria-hidden', 'true');
    }
    elements.appShell.inert = true;
    elements.appShell.setAttribute('aria-hidden', 'true');
    elements.modalRoot.append(backdrop);

    let closed = false;
    const closeListeners = new Set();
    const close = () => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      const remainingBackdrops = [...elements.modalRoot.querySelectorAll('.modal-backdrop')];
      const topBackdrop = remainingBackdrops.at(-1);
      if (topBackdrop) {
        topBackdrop.inert = false;
        topBackdrop.removeAttribute('aria-hidden');
      } else {
        elements.appShell.inert = false;
        elements.appShell.removeAttribute('aria-hidden');
      }
      for (const listener of closeListeners) listener();
      closeListeners.clear();
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
        window.setTimeout(() => previousFocus.focus(), 0);
      }
    };
    const onClose = (listener) => {
      if (typeof listener !== 'function') return () => {};
      if (closed) listener();
      else closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    };
    closeButton.addEventListener('click', close);
    if (closeable) {
      backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) close();
      });
    }

    modal.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = modalFocusableElements(modal);
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    for (const action of actions) {
      const button = node('button', {
        type: 'button',
        className: action.className || '',
        text: action.label
      });
      if (action.disabled) button.disabled = true;
      button.addEventListener('click', async () => {
        const buttons = [...footer.querySelectorAll('button')];
        const managesBusyState = action.busy !== false;
        const previousDisabled = buttons.map((item) => item.disabled);
        try {
          if (managesBusyState) buttons.forEach((item) => { item.disabled = true; });
          const shouldClose = action.run ? await action.run({ close, modal, body: bodyElement, button }) : true;
          if (shouldClose !== false) close();
          else if (managesBusyState) buttons.forEach((item, index) => { item.disabled = previousDisabled[index]; });
        } catch (error) {
          toast(uiText('Operation failed'), errorMessage(error), 'error');
          if (managesBusyState) buttons.forEach((item, index) => { item.disabled = previousDisabled[index]; });
        }
      });
      footer.append(button);
    }

    window.setTimeout(() => {
      const focusTarget = modal.querySelector('[autofocus]:not([disabled]):not([hidden])') || modalFocusableElements(modal)[0];
      focusTarget?.focus();
    }, 0);

    return { backdrop, modal, body: bodyElement, footer, close, onClose };
  }

  function askText({ title, description = '', label = 'Value', value = '', placeholder = '', danger = false }) {
    return new Promise((resolve) => {
      const input = textInput('value', value, { placeholder });
      input.setAttribute('autofocus', '');
      const body = node('form', { className: 'form-grid' }, field(label, input, '', 'full'));
      let settled = false;
      const settle = (result, controller) => {
        if (settled) return;
        settled = true;
        controller.close();
        resolve(result);
      };
      const controller = showModal({
        title,
        description,
        body,
        className: 'narrow',
        actions: [
          { label: uiText('Cancel'), busy: false, run: () => { settle(null, controller); return false; } },
          {
            label: danger ? uiText('Confirm') : uiText('Continue'),
            className: danger ? 'danger-confirm' : 'primary',
            busy: false,
            run: () => { settle(input.value.trim(), controller); return false; }
          }
        ]
      });
      body.addEventListener('submit', (event) => {
        event.preventDefault();
        settle(input.value.trim(), controller);
      });
      controller.onClose(() => {
        if (!settled) { settled = true; resolve(null); }
      });
    });
  }

  function confirmAction({ title, description, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      const body = node('div', { className: danger ? 'warning-box danger-box' : 'warning-box', text: description });
      let settled = false;
      const finish = (answer, controller) => {
        if (settled) return;
        settled = true;
        controller.close();
        resolve(answer);
      };
      const controller = showModal({
        title,
        body,
        className: 'narrow',
        actions: [
          { label: uiText('Cancel'), busy: false, run: () => { finish(false, controller); return false; } },
          { label: confirmLabel, className: danger ? 'danger-confirm' : 'primary', busy: false, run: () => { finish(true, controller); return false; } }
        ]
      });
      controller.onClose(() => {
        if (!settled) { settled = true; resolve(false); }
      });
    });
  }

  function updateProfiles(profiles) {
    state.profiles = Array.isArray(profiles) ? profiles : [];
    if (!state.profiles.some((profile) => profile.id === state.selectedProfileId)) {
      state.selectedProfileId = state.profiles.find((profile) => profile.protocol !== 'local')?.id || state.profiles[0]?.id || '';
    }
    // Open tabs keep their profile snapshot, but a colour change in the
    // editor should show straight away.
    for (const tab of state.tabs.values()) {
      const current = state.profiles.find((profile) => profile.id === tab.profile?.id);
      if (current) { tab.profile.tabColor = current.tabColor; applyTabColor(tab.tabElement, current); }
    }
    renderProfiles();
  }

  // Connection health: a best-effort TCP reachability probe per network profile,
  // surfaced as a colored dot in the sidebar. Local and serial profiles have no
  // network endpoint and are skipped.
  function healthTargets() {
    return state.profiles
      .filter((profile) => !['local', 'serial'].includes(profile.protocol) && profile.host && profile.port)
      .map((profile) => ({ ...profile }));
  }

  async function probeConnectionHealth() {
    const targets = healthTargets();
    if (!targets.length || state.healthChecking) return;
    state.healthChecking = true;
    for (const target of targets) {
      const current = state.health.get(target.id) || {};
      state.health.set(target.id, { ...current, status: 'checking' });
    }
    updateHealthDots();
    try {
      const results = await api.reachability.check(targets);
      for (const result of results || []) {
        state.health.set(result.id, {
          status: result.reachable === null ? 'unknown' : result.reachable ? 'up' : 'down',
          latencyMs: result.latencyMs,
          error: result.error,
          checkedAt: result.checkedAt
        });
      }
    } catch (error) {
      setStatus(uiText("Reachability check failed: {p0}", { p0: errorMessage(error) }), 'error');
      for (const target of targets) state.health.delete(target.id);
    } finally {
      state.healthChecking = false;
      updateHealthDots();
    }
  }

  function healthTitle(profile) {
    const record = state.health.get(profile.id);
    if (!record || record.status === 'unknown') return `${profile.name} · ${record?.error || 'reachability unknown'}`;
    if (record.status === 'checking') return `${profile.name} · checking…`;
    if (record.status === 'up') return `${profile.name} · reachable${record.latencyMs != null ? ` (${record.latencyMs} ms)` : ''}`;
    return `${profile.name} · unreachable${record.error ? ` (${record.error})` : ''}`;
  }

  function updateHealthDots() {
    for (const dot of elements.profileList.querySelectorAll('.health-dot')) {
      const profileId = dot.dataset.profileId;
      const record = state.health.get(profileId);
      const status = record?.status || 'unknown';
      dot.className = `health-dot health-${status}`;
      dot.dataset.profileId = profileId;
      const profile = profileById(profileId);
      if (profile) dot.title = healthTitle(profile);
    }
  }

  function startHealthMonitoring() {
    if (state.healthTimer) return;
    probeConnectionHealth();
    // Re-probe periodically so the sidebar reflects endpoints going up or down.
    state.healthTimer = window.setInterval(probeConnectionHealth, 60_000);
  }

  // First-run guided tour: a spotlight walkthrough of the primary surfaces.
  const TOUR_STEPS = [
    { selector: '.tool-rail', title: 'Your tool rail', body: 'Every workstation tool lives here — snippets, tunnels, network diagnostics, the live monitor, the remote-desktop gateway, SSH keys, sync, diagnostics and updates. Hover any icon for its name.', placement: 'right' },
    { selector: '.workspace-commandbar', title: 'Quick connect', body: 'Type ssh://user@host, user@host, or a /dev/ttyUSB0 serial path and press Connect. Press Ctrl+K (outside a terminal) to jump here.', placement: 'bottom' },
    { selector: '#new-group-button', title: 'Organize with groups', body: 'Create groups to file your connections. Each connection has a ⋯ menu (or right-click) to edit, duplicate, move, or delete it.', placement: 'bottom' },
    { selector: '#palette-button', title: 'Command palette', body: 'Press Ctrl+Shift+P to search every action, connection and snippet from the keyboard — the fastest way to drive Aux Command.', placement: 'bottom' },
    { selector: '#highlight-toggle', title: 'Log highlighting', body: 'Colour keywords in terminal output for fast log triage. Open it to add rules; toggle it any time with Ctrl+Shift+H.', placement: 'bottom' },
    { selector: '#tunnel-status-cluster', title: 'Live status', body: 'Active SSH tunnels show here in the status bar, and each saved connection carries a reachability dot in the sidebar. You are ready to go.', placement: 'top', optional: true }
  ];
  let tourState = null;

  function positionTourStep() {
    if (!tourState) return;
    const step = tourState.steps[tourState.index];
    const target = step.selector ? document.querySelector(step.selector) : null;
    const highlight = elements.tourHighlight;
    const popover = elements.tourPopover;
    if (target && target.offsetParent !== null) {
      const rect = target.getBoundingClientRect();
      const pad = 6;
      highlight.hidden = false;
      highlight.style.left = `${rect.left - pad}px`;
      highlight.style.top = `${rect.top - pad}px`;
      highlight.style.width = `${rect.width + pad * 2}px`;
      highlight.style.height = `${rect.height + pad * 2}px`;
      const pop = popover.getBoundingClientRect();
      let left = rect.left;
      let top = rect.bottom + 14;
      if (step.placement === 'right') { left = rect.right + 14; top = rect.top; }
      else if (step.placement === 'top') { top = rect.top - pop.height - 14; }
      else if (step.placement === 'bottom') { top = rect.bottom + 14; }
      left = Math.max(14, Math.min(left, window.innerWidth - pop.width - 14));
      top = Math.max(14, Math.min(top, window.innerHeight - pop.height - 14));
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    } else {
      // Center the popover when the target is hidden (e.g. the optional cluster).
      highlight.hidden = true;
      popover.style.left = `${(window.innerWidth - popover.offsetWidth) / 2}px`;
      popover.style.top = `${(window.innerHeight - popover.offsetHeight) / 2}px`;
    }
  }

  function renderTourStep() {
    if (!tourState) return;
    // Skip optional steps whose target is not present.
    const step = tourState.steps[tourState.index];
    elements.tourStepCount.textContent = uiText("Step {p0} of {p1}", { p0: tourState.index + 1, p1: tourState.steps.length });
    // Translated when shown, so the tour follows the current language.
    elements.tourTitle.textContent = uiText(step.title);
    elements.tourBody.textContent = uiText(step.body);
    elements.tourPrev.disabled = tourState.index === 0;
    elements.tourNext.textContent = tourState.index === tourState.steps.length - 1 ? uiText('Finish') : uiText('Next');
    positionTourStep();
  }

  function endTour(completed) {
    if (!tourState) return;
    tourState = null;
    elements.tourRoot.hidden = true;
    window.removeEventListener('resize', positionTourStep);
    if (completed) {
      api.app.saveOnboardingSettings({ tourCompleted: true }).catch(() => {});
      toast(uiText('Tour complete'), uiText('Reopen it any time from the command palette.'), 'success');
    }
  }

  function startTour() {
    // Only steps whose control is on screen are shown, so every step has a
    // spotlight (log highlighting, for example, appears once a session is open).
    const visible = (step) => Boolean(document.querySelector(step.selector)?.getClientRects().length);
    tourState = { index: 0, direction: 1, steps: TOUR_STEPS.filter(visible) };
    if (!tourState.steps.length) { tourState = null; return; }
    elements.tourRoot.hidden = false;
    window.addEventListener('resize', positionTourStep);
    renderTourStep();
  }

  function tourNext() {
    if (!tourState) return;
    if (tourState.index >= tourState.steps.length - 1) { endTour(true); return; }
    tourState.index += 1;
    tourState.direction = 1;
    renderTourStep();
  }

  function tourPrev() {
    if (!tourState || tourState.index === 0) return;
    tourState.index -= 1;
    tourState.direction = -1;
    renderTourStep();
  }

  function maybeStartFirstRunTour(settings) {
    if (settings?.onboarding?.tourCompleted) return;
    // Give the layout a moment to settle before measuring targets.
    window.setTimeout(() => { if (!tourState) startTour(); }, 700);
  }

  function closeContextMenu() {
    document.querySelector('.context-menu')?.remove();
    document.removeEventListener('pointerdown', onContextMenuPointerDown, true);
    document.removeEventListener('keydown', onContextMenuKeyDown, true);
  }

  function onContextMenuPointerDown(event) {
    if (!event.target.closest('.context-menu')) closeContextMenu();
  }

  function onContextMenuKeyDown(event) {
    const menu = document.querySelector('.context-menu');
    if (!menu) return;
    const items = [...menu.querySelectorAll('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeContextMenu();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      closeContextMenu();
    }
  }

  function openContextMenu(anchor, items, { title = '', point = null } = {}) {
    closeContextMenu();
    const menu = node('div', { className: 'context-menu', attrs: { role: 'menu', 'aria-label': title || 'Actions' } });
    if (title) menu.append(node('div', { className: 'context-menu-title', text: title }));
    for (const item of items) {
      if (item === 'separator') {
        menu.append(node('div', { className: 'context-menu-separator', attrs: { role: 'separator' } }));
        continue;
      }
      const button = node('button', {
        type: 'button',
        className: `context-menu-item${item.danger ? ' danger' : ''}`,
        attrs: { role: 'menuitem', disabled: Boolean(item.disabled), title: item.title || false }
      }, [
        node('span', { className: 'context-menu-icon', text: item.icon || '' }),
        node('span', { className: 'context-menu-label', text: item.label }),
        item.hint ? node('span', { className: 'context-menu-hint', text: item.hint }) : null
      ]);
      button.addEventListener('click', () => {
        closeContextMenu();
        Promise.resolve(item.run()).catch((error) => toast(uiText('Action failed'), errorMessage(error), 'error'));
      });
      menu.append(button);
    }
    document.body.append(menu);
    const anchorRect = point ? { left: point.x, right: point.x, top: point.y, bottom: point.y } : anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = Math.min(anchorRect.left, window.innerWidth - menuRect.width - 8);
    let top = anchorRect.bottom + 4;
    if (top + menuRect.height > window.innerHeight - 8) top = Math.max(8, anchorRect.top - menuRect.height - 4);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${top}px`;
    document.addEventListener('pointerdown', onContextMenuPointerDown, true);
    document.addEventListener('keydown', onContextMenuKeyDown, true);
    menu.querySelector('button')?.focus();
    return menu;
  }

  async function deleteProfileWithConfirm(profile) {
    const confirmed = await confirmAction({
      title: uiText('Delete connection?'),
      description: uiText("Delete “{p0}” from Aux Command? Stored credentials for this profile will also be removed.", { p0: profile.name }),
      confirmLabel: uiText('Delete'),
      danger: true
    });
    if (!confirmed) return false;
    await api.sftp.disconnect(profile.id, profile.protocol).catch(() => {});
    await api.profiles.delete(profile.id);
    if (profile.credentialId) {
      await api.vault.delete(profile.credentialId).catch((error) => {
        toast(uiText('Credential cleanup required'), errorMessage(error), 'error');
      });
    }
    updateProfiles(await api.profiles.list());
    toast(uiText('Connection deleted'), profile.name, 'success');
    return true;
  }

  async function duplicateProfile(profile) {
    const copy = { ...profile };
    delete copy.id;
    delete copy.credentialId;
    delete copy.updatedAt;
    copy.name = `${profile.name} copy`;
    copy.favorite = false;
    const saved = await api.profiles.save(copy);
    updateProfiles(await api.profiles.list());
    state.selectedProfileId = saved.id;
    renderProfiles();
    toast(uiText('Connection duplicated'), saved.name, 'success');
  }

  async function toggleProfileFavorite(profile) {
    await api.profiles.save({ ...profile, favorite: !profile.favorite });
    updateProfiles(await api.profiles.list());
  }

  function knownGroupNames() {
    const names = new Set(state.customGroups);
    for (const profile of state.profiles) names.add(profile.group || 'Connections');
    return [...names].sort((a, b) => (a === 'Local' ? -1 : b === 'Local' ? 1 : a.localeCompare(b)));
  }

  function persistSidebarSettings() {
    api.app.saveSidebarSettings({ groups: state.customGroups })
      .catch((error) => setStatus(uiText("Sidebar settings not saved: {p0}", { p0: errorMessage(error) }), 'error'));
  }

  async function moveProfileToGroup(profile) {
    const groups = knownGroupNames().filter((name) => name !== 'Local');
    return new Promise((resolve) => {
      const select = selectInput('group', groups.map((name) => [name, name]), profile.group || 'Connections');
      const newName = textInput('newGroup', '', { placeholder: uiText('Or type a new group name') });
      const body = node('div', { className: 'form-grid' }, [
        field(uiText('Existing group'), select, '', 'full'),
        field(uiText('New group'), newName, uiText('Leave blank to use the selected group above.'), 'full')
      ]);
      showModal({
        title: uiText("Move “{p0}”", { p0: profile.name }),
        description: uiText('Choose the sidebar group this connection is filed under.'),
        body,
        className: 'narrow',
        actions: [
          { label: uiText('Cancel'), busy: false, run: () => { resolve(false); return true; } },
          {
            label: uiText('Move'),
            className: 'primary',
            run: async () => {
              const target = newName.value.trim() || select.value || 'Connections';
              await api.profiles.save({ ...profile, group: target });
              if (newName.value.trim() && !state.customGroups.includes(target)) {
                state.customGroups.push(target);
                persistSidebarSettings();
              }
              updateProfiles(await api.profiles.list());
              toast(uiText('Connection moved'), `${profile.name} → ${target}`, 'success');
              resolve(true);
              return true;
            }
          }
        ]
      });
    });
  }

  function openProfileContextMenu(profile, anchor) {
    const items = [
      { icon: '⏵', label: uiText('Connect'), run: () => connectProfile(profile) },
      { icon: '✎', label: uiText('Edit…'), run: () => openProfileModal(profile) },
      { icon: '⧉', label: uiText('Duplicate'), run: () => duplicateProfile(profile) },
      { icon: profile.favorite ? '☆' : '★', label: profile.favorite ? uiText('Remove from favorites') : uiText('Add to favorites'), run: () => toggleProfileFavorite(profile) }
    ];
    if (profile.id !== 'local-shell') {
      items.push({ icon: '⇢', label: uiText('Move to group…'), run: () => moveProfileToGroup(profile) });
      items.push('separator');
      items.push({ icon: '🗑', label: uiText('Delete…'), danger: true, run: () => deleteProfileWithConfirm(profile) });
    } else {
      items.push('separator');
      items.push({
        icon: '🗑',
        label: uiText('Delete…'),
        hint: 'Built-in',
        disabled: true,
        title: uiText('The default local shell profile cannot be deleted.'),
        run: () => {}
      });
    }
    openContextMenu(anchor, items, { title: profile.name });
  }

  async function createGroup() {
    const name = await askText({
      title: uiText('New group'),
      description: uiText('Groups organize the connections sidebar. Assign connections to a group from their context menu or editor.'),
      label: uiText('Group name'),
      placeholder: uiText('Production')
    });
    const trimmed = String(name || '').trim().replace(/\s*\/\s*/g,' / ').slice(0, 60);
    if (!trimmed) return;
    if (knownGroupNames().some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      toast(uiText('Group already exists'), trimmed, 'error');
      return;
    }
    state.customGroups.push(trimmed);
    persistSidebarSettings();
    renderProfiles();
    toast(uiText('Group created'), trimmed, 'success');
  }

  async function renameGroup(groupName) {
    const name = await askText({
      title: uiText("Rename “{p0}”", { p0: groupName }),
      label: uiText('Group name'),
      value: groupName
    });
    const trimmed = String(name || '').trim().replace(/\s*\/\s*/g,' / ').slice(0, 60);
    if (!trimmed || trimmed === groupName) return;
    const members = state.profiles.filter((profile) => (profile.group || 'Connections') === groupName || profile.group?.startsWith(groupName + ' / '));
    await api.profiles.moveGroup(groupName,trimmed);
    state.customGroups = state.customGroups.filter((existing) => existing !== groupName && !existing.startsWith(groupName + ' / '));
    if (!state.customGroups.includes(trimmed)) state.customGroups.push(trimmed);
    persistSidebarSettings();
    updateProfiles(await api.profiles.list());
    toast(uiText('Group renamed'), `${groupName} → ${trimmed}`, 'success');
  }

  async function deleteGroup(groupName) {
    const members = state.profiles.filter((profile) => (profile.group || 'Connections') === groupName || profile.group?.startsWith(groupName + ' / '));
    const confirmed = await confirmAction({
      title: uiText("Delete group “{p0}”?", { p0: groupName }),
      description: members.length
        ? uiText("Connections moving to the “Connections” group: {p0}. No connections are deleted.", { p0: members.length })
        : uiText('The empty group is removed from the sidebar.'),
      confirmLabel: uiText('Delete group'),
      danger: true
    });
    if (!confirmed) return;
    if(members.length)await api.profiles.bulkUpdate(members.map(member=>member.id),{group:'Connections'});
    state.customGroups = state.customGroups.filter((existing) => existing !== groupName && !existing.startsWith(groupName + ' / '));
    state.collapsedGroups.delete(groupName);
    persistSidebarSettings();
    updateProfiles(await api.profiles.list());
    toast(uiText('Group deleted'), groupName, 'success');
  }

  function openGroupContextMenu(groupName, anchor) {
    const items = [
      { icon: '＋', label: uiText('New connection here…'), run: () => openProfileModal(null, { group: groupName }) }
    ];
    if (groupName !== 'Local') {
      items.push({ icon: '✎', label: uiText('Rename group…'), run: () => renameGroup(groupName) });
      items.push('separator');
      items.push({ icon: '🗑', label: uiText('Delete group…'), danger: true, run: () => deleteGroup(groupName) });
    }
    openContextMenu(anchor, items, { title: groupName });
  }

  function openConnectionManager() {
    const filter = textInput('connectionFilter', '', { placeholder: uiText('Search names, hosts, folders or tags') });
    const duplicates = new Set(window.AuxWorkspace.duplicates(state.profiles).flat());
    const onlyDuplicates = checkbox('duplicatesOnly', uiText('Show possible duplicates only'), false);
    const selected = new Set(); const list = node('div', { className: 'transfer-review-list' });
    const group = textInput('bulkGroup', '', { placeholder: uiText('Examples: Production / Europe / Databases') });
    const tags = textInput('bulkTags', '', { placeholder: uiText('production, database') });
    const favorite = selectInput('bulkFavorite', [['unchanged', uiText('Keep favorites unchanged')], ['yes', uiText('Add to favorites')], ['no', uiText('Remove from favorites')]], 'unchanged');
    const count = node('p', { attrs: { role: 'status' } });
    const shown = () => window.AuxWorkspace.filterProfiles(state.profiles, filter.value).filter(p => !onlyDuplicates.querySelector('input').checked || duplicates.has(p.id));
    let limit = 200;
    const render = () => {
      list.replaceChildren(); const profiles = shown();
      for (const profile of profiles.slice(0, limit)) {
        const box = checkbox(profile.id, `${profile.name} — ${formatTarget(profile)} — ${profile.group}${duplicates.has(profile.id) ? ' · possible duplicate' : ''}`, selected.has(profile.id));
        box.querySelector('input').onchange = e => { if(e.target.checked) selected.add(profile.id); else selected.delete(profile.id); count.textContent = uiText("{p0} selected · {p1} matches", { p0: selected.size, p1: profiles.length }); };
        list.append(box);
      }
      if(profiles.length > limit) { const more = node('button',{type:'button',text:uiText('Show 200 more')}); more.onclick=()=>{limit+=200;render();};list.append(more); }
      count.textContent = uiText("{p0} selected · {p1} matches", { p0: selected.size, p1: profiles.length });
    };
    const all = node('button', { type:'button', text:uiText('Select matching connections') }); all.onclick=()=>{for(const p of shown())selected.add(p.id);render();};
    const clear = node('button', { type:'button', text:uiText('Clear selection') }); clear.onclick=()=>{selected.clear();render();};
    filter.oninput=()=>{limit=200;render();}; onlyDuplicates.onchange=render;render();
    showModal({ title:uiText('Manage connections'), description:uiText('Bulk edits preserve credentials. Duplicate matches are suggestions; nothing is merged or deleted automatically. Use / in group names for nested folders.'), className:'wide', body:node('div',{className:'modal-sections'},[filter,onlyDuplicates,node('div',{className:'button-row'},[all,clear]),count,list,field(uiText('Move selected to folder (blank keeps current)'),group),field(uiText('Replace tags (blank keeps current)'),tags),favorite]), actions:[{label:uiText('Close')},{label:uiText('Review changes'),className:'primary',run:async()=>{
      if(!selected.size)throw new Error('Select connections first');const patch={};
      if(group.value.trim())patch.group=group.value.trim();if(tags.value.trim())patch.tags=tags.value.split(',').map(t=>t.trim()).filter(Boolean);
      if(favorite.value!=='unchanged')patch.favorite=favorite.value==='yes';if(!Object.keys(patch).length)throw new Error('Choose a change first');
      // Describe the change in words and list the affected connections.
      const changes=[];
      if(patch.group)changes.push(uiText('Move to folder: {p0}',{p0:patch.group}));
      if(patch.tags)changes.push(uiText('Set tags: {p0}',{p0:patch.tags.join(', ')}));
      if('favorite' in patch)changes.push(patch.favorite?uiText('Mark as favorite'):uiText('Remove from favorites'));
      const names=state.profiles.filter(p=>selected.has(p.id)).map(p=>`• ${p.name} (${formatTarget(p)})`);
      const listed=names.slice(0,25).join('\n')+(names.length>25?`\n${uiText('…and {p0} more',{p0:names.length-25})}`:'');
      if(!await confirmAction({title:uiText('Apply bulk connection edit?'),description:`${changes.join('\n')}\n\n${uiText('{p0} connections:',{p0:selected.size})}\n${listed}`,confirmLabel:uiText('Apply changes')}))return false;
      await api.profiles.bulkUpdate([...selected],patch);updateProfiles(await api.profiles.list());toast(uiText('Connections updated'),uiText('{p0} connections changed.',{p0:selected.size}),'success');return true;
    }}] });
  }

  function renderProfiles() {
    elements.profileList.replaceChildren();
    const query = elements.profileSearch.value.trim().toLowerCase();
    const activeIds = new Set([...state.tabs.values()].filter((tab) => !tab.closed).map((tab) => tab.profile.id));
    if (state.sftp.profile) activeIds.add(state.sftp.profile.id);
    const filtered = window.AuxWorkspace.filterProfiles(state.profiles, query, state.profileView, activeIds);
    elements.connectionCount.textContent = query || state.profileView !== 'all'
      ? uiText("{p0} of {p1} profiles", { p0: filtered.length, p1: state.profiles.length })
      : window.AuxI18n.profileCount(state.profiles.length);
    for (const mode of ['all', 'favorites', 'active']) {
      $(`#profiles-${mode}`).setAttribute('aria-pressed', String(state.profileView === mode));
    }

    if (!filtered.length) {
      const empty = node('div', { className: 'list-empty' }, [
        node('strong', { text: query || state.profileView !== 'all' ? uiText('No matching connections') : uiText('No saved connections') }),
        node('span', { text: query ? uiText("Nothing matches “{p0}”.", { p0: elements.profileSearch.value.trim() }) : state.profileView === 'favorites' ? uiText('Star a connection from its actions menu to keep it here.') : state.profileView === 'active' ? uiText('Your open connections will appear here.') : uiText('Create or import a connection to get started.') })
      ]);
      if (query || state.profileView !== 'all') {
        const clear = node('button', { type: 'button', className: 'mini-button', text: uiText('Clear filter') });
        clear.addEventListener('click', () => {
          elements.profileSearch.value = '';
          state.profileView = 'all';
          renderProfiles();
          elements.profileSearch.focus();
        });
        empty.append(clear);
      }
      elements.profileList.append(empty);
      return;
    }

    const grouped = new Map();
    for (const profile of filtered) {
      const group = profile.group || 'Connections';
      const parts=group.split('/').map(part=>part.trim()).filter(Boolean);
      for(let i=1;i<parts.length;i++){const parent=parts.slice(0,i).join(' / ');if(!grouped.has(parent))grouped.set(parent,[]);}
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(profile);
    }
    // Custom groups stay visible even while empty (outside of searches), so a
    // freshly created group has somewhere to receive connections.
    if (!query && state.profileView === 'all') {
      for (const custom of state.customGroups) {
        if (!grouped.has(custom)) grouped.set(custom, []);
      }
    }

    const sortedGroups = [...grouped.entries()].sort(([a], [b]) => {
      if (a === 'Local') return -1;
      if (b === 'Local') return 1;
      return a.localeCompare(b);
    });

    for (const [group, profiles] of sortedGroups) {
      const parts=group.split('/').map(part=>part.trim()).filter(Boolean);
      if(!query && parts.slice(0,-1).some((_,i)=>state.collapsedGroups.has(parts.slice(0,i+1).join(' / '))))continue;
      const collapsed = state.collapsedGroups.has(group) && !query;
      const section = node('section', { className: `profile-group${collapsed ? ' collapsed' : ''}` });
      section.style.marginLeft=`${Math.min(parts.length-1,5)*10}px`;
      const caret = node('span', { className: 'group-caret', text: collapsed ? '▸' : '▾', attrs: { 'aria-hidden': 'true' } });
      const collapseButton = node('button', {
        type: 'button',
        className: 'group-collapse',
        attrs: { 'aria-expanded': String(!collapsed), 'aria-label': uiText("{p0} group {p1}", { p0: collapsed ? 'Expand' : 'Collapse', p1: group }) }
      }, [caret, node('span', { className: 'group-name', text: group }), node('span', { className: 'group-count', text: String(profiles.length) })]);
      collapseButton.addEventListener('click', () => {
        if (state.collapsedGroups.has(group)) state.collapsedGroups.delete(group);
        else state.collapsedGroups.add(group);
        renderProfiles();
        const restored = [...elements.profileList.querySelectorAll('.group-collapse')].find((button) => button.querySelector('.group-name').textContent === group);
        restored?.focus();
      });
      const groupMenuButton = node('button', {
        type: 'button',
        className: 'group-menu',
        text: '⋯',
        title: uiText("Group actions for {p0}", { p0: group }),
        attrs: { 'aria-label': uiText("Group actions for {p0}", { p0: group }), 'aria-haspopup': 'menu' }
      });
      groupMenuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        openGroupContextMenu(group, groupMenuButton);
      });
      section.append(node('div', { className: 'profile-group-title' }, [collapseButton, groupMenuButton]));
      if (collapsed) {
        elements.profileList.append(section);
        continue;
      }
      if (!profiles.length) {
        section.append(node('div', { className: 'group-empty', text: uiText('No connections yet') }));
        elements.profileList.append(section);
        continue;
      }
      profiles.sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.name.localeCompare(b.name));
      for (const profile of profiles.slice(0, state.profileRenderLimit || 200)) {
        const badge = node('span', { className: 'protocol-badge', text: profile.protocol === 'local' ? 'TERM' : profile.protocol });
        const networked = !['local', 'serial'].includes(profile.protocol) && profile.host && profile.port;
        if (networked) {
          const status = state.health.get(profile.id)?.status || 'unknown';
          const dot = node('span', { className: `health-dot health-${status}`, attrs: { 'data-profile-id': profile.id } });
          dot.title = healthTitle(profile);
          badge.append(dot);
        }
        const connectButton = node('button', {
          type: 'button',
          className: 'profile-connect',
          title: `${profile.name} · ${formatTarget(profile)}`,
          attrs: { 'aria-label': uiText("Connect to {p0}, {p1}", { p0: profile.name, p1: formatTarget(profile) }) }
        }, [
          badge,
          node('span', { className: 'profile-copy' }, [
            node('strong', { text: `${profile.favorite ? '★ ' : ''}${profile.name}` }),
            node('small', { text: formatTarget(profile) })
          ]),
          node('span', { className: 'profile-connect-label', text: uiText('Connect') })
        ]);
        const editButton = node('button', {
          type: 'button',
          className: 'profile-edit',
          text: '⋯',
          title: uiText("Actions for {p0}", { p0: profile.name }),
          attrs: { 'aria-label': uiText("Actions for {p0}", { p0: profile.name }), 'aria-haspopup': 'menu' }
        });
        const item = node('div', {
          className: `profile-item${profile.id === state.selectedProfileId ? ' selected' : ''}`,
          attrs: { role: 'listitem' }
        }, [connectButton, editButton]);
        applyTabColor(item, profile);
        item.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          openProfileContextMenu(profile, editButton);
        });
        connectButton.addEventListener('focus', () => {
          state.selectedProfileId = profile.id;
          elements.profileList.querySelectorAll('.profile-item.selected').forEach((candidate) => candidate.classList.remove('selected'));
          item.classList.add('selected');
        });
        connectButton.addEventListener('click', () => connectProfile(profile));
        editButton.addEventListener('click', (event) => {
          event.stopPropagation();
          openProfileContextMenu(profile, editButton);
        });
        section.append(item);
      }
      if (profiles.length > (state.profileRenderLimit || 200)) {
        const more=node('button',{type:'button',className:'mini-button',text:uiText("Show more ({p0} remaining)", { p0: profiles.length-(state.profileRenderLimit || 200) })});
        more.onclick=()=>{state.profileRenderLimit=(state.profileRenderLimit || 200)+200;renderProfiles();};section.append(more);
      }
      elements.profileList.append(section);
    }

    if (!filtered.length) {
      elements.profileList.append(node('div', { className: 'list-empty', text: uiText('No matching connections.') }));
    }
  }

  function profileById(id) {
    return state.profiles.find((profile) => profile.id === id) || null;
  }

  let sshImportPending = false;
  async function importSshConfig() {
    if (sshImportPending) return;
    sshImportPending = true;
    const buttons = [elements.importSshButton, elements.welcomeImport];
    for (const button of buttons) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    const progress = node('p', { text: uiText('Reading ~/.ssh/config and resolving its SSH hosts…'), attrs: { role: 'status', 'aria-live': 'polite' } });
    const controller = showModal({ title: uiText('Import SSH config'), body: progress, closeable: false });
    try {
      const result = await runTask(uiText('Importing SSH configuration…'), () => api.profiles.importSshConfig());
      updateProfiles(result.profiles);
      controller.close();
      showModal({ title: uiText('SSH import complete'), description: uiText("{p0} SSH host entries found.", { p0: result.found }),
        body: node('div', {}, [
          node('p', { text: uiText("{p0} added; {p1} existing profiles refreshed.", { p0: result.added, p1: result.updated || 0 }) }),
          node('p', { text: result.found ? uiText('Existing profile names, groups and saved credentials are retained. No connection is opened by importing.') : uiText('No named Host entries were found in ~/.ssh/config or its included files. Wildcard-only Host blocks do not create connection profiles.') }),
          node('p', { text: uiText('The previous profile data is available under Import / Export → Recovery points.') })
        ]), actions: [{ label: uiText('Done'), className: 'primary', busy: false }] });
    } catch (error) {
      controller.close();
      showModal({ title: uiText('SSH import failed'), body: node('p', { text: errorMessage(error) }), actions: [{ label: uiText('Close'), busy: false }] });
    } finally {
      sshImportPending = false;
      for (const button of buttons) { button.disabled = false; button.removeAttribute('aria-busy'); }
    }
  }

  async function connectProfile(profile, saved = {}) {
    if (!profile) return;
    state.selectedProfileId = profile.id;
    renderProfiles();

    if (profile.protocol === 'rdp' || profile.protocol === 'vnc') {
      const kind = profile.protocol.toUpperCase();
      try {
        const result = profile.protocol === 'vnc'
          ? await runTask(uiText("Connecting VNC to {p0}…", { p0: profile.name }), () => api.vnc.start(profile), uiText("{p0} session started", { p0: kind }))
          : await runTask(uiText("Starting embedded RDP to {p0}…", { p0: profile.name }), () => api.rdp.startEmbedded(profile), uiText("{p0} session started", { p0: kind }));
        const tab = createRemoteDesktopTab(result, profile, profile.protocol, saved);
        toast(uiText("{p0} session started", { p0: kind }), profile.name, 'success');
        return tab;
      } catch (error) {
        // A rejected or unreadable server certificate is final: the external
        // client would hit the same server and ask again.
        if (/RDP server certificate/u.test(errorMessage(error))) return;
        toast(uiText("Embedded {p0} unavailable, launching external client", { p0: kind }), errorMessage(error), 'info');
      }
      // Fall through to the external native client.
      try {
        const result = await runTask(uiText("Launching {p0}…", { p0: kind }), () => api.external.launch(profile), uiText("{p0} launched", { p0: kind }));
        toast(uiText("{p0} client launched", { p0: kind }), result.executable, 'success');
      } catch { /* runTask already surfaced the error */ }
      return;
    }

    if (profile.protocol === 'ftp' || profile.protocol === 'ftps') {
      if (profile.protocol === 'ftp') {
        const confirmed = await confirmAction({
          title: uiText('Open insecure FTP?'),
          description: uiText('Plain FTP is not encrypted. Credentials and file contents can be observed on the network. Use FTPS unless this is a trusted legacy target.'),
          confirmLabel: uiText('Open FTP file browser')
        });
        if (!confirmed) return;
      }
      state.sftp.open = true;
      state.sftp.profile = profile;
      state.sftp.ownerTabId = '';
      // FTP/FTPS browsing has no owning terminal tab; a detached panel must
      // survive tab activation instead of being resynced to the active tab.
      state.sftp.detached = true;
      elements.appShell.classList.add('sftp-open');
      elements.sftpPanel.setAttribute('aria-hidden', 'false');
      elements.sftpTitle.textContent = `${profile.name} · ${profile.protocol.toUpperCase()}`;
      const openingTitle = profile.protocol === 'ftp' ? 'Opening FTP file browser' : 'Opening FTPS file browser';
      toast(openingTitle, profile.host, profile.protocol === 'ftp' ? 'info' : 'success');
      await loadSftp(profile.sftpRoot || '/');
      renderProfiles();
      updateSessionActions();
      return;
    }

    if (!window.Terminal || !window.FitAddon?.FitAddon || !window.SearchAddon?.SearchAddon) {
      toast(uiText('Terminal runtime unavailable'), uiText('Install dependencies with npm install before starting Aux Command.'), 'error');
      return;
    }

    let session;
    try {
      session = await runTask(uiText("Connecting to {p0}…", { p0: profile.name }), () => api.terminal.create({ profile, cols: 120, rows: 34, cwd: profile.protocol === 'local' ? saved.cwd : undefined, remoteCwd: profile.protocol === 'ssh' ? saved.cwd : '' }), uiText("Session started · {p0}", { p0: profile.name }));
    } catch {
      return;
    }
    return createTerminalTab(session, profile, saved);
  }

  // Keyword highlighting for log triage. Matches in plain-text terminal output
  // are wrapped in ANSI SGR colors at display time — the same technique as
  // `grep --color`. It is display-only: the main-process transcript, session
  // logs, and exports keep the unmodified stream.
  const HIGHLIGHT_COLORS = {
    red: { rgb: [255, 92, 119], label: uiText('Red') },
    amber: { rgb: [255, 199, 92], label: uiText('Amber') },
    green: { rgb: [73, 222, 140], label: uiText('Green') },
    blue: { rgb: [94, 168, 255], label: uiText('Blue') },
    magenta: { rgb: [180, 139, 234], label: uiText('Magenta') },
    cyan: { rgb: [69, 210, 255], label: uiText('Cyan') }
  };
  // Per-connection tab colours. Keys match TAB_COLORS in validation.cjs; the
  // actual colours live in styles.css so themes can adjust them.
  const TAB_COLORS = [
    ['', uiText('None')], ['red', uiText('Red')], ['orange', uiText('Orange')], ['amber', uiText('Amber')],
    ['green', uiText('Green')], ['teal', uiText('Teal')], ['blue', uiText('Blue')], ['purple', uiText('Purple')], ['pink', uiText('Pink')]
  ];
  function applyTabColor(element, profile) {
    const color = TAB_COLORS.some(([key]) => key && key === profile?.tabColor) ? profile.tabColor : '';
    if (color) element.dataset.tabColor = color;
    else delete element.dataset.tabColor;
  }
  const HIGHLIGHT_RESET = '[39;49m';
  const MAX_HIGHLIGHT_MATCHES = 400;
  let compiledHighlightCache = { version: -1, rules: [] };

  function compileHighlightRules() {
    const compiled = [];
    for (const rule of state.highlight.rules) {
      if (!rule.enabled || !rule.pattern) continue;
      let source = rule.pattern;
      // Interpret the pattern literally unless the operator wraps it in /…/ to
      // opt into a regular expression, matching the mental model of a "find" box.
      const asRegex = source.length > 2 && source.startsWith('/') && source.endsWith('/');
      if (asRegex) source = source.slice(1, -1);
      else source = source.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      if (rule.wholeWord) source = `\\b(?:${source})\\b`;
      const color = HIGHLIGHT_COLORS[rule.color] || HIGHLIGHT_COLORS.amber;
      const [r, g, b] = color.rgb;
      // Dark text on a solid brand-colored background reads cleanly over logs.
      const sgr = `[38;2;10;14;22;48;2;${r};${g};${b}m`;
      try {
        compiled.push({ regex: new RegExp(source, `g${rule.caseSensitive ? '' : 'i'}`), sgr });
      } catch { /* an invalid regex rule is skipped rather than breaking the terminal */ }
    }
    return compiled;
  }

  function currentHighlightRules() {
    if (compiledHighlightCache.version !== state.highlight.version) {
      compiledHighlightCache = { version: state.highlight.version, rules: compileHighlightRules() };
    }
    return compiledHighlightCache.rules;
  }

  // Length of the ANSI/VT escape sequence beginning at index i (str[i] is ESC),
  // so escape sequences can be copied through verbatim while surrounding plain
  // text is highlighted.
  function escapeSequenceLength(str, i) {
    if (i + 1 >= str.length) return 1;
    const c = str[i + 1];
    if (c === '[') {
      let j = i + 2;
      while (j < str.length) {
        const code = str.charCodeAt(j);
        if (code >= 0x40 && code <= 0x7e) return j + 1 - i;
        j += 1;
      }
      return str.length - i;
    }
    if (c === ']' || c === 'P' || c === 'X' || c === '^' || c === '_') {
      // OSC/DCS/SOS/PM/APC: terminated by BEL or the ST sequence (ESC \).
      let j = i + 2;
      while (j < str.length) {
        if (c === ']' && str[j] === '\x07') return j + 1 - i;
        if (str[j] === '\x1b' && str[j + 1] === '\\') return j + 2 - i;
        j += 1;
      }
      return str.length - i;
    }
    return 2;
  }

  // Wrap keyword matches in a single, non-overlapping pass so output containing
  // no matches is returned unchanged.
  function highlightPlainRun(text) {
    const rules = currentHighlightRules();
    const spans = [];
    for (const { regex, sgr } of rules) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text))) {
        if (match[0].length === 0) { regex.lastIndex += 1; continue; }
        spans.push({ start: match.index, end: match.index + match[0].length, sgr });
        if (spans.length > MAX_HIGHLIGHT_MATCHES * rules.length) break;
      }
    }
    if (!spans.length) return text;
    // Earliest start wins; on a tie the longer match wins. Overlaps are dropped.
    spans.sort((a, b) => a.start - b.start || b.end - a.end);

    let result = '';
    let cursor = 0;
    let painted = 0;
    for (const span of spans) {
      if (span.start < cursor || painted >= MAX_HIGHLIGHT_MATCHES) continue;
      result += text.slice(cursor, span.start) + span.sgr + text.slice(span.start, span.end) + HIGHLIGHT_RESET;
      cursor = span.end;
      painted += 1;
    }
    result += text.slice(cursor);
    return result;
  }

  // Split the stream into escape sequences (copied verbatim) and plain-text runs
  // (highlighted), so injected color never corrupts cursor moves, existing
  // colors, or full-screen application output.
  function applyHighlighting(text) {
    if (!state.highlight.enabled) return text;
    if (!currentHighlightRules().length) return text;
    if (!text.includes('\x1b')) return highlightPlainRun(text);
    let out = '';
    let i = 0;
    while (i < text.length) {
      if (text[i] === '\x1b') {
        const len = escapeSequenceLength(text, i);
        out += text.slice(i, i + len);
        i += len;
        continue;
      }
      let j = i;
      while (j < text.length && text[j] !== '\x1b') j += 1;
      out += highlightPlainRun(text.slice(i, j));
      i = j;
    }
    return out;
  }

  async function persistHighlightSettings() {
    try {
      await api.app.saveHighlightSettings({ enabled: state.highlight.enabled, rules: state.highlight.rules });
    } catch (error) {
      setStatus(uiText("Highlight settings not saved: {p0}", { p0: errorMessage(error) }), 'error');
    }
  }

  function applyHighlightChange() {
    // Bumping the version invalidates the compiled-rule cache; new output picks
    // the change up immediately.
    state.highlight.version += 1;
    updateSessionActions();
    persistHighlightSettings();
  }

  function toggleHighlighting(force) {
    state.highlight.enabled = force === undefined ? !state.highlight.enabled : Boolean(force);
    if (state.highlight.enabled && !state.highlight.rules.length) {
      state.highlight.rules = defaultHighlightRules();
    }
    applyHighlightChange();
    toast(uiText('Log highlighting'), state.highlight.enabled ? uiText('Enabled for terminal output') : uiText('Disabled'), state.highlight.enabled ? 'success' : 'info');
  }

  function defaultHighlightRules() {
    return [
      { id: `rule-${Date.now()}-1`, label: uiText('Errors'), pattern: '/(error|fatal|failed|panic|denied)/', color: 'red', caseSensitive: false, wholeWord: false, enabled: true },
      { id: `rule-${Date.now()}-2`, label: uiText('Warnings'), pattern: '/(warn|warning|deprecated)/', color: 'amber', caseSensitive: false, wholeWord: false, enabled: true },
      { id: `rule-${Date.now()}-3`, label: uiText('Success'), pattern: '/\\b(success|succeeded|ok|ready|listening|started)\\b/', color: 'green', caseSensitive: false, wholeWord: false, enabled: true },
      { id: `rule-${Date.now()}-4`, label: uiText('IP addresses'), pattern: '/\\b\\d{1,3}(\\.\\d{1,3}){3}\\b/', color: 'cyan', caseSensitive: false, wholeWord: false, enabled: true }
    ];
  }

  function openHighlightManager() {
    const list = node('div', { className: 'highlight-list' });
    const renderList = () => {
      list.replaceChildren();
      if (!state.highlight.rules.length) {
        list.append(node('div', { className: 'empty-state', text: uiText('No highlight rules yet. Add one below, or load the log-triage starter set.') }));
        return;
      }
      state.highlight.rules.forEach((rule, index) => {
        const enabledBox = node('input', { type: 'checkbox' });
        enabledBox.checked = rule.enabled !== false;
        enabledBox.addEventListener('change', () => { rule.enabled = enabledBox.checked; applyHighlightChange(); });

        const patternInput = textInput('pattern', rule.pattern, { placeholder: uiText('text or /regex/') });
        patternInput.addEventListener('input', () => { rule.pattern = patternInput.value; applyHighlightChange(); });

        const labelInput = textInput('label', rule.label || '', { placeholder: uiText('Label (optional)') });
        labelInput.addEventListener('input', () => { rule.label = labelInput.value; });

        const colorSelect = selectInput('color', Object.entries(HIGHLIGHT_COLORS).map(([value, def]) => [value, def.label]), rule.color || 'amber');
        colorSelect.addEventListener('change', () => { rule.color = colorSelect.value; applyHighlightChange(); });
        colorSelect.style.borderLeft = `4px solid ${HIGHLIGHT_COLORS[rule.color]?.fg || '#ffe9b8'}`;

        const caseBox = checkbox('caseSensitive', uiText('Aa'), rule.caseSensitive);
        caseBox.title = uiText('Case sensitive');
        caseBox.querySelector('input').addEventListener('change', (event) => { rule.caseSensitive = event.target.checked; applyHighlightChange(); });
        const wordBox = checkbox('wholeWord', 'W', rule.wholeWord);
        wordBox.title = uiText('Whole word');
        wordBox.querySelector('input').addEventListener('change', (event) => { rule.wholeWord = event.target.checked; applyHighlightChange(); });

        const removeButton = node('button', { type: 'button', className: 'mini-button destructive', text: '✕', title: uiText('Delete rule') });
        removeButton.addEventListener('click', () => {
          state.highlight.rules.splice(index, 1);
          applyHighlightChange();
          renderList();
        });

        list.append(node('div', { className: 'highlight-row' }, [
          node('label', { className: 'highlight-enable', title: uiText('Enabled') }, [enabledBox]),
          node('div', { className: 'highlight-fields' }, [patternInput, labelInput]),
          colorSelect,
          node('div', { className: 'highlight-flags' }, [caseBox, wordBox]),
          removeButton
        ]));
      });
    };

    const enableToggle = checkbox('enabled', uiText('Highlight terminal output'), state.highlight.enabled);
    enableToggle.querySelector('input').addEventListener('change', (event) => {
      state.highlight.enabled = event.target.checked;
      if (state.highlight.enabled && !state.highlight.rules.length) state.highlight.rules = defaultHighlightRules();
      applyHighlightChange();
      renderList();
    });

    const addButton = node('button', { type: 'button', className: 'mini-button', text: uiText('+ Add rule') });
    addButton.addEventListener('click', () => {
      state.highlight.rules.push({ id: `rule-${Date.now()}`, label: '', pattern: '', color: 'amber', caseSensitive: false, wholeWord: false, enabled: true });
      renderList();
    });
    const starterButton = node('button', { type: 'button', className: 'mini-button', text: uiText('Load starter set') });
    starterButton.addEventListener('click', () => {
      state.highlight.rules = defaultHighlightRules();
      applyHighlightChange();
      renderList();
    });

    renderList();
    const body = node('div', { className: 'modal-sections' }, [
      node('div', { className: 'checkbox-row' }, [enableToggle]),
      node('div', {}, [
        node('div', { className: 'section-title', text: uiText('Rules') }),
        list,
        node('div', { className: 'button-row', attrs: { style: 'margin-top:10px' } }, [addButton, starterButton])
      ]),
      node('div', { className: 'warning-box', text: uiText('Plain text matches literally; wrap a pattern in /slashes/ for a regular expression. Highlighting applies to normal terminal output, not full-screen apps like vim or htop.') })
    ]);
    showModal({
      title: uiText('Log highlighting'),
      description: uiText('Color keywords in terminal output to speed up log triage. Rules apply to every terminal and persist across restarts.'),
      body,
      className: 'wide',
      actions: [{ label: uiText('Done'), busy: false }]
    });
  }

  // ---------------------------------------------------------------------------
  // Terminal assist: OS detection, inline suggestions, autocorrect and the
  // dangerous-command guard. Pure logic lives in assist.js (window.AuxAssist);
  // everything here is wiring and UI.
  // ---------------------------------------------------------------------------

  function assistHistoryFor(profile) {
    const key = `${profile.protocol}:${profile.host || 'local'}:${profile.username || ''}`;
    let history = state.assist.history.get(key);
    if (!history) {
      history = new window.AuxAssist.CommandHistory();
      state.assist.history.set(key, history);
    }
    return history;
  }

  function setupTabAssist(tab, profile) {
    const seed = profile.protocol === 'local' ? state.assist.localOsInfo : null;
    const bar = node('div', { className: 'assist-bar', attrs: { 'aria-live': 'polite' } });
    tab.view.append(bar);
    tab.assist = {
      mirror: new window.AuxAssist.CommandLineMirror(),
      detector: new window.AuxAssist.OsDetector(seed),
      history: assistHistoryFor(profile),
      bar,
      osInfo: seed,
      suggestion: null,
      correction: null,
      pendingCommand: '',
      watchBuffer: '',
      watchRemaining: 0
    };
    if (seed) updateOsBadge(tab);
  }

  function updateOsBadge(tab) {
    if (!tab.assist?.osInfo || !state.assist.osDetection) return;
    let badge = tab.tabElement.querySelector('.tab-os-badge');
    if (!badge) {
      badge = node('span', { className: 'tab-os-badge' });
      tab.tabElement.querySelector('.tab-title')?.after(badge);
    }
    badge.textContent = tab.assist.osInfo.label;
    badge.title = uiText("Detected operating system: {p0}", { p0: tab.assist.osInfo.label });
  }

  function clearAssistBar(tab) {
    if (!tab.assist) return;
    tab.assist.suggestion = null;
    tab.assist.bar.classList.remove('visible');
    tab.assist.bar.replaceChildren();
  }

  // Input typed at a no-echo prompt (sudo, ssh, read -s) never appears on
  // screen. It must never be displayed in the assist bar, suggested, or kept
  // in history, so the screen is checked before any of that happens.
  const secretPromptPattern = /(pass(word|phrase|code)?|passwort|kennwort|mot de passe|contraseña|senha|пароль|密码|口令|パスワード|\bpin\b|token|secret|otp|one-time|verification code)[^\n:：]*[:：]$/iu;

  function cursorLineText(tab) {
    const buffer = tab.terminal?.buffer?.active;
    if (!buffer) return '';
    let row = buffer.baseY + buffer.cursorY;
    let text = buffer.getLine(row)?.translateToString(true) || '';
    for (let guard = 0; guard < 8 && buffer.getLine(row)?.isWrapped; guard += 1) {
      row -= 1;
      text = (buffer.getLine(row)?.translateToString(true) || '') + text;
    }
    return text;
  }

  function secretPromptVisible(tab, typed = '') {
    const screen = cursorLineText(tab).trimEnd();
    const text = String(typed || '').trim();
    const before = text && screen.endsWith(text) ? screen.slice(0, -text.length) : screen;
    return secretPromptPattern.test(before.trimEnd());
  }

  function inputIsHidden(tab, typed) {
    const text = String(typed || '').trim();
    if (secretPromptVisible(tab, text)) return true;
    return Boolean(text) && !cursorLineText(tab).includes(text.slice(-24));
  }

  function updateAssistSuggestion(tab) {
    if (!tab.assist) return;
    if (tab.assist.correction) return; // the correction chip owns the bar until dismissed
    if (!state.assist.enabled || !state.assist.suggestions || !tab.assist.mirror.tracked) {
      clearAssistBar(tab);
      return;
    }
    // Wait for the shell's echo so a hidden prompt can be recognised before
    // anything typed is drawn in the assist bar.
    tab.assist.suggestion = null;
    window.clearTimeout(tab.assist.suggestTimer);
    tab.assist.suggestTimer = window.setTimeout(() => renderAssistSuggestion(tab), 90);
  }

  function renderAssistSuggestion(tab) {
    if (!tab.assist || tab.assist.correction || !tab.assist.mirror.tracked) return;
    if (!tab.assist.mirror.line || inputIsHidden(tab, tab.assist.mirror.line)) {
      clearAssistBar(tab);
      return;
    }
    const suggestion = window.AuxAssist.suggest(tab.assist.mirror.line, tab.assist.history, tab.assist.osInfo);
    if (!suggestion) {
      clearAssistBar(tab);
      return;
    }
    tab.assist.suggestion = suggestion;
    tab.assist.bar.replaceChildren(
      node('span', { className: 'assist-typed', text: tab.assist.mirror.line }),
      node('span', { className: 'assist-ghost', text: suggestion.completion }),
      node('span', { className: 'assist-hint', text: uiText('Ctrl+Space') })
    );
    tab.assist.bar.classList.add('visible');
  }

  function acceptAssistSuggestion(tab) {
    const suggestion = tab.assist?.suggestion;
    if (!suggestion) return;
    tab.assist.mirror.feed(suggestion.completion);
    api.terminal.write(tab.id, suggestion.completion).catch((error) => toast(uiText('Terminal input failed'), errorMessage(error), 'error'));
    updateAssistSuggestion(tab);
  }

  function showAssistCorrection(tab, correction) {
    if (!tab.assist) return;
    tab.assist.correction = correction;
    tab.assist.suggestion = null;
    const insert = node('button', { type: 'button', className: 'assist-chip-action', text: uiText('Insert') });
    insert.addEventListener('click', () => {
      tab.assist.correction = null;
      tab.assist.mirror.feed(correction.corrected);
      api.terminal.write(tab.id, correction.corrected).catch((error) => toast(uiText('Terminal input failed'), errorMessage(error), 'error'));
      clearAssistBar(tab);
      tab.terminal.focus();
      updateAssistSuggestion(tab);
    });
    const dismiss = node('button', { type: 'button', className: 'assist-chip-dismiss', text: '×', title: uiText('Dismiss') });
    dismiss.addEventListener('click', () => {
      tab.assist.correction = null;
      clearAssistBar(tab);
      tab.terminal.focus();
    });
    tab.assist.bar.replaceChildren(
      node('span', { className: 'assist-chip-label', text: uiText('Did you mean:') }),
      node('code', { className: 'assist-chip-command', text: correction.corrected }),
      insert,
      dismiss
    );
    tab.assist.bar.classList.add('visible');
  }

  const terminalReportPattern = /^(?:\x1b\[[?>=]?[\d;]*[cnRyt]|\x1b\[\?[\d;]*\$y|\x1b\][\d;]*;?rgb:[^\x07\x1b]*(?:\x07|\x1b\\)|\x1bP[\s\S]*?\x1b\\|\x1b\[[IO]|\x1b\[<[\d;]+[Mm]|\x1b\[M[\s\S]{3})+$/u;
  function isTerminalReport(data) {
    return typeof data === 'string' && data.startsWith('\x1b') && terminalReportPattern.test(data);
  }

  function dispatchTerminalInput(tab, data) {
    const targets = state.broadcastInput ? [...state.tabs.values()].filter((candidate) => candidate.terminal && !candidate.closed) : [tab];
    for (const target of targets) {
      if (!target.closed) api.terminal.write(target.id, data).catch((error) => toast(uiText('Terminal input failed'), errorMessage(error), 'error'));
    }
  }

  function commitTerminalInput(tab, data) {
    if (state.assist.enabled && tab.assist) {
      if (tab.assist.correction) {
        tab.assist.correction = null;
        clearAssistBar(tab);
      }
      // A typed Enter can be checked against the echo; a paste has not been
      // echoed yet, so only a visible password prompt excludes it.
      const typedEnter = /^[\r\n]+$/u.test(data);
      const hidden = (line) => (typedEnter ? inputIsHidden(tab, line) : secretPromptVisible(tab));
      const result = tab.assist.mirror.feed(data);
      for (const commit of result.committed) {
        if (commit.tracked && commit.line.trim() && !hidden(commit.line)) {
          tab.assist.history.add(commit.line);
          tab.assist.pendingCommand = commit.line;
          tab.assist.watchBuffer = '';
          tab.assist.watchRemaining = 2048;
        }
      }
      updateAssistSuggestion(tab);
    }
    dispatchTerminalInput(tab, data);
  }

  function handleTerminalInput(tab, data) {
    if (state.assist.enabled && state.assist.dangerGuard && tab.assist && /[\r\n]/u.test(data)) {
      const preview = tab.assist.mirror.preview(data);
      // Untracked lines (edited with Tab, arrows or Ctrl chords) are still
      // checked: a false alarm costs one click, a miss can wipe a server.
      const hit = preview.committed
        .map((commit) => window.AuxAssist.dangerCheck(commit.line))
        .find(Boolean);
      if (hit) {
        confirmAction({
          title: uiText('Run dangerous command?'),
          description: `${hit.reason}\n\n${hit.command}`,
          confirmLabel: uiText('Run command'),
          danger: true
        }).then((confirmed) => {
          // The typed line stays visible either way; only Enter was held back.
          if (confirmed) commitTerminalInput(tab, data);
          if(tab.detached)detachTab(tab).catch(()=>{});else tab.terminal.focus();
        });
        return;
      }
    }
    commitTerminalInput(tab, data);
  }

  function handleAssistOutput(tab, data) {
    if (!state.assist.enabled || !tab.assist) return;
    if (state.assist.osDetection && !tab.assist.detector.locked) {
      const previous = tab.assist.osInfo;
      const info = tab.assist.detector.feed(data);
      if (info && info !== previous) {
        tab.assist.osInfo = info;
        updateOsBadge(tab);
      }
    }
    if (state.assist.autocorrect && tab.assist.pendingCommand && tab.assist.watchRemaining > 0) {
      tab.assist.watchBuffer = `${tab.assist.watchBuffer}${data}`.slice(-2048);
      tab.assist.watchRemaining -= data.length;
      const token = window.AuxAssist.detectCommandNotFound(tab.assist.watchBuffer);
      if (token) {
        const correction = window.AuxAssist.correctCommand(tab.assist.pendingCommand, token, tab.assist.history, tab.assist.osInfo);
        tab.assist.pendingCommand = '';
        tab.assist.watchBuffer = '';
        tab.assist.watchRemaining = 0;
        if (correction) showAssistCorrection(tab, correction);
      } else if (tab.assist.watchRemaining <= 0) {
        tab.assist.pendingCommand = '';
        tab.assist.watchBuffer = '';
      }
    }
  }

  function refreshAssistUi() {
    for (const tab of state.tabs.values()) {
      if (!tab.assist) continue;
      if (!state.assist.enabled) {
        tab.assist.correction = null;
        clearAssistBar(tab);
      } else {
        updateAssistSuggestion(tab);
      }
      const badge = tab.tabElement.querySelector('.tab-os-badge');
      if (badge) badge.hidden = !(state.assist.enabled && state.assist.osDetection);
    }
  }

  async function openAssistModal() {
    const activeTab = state.tabs.get(state.activeTabId);
    const detected = activeTab?.assist?.osInfo?.label;
    const enabled = checkbox('enabled', uiText('Enable terminal assist'), state.assist.enabled);
    const suggestions = checkbox('suggestions', uiText('Inline command suggestions (accept with Ctrl+Space)'), state.assist.suggestions);
    const autocorrect = checkbox('autocorrect', uiText('“Did you mean” fixes after command-not-found errors'), state.assist.autocorrect);
    const dangerGuard = checkbox('dangerGuard', uiText('Confirm before running destructive commands'), state.assist.dangerGuard);
    const osDetection = checkbox('osDetection', uiText('Detect the session operating system (tab badge, per-OS suggestions)'), state.assist.osDetection);

    const aiStatus = await api.ai.status().catch(() => ({ enabled: false, endpoint: '', model: '', hasKey: false }));
    const aiEnabled = checkbox('aiEnabled', uiText('Enable AI command assist (Ctrl+Shift+A)'), aiStatus.enabled);
    const aiEndpoint = node('input', { type: 'text', placeholder: 'http://127.0.0.1:8080 (llama.cpp, Ollama, or any OpenAI-compatible server)' });
    aiEndpoint.value = aiStatus.endpoint || '';
    const aiModel = node('input', { type: 'text', placeholder: uiText('Model name (optional for llama.cpp)') });
    aiModel.value = aiStatus.model || '';
    const aiKey = node('input', { type: 'password', autocomplete: 'new-password', placeholder: aiStatus.hasKey ? uiText('Stored key exists — leave blank to keep') : uiText('API key (optional, stored encrypted in the vault)') });

    const body = node('div', { className: 'assist-settings' }, [
      node('p', { className: 'muted', text: uiText('Assist watches only what you type and what the session prints back. Command history for suggestions stays in memory and is never written to disk. No probe commands are ever sent to your servers.') }),
      node('div', { className: 'checkbox-column' }, [enabled, suggestions, autocorrect, dangerGuard, osDetection]),
      detected ? node('p', { className: 'muted', text: uiText("Active session detected as: {p0}", { p0: detected }) }) : null,
      node('div', { className: 'section-title', text: uiText('AI assist (optional, off by default)') }),
      node('p', { className: 'muted', text: uiText('Bring your own endpoint: nothing is ever sent to any AI service unless you ask, and only to the endpoint you configure here. Replies are inserted, never executed.') }),
      node('div', { className: 'checkbox-column' }, [aiEnabled]),
      field(uiText('Endpoint'), aiEndpoint, uiText('Base URL of an OpenAI-compatible chat-completions server.')),
      field(uiText('Model'), aiModel),
      field(uiText('API key'), aiKey, uiText('Stored encrypted via the desktop keyring; never shown again and never sent to the renderer.'))
    ]);
    const controller = showModal({
      title: uiText('Terminal assist'),
      description: uiText('Typing help, safety checks and OS awareness for every terminal session.'),
      body,
      className: 'narrow',
      actions: [
        { label: uiText('Cancel'), run: () => { controller.close(); return false; } },
        {
          label: uiText('Save'),
          className: 'primary',
          run: async () => {
            const next = {
              enabled: enabled.querySelector('input').checked,
              suggestions: suggestions.querySelector('input').checked,
              autocorrect: autocorrect.querySelector('input').checked,
              dangerGuard: dangerGuard.querySelector('input').checked,
              osDetection: osDetection.querySelector('input').checked
            };
            await api.app.saveAssistSettings(next);
            const aiResult = await api.ai.configure({
              enabled: aiEnabled.querySelector('input').checked,
              endpoint: aiEndpoint.value.trim(),
              model: aiModel.value.trim(),
              ...(aiKey.value ? { apiKey: aiKey.value } : {})
            });
            state.ai = aiResult;
            Object.assign(state.assist, next);
            refreshAssistUi();
            toast(uiText('Terminal assist updated'), next.enabled ? uiText('Assist is on for all terminal sessions.') : uiText('Assist is off.'), 'success');
            controller.close();
            return false;
          }
        }
      ]
    });
  }

  async function openAiAssistModal() {
    const status = state.ai?.enabled ? state.ai : await api.ai.status().catch(() => null);
    state.ai = status || { enabled: false };
    if (!state.ai.enabled) {
      toast(uiText('AI assist is off'), uiText('Enable it and set your endpoint under Assist first.'), 'info');
      openAssistModal();
      return;
    }
    const activeTerminal = state.tabs.get(state.activeTabId);
    const kindSelect = node('select', { attrs: { 'aria-label': uiText('AI request type') } }, [
      Object.assign(node('option', { text: uiText('Natural language → command') }), { value: 'command' }),
      Object.assign(node('option', { text: uiText('Explain the recent session output') }), { value: 'explain' })
    ]);
    const prompt = node('textarea', { placeholder: uiText('e.g. show the 10 largest files under /var/log'), attrs: { rows: '3' } });
    const includeContext = checkbox('includeContext', uiText('Attach the last lines of session output as context'), false);
    const response = node('pre', { className: 'ai-response', text: '' });
    const insertButton = node('button', { type: 'button', className: 'button', text: uiText('Insert into terminal'), hidden: true });
    insertButton.hidden = true;
    let lastReply = null;

    const sessionContext = async () => {
      if (!activeTerminal) return {};
      const wantsOutput = kindSelect.value === 'explain' || includeContext.querySelector('input').checked;
      let output = '';
      if (wantsOutput) {
        const transcript = await api.terminal.exportTranscript(activeTerminal.id).catch(() => null);
        output = window.AuxAssist.stripAnsi(transcript?.text || '').slice(-4000);
      }
      return { osLabel: activeTerminal.assist?.osInfo?.label || '', output };
    };

    const ask = async () => {
      response.textContent = uiText('Asking your endpoint…');
      insertButton.hidden = true;
      try {
        const result = await api.ai.ask({ kind: kindSelect.value, prompt: prompt.value, context: await sessionContext() });
        lastReply = result;
        response.textContent = result.reply;
        insertButton.hidden = !(result.kind === 'command' && activeTerminal && !activeTerminal.closed);
      } catch (error) {
        lastReply = null;
        response.textContent = uiText("Request failed: {p0}", { p0: errorMessage(error) });
      }
      return false;
    };

    insertButton.addEventListener('click', () => {
      const target = state.tabs.get(state.activeTabId);
      if (!lastReply || !target || target.closed) return;
      const command = lastReply.reply.split(/\r\n|\r|\n/u)[0].trim();
      // Replies may be steered by hostile terminal output, so anything that
      // could act as a keypress (Enter, Ctrl chords, escapes) is refused.
      if (!command || /[\x00-\x1f\x7f-\x9f]/u.test(command)) {
        toast(uiText('Reply not inserted'), uiText('The reply contained control characters.'), 'error');
        return;
      }
      controller.close();
      target.assist?.mirror.feed(command);
      api.terminal.write(target.id, command).catch((error) => toast(uiText('Terminal input failed'), errorMessage(error), 'error'));
      updateAssistSuggestion(target);
      target.terminal.focus();
    });
    kindSelect.addEventListener('change', () => {
      prompt.placeholder = kindSelect.value === 'explain'
        ? uiText('Optional question about the output (leave empty for a general explanation)')
        : uiText('e.g. show the 10 largest files under /var/log');
    });
    prompt.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        ask();
      }
    });

    const controller = showModal({
      title: uiText('Ask AI'),
      description: uiText("Endpoint: {p0}{p1}. Replies are inserted, never executed.", { p0: state.ai.endpoint, p1: state.ai.model ? ` · ${state.ai.model}` : '' }),
      body: node('div', { className: 'ai-ask' }, [
        field(uiText('Request type'), kindSelect),
        field(uiText('Prompt'), prompt, '', 'full'),
        node('div', { className: 'checkbox-column' }, [includeContext]),
        response,
        insertButton
      ]),
      actions: [
        { label: uiText('Close'), run: () => { controller.close(); return false; } },
        { label: uiText('Ask'), className: 'primary', run: ask }
      ]
    });
    window.setTimeout(() => prompt.focus(), 0);
  }

  function createTerminalTab(session, profile, saved = {}) {
    const terminal = new window.Terminal(terminalOptionsForProfile(profile));
    const fitAddon = new window.FitAddon.FitAddon();
    const searchAddon = new window.SearchAddon.SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    registerTerminalLinks(terminal);

    const panelId = `terminal-panel-${session.id}`;
    const tabId = `terminal-tab-${session.id}`;
    const view = node('div', {
      id: panelId,
      className: 'terminal-view',
      attrs: { role: 'tabpanel', 'aria-labelledby': tabId, 'data-session-id': session.id }
    });
    const closeButton = node('button', { type: 'button', className: 'tab-close', text: '×', title: uiText("Close {p0}", { p0: session.title }) });
    const tabButton = node('button', {
      id: tabId,
      type: 'button',
      className: 'tab-select',
      attrs: { role: 'tab', tabindex: '-1', 'aria-selected': 'false', 'aria-controls': panelId, 'data-session-id': session.id }
    }, [
      node('span', { className: 'tab-dot' }),
      node('span', { className: 'tab-title', text: session.title })
    ]);
    const tabElement = node('div', { className: 'session-tab', attrs: { 'data-session-id': session.id } }, [tabButton, closeButton]);
    applyTabColor(tabElement, profile);

    elements.tabbar.insertBefore(tabElement, elements.tabbarSpacer);
    elements.terminalStack.append(view);
    terminal.open(view);
    const maximize = node('button', { type: 'button', className: 'pane-maximize', text: '⛶', title: window.AuxI18n.t('toolbar.maximize'), attrs: { 'aria-label': window.AuxI18n.t('toolbar.maximize') } });
    maximize.addEventListener('click', () => { activateTab(session.id); setTerminalMaximized(true); });
    view.append(maximize);

    const tab = {
      id: session.id,
      profile,
      title: session.title,
      terminal,
      fitAddon,
      searchAddon,
      view,
      tabElement,
      tabButton,
      closed: false,
      logging: session.logging || null,
      detached: Boolean(session.detached),
      resizeTimer: 0,
      cwd: saved.cwd || session.cwd || '',
      customTitle: Boolean(saved.customTitle),
      autoTitle: session.title
    };
    if (saved.customTitle && saved.title) {
      tab.title = saved.title;
      tab.tabElement.querySelector('.tab-title').textContent = saved.title;
    }
    if (saved.fontSize) terminal.options.fontSize = saved.fontSize;
    if (saved.paneWidth) view.style.width = `${saved.paneWidth}px`;
    if (saved.paneHeight) view.style.height = `${saved.paneHeight}px`;
    view.addEventListener('pointerup', () => persistSessions());
    state.tabs.set(session.id, tab);
    tab.view.classList.toggle('detached',tab.detached);
    enableTabDragging(tab);
    observeResizablePane(tab);
    setupTabAssist(tab, profile);

    terminal.onData((data) => {
      // Automatic replies to remote queries (device attributes, cursor
      // position, colours, focus and mouse reports) are not typing: they go
      // only to this session and never reach the command mirror or macros.
      if (isTerminalReport(data)) {
        if (!tab.closed) api.terminal.write(tab.id, data).catch(() => {});
        return;
      }
      recordTerminalMacroInput(tab, data);
      handleTerminalInput(tab, data);
    });
    terminal.onResize(({ cols, rows }) => {
      window.clearTimeout(tab.resizeTimer);
      tab.resizeTimer = window.setTimeout(() => {
        if(!tab.detached)api.terminal.resize(session.id, cols, rows).catch(() => {});
      }, 60);
    });
    terminal.onTitleChange((title) => {
      const clean = String(title || '').trim().slice(0, 100);
      if (!clean) return;
      tab.autoTitle = clean;
      if (tab.customTitle) return;
      tab.title = clean;
      tab.tabElement.querySelector('.tab-title').textContent = clean;
      tab.tabButton.title = `${clean} · ${formatTarget(profile)}`;
      if (state.activeTabId === tab.id) elements.activeSessionLabel.textContent = `${clean} · ${profile.protocol.toUpperCase()}`;
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.code === 'Space'
        && state.assist.enabled && state.assist.suggestions && tab.assist?.suggestion) {
        acceptAssistSuggestion(tab);
        return false;
      }
      // Ctrl+Shift+C / Ctrl+Insert copy, Ctrl+Shift+V / Shift+Insert paste,
      // matching GNOME Terminal and Konsole. preventDefault stops Chromium
      // from also pasting into xterm's hidden textarea.
      if ((event.ctrlKey && event.shiftKey && event.code === 'KeyC') || (event.ctrlKey && !event.shiftKey && !event.altKey && event.code === 'Insert')) {
        event.preventDefault();
        copyTerminalSelection().catch(() => {});
        return false;
      }
      if ((event.ctrlKey && event.shiftKey && event.code === 'KeyV') || (event.shiftKey && !event.ctrlKey && !event.altKey && event.code === 'Insert')) {
        event.preventDefault();
        pasteIntoTerminal().catch(() => {});
        return false;
      }
      // Ctrl+Shift chords are workspace shortcuts even while the terminal has
      // focus; plain Ctrl combinations (Ctrl+W, Ctrl+K, …) stay with the shell
      // until the session has exited.
      if (event.ctrlKey && event.key === 'Tab' && handleWorkspaceShortcut(event)) return false;
      if (event.ctrlKey && !event.altKey && ZOOM_AND_TAB_KEYS.has(event.code) && handleWorkspaceShortcut(event)) return false;
      if (event.ctrlKey && event.shiftKey && handleWorkspaceShortcut(event)) return false;
      if (tab.closed && event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        requestCloseTab(tab.id);
        return false;
      }
      return true;
    });
    const copyTerminalSelection = async () => {
      const selection = terminal.getSelection();
      if (selection) await api.system.clipboardWrite(selection);
      return Boolean(selection);
    };
    const pasteIntoTerminal = async (type) => {
      if (tab.closed) return;
      const text = sanitizePasteText(await api.system.clipboardRead(type));
      if (!text || !(await confirmTerminalPaste(tab, text))) return;
      terminal.paste(text);
    };
    // Like other Linux terminals, a mouse highlight becomes the primary
    // selection (middle-click paste) and, unless disabled, is also copied
    // to the clipboard. Search matches are selected programmatically and
    // must not overwrite the clipboard, so only mouse selections count.
    const publishMouseSelection = () => {
      const selection = terminal.getSelection();
      if (!selection) return;
      api.system.clipboardWrite(selection, 'selection').catch(() => {});
      if (state.ui.terminalCopyOnSelect !== false) api.system.clipboardWrite(selection).catch(() => {});
    };
    const appOwnsMouse = (event) => terminal.modes?.mouseTrackingMode && terminal.modes.mouseTrackingMode !== 'none' && !event.shiftKey;
    view.addEventListener('mouseup', (event) => {
      if (event.button === 0) window.setTimeout(publishMouseSelection, 0);
      // Middle-click pastes the primary selection. Chromium's own middle-click
      // paste is cancelled so text is never inserted twice.
      if (event.button === 1 && !appOwnsMouse(event)) {
        event.preventDefault();
        event.stopPropagation();
        pasteIntoTerminal('selection').catch(() => {});
      }
    }, true);
    const terminalMenu = (event) => {
      const focusAfter = (action) => async () => { try { await action(); } finally { terminal.focus(); } };
      const copyOnSelect = state.ui.terminalCopyOnSelect !== false;
      openContextMenu(view, [
        { label: uiText('Copy'), icon: '⧉', hint: 'Ctrl+Shift+C', disabled: !terminal.hasSelection(), run: focusAfter(copyTerminalSelection) },
        { label: uiText('Paste'), icon: '⎘', hint: 'Ctrl+Shift+V', disabled: tab.closed, run: focusAfter(() => pasteIntoTerminal()) },
        { label: uiText('Paste selection'), icon: '⎘', hint: uiText('Middle-click'), disabled: tab.closed, run: focusAfter(() => pasteIntoTerminal('selection')) },
        { label: uiText('Select all'), icon: '▭', run: focusAfter(() => { terminal.selectAll(); publishMouseSelection(); }) },
        'separator',
        { label: uiText('Find in terminal'), icon: '⌕', run: () => { activateTab(tab.id); openTerminalSearch(); } },
        { label: uiText('Clear scrollback'), icon: '⌫', run: focusAfter(() => terminal.clear()) },
        'separator',
        { label: copyOnSelect ? uiText('Turn off copy on select') : uiText('Turn on copy on select'), icon: copyOnSelect ? '✓' : '', run: focusAfter(() => saveAppearance({ terminalCopyOnSelect: !copyOnSelect })) }
      ], { point: { x: event.clientX, y: event.clientY } });
    };
    view.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      // Full-screen apps with mouse reporting (tmux, vim, htop) receive the
      // right-click themselves; Shift+right-click still opens the menu.
      if (appOwnsMouse(event)) return;
      if (state.ui.terminalRightClick !== 'paste') { terminalMenu(event); return; }
      try {
        if (!(await copyTerminalSelection())) await pasteIntoTerminal();
      } catch { /* clipboard support is best effort */ }
    });

    tabButton.title = `${session.title} · ${formatTarget(profile)}`;
    const sessionMenu = () => openContextMenu(tabButton, [
      { label: uiText('Rename tab'), icon: '✎', hint: 'F2', run: () => startTabRename(tab) },
      { label: uiText('Working directory for restore'), icon: '⌂', disabled: !['local', 'ssh'].includes(profile.protocol), run: async () => {
        const cwd = await askText({ title: uiText('Restore working directory'), label: uiText('Absolute directory'), value: tab.cwd || '/', description: uiText('Used when this session is reopened. SSH directories are applied before the configured startup command.') });
        if (cwd === null) return;
        if (!cwd.startsWith('/') || /[\x00-\x1f]/u.test(cwd)) throw new Error('Enter an absolute directory without control characters');
        tab.cwd = cwd; tab.explicitCwd = true; persistSessions();
      } },
      { label:uiText('Connection timeline'),icon:'◷',run:async()=>{const events=await api.terminal.timeline(tab.id);showModal({title:uiText('Connection timeline'),description:uiText('Observed process events and detected errors. Unreported DNS, network and authentication steps are not inferred as successful.'),body:node('div',{className:'transfer-review-list'},events.map(event=>node('div',{className:'transfer-review-item'},[node('strong',{text:(event.elapsedMs/1000).toFixed(2)+'s · '+event.stage}),node('span',{text:event.message})])))});} },
      { label: uiText('Move to separate window'), icon:'↗', disabled:tab.closed, run:()=>detachTab(tab) },
      { label: uiText('Move tab left'), icon: '←', hint: 'Ctrl+Shift+PgUp', run: () => moveSessionTab(tab, -1) },
      { label: uiText('Move tab right'), icon: '→', hint: 'Ctrl+Shift+PgDn', run: () => moveSessionTab(tab, 1) },
      { label: uiText('Duplicate session'), icon: '+', run: () => connectProfile(profile, tab) },
      { label: uiText('Increase text size'), icon: 'A+', hint: 'Ctrl+=', run: () => zoomTerminal(tab, 1) },
      { label: uiText('Decrease text size'), icon: 'A−', hint: 'Ctrl+−', run: () => zoomTerminal(tab, -1) },
      { label: uiText('Reset text size'), icon: '↺', hint: 'Ctrl+0', run: () => zoomTerminal(tab, 0) },
      'separator',
      { label: uiText('Close session'), icon: '×', danger: true, run: () => requestCloseTab(tab.id) }
    ], { title: tab.title });
    tabElement.addEventListener('contextmenu', (event) => { event.preventDefault(); sessionMenu(); });
    tabButton.addEventListener('click', () => activateTab(session.id));
    tabButton.addEventListener('dblclick', (event) => { event.preventDefault(); startTabRename(tab); });
    tabButton.addEventListener('keydown', (event) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); sessionMenu(); return; }
      if (event.key === 'F2') { event.preventDefault(); startTabRename(tab); return; }
      if (event.key === 'Delete') {
        event.preventDefault();
        requestCloseTab(session.id);
        return;
      }
      const tabs = [...state.tabs.values()];
      const index = tabs.findIndex((candidate) => candidate.id === session.id);
      let target = null;
      if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') target = tabs[0];
      if (event.key === 'End') target = tabs.at(-1);
      if (!target) return;
      event.preventDefault();
      activateTab(target.id);
      window.setTimeout(() => target.tabButton.focus(), 0);
    });
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      requestCloseTab(session.id);
    });

    const pending = state.pendingTerminalData.get(session.id);
    if (pending) {
      writeTerminalData(tab, pending);
      state.pendingTerminalData.delete(session.id);
    }
    activateTab(session.id);
    persistSessions();
    return tab;
  }

  function restoreInitialSessions(sessions = []) {
    if (!Array.isArray(sessions) || !sessions.length) return;
    if (!window.Terminal || !window.FitAddon?.FitAddon) {
      toast(uiText('Existing sessions could not be restored'), uiText('Terminal runtime is unavailable; closing orphaned backend sessions.'), 'error');
      for (const session of sessions) {
        if (session?.id) api.terminal.close(session.id).catch(() => {});
      }
      return;
    }

    let restored = 0;
    for (const session of sessions) {
      if (!session?.id) continue;
      const profile = profileById(session.profileId);
      if (!profile || !['local', 'ssh', 'mosh', 'telnet', 'serial'].includes(profile.protocol)) {
        api.terminal.close(session.id).catch(() => {});
        toast(uiText('Stale terminal session closed'), session.title || session.id, 'error');
        continue;
      }
      createTerminalTab(session, profile, state.savedSessions?.find((saved) => saved.startedAt === session.id) || {});
      restored += 1;
    }
    if (restored) toast(uiText('Terminal sessions restored'), uiText("Sessions reattached after renderer reload: {p0}.", { p0: restored }), 'success');
  }

  async function restoreSessionCollection(saved, { skipLive = false } = {}) {
    if (state.restoringSessions) throw new Error('A workspace is already being opened');
    state.restoringSessions = true;
    const liveIds = new Set(state.tabs.keys());
    const failures = [];
    let active = null;
    try {
      for (const item of saved.slice(0, 50)) {
        if (skipLive && liveIds.has(item.startedAt)) {
          if (item.active) active = state.tabs.get(item.startedAt);
          continue;
        }
        const profile = profileById(item.profileId);
        if (!profile) { failures.push(item.title || item.profileId); continue; }
        if (!['local', 'ssh', 'mosh', 'telnet', 'serial', 'rdp', 'vnc'].includes(profile.protocol)) continue;
        const tab = await connectProfile(profile, item);
        if (item.active && tab) active = tab;
      }
      if (active) activateTab(active.id);
      if (failures.length) toast(uiText('Some profiles are unavailable'), failures.join(', '), 'error');
    } finally { state.restoringSessions = false; persistSessions(); }
  }

  async function restoreSavedSessions() {
    try { await restoreSessionCollection(state.savedSessions || await api.app.getSessions(), { skipLive: true }); }
    catch (error) { toast(uiText('Session restore failed'), errorMessage(error), 'error'); }
  }

  let draggedSessionId = '';
  // Tabs reorder by drag and drop. The drop marker shows whether the tab
  // lands before or after the one under the pointer; dropping on the empty
  // part of the tab bar moves it to the end. Dropping on a tiled pane moves
  // the dragged session next to that pane.
  function placeTab(moved, target, after) {
    if (!moved || moved === target) return;
    const ordered = [...state.tabs.values()].filter((item) => item !== moved);
    const index = target ? ordered.indexOf(target) + (after ? 1 : 0) : ordered.length;
    ordered.splice(index, 0, moved);
    state.tabs = new Map(ordered.map((item) => [item.id, item]));
    for (const item of ordered) {
      elements.tabbar.insertBefore(item.tabElement, elements.tabbarSpacer);
      elements.terminalStack.append(item.view);
    }
    persistSessions();
    activateTab(moved.id);
  }

  function clearTabDropMarkers() {
    for (const element of elements.tabbar.querySelectorAll('.drop-before, .drop-after, .dragging')) element.classList.remove('drop-before', 'drop-after', 'dragging');
  }

  function enableTabDragging(tab) {
    tab.tabButton.draggable = true;
    tab.tabButton.addEventListener('dragstart', (event) => {
      draggedSessionId = tab.id;
      event.dataTransfer.setData('text/x-aux-session', tab.id);
      event.dataTransfer.effectAllowed = 'move';
      tab.tabElement.classList.add('dragging');
    });
    tab.tabButton.addEventListener('dragend', () => { draggedSessionId = ''; clearTabDropMarkers(); });
    const dropAfter = (event) => {
      const rect = tab.tabElement.getBoundingClientRect();
      return event.clientX > rect.left + rect.width / 2;
    };
    tab.tabElement.addEventListener('dragover', (event) => {
      if (!draggedSessionId || draggedSessionId === tab.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const after = dropAfter(event);
      tab.tabElement.classList.toggle('drop-after', after);
      tab.tabElement.classList.toggle('drop-before', !after);
    });
    tab.tabElement.addEventListener('dragleave', () => tab.tabElement.classList.remove('drop-before', 'drop-after'));
    tab.tabElement.addEventListener('drop', (event) => {
      const moved = state.tabs.get(draggedSessionId);
      if (!moved || moved === tab) return;
      event.preventDefault();
      event.stopPropagation();
      const after = dropAfter(event);
      draggedSessionId = '';
      clearTabDropMarkers();
      placeTab(moved, tab, after);
    });
    tab.view.addEventListener('dragover', (event) => { if (draggedSessionId && draggedSessionId !== tab.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } });
    tab.view.addEventListener('drop', (event) => {
      const moved = state.tabs.get(draggedSessionId);
      if (!moved || moved === tab) return;
      event.preventDefault();
      draggedSessionId = '';
      clearTabDropMarkers();
      placeTab(moved, tab, false);
    });
  }

  function enableTabBarDrop() {
    elements.tabbarSpacer.addEventListener('dragover', (event) => { if (draggedSessionId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } });
    elements.tabbarSpacer.addEventListener('drop', (event) => {
      const moved = state.tabs.get(draggedSessionId);
      if (!moved) return;
      event.preventDefault();
      draggedSessionId = '';
      clearTabDropMarkers();
      placeTab(moved, null, true);
    });
  }

  // A detached window uses the same font, size, line height, scrollback,
  // colours and name as the tab.
  function detachTab(tab) {
    const { fontFamily, fontSize, lineHeight, scrollback, theme } = tab.terminal?.options || {};
    return api.terminal.detach(tab.id, { title: tab.title, fontFamily, fontSize, lineHeight, scrollback, theme });
  }

  function applyTabTitle(tab) {
    tab.tabElement.querySelector('.tab-title').textContent = tab.title;
    const close = tab.tabElement.querySelector('.tab-close');
    if (close) close.title = uiText("Close {p0}", { p0: tab.title });
    if (tab.profile) tab.tabButton.title = `${tab.title} · ${formatTarget(tab.profile)}`;
    if (state.activeTabId === tab.id && tab.profile) elements.activeSessionLabel.textContent = `${tab.title} · ${tab.profile.protocol.toUpperCase()}`;
  }

  // Rename in place: Enter or leaving the field saves, Escape cancels, and an
  // empty name returns the tab to its automatic title.
  function startTabRename(tab) {
    if (tab.tabElement.querySelector('.tab-rename-input')) return;
    const input = node('input', { type: 'text', className: 'tab-rename-input', value: tab.title, attrs: { maxlength: 100, spellcheck: 'false', 'aria-label': uiText('Tab name') } });
    tab.tabButton.hidden = true;
    tab.tabElement.prepend(input);
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const name = input.value.replace(/[\x00-\x1f\x7f]/gu, '').trim().slice(0, 100);
      input.remove();
      tab.tabButton.hidden = false;
      if (save) {
        if (name) { tab.customTitle = true; tab.title = name; }
        else { tab.customTitle = false; tab.title = tab.autoTitle || tab.title; }
        applyTabTitle(tab);
        persistSessions();
      }
      tab.tabButton.focus();
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('dragstart', (event) => event.preventDefault());
    input.focus();
    input.select();
  }

  function moveSessionTab(tab, direction, focus = true) {
    const ordered = [...state.tabs.values()];
    const index = ordered.indexOf(tab);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    state.tabs = new Map(ordered.map((item) => [item.id, item]));
    for (const item of ordered) {
      elements.tabbar.insertBefore(item.tabElement, elements.tabbarSpacer);
      elements.terminalStack.append(item.view);
    }
    persistSessions();
    if (focus) tab.tabButton.focus();
  }

  // Ctrl+= / Ctrl+− / Ctrl+0 (and the tab menu) change one terminal's text
  // size; the size is saved with the session like the pane size.
  const ZOOM_AND_TAB_KEYS = new Set(['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0', 'PageUp', 'PageDown']);
  function zoomTerminal(tab, step) {
    if (!tab?.terminal) return;
    const current = tab.terminal.options.fontSize;
    const next = step === 0 ? terminalOptionsForProfile(tab.profile).fontSize : Math.min(32, Math.max(8, current + step));
    if (next === current) return;
    tab.terminal.options.fontSize = next;
    fitVisibleTerminals();
    persistSessions();
    setStatus(uiText('Text size {p0} px', { p0: next }));
  }

  function isReopenable(tab) {
    return !tab.transient && (tab.profile?.id === 'local-shell' || state.profiles.some((profile) => profile.id === tab.profile?.id));
  }

  async function sessionSnapshot() {
    const live = new Map((await api.terminal.list()).map((item) => [item.id, item]));
    // Only sessions of saved connections can be reopened later; quick-connect
    // and gateway viewer tabs have no stored profile and are left out.
    return [...state.tabs.values()].filter((tab) => !tab.closed && isReopenable(tab)).map((tab) => ({
      profileId: tab.profile.id, protocol: tab.profile.protocol, title: tab.title,
      startedAt: tab.id, customTitle: Boolean(tab.customTitle),
      cwd: tab.explicitCwd ? tab.cwd : live.get(tab.id)?.cwd || tab.cwd || '',
      fontSize: tab.terminal?.options.fontSize || null, active: tab.id === state.activeTabId,
      paneWidth: parseFloat(tab.view.style.width) || 0, paneHeight: parseFloat(tab.view.style.height) || 0
    }));
  }

  async function openWorkspaces() {
    state.namedWorkspaces = (await api.app.getState()).settings.namedWorkspaces || [];
    const body = node('div', { className: 'menu-stack' });
    if (!state.namedWorkspaces.length) body.append(node('p', { text: uiText('Save your open connections, tab order, names and layout as a workspace.') }));
    let controller;
    for (const workspace of state.namedWorkspaces) {
      const open = node('button', { type: 'button', className: 'mini-button', text: uiText('Open') });
      const update = node('button', { type: 'button', className: 'mini-button', text: uiText('Update') });
      const remove = node('button', { type: 'button', className: 'mini-button destructive', text: uiText('Delete') });
      body.append(node('div', { className: 'menu-action' }, [node('strong', { text: workspace.name }), node('small', { text: uiText('{count} sessions · {layout}', { count: workspace.sessions.length, layout: window.AuxI18n.t(workspace.workspace.layout === 'grid' ? 'toolbar.tiled' : 'toolbar.single') }) }), node('div', { className: 'button-row' }, [open, update, remove])]));
      open.addEventListener('click', async () => {
        open.disabled = true;
        try {
          state.paneFlow=workspace.workspace.paneFlow||'auto'; state.layout = workspace.workspace.layout; state.paneMinWidth = workspace.workspace.paneMinWidth; state.paneMinHeight = workspace.workspace.paneMinHeight;
          applyTerminalLayout(); persistWorkspaceSettings(); controller.close();
          await restoreSessionCollection(workspace.sessions);
        } catch (error) { toast(uiText('Workspace failed'), errorMessage(error), 'error'); }
        finally { open.disabled = false; }
      });
      update.addEventListener('click', async () => {
        try { await saveNamedWorkspace(workspace.name, workspace.id); controller.close(); openWorkspaces(); }
        catch (error) { toast(uiText('Workspace save failed'), errorMessage(error), 'error'); }
      });
      remove.addEventListener('click', async () => {
        if (!await confirmAction({ title: uiText('Delete saved workspace?'), description: workspace.name, confirmLabel: uiText('Delete'), danger: true })) return;
        try { await api.app.deleteNamedWorkspace(workspace.id); controller.close(); openWorkspaces(); }
        catch (error) { toast(uiText('Workspace delete failed'), errorMessage(error), 'error'); }
      });
    }
    controller = showModal({ title: uiText('Named workspaces'), description: uiText('Opening a workspace adds its sessions to your current workspace. Credentials stay in their connection profiles.'), body, className: 'wide', actions: [
      { label: uiText('Save current workspace'), className: 'primary', run: async () => {
        const name = await askText({ title: uiText('Save workspace'), label: uiText('Workspace name') });
        if (!name) return false;
        await saveNamedWorkspace(name); controller.close(); openWorkspaces(); return false;
      } }, { label: uiText('Close'), busy: false }
    ] });
  }

  async function saveNamedWorkspace(name, id) {
    const sessions = await sessionSnapshot();
    const skipped = [...state.tabs.values()].filter((tab) => !tab.closed && !isReopenable(tab)).length;
    if (!sessions.length) throw new Error(skipped ? uiText('Quick-connect sessions cannot be saved in a workspace. Save the connection first.') : uiText('Open at least one live session before saving a workspace'));
    if (skipped) toast(uiText('Some sessions were not saved'), uiText('{p0} quick-connect sessions have no saved connection and were left out.', { p0: skipped }), 'error');
    state.namedWorkspaces = await api.app.saveNamedWorkspace({ id, name, sessions, workspace: { layout: state.layout, paneMinWidth: state.paneMinWidth, paneMinHeight: state.paneMinHeight, paneFlow: state.paneFlow || 'auto' } });
  }

  function closeTerminalSearch() {
    const panel = elements.terminalSearchHost.querySelector('.terminal-search-panel');
    panel?.remove();
    state.terminalSearchOpen = false;
    for (const tab of state.tabs.values()) tab.searchAddon?.clearDecorations();
    elements.terminalSearchToggle.classList.remove('active');
    elements.terminalSearchToggle.setAttribute('aria-pressed', 'false');
    activeTab()?.terminal?.focus();
  }

  function runTerminalSearch(direction = 'next') {
    const tab = activeTab();
    const query = state.terminalSearchQuery;
    if (!tab?.searchAddon || !query) {
      tab?.searchAddon?.clearDecorations();
      const status = elements.terminalSearchHost.querySelector('.terminal-search-status');
      if (status) status.textContent = '';
      return false;
    }
    const options = { caseSensitive: false, wholeWord: false, regex: false, incremental: false };
    const found = direction === 'previous' ? tab.searchAddon.findPrevious(query, options) : tab.searchAddon.findNext(query, options);
    const status = elements.terminalSearchHost.querySelector('.terminal-search-status');
    if (status) status.textContent = found ? uiText('Match found') : uiText('No matches');
    return found;
  }

  function openTerminalSearch() {
    const tab = activeTab();
    if (!tab?.terminal) {
      toast(uiText('Open a terminal first'), uiText('Terminal search needs an active session.'), 'error');
      return;
    }
    let panel = elements.terminalSearchHost.querySelector('.terminal-search-panel');
    if (!panel) {
      const input = node('input', {
        type: 'search',
        value: state.terminalSearchQuery,
        placeholder: uiText('Find in terminal'),
        attrs: { 'aria-label': uiText('Find in terminal'), spellcheck: 'false' }
      });
      const previous = node('button', { type: 'button', text: '↑', title: uiText('Previous match') });
      const next = node('button', { type: 'button', text: '↓', title: uiText('Next match') });
      const close = node('button', { type: 'button', text: '×', title: uiText('Close search') });
      panel = node('div', { className: 'terminal-search-panel' }, [input, previous, next, close,
        node('span', { className: 'terminal-search-status', attrs: { role: 'status', 'aria-live': 'polite' } })]);
      elements.terminalSearchHost.append(panel);
      input.addEventListener('input', () => {
        state.terminalSearchQuery = input.value;
        runTerminalSearch('next');
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          runTerminalSearch(event.shiftKey ? 'previous' : 'next');
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closeTerminalSearch();
        }
      });
      previous.addEventListener('click', () => runTerminalSearch('previous'));
      next.addEventListener('click', () => runTerminalSearch('next'));
      close.addEventListener('click', closeTerminalSearch);
    }
    state.terminalSearchOpen = true;
    elements.terminalSearchToggle.classList.add('active');
    elements.terminalSearchToggle.setAttribute('aria-pressed', 'true');
    const input = panel.querySelector('input');
    input.value = state.terminalSearchQuery;
    input.focus();
    input.select();
  }

  async function openSessionReplay(tab) {
    let recording;
    try {
      recording = await api.terminal.recording(tab.id);
    } catch (error) {
      toast(uiText('Replay unavailable'), errorMessage(error), 'error');
      return;
    }
    if (!recording.chunks?.length) {
      toast(uiText('Nothing to replay yet'), uiText('This session has not produced any output.'), 'info');
      return;
    }

    const host = node('div', { className: 'replay-terminal' });
    const statusText = node('span', { className: 'replay-status', text: uiText('Ready') });
    const playButton = node('button', { type: 'button', className: 'button primary', text: uiText('Play') });
    const restartButton = node('button', { type: 'button', className: 'button', text: uiText('Restart') });
    const speedSelect = node('select', { attrs: { 'aria-label': uiText('Replay speed') } },
      [['1', '1×'], ['2', '2×'], ['4', '4×'], ['8', '8×'], ['instant', 'Instant']].map(([value, label]) => {
        const option = node('option', { text: label });
        option.value = value;
        return option;
      }));
    speedSelect.value = '4';

    const player = {
      terminal: null,
      index: 0,
      playing: false,
      token: 0
    };

    const setStatus = () => {
      statusText.textContent = uiText("{p0}/{p1} chunks{p2}", { p0: Math.min(player.index, recording.chunks.length), p1: recording.chunks.length, p2: recording.truncated ? ' · bounded to recent activity' : '' });
      playButton.textContent = player.playing ? uiText('Pause') : (player.index >= recording.chunks.length ? uiText('Done') : uiText('Play'));
    };

    const resetTerminal = () => {
      player.terminal?.dispose();
      player.terminal = new window.Terminal({ ...terminalOptionsForProfile(tab.profile), disableStdin: true, convertEol: false });
      host.replaceChildren();
      player.terminal.open(host);
      // E2E hook: replayed content is only reachable through the xterm buffer
      // API (DOM rows carry no text), so tests read it via this reference.
      host._replayTerminal = player.terminal;
      player.index = 0;
      setStatus();
    };

    const drive = async () => {
      const token = ++player.token;
      player.playing = true;
      setStatus();
      const speed = speedSelect.value;
      while (player.playing && token === player.token && player.index < recording.chunks.length) {
        const chunk = recording.chunks[player.index];
        const previous = player.index > 0 ? recording.chunks[player.index - 1].t : chunk.t;
        if (speed !== 'instant') {
          const delay = Math.min(2000, Math.max(0, (chunk.t - previous) / Number(speed)));
          if (delay > 4) await new Promise((resolve) => window.setTimeout(resolve, delay));
          if (!player.playing || token !== player.token) break;
        }
        // Same forced refresh as writeTerminalData: software rendering may not
        // repaint written rows on its own.
        player.terminal.write(chunk.data, () => {
          try { player.terminal.refresh(0, player.terminal.rows - 1); } catch { /* replay terminal may be closing */ }
        });
        player.index += 1;
        if (player.index % 20 === 0 || player.index >= recording.chunks.length) setStatus();
      }
      if (token === player.token) {
        player.playing = false;
        setStatus();
      }
    };

    playButton.addEventListener('click', () => {
      if (player.playing) {
        player.playing = false;
        player.token += 1;
        setStatus();
      } else {
        if (player.index >= recording.chunks.length) resetTerminal();
        drive();
      }
    });
    restartButton.addEventListener('click', () => {
      player.playing = false;
      player.token += 1;
      resetTerminal();
    });

    const controller = showModal({
      title: uiText('Session replay'),
      description: uiText("{p0} · recorded from session start{p1}", { p0: recording.title || tab.title, p1: recording.truncated ? ' (oldest output dropped)' : '' }),
      body: node('div', { className: 'replay' }, [
        node('div', { className: 'replay-controls' }, [playButton, restartButton, speedSelect, statusText]),
        host
      ]),
      className: 'wide',
      actions: [{ label: uiText('Close'), run: () => { player.playing = false; player.token += 1; player.terminal?.dispose(); controller.close(); return false; } }]
    });
    controller.onClose(() => {
      player.playing = false;
      player.token += 1;
      player.terminal?.dispose();
    });
    resetTerminal();
  }

  async function exportActiveTranscript() {
    const tab = activeTab();
    if (!tab?.terminal) {
      toast(uiText('Open a terminal first'), uiText('Transcript export needs an active session.'), 'error');
      return;
    }
    let transcript;
    try {
      transcript = await api.terminal.exportTranscript(tab.id);
    } catch (error) {
      toast(uiText('Transcript export failed'), errorMessage(error), 'error');
      return;
    }
    const output = node('textarea', {
      className: 'remote-editor transcript-export',
      attrs: { readonly: '', spellcheck: 'false' }
    });
    output.value = transcript.plainText ?? transcript.text ?? '';
    const body = node('div', { className: 'form-grid compact-form' }, [
      node('div', { className: 'warning-box full', text: transcript.truncated ? uiText('This transcript was bounded to the most recent 1 MB of output.') : uiText('This transcript is captured locally from the active session output stream.') }),
      field(uiText('Session'), textInput('session', `${transcript.title || tab.title} · ${transcript.protocol || tab.profile.protocol}`, { required: false }), '', 'full'),
      field(uiText('Transcript'), output, uiText('Review before copying. Transcripts may contain secrets, commands, hostnames, or customer data.'), 'full')
    ]);
    showModal({
      title: uiText('Export terminal transcript'),
      description: `${transcript.title || tab.title} · ${transcript.exportedAt || ''}`,
      body,
      className: 'wide',
      actions: [
        { label: uiText('Copy transcript'), className: 'primary', busy: false, run: async () => {
          await api.system.clipboardWrite(output.value);
          toast(uiText('Transcript copied'), uiText("{p0} characters copied to clipboard.", { p0: output.value.length }), 'success');
          return false;
        } },
        { label: uiText('Save transcript'), busy: false, run: async () => {
          const result = await api.terminal.saveTranscript(tab.id);
          if (!result?.canceled) toast(uiText('Transcript saved'), result.filePath, 'success');
          return false;
        } },
        { label: uiText('Print transcript'), busy: false, run: async () => {
          const result = await api.terminal.printTranscript(tab.id);
          toast(result?.printed ? uiText('Print job sent') : uiText('Print canceled'), transcript.title || tab.title, result?.printed ? 'success' : 'info');
          return false;
        } },
        { label: uiText('Replay session'), busy: false, run: async () => {
          await openSessionReplay(tab);
          return false;
        } },
        { label: uiText('Close'), busy: false }
      ]
    });
    window.setTimeout(() => output.focus(), 0);
  }

  async function toggleTerminalLogging() {
    const tab = activeTab();
    if (!tab) {
      toast(uiText('Open a terminal first'), uiText('Terminal logging needs an active session.'), 'error');
      return;
    }
    if (tab.logging?.active) {
      const result = await api.terminal.stopLogging(tab.id);
      tab.logging = result?.filePath ? { filePath: result.filePath, active: false } : null;
      updateSessionActions();
      toast(uiText('Terminal logging stopped'), result?.filePath || tab.title, 'success');
      return;
    }
    const confirmed = await confirmAction({
      title: uiText('Start terminal log?'),
      description: uiText('Terminal logs may capture secrets, commands, hostnames, customer data, and remote output. Choose the log file carefully and stop logging when finished.'),
      confirmLabel: uiText('Choose log file')
    });
    if (!confirmed) return;
    const result = await api.terminal.startLogging(tab.id);
    if (result?.canceled) return;
    tab.logging = { filePath: result.filePath, active: true };
    updateSessionActions();
    toast(uiText('Terminal logging started'), result.filePath, 'success');
  }

  function fitVisibleTerminals() {
    const tabs = state.layout === 'grid' && !state.focusMode ? [...state.tabs.values()] : [activeTab()].filter(Boolean);
    for (const tab of tabs) {
      if(tab.detached)continue;
      window.clearTimeout(tab.resizeTimer);
      tab.resizeTimer = window.setTimeout(() => {
        try { tab.fitAddon.fit(); } catch { /* session may be closing */ }
      }, 80);
    }
  }

  const paneResizeObserver = 'ResizeObserver' in window
    ? new ResizeObserver(() => fitVisibleTerminals())
    : null;

  function observeResizablePane(tab) {
    if (!paneResizeObserver) return;
    try { paneResizeObserver.observe(tab.view); } catch { /* ResizeObserver may reject detached panes */ }
  }

  function unobserveResizablePane(tab) {
    if (!paneResizeObserver) return;
    try { paneResizeObserver.unobserve(tab.view); } catch { /* pane may already be detached */ }
  }

  function applyPaneSize() {
    elements.terminalStack.style.setProperty('--pane-min-width', `${state.paneMinWidth}px`);
    elements.terminalStack.style.setProperty('--pane-min-height', `${state.paneMinHeight}px`);
    fitVisibleTerminals();
  }

  function applyPersistedWorkspaceSettings(settings) {
    if (settings?.ui) { state.ui = { ...state.ui, ...settings.ui }; applyAppearance(); }
    const workspace = settings?.workspace || {};
    state.customGroups = Array.isArray(settings?.sidebar?.groups) ? [...settings.sidebar.groups] : [];
    const highlight = settings?.highlight || {};
    state.highlight.enabled = Boolean(highlight.enabled);
    state.highlight.rules = Array.isArray(highlight.rules) ? highlight.rules.map((rule) => ({ ...rule })) : [];
    state.highlight.version += 1;
    const assist = settings?.assist || {};
    for (const key of ['enabled', 'suggestions', 'autocorrect', 'dangerGuard', 'osDetection']) {
      if (key in assist) state.assist[key] = Boolean(assist[key]);
    }
    state.paneFlow = workspace.paneFlow || 'auto';
    state.layout = workspace.layout === 'grid' ? 'grid' : 'single';
    const width = Number(workspace.paneMinWidth);
    const height = Number(workspace.paneMinHeight);
    state.paneMinWidth = Number.isFinite(width) ? Math.max(240, Math.min(720, Math.round(width))) : 320;
    state.paneMinHeight = Number.isFinite(height) ? Math.max(160, Math.min(520, Math.round(height))) : 220;
    applyTerminalLayout();
  }

  function persistWorkspaceSettings() {
    if (state.workspacePersistTimer) clearTimeout(state.workspacePersistTimer);
    state.workspacePersistTimer = setTimeout(() => {
      state.workspacePersistTimer = null;
      api.app.saveWorkspaceSettings({
        layout: state.layout,
        paneMinWidth: state.paneMinWidth,
        paneMinHeight: state.paneMinHeight, paneFlow: state.paneFlow || 'auto'
      }).catch((error) => setStatus(uiText("Workspace settings not saved: {p0}", { p0: errorMessage(error) }), 'error'));
    }, 250);
  }

  let sessionPersistTimer = null;
  function persistSessions() {
    if (state.initializing || state.restoringSessions) return;
    if (sessionPersistTimer) clearTimeout(sessionPersistTimer);
    sessionPersistTimer = setTimeout(async () => {
      sessionPersistTimer = null;
      try { await api.app.saveSessions(await sessionSnapshot()); }
      catch (error) { setStatus(uiText("Session state not saved: {p0}", { p0: errorMessage(error) }), 'error'); }
    }, 500);
  }

  function adjustPaneSize(delta) {
    const step = Number(delta) || 0;
    // The setting is a minimum, and panes stretch to fill the row. Start from
    // the size panes actually have so every press visibly changes the layout.
    const pane = [...elements.terminalStack.querySelectorAll('.terminal-view.active')].map((view) => view.getBoundingClientRect()).find((rect) => rect.width > 0);
    const baseWidth = step > 0 && pane ? Math.max(state.paneMinWidth, Math.round(pane.width)) : state.paneMinWidth;
    const baseHeight = step > 0 && pane ? Math.max(state.paneMinHeight, Math.round(pane.height)) : state.paneMinHeight;
    state.paneMinWidth = Math.max(240, Math.min(720, baseWidth + step));
    state.paneMinHeight = Math.max(160, Math.min(520, baseHeight + Math.round(step * 0.65)));
    applyPaneSize();
    state.initializing ? null : persistWorkspaceSettings();
    setStatus(uiText("Minimum pane size {p0} × {p1} px", { p0: state.paneMinWidth, p1: state.paneMinHeight }));
  }

  function updateSessionActions() {
    const tab = activeTab();
    const tabCount = state.tabs.size;
    // The tab bar and its toolbar only appear once a session exists; the
    // welcome screen stays uncluttered.
    elements.appShell.classList.toggle('no-sessions', tabCount === 0);
    if (!tab && state.focusMode) {
      state.focusMode = false; elements.appShell.classList.remove('focus-mode');
      elements.terminalStack.classList.toggle('layout-grid', state.layout === 'grid');
    }
    elements.maximizeTerminal.disabled = !tab;
    elements.maximizeTerminal.textContent = window.AuxI18n.t(state.focusMode ? 'toolbar.restore' : 'toolbar.maximize');
    elements.maximizeTerminal.setAttribute('aria-pressed', String(state.focusMode));
    const terminalTab = Boolean(tab?.terminal);
    const terminalCount = [...state.tabs.values()].filter((candidate) => candidate.terminal && !candidate.closed).length;
    const fileTransfer = isFileTransferProfile(tab?.profile);
    elements.layoutToggle.disabled = tabCount < 2 && state.layout !== 'grid';
    elements.broadcastToggle.disabled = terminalCount < 2;
    elements.terminalSearchToggle.disabled = !terminalTab;
    elements.highlightToggle.classList.toggle('active', state.highlight.enabled);
    elements.highlightToggle.setAttribute('aria-pressed', state.highlight.enabled ? 'true' : 'false');
    elements.exportTranscriptButton.disabled = !terminalTab;
    elements.terminalLogButton.disabled = !terminalTab || tab.closed;
    elements.terminalLogButton.textContent = tab?.logging?.active ? window.AuxI18n.t('toolbar.stopLog') : window.AuxI18n.t('toolbar.log');
    elements.macroRecordButton.disabled = !terminalTab || tab.closed;
    elements.macroRecordButton.textContent = state.macroRecording ? uiText('Stop macro') : uiText('Macro');
    elements.macroRecordButton.classList.toggle('active', Boolean(state.macroRecording));
    elements.macroRecordButton.setAttribute('aria-pressed', state.macroRecording ? 'true' : 'false');
    elements.duplicateSessionButton.disabled = !terminalTab;
    elements.reconnectSessionButton.disabled = !terminalTab;
    elements.paneShrinkButton.disabled = state.layout !== 'grid' || state.focusMode;
    elements.paneGrowButton.disabled = state.layout !== 'grid' || state.focusMode;
    elements.sftpToggle.disabled = !fileTransfer;
    elements.sftpToggle.textContent = tab?.profile?.protocol === 'ftp' || tab?.profile?.protocol === 'ftps' ? uiText('Files') : 'SFTP';
    elements.sftpToggle.title = fileTransfer ? uiText('Toggle file browser (Ctrl+Shift+F)') : uiText('File browser requires an SSH, FTP, or FTPS session');
  }

  function applyTerminalLayout() {
    elements.terminalStack.dataset.flow=state.paneFlow||'auto';
    if(document.getElementById('pane-flow'))document.getElementById('pane-flow').value=state.paneFlow||'auto';
    applyPaneSize();
    elements.terminalStack.classList.toggle('layout-grid', state.layout === 'grid' && !state.focusMode);
    elements.layoutToggle.classList.toggle('active', state.layout === 'grid');
    elements.layoutToggle.textContent = state.layout === 'grid' ? window.AuxI18n.t('toolbar.tiled') : window.AuxI18n.t('toolbar.single');
    elements.layoutToggle.title = state.layout === 'grid' ? uiText('Switch to single-session view (Ctrl+Shift+L)') : uiText('Switch to tiled-session view (Ctrl+Shift+L)');
    elements.layoutToggle.setAttribute('aria-pressed', state.layout === 'grid' ? 'true' : 'false');
    for (const tab of state.tabs.values()) {
      const visible = !tab.detached && Boolean(state.activeTabId) && ((state.layout === 'grid' && !state.focusMode) || tab.id === state.activeTabId);
      tab.view.classList.toggle('active', visible);
      tab.view.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    updateSessionActions();
    fitVisibleTerminals();
  }

  function setTerminalMaximized(enabled) {
    state.focusMode = Boolean(enabled && activeTab());
    if (state.focusMode && state.broadcastInput) applyBroadcastState(false);
    elements.appShell.classList.toggle('focus-mode', state.focusMode);
    applyTerminalLayout();
    activeTab()?.terminal?.focus();
  }

  function updateFullscreen(enabled) {
    state.fullscreen = Boolean(enabled);
    $('#fullscreen-button').setAttribute('aria-pressed', String(state.fullscreen));
    $('#session-fullscreen').textContent = window.AuxI18n.t(state.fullscreen ? 'toolbar.exitFullscreen' : 'toolbar.fullscreen');
    fitVisibleTerminals();
  }

  async function toggleFullscreen() {
    try { updateFullscreen(await api.app.setFullscreen(!state.fullscreen)); }
    catch (error) { toast(uiText('Full screen failed'), errorMessage(error), 'error'); }
  }

  function toggleTerminalLayout() {
    if (state.focusMode) setTerminalMaximized(false);
    if (state.tabs.size < 2 && state.layout !== 'grid') {
      toast(uiText('Open another session first'), uiText('Tiled layout needs at least two terminal sessions.'), 'error');
      return;
    }
    state.layout = state.layout === 'single' ? 'grid' : 'single';
    applyTerminalLayout();
    state.initializing ? null : persistWorkspaceSettings();
  }

  function applyBroadcastState(enabled) {
    state.broadcastInput = Boolean(enabled);
    elements.broadcastToggle.classList.toggle('active', state.broadcastInput);
    elements.broadcastToggle.setAttribute('aria-pressed', state.broadcastInput ? 'true' : 'false');
    elements.broadcastWarning.hidden = !state.broadcastInput;
    if (state.broadcastInput) {
      const terminals = [...state.tabs.values()].filter((tab) => tab.terminal && !tab.closed);
      const names = terminals.map((tab) => tab.title).join(', ');
      elements.broadcastWarning.querySelector('span').textContent = uiText("Keyboard input is being sent to {p0} terminals: {p1}", { p0: terminals.length, p1: names });
    }
  }

  async function toggleBroadcastInput() {
    const terminals = [...state.tabs.values()].filter((tab) => tab.terminal && !tab.closed);
    if (terminals.length < 2 && !state.broadcastInput) {
      toast(uiText('Open another session first'), uiText('Broadcast input needs at least two terminal sessions.'), 'error');
      return;
    }
    if (!state.broadcastInput) {
      const names = terminals.map((tab) => tab.title).join(', ');
      const confirmed = await confirmAction({
        title: uiText('Enable broadcast input?'),
        description: uiText("Every keystroke will be sent to {p0} terminals: {p1}. Commands cannot be recalled after transmission.", { p0: terminals.length, p1: names }),
        confirmLabel: uiText('Enable broadcast'),
        danger: true
      });
      if (!confirmed) return;
    }
    applyBroadcastState(!state.broadcastInput);
    toast(
      state.broadcastInput ? uiText('Broadcast input enabled') : uiText('Broadcast input disabled'),
      state.broadcastInput ? uiText('Keyboard input now goes to every open terminal.') : uiText('Keyboard input now goes only to the focused terminal.'),
      state.broadcastInput ? 'success' : ''
    );
  }

  function writeTerminalData(tab, data) {
    // applyHighlighting is escape-aware: it colors only plain-text runs and
    // copies escape sequences through verbatim.
    const payload = state.highlight.enabled ? applyHighlighting(data) : data;
    tab.terminal.write(payload);
  }

  function activateTab(id) {
    if(state.tabs.get(id)?.detached)detachTab(state.tabs.get(id)).catch(error=>toast(uiText('Detached terminal'),errorMessage(error),'error'));
    state.activeTabId = id || '';
    const fallbackTabId = state.tabs.keys().next().value || '';
    for (const [tabId, tab] of state.tabs) {
      const active = tabId === state.activeTabId;
      const roving = active || (!state.activeTabId && tabId === fallbackTabId);
      tab.tabElement.classList.toggle('active', active);
      tab.tabButton.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabButton.setAttribute('tabindex', roving ? '0' : '-1');
      tab.view.classList.toggle('active', Boolean(state.activeTabId) && ((state.layout === 'grid' && !state.focusMode) || active));
      tab.view.setAttribute('aria-hidden', state.activeTabId && ((state.layout === 'grid' && !state.focusMode) || active) ? 'false' : 'true');
    }
    const activeTab = state.tabs.get(state.activeTabId);
    elements.welcome.classList.toggle('hidden', Boolean(activeTab));
    if (activeTab) {
      elements.activeSessionLabel.textContent = `${activeTab.title} · ${activeTab.profile.protocol.toUpperCase()}`;
      window.setTimeout(() => {
        fitVisibleTerminals();
        // A double-click starts renaming; keep focus in the name field.
        if (document.activeElement?.classList.contains('tab-rename-input')) return;
        if (activeTab.terminal) activeTab.terminal.focus();
        else activeTab.view.querySelector('iframe')?.focus();
      }, 0);
    } else {
      elements.activeSessionLabel.textContent = window.AuxI18n.t('status.noSession');
    }
    updateSessionActions();
    renderProfiles();
    activeTab?.tabElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    persistSessions();
    // Roving tabindex uses a fallback tab when Home is active; do not regress to: tab.tabButton.setAttribute('tabindex', active ? '0' : '-1')
    if (state.sftp.open) syncSftpToActiveTab().catch((error) => toast(uiText('SFTP switch failed'), errorMessage(error), 'error'));
  }

  async function requestCloseTab(id) {
    const tab = state.tabs.get(id);
    if (!tab) return;
    // VNC sessions close without confirmation
    if (tab.protocol === 'vnc' || tab.profile?.protocol === 'vnc') {
      await closeVncTab(id);
      return;
    }
    if (!tab.closed) {
      const confirmed = await confirmAction({
        title: uiText('Close live session?'),
        description: uiText("Closing “{p0}” will terminate its active process and cannot preserve shell state.", { p0: tab.title }),
        confirmLabel: uiText('Close session'),
        danger: true
      });
      if (!confirmed) return;
    }
    await closeTab(id);
  }

  // Shared surface for embedded VNC and embedded RDP: both stream a remote
  // desktop into a noVNC iframe tab and differ only in the backend that owns
  // the session.
  function createRemoteDesktopTab(result, profile, protocol, saved = {}) {
    const kind = protocol.toUpperCase();
    const sessionId = result.id;
    const panelId = `terminal-panel-${sessionId}`;
    const tabId = `terminal-tab-${sessionId}`;
    const view = node('div', {
      id: panelId,
      className: 'terminal-view vnc-view',
      attrs: { role: 'tabpanel', 'aria-labelledby': tabId, 'data-session-id': sessionId }
    });
    view.append(node('iframe', {
      className: 'vnc-iframe',
      attrs: {
        src: `${result.vncUrl}&lang=${encodeURIComponent(window.AuxI18n.getLanguage())}`,
        // Same-origin here means the isolated aux-vnc://viewer origin (needed
        // for noVNC's module scripts), not the workspace page.
        sandbox: 'allow-scripts allow-same-origin',
        title: `${kind}: ${profile.name}`
      }
    }));

    const closeButton = node('button', { type: 'button', className: 'tab-close', text: '×', title: uiText("Close {p0} {p1}", { p0: kind, p1: profile.name }) });
    const tabButton = node('button', {
      id: tabId,
      type: 'button',
      className: 'tab-select',
      attrs: { role: 'tab', tabindex: '-1', 'aria-selected': 'false', 'aria-controls': panelId }
    }, [
      node('span', { className: 'tab-dot' }),
      node('span', { className: 'tab-title', text: `${kind}: ${profile.name}` })
    ]);
    const tabElement = node('div', { className: 'session-tab', attrs: { 'data-session-id': sessionId } }, [tabButton, closeButton]);
    applyTabColor(tabElement, profile);
    elements.tabbar.insertBefore(tabElement, elements.tabbarSpacer);
    elements.terminalStack.append(view);

    const desktopTab = {
      id: sessionId,
      protocol,
      desktopKind: protocol,
      profile,
      title: `${kind} · ${profile.name}`,
      view,
      tabElement,
      tabButton,
      closed: false,
      autoTitle: `${kind}: ${profile.name}`
    };
    if (saved.customTitle && saved.title) {
      desktopTab.title = saved.title; desktopTab.customTitle = true;
      tabElement.querySelector('.tab-title').textContent = saved.title;
    }
    if (saved.paneWidth) view.style.width = `${saved.paneWidth}px`;
    if (saved.paneHeight) view.style.height = `${saved.paneHeight}px`;
    view.addEventListener('pointerup', persistSessions);
    state.vncSessions = state.vncSessions || new Map();
    state.vncSessions.set(sessionId, desktopTab);
    state.tabs.set(sessionId, desktopTab);

    tabButton.addEventListener('click', () => activateTab(sessionId));
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      requestCloseVncTab(sessionId);
    });
    // Remote desktop tabs move and rename like terminal tabs.
    enableTabDragging(desktopTab);
    const desktopMenu = () => openContextMenu(tabButton, [
      { label: uiText('Rename tab'), icon: '✎', hint: 'F2', run: () => startTabRename(desktopTab) },
      { label: uiText('Move tab left'), icon: '←', hint: 'Ctrl+Shift+PgUp', run: () => moveSessionTab(desktopTab, -1) },
      { label: uiText('Move tab right'), icon: '→', hint: 'Ctrl+Shift+PgDn', run: () => moveSessionTab(desktopTab, 1) },
      'separator',
      { label: uiText('Close session'), icon: '×', danger: true, run: () => requestCloseVncTab(sessionId) }
    ], { title: desktopTab.title });
    tabElement.addEventListener('contextmenu', (event) => { event.preventDefault(); desktopMenu(); });
    tabButton.addEventListener('dblclick', (event) => { event.preventDefault(); startTabRename(desktopTab); });
    tabButton.addEventListener('keydown', (event) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); desktopMenu(); }
      else if (event.key === 'F2') { event.preventDefault(); startTabRename(desktopTab); }
      else if (event.key === 'Delete') { event.preventDefault(); requestCloseVncTab(sessionId); }
    });
    activateTab(sessionId);
    persistSessions();
    return desktopTab;
  }

  async function closeVncTab(id) {
    const tab = state.tabs.get(id);
    if (!tab) return;
    try {
      if (tab.desktopKind === 'rdp') await api.rdp.stopEmbedded(id);
      else await api.vnc.stop(id);
    } catch { /* bridge already closed */ }
    if (tab.gatewayId) api.gateway.disconnect(tab.gatewayId).catch(() => {});
    state.tabs.delete(id);
    tab.tabElement?.remove();
    tab.view?.remove();
    state.vncSessions?.delete(id);
    if (state.activeTabId === id) {
      const remaining = [...state.tabs.keys()];
      activateTab(remaining.at(-1) || '');
    }
    if (!state.tabs.size) activateTab('');
    updateSessionActions();
    renderProfiles();
    persistSessions();
  }

  function requestCloseVncTab(id) {
    closeVncTab(id);
  }

  async function closeTab(id) {
    const tab = state.tabs.get(id);
    if (!tab) return;
    if (tab.protocol === 'vnc' || !tab.terminal) {
      await closeVncTab(id);
      return;
    }
    if (state.sftp.ownerTabId === tab.id) {
      state.sftp.open = false;
      elements.appShell.classList.remove('sftp-open');
      elements.sftpPanel.setAttribute('aria-hidden', 'true');
      await disconnectSftp(tab.profile, { reset: true, status: 'SFTP disconnected' });
    }
    // Always tell the main process: for live sessions this ends the PTY, for
    // exited sessions it releases the retained transcript.
    try { await api.terminal.close(id); } catch { /* process may already have exited */ }
    tab.terminal.dispose();
    unobserveResizablePane(tab);
    tab.tabElement.remove();
    tab.view.remove();
    state.tabs.delete(id);
    state.pendingTerminalData.delete(id);
    if ([...state.tabs.values()].filter((candidate) => candidate.terminal && !candidate.closed).length < 2 && state.broadcastInput) {
      applyBroadcastState(false);
      toast(uiText('Broadcast input disabled'), uiText('Fewer than two terminal sessions remain.'));
    }

    if (state.activeTabId === id) {
      const remaining = [...state.tabs.keys()];
      activateTab(remaining.at(-1) || '');
    }
    if (!state.tabs.size) activateTab('');
    updateSessionActions();
    renderProfiles();
    persistSessions();
  }

  function recordTerminalMacroInput(tab, data) {
    if (!state.macroRecording || typeof data !== 'string' || tab.id !== state.macroRecording.tabId) return;
    // Keystrokes at a password prompt are not recorded into the macro.
    if (secretPromptVisible(tab)) { state.macroRecording.skippedSecret = true; return; }
    state.macroRecording.chunks.push(data);
    const joined = state.macroRecording.chunks.join('');
    if (joined.length > 4096) state.macroRecording.chunks = [joined.slice(-4096)];
  }

  function macroCommandText() {
    return (state.macroRecording?.chunks || [])
      .join('')
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, '')
      .replace(/[^\t\n\r\x20-\x7e]/gu, '')
      .replace(/\r\n?/gu, '\n')
      .trim();
  }

  async function toggleMacroRecording() {
    const tab = activeTab();
    if (!tab || tab.closed) throw new Error('Open an active terminal before recording a macro');
    if (!state.macroRecording) {
      const confirmed = await confirmAction({
        title: uiText('Start macro recording?'),
        description: uiText('Macro recording may capture secrets typed into this terminal. Do not record passwords, tokens, recovery codes, or private customer data.'),
        confirmLabel: uiText('Start recording'),
        danger: true
      });
      if (!confirmed) return;
      state.macroRecording = { tabId: tab.id, title: tab.title, startedAt: new Date().toISOString(), chunks: [] };
      updateSessionActions();
      toast(uiText('Macro recording'), tab.title, 'success');
      return;
    }
    const command = macroCommandText();
    const recorded = state.macroRecording;
    state.macroRecording = null;
    updateSessionActions();
    if (!command) {
      toast(uiText('Macro discarded'), uiText('No replayable terminal input was captured.'), 'info');
      return;
    }
    const form = snippetForm({
      name: `Macro ${new Date().toLocaleString()}`,
      description: uiText("Recorded from {p0} at {p1}", { p0: recorded.title, p1: recorded.startedAt }),
      command
    });
    let controller;
    const save = async () => {
      if (!form.reportValidity()) return false;
      const values = new FormData(form);
      const saved = await api.snippets.save({
        name: String(values.get('name') || '').trim(),
        description: String(values.get('description') || '').trim(),
        command: String(values.get('command') || '')
      });
      await refreshSnippets();
      toast(uiText('Macro recorded'), saved.name, 'success');
      return true;
    };
    controller = showModal({
      title: uiText('Save recorded macro'),
      description: recorded.skippedSecret
        ? `${uiText('Review the captured input before saving. Remove secrets before you save or replay it.')} ${uiText('Input typed at a password prompt was left out.')}`
        : uiText('Review the captured input before saving. Remove secrets before you save or replay it.'),
      body: form,
      className: 'narrow',
      actions: [
        { label: uiText('Discard'), busy: false, run: () => true },
        { label: uiText('Save macro snippet'), className: 'primary', run: save }
      ]
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const close = await save();
        if (close) controller.close();
      } catch (error) {
        toast(uiText('Could not save macro'), errorMessage(error), 'error');
      }
    });
  }

  async function duplicateActiveSession() {
    const tab = activeTab();
    if (!tab?.terminal) {
      toast(uiText('No active session'), uiText('Open a terminal tab before duplicating a session.'), 'error');
      return;
    }
    await connectProfile(tab.profile);
  }

  async function reconnectActiveSession() {
    const tab = activeTab();
    if (!tab?.terminal) {
      toast(uiText('No active session'), uiText('Open a terminal tab before reconnecting a session.'), 'error');
      return;
    }
    const replacement = await connectProfile(tab.profile, { ...tab, fontSize: tab.terminal?.options.fontSize });
    if (replacement) await closeTab(tab.id);
  }

  function localProfile() {
    return state.profiles.find((profile) => profile.id === 'local-shell') || {
      id: 'local-shell',
      name: 'Local shell',
      group: 'Local',
      protocol: 'local',
      host: '',
      port: 0
    };
  }

  function parseQuickTarget(raw, selectedProtocol) {
    let value = String(raw || '').trim();
    if (!value) throw new Error('Enter a hostname or connection URI');
    let protocol = selectedProtocol || 'ssh';
    let username = '';
    let host = '';
    let port = 0;

    if (protocol === 'serial') {
      if (!value.startsWith('/dev/')) throw new Error('Enter an absolute serial device path such as /dev/ttyUSB0');
      return {
        id: self.crypto.randomUUID(),
        name: `SERIAL · ${value}`,
        group: 'Quick connections',
        protocol,
        device: value,
        baudRate: 115200
      };
    }

    if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(value)) {
      const url = new URL(value);
      protocol = url.protocol.replace(':', '').toLowerCase();
      if (!['ssh', 'mosh', 'telnet', 'ftp', 'ftps', 'rdp', 'vnc'].includes(protocol)) throw new Error(`Unsupported protocol: ${protocol}`);
      username = decodeURIComponent(url.username || '');
      host = url.hostname;
      port = url.port ? Number(url.port) : 0;
    } else {
      const at = value.lastIndexOf('@');
      if (at >= 0) {
        username = value.slice(0, at);
        value = value.slice(at + 1);
      }
      if (value.startsWith('[')) {
        const closing = value.indexOf(']');
        if (closing < 0) throw new Error('Invalid IPv6 address');
        host = value.slice(1, closing);
        if (value[closing + 1] === ':') port = Number(value.slice(closing + 2));
      } else {
        const colonCount = (value.match(/:/gu) || []).length;
        if (colonCount === 1) {
          const index = value.lastIndexOf(':');
          const possiblePort = value.slice(index + 1);
          if (/^\d+$/u.test(possiblePort)) {
            host = value.slice(0, index);
            port = Number(possiblePort);
          } else host = value;
        } else host = value;
      }
    }
    if (!host) throw new Error('A hostname is required');
    const defaultPorts = { ssh: 22, mosh: 22, telnet: 23, ftp: 21, ftps: 990, rdp: 3389, vnc: 5900 };
    return {
      id: self.crypto.randomUUID(),
      name: `${protocol.toUpperCase()} · ${host}`,
      group: 'Quick connections',
      protocol,
      host,
      port: port || defaultPorts[protocol],
      username,
      useSshConfig: true,
      keepAliveSeconds: 30,
      sftpRoot: '/'
    };
  }

  async function quickConnect() {
    try {
      const profile = parseQuickTarget(elements.quickInput.value, elements.quickProtocol.value);
      await connectProfile(profile);
    } catch (error) {
      toast(uiText('Invalid connection target'), errorMessage(error), 'error');
    }
  }

  async function openProfileModal(existing = null, defaults = {}) {
    const profile = existing || {
      name: '',
      protocol: 'ssh',
      group: 'Connections',
      host: '',
      port: 22,
      username: '',
      identityFile: '',
      proxyJump: '',
      keepAliveSeconds: 30,
      sftpRoot: '/',
      transferMode: 'sftp',
      device: '/dev/ttyUSB0',
      baudRate: 115200,
      rdpDomain: '',
      startupCommand: '',
      notes: '',
      favorite: false,
      tabColor: '',
      useSshConfig: true,
      compression: false,
      agentForwarding: false,
      x11Forwarding: false,
      credentialId: '',
      credentialKind: 'password',
      inheritTerminalDefaults: true,
      terminalTheme: 'aux-dark',
      terminalFontFamily: defaultTerminalFont,
      terminalFontSize: 13,
      terminalCursorStyle: 'block',
      terminalCursorBlink: true,
      terminalScrollback: 20_000,
      ...defaults
    };
    const hasCredential = profile.credentialId ? await api.vault.has(profile.credentialId).catch(() => false) : false;
    const protocol = selectInput('protocol', [
      ['ssh', 'SSH'], ['mosh', uiText('Mosh')], ['ftp', 'FTP'], ['ftps', 'FTPS'], ['rdp', 'RDP'], ['vnc', 'VNC'], ['telnet', uiText('Telnet')], ['serial', uiText('Serial')], ['local', uiText('Local shell')]
    ], profile.protocol);
    if (existing?.id === 'local-shell') protocol.disabled = true;
    const name = textInput('name', profile.name, { required: true, placeholder: uiText('Production gateway') });
    const group = textInput('group', profile.group || 'Connections', { placeholder: uiText('Connections') });
    group.setAttribute('list', 'group-options');
    const groupOptions = node('datalist', { attrs: { id: 'group-options' } },
      knownGroupNames().filter((groupName) => groupName !== 'Local').map((groupName) => node('option', { attrs: { value: groupName } })));
    const host = textInput('host', profile.host, { placeholder: 'server.example.com' });
    const port = textInput('port', profile.port || 22, { type: 'number', min: 1, max: 65535 });
    const username = textInput('username', profile.username, { placeholder: 'admin' });
    const identityFile = textInput('identityFile', profile.identityFile, { placeholder: '~/.ssh/id_ed25519' });
    const knownHostsFile = textInput('knownHostsFile', profile.knownHostsFile, { placeholder: '~/.ssh/known_hosts' });
    const proxyJump = textInput('proxyJump', profile.proxyJump, { placeholder: uiText('bastion or user@bastion:2222,inner') });
    const keepAlive = textInput('keepAliveSeconds', profile.keepAliveSeconds ?? 30, { type: 'number', min: 0, max: 600 });
    const startupCommand = node('textarea', { name: 'startupCommand', value: profile.startupCommand || '', placeholder: 'tmux attach || tmux new' });
    startupCommand.value = profile.startupCommand || '';
    const sftpRoot = textInput('sftpRoot', profile.sftpRoot || '/', { placeholder: '/' });
    const transferMode = selectInput('transferMode', [
      ['sftp', uiText('SFTP browser')], ['scp', uiText('SCP fallback')]
    ], profile.transferMode || 'sftp');
    const device = textInput('device', profile.device || '/dev/ttyUSB0', { placeholder: '/dev/ttyUSB0' });
    const baudRate = textInput('baudRate', profile.baudRate || 115200, { type: 'number', min: 50, max: 4000000 });
    const rdpDomain = textInput('rdpDomain', profile.rdpDomain, { placeholder: 'CORP' });
    const terminalTheme = selectInput('terminalTheme', Object.keys(THEME_LABELS).map((key) => [key, themeLabel(key)]), profile.terminalTheme || 'aux-dark');
    const terminalFontFamily = textInput('terminalFontFamily', profile.terminalFontFamily || defaultTerminalFont, { placeholder: defaultTerminalFont });
    const terminalFontSize = textInput('terminalFontSize', profile.terminalFontSize || 13, { type: 'number', min: 8, max: 32 });
    const terminalCursorStyle = selectInput('terminalCursorStyle', [
      ['block', uiText('Block')], ['underline', uiText('Underline')], ['bar', uiText('Bar')]
    ], profile.terminalCursorStyle || 'block');
    const terminalScrollback = textInput('terminalScrollback', profile.terminalScrollback || 20000, { type: 'number', min: 1000, max: 200000 });
    const tabColor = selectInput('tabColor', TAB_COLORS, profile.tabColor || '');
    const notes = node('textarea', { name: 'notes', placeholder: uiText('Operational notes') });
    notes.value = profile.notes || '';
    const credentialKind = selectInput('credentialKind', [
      ['password', uiText('Account password')], ['passphrase', uiText('Private-key passphrase')]
    ], profile.credentialKind || (profile.identityFile ? 'passphrase' : 'password'));
    const secret = textInput('secret', '', { type: 'password', autocomplete: 'new-password', placeholder: hasCredential ? uiText('Stored credential exists — leave blank to keep') : uiText('Optional file-transfer credential') });
    const persistentAvailable = Boolean(state.vault?.persistentEncryptionAvailable);

    const optionsRow = node('div', { className: 'checkbox-row full', attrs: { 'data-when': 'ssh,mosh' } }, [
      checkbox('useSshConfig', uiText('Use ~/.ssh/config'), profile.useSshConfig !== false),
      checkbox('compression', uiText('Compression'), profile.compression),
      checkbox('agentForwarding', uiText('Agent forwarding'), profile.agentForwarding),
      checkbox('x11Forwarding', uiText('X11 forwarding'), profile.x11Forwarding)
    ]);
    const credentialRow = node('div', { className: 'credential-grid full', attrs: { 'data-when': 'ssh,ftp,ftps' } }, [
      field(uiText('Credential type'), credentialKind, uiText('Prevents a private-key passphrase from being sent as an account password.')),
      field(uiText('File-transfer credential'), secret, uiText('Used by graphical SFTP/FTP/FTPS. Terminal SSH authentication remains interactive through OpenSSH.')),
      node('div', { className: 'checkbox-column' }, [
        checkbox('persistentSecret', persistentAvailable ? uiText('Store encrypted on this desktop') : uiText('Encrypted storage unavailable'), persistentAvailable, !persistentAvailable),
        hasCredential ? checkbox('clearSecret', uiText('Remove stored credential'), false) : null
      ])
    ]);
    const form = node('form', { className: 'form-grid', attrs: { id: 'profile-form' } }, [
      field(uiText('Name'), name),
      field(uiText('Protocol'), protocol),
      field(uiText('Group'), group),
      groupOptions,
      field(uiText('Tab color'), tabColor, uiText('Marks this connection’s tabs and list entry, e.g. red for production.')),
      field(uiText('Host'), host, '', '',),
      field(uiText('Port'), port),
      field(uiText('Username'), username, '', '',),
      field(uiText('Identity file'), identityFile, uiText('OpenSSH key path. Agent authentication is used automatically when available.')),
      field(uiText('Known-hosts file'), knownHostsFile, uiText('Optional OpenSSH known-hosts override for isolated lab or fixture hosts.')),
      field('ProxyJump', proxyJump, uiText('One or more bastion hops for the OpenSSH -J option, e.g. bastion or user@bastion:2222,inner. Applies to terminals, tunnels, and graphical SFTP.')),
      field(uiText('Keepalive seconds'), keepAlive),
      field(uiText('SFTP start path'), sftpRoot, '', '',),
      field(uiText('SSH transfer mode'), transferMode, uiText('SCP is upload/download fallback only for legacy SSH servers without SFTP.')),
      field(uiText('Serial device'), device, '', '',),
      field(uiText('Baud rate'), baudRate, '', '',),
      field(uiText('RDP domain'), rdpDomain, '', '',),
      field(uiText('RDP desktop width'),textInput('rdpWidth',profile.rdpWidth||1600,{type:'number',min:'800',max:'3840'})),
      field(uiText('RDP desktop height'),textInput('rdpHeight',profile.rdpHeight||900,{type:'number',min:'600',max:'2160'})),
      checkbox('rdpAudio',uiText('Play RDP audio on this computer'),Boolean(profile.rdpAudio)),
      field(uiText('Startup command'), startupCommand, uiText('Runs after connecting.'), 'full'),
      node('div', { className: 'checkbox-column full', attrs: { 'data-when': 'ssh' } }, checkbox('trackRemoteCwd', uiText('Track SSH working directory with Bash integration (requires Bash 5.1+; no startup command)'), Boolean(profile.trackRemoteCwd))),
      optionsRow,
      // Terminal appearance only matters for protocols that open a terminal;
      // it is hidden (not cleared) for file-transfer and desktop protocols.
      node('div', { className: 'section-title full', text: uiText('Terminal appearance'), attrs: { 'data-terminal-only': '' } }),
      node('div', { className: 'checkbox-column full', attrs: { 'data-terminal-only': '' } }, checkbox('inheritTerminalDefaults', uiText('Use global terminal defaults'), Boolean(profile.inheritTerminalDefaults))),
      field(uiText('Terminal theme'), terminalTheme, uiText('Applied to new terminal tabs for this profile.')),
      field(uiText('Terminal font'), terminalFontFamily, uiText('Font family stack used by xterm.js.')),
      field(uiText('Font size'), terminalFontSize, uiText('8–32 px.')),
      field(uiText('Cursor style'), terminalCursorStyle),
      field(uiText('Scrollback lines'), terminalScrollback, uiText('1,000–200,000 lines.')),
      node('div', { className: 'checkbox-column', attrs: { 'data-terminal-only': '' } }, checkbox('terminalCursorBlink', uiText('Blinking cursor'), profile.terminalCursorBlink !== false)),
      credentialRow,
      node('div', { className: 'checkbox-row full' }, checkbox('favorite', uiText('Favorite connection'), profile.favorite)),
      field(uiText('Notes'), notes, '', 'full')
    ]);

    const conditional = new Map([
      [host.closest('.field'), 'ssh,mosh,rdp,vnc,telnet,ftp,ftps'],
      [port.closest('.field'), 'ssh,mosh,rdp,vnc,telnet,ftp,ftps'],
      [username.closest('.field'), 'ssh,mosh,rdp,ftp,ftps'],
      [identityFile.closest('.field'), 'ssh,mosh'],
      [knownHostsFile.closest('.field'), 'ssh,mosh'],
      [proxyJump.closest('.field'), 'ssh'],
      [keepAlive.closest('.field'), 'ssh'],
      [sftpRoot.closest('.field'), 'ssh,ftp,ftps'],
      [transferMode.closest('.field'), 'ssh'],
      [device.closest('.field'), 'serial'],
      [baudRate.closest('.field'), 'serial'],
      [rdpDomain.closest('.field'), 'rdp'],
      [form.querySelector('[name=rdpWidth]').closest('.field'),'rdp'],
      [form.querySelector('[name=rdpHeight]').closest('.field'),'rdp'],
      [form.querySelector('[name=rdpAudio]').closest('label'),'rdp'],
      [startupCommand.closest('.field'), 'ssh,mosh,local']
    ]);
    for (const [element, when] of conditional) element.dataset.when = when;
    for (const control of [terminalTheme, terminalFontFamily, terminalFontSize, terminalCursorStyle, terminalScrollback]) control.closest('.field').dataset.terminalOnly = '';

    const updateConditionalFields = () => {
      const selected = protocol.value;
      for (const element of form.querySelectorAll('[data-when]')) {
        const visible = element.dataset.when.split(',').includes(selected);
        element.hidden = !visible;
        element.querySelectorAll('input, select, textarea').forEach((control) => { control.disabled = !visible; });
      }
      const terminal = ['ssh', 'mosh', 'local', 'telnet', 'serial'].includes(selected);
      for (const element of form.querySelectorAll('[data-terminal-only]')) element.hidden = !terminal;
      const defaultPorts = { ssh: 22, mosh: 22, telnet: 23, ftp: 21, ftps: 990, rdp: 3389, vnc: 5900 };
      if (defaultPorts[selected] && (!port.value || Object.values(defaultPorts).includes(Number(port.value)))) port.value = defaultPorts[selected];
      host.required = ['ssh', 'mosh', 'rdp', 'vnc', 'telnet', 'ftp', 'ftps'].includes(selected);
    };
    protocol.addEventListener('change', updateConditionalFields);
    updateConditionalFields();

    let controller;
    const saveProfile = async () => {
      if (!form.reportValidity()) return false;
      const values = new FormData(form);
      const selectedProtocol = existing?.id === 'local-shell' ? 'local' : values.get('protocol');
      const next = {
        ...(existing || {}),
        id: existing?.id,
        name: String(values.get('name') || '').trim(),
        protocol: selectedProtocol,
        group: String(values.get('group') || 'Connections').trim(),
        host: String(values.get('host') || '').trim(),
        port: Number(values.get('port') || ({ rdp: 3389, vnc: 5900, telnet: 23 }[selectedProtocol] || 22)),
        username: String(values.get('username') || '').trim(),
        identityFile: String(values.get('identityFile') || '').trim(),
        knownHostsFile: String(values.get('knownHostsFile') || '').trim(),
        proxyJump: String(values.get('proxyJump') || '').trim(),
        keepAliveSeconds: Number(values.get('keepAliveSeconds') || 0),
        startupCommand: String(values.get('startupCommand') || ''),
        trackRemoteCwd: values.has('trackRemoteCwd'),
        sftpRoot: String(values.get('sftpRoot') || '/').trim(),
        transferMode: String(values.get('transferMode') || 'sftp'),
        device: String(values.get('device') || '').trim(),
        baudRate: Number(values.get('baudRate') || 115200),
        rdpDomain: String(values.get('rdpDomain') || '').trim(),
        rdpAudio: values.has('rdpAudio'), rdpWidth: Number(values.get('rdpWidth')), rdpHeight: Number(values.get('rdpHeight')),
        notes: String(values.get('notes') || ''),
        favorite: values.has('favorite'),
        tabColor: String(values.get('tabColor') || ''),
        useSshConfig: values.has('useSshConfig'),
        compression: values.has('compression'),
        agentForwarding: values.has('agentForwarding'),
        x11Forwarding: values.has('x11Forwarding'),
        credentialId: existing?.credentialId || '',
        credentialKind: String(values.get('credentialKind') || 'password'),
        inheritTerminalDefaults: values.has('inheritTerminalDefaults'),
        terminalTheme: String(values.get('terminalTheme') || 'aux-dark'),
        terminalFontFamily: String(values.get('terminalFontFamily') || defaultTerminalFont).trim(),
        terminalFontSize: Number(values.get('terminalFontSize') || 13),
        terminalCursorStyle: String(values.get('terminalCursorStyle') || 'block'),
        terminalCursorBlink: values.has('terminalCursorBlink'),
        terminalScrollback: Number(values.get('terminalScrollback') || 20000)
      };

      const previousCredentialId = existing?.credentialId || '';
      const clearSecret = values.has('clearSecret');
      const secretValue = String(values.get('secret') || '');
      const previousCredentialKind = existing?.credentialKind || (existing?.identityFile ? 'passphrase' : 'password');
      if (previousCredentialId && previousCredentialKind !== next.credentialKind && !secretValue && !clearSecret) {
        secret.setCustomValidity('credential kind changes require entering a replacement SFTP credential or removing the stored credential.');
        secret.reportValidity();
        return false;
      }
      secret.setCustomValidity('');
      if (clearSecret) next.credentialId = '';
      if (secretValue) next.credentialId ||= self.crypto.randomUUID();

      const saved = await api.profiles.save(next);
      const rollbackProfile = async () => {
        try {
          if (existing) await api.profiles.save(existing);
          else await api.profiles.delete(saved.id);
        } catch (rollbackError) {
          toast(uiText('Profile rollback failed'), errorMessage(rollbackError), 'error');
        }
      };
      if (secretValue) {
        try {
          await api.vault.set(saved.credentialId, secretValue, values.has('persistentSecret'));
        } catch (error) {
          await rollbackProfile();
          throw error;
        }
        if (clearSecret && previousCredentialId && previousCredentialId !== saved.credentialId) {
          await api.vault.delete(previousCredentialId).catch((error) => {
            toast(uiText('Credential cleanup required'), errorMessage(error), 'error');
          });
        }
      } else if (clearSecret && previousCredentialId) {
        try {
          await api.vault.delete(previousCredentialId);
        } catch (error) {
          await rollbackProfile();
          throw error;
        }
      }
      await api.sftp.disconnect(saved.id, saved.protocol).catch(() => {});
      updateProfiles(await api.profiles.list());
      state.selectedProfileId = saved.id;
      renderProfiles();
      toast(existing ? uiText('Connection updated') : uiText('Connection created'), saved.name, 'success');
      return true;
    };

    const actions = [];
    if (existing && existing.id !== 'local-shell') {
      actions.push({
        label: uiText('Delete'),
        className: 'danger',
        run: async () => {
          const deleted = await deleteProfileWithConfirm(existing);
          if (deleted) controller.close();
          return false;
        }
      });
    }
    actions.push(
      { label: uiText('Cancel'), busy: false, run: () => true },
      { label: existing ? uiText('Save changes') : uiText('Create connection'), className: 'primary', run: saveProfile }
    );
    controller = showModal({
      title: existing ? uiText("Edit {p0}", { p0: existing.name }) : uiText('New connection'),
      description: uiText('Profiles contain connection settings only. Exported profiles never include credentials.'),
      body: form,
      className: 'wide',
      actions
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const close = await saveProfile();
        if (close) controller.close();
      } catch (error) {
        toast(uiText('Could not save connection'), errorMessage(error), 'error');
      }
    });
  }

  function applyRecoveredWorkspace(result) {
    if (state.workspacePersistTimer) { clearTimeout(state.workspacePersistTimer); state.workspacePersistTimer = null; }
    updateProfiles(result.profiles);
    state.snippets = result.snippets;
    applyPersistedWorkspaceSettings(result.settings);
    initializeLanguage(result.settings);
    renderProfiles();
    toast(uiText('Workspace restored'), uiText('Profiles and settings restored. Active sessions were not restarted.'), 'success');
  }

  function openProfileDataMenu() {
    const body = node('div', { className: 'menu-stack' });
    const action = (title, detail, run) => {
      const button = node('button', { type: 'button', className: 'menu-action' }, [node('strong', { text: title }), node('span', { text: detail })]);
      button.addEventListener('click', async () => {
        button.disabled = true; button.setAttribute('aria-busy', 'true');
        try { await run(); } catch (error) { toast(title, errorMessage(error), 'error'); }
        finally { button.disabled = false; button.removeAttribute('aria-busy'); }
      });
      body.append(button);
    };
    const controller = showModal({ title: uiText('Import / Export and recovery'), description: uiText('Portable exports exclude saved passwords, private keys and SSH config files. Treat profile notes and commands as private data.'), body, className: 'narrow', actions: [{ label: uiText('Close'), busy: false }] });
    action('Import Aux Command profiles', 'Preview a JSON export and choose how to handle existing profiles.', async () => {
      const result = await api.profiles.import(); if (result.canceled) return;
      controller.close();
      const mode = node('select', { attrs: { 'aria-label': uiText('Existing profile handling') } }, [
        node('option', { value: 'merge', text: uiText('Add missing; keep existing profiles') }),
        node('option', { value: 'update', text: uiText('Update matching profiles') }),
        node('option', { value: 'copy', text: uiText('Create separate copies') })
      ]);
      const summary = node('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
      const refresh = () => { const p = result.preview[mode.value]; summary.textContent = uiText("{p0} profiles to add, {p1} to update, {p2} to leave unchanged; {p3} snippets to add, {p4} to update. {p5} differing matches.", { p0: p.added, p1: p.updated, p2: p.skipped, p3: p.snippetsAdded, p4: p.snippetsUpdated, p5: p.conflicts }); };
      mode.addEventListener('change', refresh); refresh();
      showModal({ title: uiText('Review profile import'), description: uiText('A recovery point is created before applying the import.'), body: node('div', {}, [mode, summary, node('p', { text: uiText('Only import files you trust: they may contain startup commands and snippets. Credentials are not imported; local credentials are retained only for an unchanged connection.') })]), actions: [
        { label: uiText('Cancel'), busy: false },
        { label: uiText('Import'), className: 'primary', run: async () => {
          const saved = await api.profiles.applyImport(result.token, mode.value);
          updateProfiles(saved.profiles); state.snippets = saved.snippets;
          toast(uiText('Import complete'), uiText("{p0} added, {p1} updated, {p2} unchanged.", { p0: saved.added, p1: saved.updated, p2: saved.skipped }), 'success'); return true;
        } }
      ] });
    });
    action('Export profiles', 'Save profiles and snippets without saved credentials.', async () => {
      const result = await api.profiles.export(); if (!result.canceled) toast(uiText('Profiles exported'), result.filePath, 'success');
    });
    action('Back up workspace', 'Save profiles, snippets, layout and preferences without secrets.', async () => {
      const result = await api.recovery.export(); if (!result.canceled) toast(uiText('Workspace backed up'), result.filePath, 'success');
    });
    action('Restore workspace backup', 'Review a backup before replacing profiles and preferences.', async () => {
      const result = await api.recovery.preview(); if (result.canceled) return;
      controller.close();
      // A backup from someone else could carry startup commands, including
      // for the local shell, so every one is listed before restoring.
      const commands = Array.isArray(result.startupCommands) ? result.startupCommands : [];
      const body = node('div', {}, [
        node('p', { text: uiText('A recovery point is created first. Passwords, private keys and SSH configuration are not restored from portable backups. Active sessions continue.') }),
        commands.length ? node('div', { className: 'warning-box danger-box', text: `${uiText('This backup contains startup commands that run when you connect. Restore it only if you trust where it came from:')}\n\n${commands.map((entry) => `${entry.name} (${entry.protocol}${entry.protocol === 'local' ? `, ${uiText('runs on this computer')}` : ''}): ${entry.command}`).join('\n')}` }) : null
      ]);
      showModal({ title: uiText('Restore workspace backup?'), description: uiText("{p0} profiles and {p1} snippets will replace the current lists and workspace settings.", { p0: result.profiles, p1: result.snippets }), body, actions: [
        { label: uiText('Cancel'), busy: false }, { label: uiText('Restore'), className: 'primary', run: async () => { applyRecoveredWorkspace(await api.recovery.restore(result.token)); return true; } }
      ] });
    });
    action('Recovery points', 'Undo an import or restore using one of the last ten local snapshots.', async () => {
      const points = await api.recovery.list(); controller.close();
      const list = node('div', { className: 'menu-stack' });
      if (!points.length) list.append(node('p', { text: uiText('No recovery points yet. They are created automatically before imports and restores.') }));
      for (const point of points) {
        const button = node('button', { type: 'button', className: 'menu-action', text: `${new Date(point.createdAt).toLocaleString()} — ${point.reason}` });
        button.addEventListener('click', () => showModal({ title: uiText('Restore recovery point?'), description: uiText('This replaces the current profiles and workspace settings. Saved credentials stay in the local keyring.'), body: node('p', { text: `${point.reason} — ${new Date(point.createdAt).toLocaleString()}` }), actions: [{ label: uiText('Cancel'), busy: false }, { label: uiText('Restore'), className: 'primary', run: async () => { applyRecoveredWorkspace(await api.recovery.restoreLocal(point.id)); return true; } }] }));
        list.append(button);
      }
      showModal({ title: uiText('Recovery points'), body: list, actions: [{ label: uiText('Close'), busy: false }] });
    });
  }

  function activeTab() {
    return state.tabs.get(state.activeTabId) || null;
  }

  async function refreshSnippets() {
    state.snippets = await api.snippets.list();
    return state.snippets;
  }

  async function runSnippet(snippet) {
    const tab = activeTab();
    if (!tab || !tab.terminal) throw new Error('Open a terminal tab before running a snippet');
    if (tab.closed) throw new Error('The active session has exited; open a live terminal before running a snippet');
    // Snippets can come from imported workspaces, so dangerous or multi-line
    // commands are shown in full before anything is sent.
    const command = String(snippet.command || '');
    const lines = command.split(/\r\n|\r|\n/u).filter((line) => line.trim());
    const hit = lines.map((line) => window.AuxAssist?.dangerCheck(line)).find(Boolean);
    if (hit || lines.length > 1) {
      const confirmed = await confirmAction({
        title: hit ? uiText('Run dangerous command?') : uiText('Run {p0} commands?', { p0: lines.length }),
        description: `${hit ? `${hit.reason}\n\n` : ''}${command}`,
        confirmLabel: uiText('Run command'),
        danger: Boolean(hit)
      });
      tab.terminal.focus();
      if (!confirmed) return;
    }
    await api.terminal.write(tab.id, `${lines.join('\r')}\r`);
    toast(uiText('Snippet sent'), snippet.name, 'success');
  }

  function snippetForm(snippet = {}) {
    const name = textInput('name', snippet.name || '', { required: true, placeholder: uiText('Restart service') });
    const description = textInput('description', snippet.description || '', { placeholder: uiText('Optional note') });
    const command = node('textarea', { name: 'command', placeholder: 'systemctl status nginx --no-pager' });
    command.value = snippet.command || '';
    command.required = true;
    return node('form', { className: 'form-grid compact-form', attrs: { id: 'snippet-form' } }, [
      field(uiText('Name'), name),
      field(uiText('Description'), description),
      field(uiText('Command'), command, uiText('Sent to the active terminal exactly as written, followed by Enter.'), 'full')
    ]);
  }

  async function openSnippetEditor(existing = null, parentController = null) {
    const form = snippetForm(existing || {});
    const save = async () => {
      if (!form.reportValidity()) return false;
      const values = new FormData(form);
      const saved = await api.snippets.save({
        ...(existing || {}),
        id: existing?.id,
        name: String(values.get('name') || '').trim(),
        description: String(values.get('description') || '').trim(),
        command: String(values.get('command') || '')
      });
      await refreshSnippets();
      toast(existing ? uiText('Snippet updated') : uiText('Snippet created'), saved.name, 'success');
      parentController?.close();
      openSnippetsModal();
      return true;
    };
    let controller;
    controller = showModal({
      title: existing ? uiText("Edit {p0}", { p0: existing.name }) : uiText('New command snippet'),
      description: uiText('Reusable commands and macros for the active terminal.'),
      body: form,
      className: 'narrow',
      actions: [
        { label: uiText('Cancel'), busy: false, run: () => true },
        { label: existing ? uiText('Save snippet') : uiText('Create snippet'), className: 'primary', run: save }
      ]
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const close = await save();
        if (close) controller.close();
      } catch (error) {
        toast(uiText('Could not save snippet'), errorMessage(error), 'error');
      }
    });
  }

  async function openSnippetsModal() {
    try { await refreshSnippets(); } catch (error) { toast(uiText('Could not refresh snippets'), errorMessage(error), 'error'); }
    const body = node('div', { className: 'menu-stack' });
    const current = activeTab();
    if (!state.snippets.length) {
      body.append(node('div', { className: 'list-empty', text: uiText('No snippets yet. Add commands you run often, then send them to the active terminal.') }));
    }
    for (const snippet of [...state.snippets].sort((a, b) => a.name.localeCompare(b.name))) {
      const runButton = node('button', { type: 'button', className: 'mini-button', text: uiText('Run'), title: current ? uiText("Run {p0}", { p0: snippet.name }) : uiText('Open a terminal tab first') });
      runButton.disabled = !current;
      const editButton = node('button', { type: 'button', className: 'mini-button', text: uiText('Edit') });
      const deleteButton = node('button', { type: 'button', className: 'mini-button', text: uiText('Delete') });
      const row = node('div', { className: 'menu-action snippet-row' }, [
        node('span', {}, [
          node('strong', { text: snippet.name }),
          node('small', { text: snippet.description || snippet.command })
        ]),
        node('span', { className: 'snippet-actions' }, [runButton, editButton, deleteButton])
      ]);
      body.append(row);
      runButton.addEventListener('click', async () => {
        try { await runSnippet(snippet); controller.close(); }
        catch (error) { toast(uiText('Snippet failed'), errorMessage(error), 'error'); }
      });
      editButton.addEventListener('click', () => openSnippetEditor(snippet, controller));
      deleteButton.addEventListener('click', async () => {
        const confirmed = await confirmAction({
          title: uiText('Delete snippet?'),
          description: uiText("Delete “{p0}” from the command snippet library?", { p0: snippet.name }),
          confirmLabel: uiText('Delete'),
          danger: true
        });
        if (!confirmed) return;
        try {
          await api.snippets.delete(snippet.id);
          await refreshSnippets();
          toast(uiText('Snippet deleted'), snippet.name, 'success');
          controller.close();
          openSnippetsModal();
        } catch (error) {
          toast(uiText('Snippet delete failed'), errorMessage(error), 'error');
        }
      });
    }
    let controller;
    controller = showModal({
      title: uiText('Command snippets'),
      description: uiText('Reusable terminal macros. Select Run to send a command to the active tab.'),
      body,
      className: 'wide',
      actions: [
        { label: uiText('New snippet'), className: 'primary', busy: false, run: () => { openSnippetEditor(null, controller); return false; } },
        { label: uiText('Close'), busy: false }
      ]
    });
  }

  // ---------------------------------------------------------------------------
  // Multi-session command runner: send one command to selected live terminals
  // and collect each session's output side by side.
  // ---------------------------------------------------------------------------

  function renderAgentStatus() {
    if (state.agentAvailable === undefined) return;
    elements.agentStatus.textContent = state.agentAvailable ? window.AuxI18n.t('sidebar.agentReady') : window.AuxI18n.t('sidebar.agentNone');
    elements.agentStatus.classList.toggle('good', state.agentAvailable);
  }

  function applyLanguage(language) {
    window.AuxI18n.setLanguage(language);
    document.documentElement.lang = window.AuxI18n.getLanguage();
    window.AuxI18n.apply(document);
    elements.languageSelect.title = window.AuxI18n.t('lang.label');
    elements.languageSelect.setAttribute('aria-label', window.AuxI18n.t('lang.label'));
    // Refresh the dynamic chrome strings that live outside data-i18n.
    updateSessionActions();
    updateFullscreen(state.fullscreen);
    for (const button of document.querySelectorAll('.pane-maximize')) {
      button.title = window.AuxI18n.t('toolbar.maximize'); button.setAttribute('aria-label', button.title);
    }
    updateProfiles(state.profiles);
    // apply() resets every data-i18n element to its default text; elements
    // that show live state are rendered again from that state.
    applyTerminalLayout();
    renderAgentStatus();
    refreshHostStats();
    const active = state.tabs.get(state.activeTabId);
    elements.activeSessionLabel.textContent = active ? `${active.title} · ${active.profile.protocol.toUpperCase()}` : window.AuxI18n.t('status.noSession');
  }

  function applyAppearance() {
    elements.appShell.dataset.density = state.ui.density || 'comfortable';
    elements.appShell.style.setProperty('--sidebar', `${state.ui.sidebarWidth || 280}px`);
    elements.appShell.style.setProperty('--sftp', `${state.ui.filesWidth || 384}px`);
    $('#sidebar-resizer').setAttribute('aria-valuenow', String(state.ui.sidebarWidth || 280));
    $('#files-resizer').setAttribute('aria-valuenow', String(state.ui.filesWidth || 384));
    elements.appShell.classList.toggle('sidebar-hidden', Boolean(state.ui.sidebarHidden));
    elements.sidebarToggle.setAttribute('aria-expanded', String(window.innerWidth <= 1024 ? elements.appShell.classList.contains('sidebar-open') : !state.ui.sidebarHidden));
    window.clearTimeout(state.panelFitTimer);
    state.panelFitTimer = window.setTimeout(fitVisibleTerminals, 220);
  }

  async function saveAppearance(patch) {
    const result = await api.app.saveUiSettings(patch);
    state.ui = { ...state.ui, ...result.ui };
    applyAppearance();
  }

  function openPreferences() {
    const density = selectInput('density', [['comfortable', uiText('Comfortable')], ['compact', uiText('Compact')]], state.ui.density);
    const sidebar = checkbox('sidebarHidden', uiText('Hide connections sidebar on wide screens'), state.ui.sidebarHidden);
    const defaults = state.ui.terminalDefaults || {};
    const font = textInput('globalFontFamily', defaults.terminalFontFamily || defaultTerminalFont);
    const size = textInput('globalFontSize', defaults.terminalFontSize || 13, { type: 'number', min: 8, max: 32 });
    const scrollback = textInput('globalScrollback', defaults.terminalScrollback || 20000, { type: 'number', min: 1000, max: 200000 });
    const theme = selectInput('globalTheme', Object.keys(terminalThemes).map((key) => [key, themeLabel(key)]), defaults.terminalTheme || 'aux-dark');
    const copyOnSelect = checkbox('terminalCopyOnSelect', uiText('Copy highlighted terminal text to the clipboard'), state.ui.terminalCopyOnSelect !== false);
    const pasteWarning = checkbox('terminalPasteWarning', uiText('Ask before pasting several lines or pasting into several sessions'), state.ui.terminalPasteWarning !== false);
    const rightClick = selectInput('terminalRightClick', [['menu', uiText('Show copy and paste menu')], ['paste', uiText('Copy selection, or paste if nothing is selected')]], state.ui.terminalRightClick === 'paste' ? 'paste' : 'menu');
    const shortcutInputs = new Map();
    const shortcutGrid = node('div', { className: 'form-grid' });
    for (const [id, label] of window.AuxPreferences.ACTIONS) {
      const input = textInput(`shortcut-${id}`, state.ui.shortcuts?.[id] || window.AuxPreferences.DEFAULT_SHORTCUTS[id]);
      shortcutInputs.set(id, input); shortcutGrid.append(field(uiText(label), input));
    }
    const reset = node('button', { type: 'button', className: 'mini-button', text: uiText('Reset shortcuts') });
    reset.addEventListener('click', () => { for (const [id, input] of shortcutInputs) input.value = window.AuxPreferences.DEFAULT_SHORTCUTS[id]; });
    const body = node('form', { className: 'modal-sections' }, [
      field(uiText('Interface density'), density, uiText('Drag panel edges or focus them and use arrow keys to resize.')),
      node('div', { className: 'checkbox-column' }, [sidebar]),
      node('strong', { text: uiText('Global terminal defaults') }),
      node('div', { className: 'form-grid' }, [field(uiText('Terminal theme'), theme), field(uiText('Terminal font'), font), field(uiText('Font size'), size), field(uiText('Scrollback lines'), scrollback)]),
      node('p', { className: 'muted', text: uiText('New profiles inherit these defaults. Existing profiles can opt in through their Terminal appearance settings. Changes apply when a session opens.') }),
      node('strong', { text: uiText('Copy and paste') }),
      node('div', { className: 'checkbox-column' }, [copyOnSelect, pasteWarning]),
      field(uiText('Right-click in terminal'), rightClick, uiText('Highlighted text can always be pasted with a middle-click. Hold Shift to select or open the menu inside tmux, vim and other mouse-aware apps.')),
      node('strong', { text: uiText('Keyboard shortcuts') }), shortcutGrid, reset,
      node('p', { className: 'muted', text: uiText('Use unique Ctrl+Shift+letter shortcuts. C and V stay reserved for terminal copy/paste. Ctrl+Tab switches tabs.') })
    ]);
    showModal({ title: uiText('Workspace preferences'), description: uiText('Appearance, terminal defaults and keyboard shortcuts.'), body, className: 'wide', actions: [
      { label: uiText('Cancel'), busy: false },
      { label: uiText('Save preferences'), className: 'primary', run: async () => {
        if (!body.reportValidity()) return false;
        const shortcuts = window.AuxPreferences.shortcuts(Object.fromEntries([...shortcutInputs].map(([id, input]) => [id, input.value])), true);
        await saveAppearance({ density: density.value, sidebarHidden: sidebar.querySelector('input').checked, shortcuts,
          terminalCopyOnSelect: copyOnSelect.querySelector('input').checked, terminalPasteWarning: pasteWarning.querySelector('input').checked, terminalRightClick: rightClick.value,
          terminalDefaults: { terminalTheme: theme.value, terminalFontFamily: font.value, terminalFontSize: Number(size.value), terminalScrollback: Number(scrollback.value) } });
        toast(uiText('Preferences saved'), '', 'success');
        return true;
      } }
    ] });
  }

  function bindPanelResizer(id, key, min, max, direction) {
    const handle = $(id);
    let origin = null;
    const change = (value) => { state.ui[key] = Math.max(min, Math.min(max, Math.round(value))); applyAppearance(); };
    const save = () => saveAppearance({ [key]: state.ui[key] }).catch((error) => toast(uiText('Panel size not saved'), errorMessage(error), 'error'));
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || (id === '#sidebar-resizer' && innerWidth <= 1024)) return;
      event.preventDefault(); origin = { x: event.clientX, width: state.ui[key] || min };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => { if (origin) change(origin.width + direction * (event.clientX - origin.x)); });
    const finish = () => { if (origin) { origin = null; save(); } };
    handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
    handle.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      change(event.key === 'Home' ? min : event.key === 'End' ? max : (state.ui[key] || min) + direction * (event.key === 'ArrowRight' ? 20 : -20)); save();
    });
  }

  function initializeLanguage(settings) {
    for (const [code, label] of window.AuxI18n.LANGUAGES) {
      const option = node('option', { text: label });
      option.value = code;
      elements.languageSelect.append(option);
    }
    const language = settings?.ui?.language || 'en';
    elements.languageSelect.value = language;
    window.AuxI18n.setLanguage(language);
    document.documentElement.lang = window.AuxI18n.getLanguage();
    window.AuxI18n.apply(document);
    elements.languageSelect.title = window.AuxI18n.t('lang.label');
    elements.languageSelect.addEventListener('change', () => {
      const next = elements.languageSelect.value;
      api.app.saveUiSettings({ language: next }).catch((error) => setStatus(uiText("Language not saved: {p0}", { p0: errorMessage(error) }), 'error'));
      applyLanguage(next);
    });
  }

  async function refreshHostStats() {
    try {
      const stats = await api.system.stats();
      if (!stats?.supported) {
        elements.hostStats.hidden = true;
        return;
      }
      const load = stats.load1 === null ? '–' : stats.load1.toFixed(2);
      elements.hostStats.textContent = uiText("load {p0} · mem {p1}% · disk {p2}%", { p0: load, p1: stats.memUsedPct ?? '–', p2: stats.diskUsedPct ?? '–' });
      elements.hostStats.title = uiText("Local host — load {p0} of {p1} cores, memory {p2}% used, root disk {p3}% used, up {p4}h", { p0: load, p1: stats.cpuCount, p2: stats.memUsedPct, p3: stats.diskUsedPct, p4: Math.floor(stats.uptimeSec / 3600) });
      elements.hostStats.hidden = false;
    } catch {
      elements.hostStats.hidden = true;
    }
  }

  function startHostStats() {
    refreshHostStats();
    window.setInterval(refreshHostStats, 20000);
  }

  function multiRunCaptureTap(id, data) {
    const capture=state.multiRun?.captures.get(id);if(!capture || capture.done)return;
    capture.text=(capture.text+data).slice(-100000);
    // The exit status arrives in an OSC 777 sequence, which xterm does not
    // display, so no marker text is left in the terminal or its scrollback.
    const match=capture.text.match(new RegExp('\\x1b\\]777;aux-run;'+capture.marker+';(\\d+)\\x07'));
    if(match){capture.done=true;capture.status.textContent=Number(match[1])===0?uiText('Completed · exit 0'):uiText('Failed · exit {p0}',{p0:match[1]});}
    capture.pre.textContent=window.AuxAssist.stripAnsi(capture.text.replace(/\x1b\]777;aux-run;[^\x07]*\x07/g,'')).split(/\r?\n/u).filter(line=>!line.includes('aux-run;'+capture.marker)).join('\n').trim().slice(-12000);
    if([...state.multiRun.captures.values()].every(item=>item.done)){clearTimeout(state.multiRun.timer);state.multiRun.finish();}
  }

  function stopMultiRunCapture() {
    if(!state.multiRun)return;clearTimeout(state.multiRun.timer);state.multiRun=null;
  }

  function openMultiRunModal() {
    if(state.multiRun && [...state.multiRun.captures.values()].some(item=>!item.done)){
      toast(uiText('Task still running'),uiText('Use Cancel run in the current task window, or wait for its timeout.'),'error');return;
    }
    const live=[...state.tabs.values()].filter(tab=>tab.terminal&&!tab.closed&&!tab.detached&&['local','ssh'].includes(tab.profile.protocol));
    if(!live.length){toast(uiText('No eligible sessions'),uiText('Open a local or SSH terminal with a ready shell prompt.'),'error');return;}
    stopMultiRunCapture();
    const boxes=live.map(tab=>({tab,box:checkbox('target-'+tab.id,tab.title+' · '+formatTarget(tab.profile),true)}));
    const input=node('textarea',{name:'taskCommand',attrs:{'aria-label':uiText('Command to run'),rows:'4',spellcheck:'false'}});
    const privateCommand=checkbox('privateTask',uiText('Sensitive command: do not save as a reusable task or add to command history'),false);
    const templates=selectInput('taskTemplate',[['',uiText('Choose a saved task…')],...state.snippets.map(item=>[item.id,item.name])],'');
    templates.onchange=()=>{const snippet=state.snippets.find(item=>item.id===templates.value);if(snippet)input.value=snippet.command;};
    const timeout=textInput('taskTimeout','60',{type:'number',min:'5',max:'3600'});
    const results=node('div',{className:'multi-run-results'});const status=node('p',{attrs:{role:'status'},text:uiText('Ready. Commands run in a POSIX sh subprocess of each selected terminal.')});
    const save=node('button',{type:'button',className:'mini-button',text:uiText('Save reusable task')});
    save.onclick=async()=>{try{if(privateCommand.querySelector('input').checked)throw new Error('Sensitive commands cannot be saved');if(!input.value.trim())throw new Error('Enter a command');const name=await askText({title:uiText('Save reusable task'),label:uiText('Task name'),value:''});if(!name)return;await api.snippets.save({name,command:input.value,description:uiText('Reusable multi-host task')});state.snippets=await api.snippets.list();toast(uiText('Task saved'),name,'success');}catch(error){toast(uiText('Task not saved'),errorMessage(error),'error');}};
    const cancel=node('button',{type:'button',className:'mini-button',text:uiText('Cancel run'),disabled:true});
    const interrupt=async(reason)=>{
      const run=state.multiRun;if(!run)return;run.cancelled=true;clearTimeout(run.timer);
      for(const [id,capture] of run.captures){if(capture.done)continue;capture.done=true;capture.status.textContent=reason+' · interrupt requested';try{await api.terminal.write(id,'\x03');}catch(error){capture.status.textContent=errorMessage(error);}}
      run.finish();status.textContent=reason+'. Interrupts were sent; check terminals if a process ignores Ctrl+C.';
    };
    cancel.onclick=()=>interrupt('Cancelled');
    const start=async()=>{
      if(state.multiRun&&[...state.multiRun.captures.values()].some(c=>!c.done))return false;
      const command=input.value.trim(),seconds=Number(timeout.value);const targets=boxes.filter(item=>item.box.querySelector('input').checked).map(item=>item.tab);
      if(!command||!targets.length)throw new Error('Enter a command and select sessions');
      if(!Number.isInteger(seconds)||seconds<5||seconds>3600)throw new Error('Timeout must be 5–3,600 seconds');
      const danger=window.AuxAssist.dangerCheck(command);
      if(!await confirmAction({title:danger?uiText('Review dangerous multi-host task'):uiText('Review multi-host task'),description:command+'\n\nTargets:\n'+targets.map(tab=>tab.title+' · '+formatTarget(tab.profile)).join('\n')+'\n\nTimeout: '+seconds+'s. Each terminal must be at a shell prompt.',confirmLabel:uiText('Run on selected sessions'),danger:Boolean(danger)}))return false;
      results.replaceChildren();const captures=new Map();cancel.disabled=false;cancel.classList.add('destructive');save.disabled=true;input.disabled=true;status.textContent='Running on '+targets.length+' sessions';
      const finish=()=>{cancel.disabled=true;cancel.classList.remove('destructive');save.disabled=false;input.disabled=false;status.textContent=uiText('Run finished. Review each host result.');};
      const run=state.multiRun={captures,finish,cancelled:false,timer:setTimeout(()=>interrupt('Timed out'),seconds*1000)};
      const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
      const runs=targets.map(tab=>{
        const marker=crypto.randomUUID().replaceAll('-','').slice(0,12);const pre=node('pre',{className:'multi-run-output'});const line=node('span',{text:uiText('Running')});
        results.append(node('div',{className:'multi-run-block'},[node('strong',{text:tab.title}),line,pre]));const capture={pre,status:line,text:'',marker,done:false};captures.set(tab.id,capture);return {tab,marker,capture};
      });
      for(const {tab,marker,capture} of runs){
        if(run.cancelled)break;
        const wrapper='sh -c '+quote(command)+"; printf '\\033]777;aux-run;"+marker+";%s\\007' \"$?\"";
        if(!privateCommand.querySelector('input').checked)tab.assist?.history.add(command);
        // Ctrl+U clears any half-typed input first; the leading space keeps
        // the wrapper out of shell history (HISTCONTROL=ignorespace).
        try{await api.terminal.write(tab.id,'\x15 sh -c '+quote(wrapper)+'\r');}catch(error){capture.done=true;line.textContent='Failed: '+errorMessage(error);}
      }
      if(!run.cancelled&&[...captures.values()].every(c=>c.done)){clearTimeout(run.timer);finish();}return false;
    };
    // While running, keep cancellation reachable by retaining this dialog.
    const controller=showModal({title:uiText('Reusable multi-host tasks'),description:uiText('Existing authenticated sessions are used. Credentials are not copied into task templates. Output stays in this session; terminal logging, if enabled separately, still applies.'),closeable:false,className:'wide',body:node('div',{className:'modal-sections'},[field(uiText('Saved task'),templates),node('div',{className:'checkbox-column'},boxes.map(item=>item.box)),field(uiText('Command to run'),input,'','full'),privateCommand,field(uiText('Timeout (seconds)'),timeout),node('div',{className:'button-row'},[save,cancel]),status,results]),actions:[{label:uiText('Close'),run:()=>{if(state.multiRun&&[...state.multiRun.captures.values()].some(c=>!c.done)){toast(uiText('Task still running'),uiText('Cancel the run before closing this window.'),'error');return false;}controller.close();return false;}},{label:uiText('Review and run'),className:'primary',run:start}]});
  }

  function historySearchEntries() {
    // Interleave per-host MRU lists by rank so the most recent commands from
    // every session surface first.
    const lists = [...state.assist.history.entries()].map(([key, history]) => ({
      host: key.split(':')[1] || 'local',
      entries: history.list()
    }));
    const merged = [];
    const depth = Math.max(0, ...lists.map((list) => list.entries.length));
    for (let rank = 0; rank < depth; rank++) {
      for (const list of lists) {
        if (rank < list.entries.length) merged.push({ command: list.entries[rank], host: list.host });
      }
    }
    return merged;
  }

  function openHistorySearch() {
    const activeTab = state.tabs.get(state.activeTabId);
    const input = node('input', {
      type: 'search',
      placeholder: uiText('Search commands from every open session…'),
      attrs: { 'aria-label': uiText('Search command history') }
    });
    const list = node('div', { className: 'history-search-list', attrs: { role: 'listbox' } });
    let matches = [];
    let selected = 0;

    const insert = (entry) => {
      const target = state.tabs.get(state.activeTabId);
      if (!target || !target.terminal || target.closed) {
        toast(uiText('No active terminal'), uiText('Open a terminal session to insert a command.'), 'error');
        return;
      }
      controller.close();
      target.assist?.mirror.feed(entry.command);
      api.terminal.write(target.id, entry.command).catch((error) => toast(uiText('Terminal input failed'), errorMessage(error), 'error'));
      updateAssistSuggestion(target);
      target.terminal.focus();
    };

    const render = () => {
      matches = window.AuxAssist.searchHistory(input.value, historySearchEntries());
      selected = Math.min(selected, Math.max(0, matches.length - 1));
      list.replaceChildren(...matches.map((entry, index) => {
        const row = node('button', {
          type: 'button',
          className: `history-search-row${index === selected ? ' selected' : ''}`,
          attrs: { role: 'option', 'aria-selected': index === selected ? 'true' : 'false' }
        }, [
          node('code', { className: 'history-search-command', text: entry.command }),
          node('span', { className: 'history-search-host', text: entry.host })
        ]);
        row.addEventListener('click', () => insert(entry));
        return row;
      }));
      if (!matches.length) {
        list.append(node('div', { className: 'list-empty', text: state.assist.history.size ? uiText('No matching commands.') : uiText('Type in a terminal first — history fills as you work (memory only, never saved to disk).') }));
      }
    };

    input.addEventListener('input', () => { selected = 0; render(); });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(selected + 1, matches.length - 1); render(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(selected - 1, 0); render(); }
      else if (event.key === 'Enter' && matches[selected]) { event.preventDefault(); insert(matches[selected]); }
    });

    const controller = showModal({
      title: uiText('Session history search'),
      description: activeTab ? uiText("Insert into “{p0}” without running it.", { p0: activeTab.title }) : uiText('Commands are inserted into the active terminal, never executed.'),
      body: node('div', { className: 'history-search' }, [input, list]),
      className: 'narrow',
      actions: []
    });
    render();
    window.setTimeout(() => input.focus(), 0);
  }

  function paletteActions() {
    const actions = [
      { label: uiText('Named workspaces'), category: 'Action', detail: uiText('Save and reopen session collections and layouts'), run: () => openWorkspaces() },
      { label: uiText('Workspace preferences'), category: 'Action', detail: uiText('Appearance, density and connection sidebar'), run: () => openPreferences() },
      { label: uiText('Network tools'), category: 'Action', detail: uiText('Ping, DNS, traceroute, port scan, Whois and Wake-on-LAN'), run: () => openNetworkTools() },
      { label: uiText('SSH key manager'), category: 'Action', detail: uiText('Create and manage SSH keys'), run: () => openSshKeyManager() },
      { label: uiText('Live server monitor'), category: 'Action', detail: uiText('Inspect server resource usage'), run: () => openLiveMonitor() },
      { label: uiText('Remote desktop gateway'), category: 'Action', detail: uiText('Remote desktop connections'), run: () => openRemoteDesktopGateway() },
      { label: uiText('Profile synchronization'), category: 'Action', detail: uiText('Configure profile sync'), run: () => openProfileSync() },
      { label: uiText('Release updates'), category: 'Action', detail: uiText('Check available releases'), run: () => openUpdatesModal() },
      { label: uiText('Import and export workspace'), category: 'Action', detail: uiText('Back up and restore connections and settings'), run: () => openProfileDataMenu() },
      { label: uiText('Terminal assist settings'), category: 'Action', detail: uiText('Suggestions, corrections and command guard'), run: () => openAssistModal() },
      { label: uiText('New local terminal'), category: 'Action', detail: uiText('Open a local shell tab'), run: () => connectProfile(localProfile()) },
      { label: uiText('Find in terminal'), category: 'Action', detail: uiText('Search the active terminal buffer'), run: () => openTerminalSearch() },
      { label: uiText('Search session history'), category: 'Action', detail: uiText('Find a command typed in any open session and insert it (Ctrl+Shift+Y)'), run: () => openHistorySearch() },
      { label: uiText('Run on multiple sessions'), category: 'Action', detail: uiText('Send one command to selected sessions and collect per-host output (Ctrl+Shift+M)'), run: () => openMultiRunModal() },
      { label: uiText('Ask AI'), category: 'Action', detail: uiText('Natural language → command or explain output via your own endpoint (Ctrl+Shift+A)'), run: () => openAiAssistModal() },
      { label: uiText('Command snippets'), category: 'Action', detail: uiText('Open snippet manager'), run: () => openSnippetsModal() },
      { label: uiText('New connection profile'), category: 'Action', detail: uiText('Create SSH, Mosh, Telnet, RDP, VNC or serial profile'), run: () => openProfileModal() },
      { label: uiText('SSH tunnels'), category: 'Action', detail: uiText('Open tunnel manager'), run: () => openTunnelsModal() },
      { label: uiText('System diagnostics'), category: 'Action', detail: uiText('Show runtime tool status'), run: () => openDiagnosticsModal() },
      { label: uiText('Log highlighting rules'), category: 'Action', detail: uiText('Configure keyword highlighting for terminal output'), run: () => openHighlightManager() },
      { label: uiText('Check connection reachability'), category: 'Action', detail: uiText('Probe every saved connection now'), run: () => probeConnectionHealth() },
      { label: uiText('Take the guided tour'), category: 'Action', detail: uiText('Replay the first-run walkthrough'), run: () => startTour() },
      { label: state.highlight.enabled ? uiText('Disable log highlighting') : uiText('Enable log highlighting'), category: 'Action', detail: uiText('Toggle keyword highlighting (Ctrl+Shift+H)'), run: () => toggleHighlighting() },
      { label: uiText('Duplicate session'), category: 'Action', detail: uiText('Open another session with the active profile'), run: () => duplicateActiveSession() },
      { label: uiText('Reconnect session'), category: 'Action', detail: uiText('Close and reopen the active session from its profile'), run: () => reconnectActiveSession() },
      { label: uiText('Toggle tiled layout'), category: 'Action', detail: uiText('Switch single/tiled terminal workspace'), run: () => toggleTerminalLayout() },
      { label: uiText('Grow tiled panes'), category: 'Action', detail: uiText('Increase tiled pane minimum size'), run: () => adjustPaneSize(40) },
      { label: uiText('Shrink tiled panes'), category: 'Action', detail: uiText('Decrease tiled pane minimum size'), run: () => adjustPaneSize(-40) },
      { label: uiText('Toggle broadcast input'), category: 'Action', detail: uiText('Send keyboard input to all sessions'), run: () => toggleBroadcastInput() }
    ];
    for (const tab of state.tabs.values()) {
      actions.push({ label: uiText("Switch to: {p0}", { p0: tab.title }), category: 'Open session',
        detail: `${tab.profile.protocol.toUpperCase()} · ${formatTarget(tab.profile)}${tab.closed ? ' · Exited' : ''}`,
        run: () => activateTab(tab.id) });
    }
    for (const profile of state.profiles) {
      actions.push({
        label: uiText("Connect profile: {p0}", { p0: profile.name }),
        category: 'Connect profile',
        detail: `${profile.protocol.toUpperCase()} · ${formatTarget(profile)}`,
        run: () => connectProfile(profile)
      });
    }
    for (const snippet of state.snippets) {
      actions.push({
        label: uiText("Run snippet: {p0}", { p0: snippet.name }),
        category: 'Run snippet',
        detail: snippet.description || snippet.command,
        run: () => runSnippet(snippet)
      });
    }
    return actions;
  }

  async function openCommandPalette() {
    try { await refreshSnippets(); } catch { /* palette can still show static actions and profiles */ }
    const listId = `palette-list-${self.crypto.randomUUID()}`;
    const input = node('input', {
      type: 'search',
      placeholder: uiText('Search tools, open sessions, connections, snippets…'),
      attrs: {
        'aria-label': uiText('Search command palette'),
        'aria-controls': listId,
        'aria-expanded': 'true',
        role: 'combobox',
        spellcheck: 'false'
      }
    });
    const list = node('div', { id: listId, className: 'palette-list', attrs: { role: 'listbox' } });
    const body = node('div', { className: 'palette-shell' }, [input, list]);
    let controller;
    const updatePaletteSelection = (rows, selectedIndex) => {
      rows.forEach((row, index) => {
        const selected = index === selectedIndex;
        row.classList.toggle('selected', selected);
        row.setAttribute('aria-selected', selected ? 'true' : 'false');
        if (selected) input.setAttribute('aria-activedescendant', row.id);
      });
      if (!rows.length) input.removeAttribute('aria-activedescendant');
    };
    const render = () => {
      const query = input.value.trim().toLowerCase();
      const actions = paletteActions().filter((action) => window.AuxWorkspace.matches(`${action.label} ${action.category} ${action.detail}`, query)).slice(0, 80);
      list.replaceChildren();
      if (!actions.length) {
        input.removeAttribute('aria-activedescendant');
        list.append(node('div', { className: 'list-empty', text: uiText('No matching commands.') }));
        return;
      }
      for (const [index, action] of actions.entries()) {
        const row = node('button', {
          type: 'button',
          id: `${listId}-option-${index}`,
          className: `palette-row${index === 0 ? ' selected' : ''}`,
          attrs: { 'data-action-index': String(index), role: 'option', 'aria-selected': index === 0 ? 'true' : 'false' }
        }, [
          node('span', { className: 'palette-copy' }, [node('strong', { text: action.label }), node('small', { text: action.detail })]),
          node('span', { className: 'palette-category', text: action.category })
        ]);
        row.addEventListener('click', async () => {
          controller.close();
          try { await action.run(); }
          catch (error) { toast(uiText('Command failed'), errorMessage(error), 'error'); }
        });
        list.append(row);
      }
      updatePaletteSelection([...list.querySelectorAll('.palette-row')], 0);
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', (event) => {
      const rows = [...list.querySelectorAll('.palette-row')];
      const current = rows.findIndex((row) => row.classList.contains('selected'));
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!rows.length) return;
        const next = event.key === 'ArrowDown' ? Math.min(rows.length - 1, current + 1) : Math.max(0, current - 1);
        updatePaletteSelection(rows, next);
        rows[next]?.scrollIntoView({ block: 'nearest' });
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        (rows[current] || rows[0])?.click();
      }
    });
    controller = showModal({
      title: uiText('Command palette'),
      description: uiText('Run actions, connect profiles, and launch snippets from one keyboard-driven menu.'),
      body,
      className: 'wide',
      actions: [{ label: uiText('Close'), busy: false }]
    });
    render();
    window.setTimeout(() => input.focus(), 0);
  }

  function resetSftpState(message = 'Open an SSH session, then enable SFTP.', status = 'No active transfer') {
    state.sftp.requestToken += 1;
    state.sftp.profile = null;
    state.sftp.ownerTabId = '';
    state.sftp.detached = false;
    state.sftp.path = '/';
    state.sftp.entries = [];
    state.sftp.selectedPath = '';
    state.sftp.selection.clear();
    state.sftp.lastError = '';
    elements.sftpTitle.textContent = 'SFTP';
    elements.sftpPath.value = '/';
    elements.sftpEmpty.textContent = message;
    elements.transferStatus.textContent = status;
    elements.fileList.classList.remove('loading');
    elements.fileList.setAttribute('aria-busy', 'false');
    renderSftpEntries();
    renderProfiles();
  }

  async function disconnectSftp(profile = state.sftp.profile, options = {}) {
    const profileId = profile?.id || '';
    if (options.reset) resetSftpState(options.message, options.status);
    if (!profileId) return;
    try {
      await api.sftp.disconnect(profileId, profile?.protocol);
    } catch (error) {
      toast(uiText('SFTP disconnect failed'), errorMessage(error), 'error');
    }
  }

  async function toggleSftp(force) {
    const shouldOpen = force === undefined ? !state.sftp.open : Boolean(force);
    if (!shouldOpen) {
      const profile = state.sftp.profile;
      state.sftp.open = false;
      elements.appShell.classList.remove('sftp-open');
      elements.sftpPanel.setAttribute('aria-hidden', 'true');
      await disconnectSftp(profile, { reset: true, status: 'SFTP disconnected' });
      window.setTimeout(() => activeTab()?.fitAddon.fit(), 200);
      return;
    }
    const tab = activeTab();
    if (!tab || !isFileTransferProfile(tab.profile)) {
      toast(uiText('File browser unavailable'), uiText('Activate an SSH, FTP, or FTPS session before opening the file browser.'), 'error');
      return;
    }
    state.sftp.open = true;
    state.sftp.detached = false;
    elements.appShell.classList.add('sftp-open');
    elements.sftpPanel.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => tab.fitAddon.fit(), 200);
    await syncSftpToActiveTab();
  }

  async function syncSftpToActiveTab() {
    if (!state.sftp.open) return;
    // A detached FTP/FTPS browser is not bound to any terminal tab and only
    // closes through its own panel controls.
    if (state.sftp.detached) return;
    const syncToken = ++state.sftp.syncToken;
    const tab = activeTab();
    const previousProfile = state.sftp.profile;
    if (!tab || !isFileTransferProfile(tab.profile)) {
      if (previousProfile) await disconnectSftp(previousProfile, { reset: true, message: 'Activate an SSH, FTP, or FTPS session to browse files.' });
      else resetSftpState('Activate an SSH, FTP, or FTPS session to browse files.');
      return;
    }
    const profileChanged = previousProfile?.id !== tab.profile.id;
    if (profileChanged && previousProfile) {
      await disconnectSftp(previousProfile, { reset: true, status: 'Switching SFTP session…' });
      if (syncToken !== state.sftp.syncToken) return;
    }
    state.sftp.profile = tab.profile;
    state.sftp.ownerTabId = tab.id;
    elements.sftpTitle.textContent = `${tab.profile.name} · ${tab.profile.protocol.toUpperCase()}`;
    await loadSftp(profileChanged ? (tab.profile.sftpRoot || '/') : state.sftp.path);
  }

  async function loadSftp(remotePath) {
    const profile = state.sftp.profile;
    if (!profile) return;
    const path = normalizeRemotePath(remotePath);
    const token = ++state.sftp.requestToken;
    state.sftp.path = path;
    state.sftp.selection.clear();
    state.sftp.selectedPath = '';
    state.sftp.selectedPath = '';
    state.sftp.lastError = '';
    elements.sftpPath.value = path;
    elements.transferStatus.textContent = uiText("Loading {p0}…", { p0: path });
    elements.fileList.classList.add('loading');
    elements.fileList.setAttribute('aria-busy', 'true');
    updateSftpButtons();
    try {
      const entries = await api.sftp.list(profile, path);
      if (token !== state.sftp.requestToken) return;
      state.sftp.entries = entries;
      elements.transferStatus.textContent = uiText("Entries: {p0}", { p0: entries.length });
      renderSftpEntries();
    } catch (error) {
      if (token !== state.sftp.requestToken) return;
      state.sftp.entries = [];
      state.sftp.lastError = errorMessage(error);
      elements.sftpEmpty.textContent = state.sftp.lastError;
      elements.transferStatus.textContent = uiText('SFTP connection failed');
      renderSftpEntries();
      toast(uiText('SFTP error'), errorMessage(error), 'error');
    } finally {
      if (token === state.sftp.requestToken) {
        elements.fileList.classList.remove('loading');
        elements.fileList.setAttribute('aria-busy', 'false');
      }
    }
  }

  function renderSftpEntries() {
    elements.fileList.replaceChildren();
    const visibleEntries = window.AuxWorkspace.visibleFiles(state.sftp.entries, state.sftp.filter);
    const visiblePaths = new Set(visibleEntries.map((entry) => entry.path));
    state.sftp.selection = new Set([...state.sftp.selection].filter((path) => visiblePaths.has(path)));
    if (!visiblePaths.has(state.sftp.selectedPath)) state.sftp.selectedPath = '';
    for (const entry of visibleEntries) {
      const row = node('button', {
        type: 'button',
        className: `file-row${state.sftp.selection.has(entry.path) ? ' selected' : ''}`,
        attrs: { 'aria-pressed': String(state.sftp.selection.has(entry.path)) },
        title: entry.longname || entry.name
      }, [
        node('span', { className: 'file-icon', text: entry.directory ? '▣' : '·/' }),
        node('span', { className: 'file-copy' }, [
          node('strong', { text: entry.name }),
          node('small', { text: `${entry.permissions}${entry.modifiedAt ? ` · ${new Date(entry.modifiedAt).toLocaleString()}` : ''}` })
        ]),
        node('span', { className: 'file-size', text: entry.directory ? 'DIR' : formatBytes(entry.size) })
      ]);
      row.dataset.path = entry.path;
      row.addEventListener('click', (event) => {
        if (event.shiftKey && state.sftp.selectionAnchor) {
          const anchor = visibleEntries.findIndex((item) => item.path === state.sftp.selectionAnchor);
          const end = visibleEntries.indexOf(entry);
          if (!event.ctrlKey && !event.metaKey) state.sftp.selection.clear();
          for (const item of visibleEntries.slice(Math.max(0, Math.min(anchor, end)), Math.max(anchor, end) + 1)) state.sftp.selection.add(item.path);
        } else if (event.ctrlKey || event.metaKey) {
          if (state.sftp.selection.has(entry.path)) state.sftp.selection.delete(entry.path);
          else state.sftp.selection.add(entry.path);
          state.sftp.selectionAnchor = entry.path;
        } else {
          state.sftp.selection = new Set([entry.path]);
          state.sftp.selectionAnchor = entry.path;
        }
        state.sftp.selectedPath = state.sftp.selection.has(entry.path) ? entry.path : [...state.sftp.selection][0] || '';
        updateFileSelection();
      });
      row.addEventListener('dblclick', () => activateSftpEntry(entry));
      row.addEventListener('keydown', (event) => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const rows = [...elements.fileList.querySelectorAll('.file-row')];
          const index = rows.indexOf(row);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
          rows[next]?.focus();
          rows[next]?.click();
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          activateSftpEntry(entry);
        }
      });
      elements.fileList.append(row);
    }
    const empty = !state.sftp.profile || visibleEntries.length === 0;
    elements.sftpEmpty.classList.toggle('visible', empty);
    if (state.sftp.profile && !visibleEntries.length && !state.sftp.lastError) {
      elements.sftpEmpty.textContent = state.sftp.entries.length ? uiText('No files match your filters.') : uiText('This directory is empty.');
    }
    updateSftpButtons();
  }

  function activateSftpEntry(entry) {
    // Keyboard activation can land on a row that was never clicked, so the
    // activated entry must become the selection before the editor opens.
    state.sftp.selectedPath = entry.path;
    state.sftp.selection = new Set([entry.path]);
    for (const candidate of elements.fileList.querySelectorAll('.file-row')) {
      candidate.classList.toggle('selected', candidate.dataset.path === entry.path);
    }
    updateSftpButtons();
    if (entry.directory) loadSftp(entry.path);
    else openRemoteTextEditor();
  }

  function selectedSftpEntry() {
    return state.sftp.entries.find((entry) => entry.path === state.sftp.selectedPath) || null;
  }

  function updateFileSelection() {
    for (const row of elements.fileList.querySelectorAll('.file-row')) {
      const selected = state.sftp.selection.has(row.dataset.path);
      row.classList.toggle('selected', selected); row.setAttribute('aria-pressed', String(selected));
    }
    updateSftpButtons();
  }

  function updateSftpButtons() {
    const selected = selectedSftpEntry();
    const ready = Boolean(state.sftp.profile);
    elements.sftpUpload.disabled = !ready;
    elements.sftpMkdir.disabled = !ready;
    const files = state.sftp.entries.filter((entry) => state.sftp.selection.has(entry.path));
    elements.sftpDownload.disabled = !files.length;
    elements.sftpEdit.disabled = !selected || selected.directory || state.sftp.selection.size !== 1;
    elements.sftpMore.disabled = !selected || state.sftp.selection.size !== 1;
    $('#file-selection-count').textContent = state.sftp.selection.size ? uiText("{p0} selected", { p0: state.sftp.selection.size }) : '';
    $('#file-manager-button').disabled = !ready;
    elements.sftpUp.disabled = !ready || state.sftp.path === '/';
  }

  function scheduleTransferQueueRender() {
    if (state.transferQueue.renderTimer) return;
    state.transferQueue.renderTimer = setTimeout(() => { state.transferQueue.renderTimer = null; renderTransferQueue(); }, 100);
  }

  function renderTransferQueue() {
    const entries = state.transferQueue.entries;
    const container = document.getElementById('transfer-queue');
    if (!container) return;
    if(!document.getElementById('queue-batch-controls')){
      const controls=node('div',{id:'queue-batch-controls',className:'button-row'});
      for(const [label,action,statuses] of [['Pause all','pause',['queued','transferring']],['Resume / retry all','resume',['paused','failed']]]){
        const button=node('button',{type:'button',className:'mini-button',text:uiText(label),attrs:{'data-ui-message':label}});button.onclick=async()=>{button.disabled=true;try{for(const entry of state.transferQueue.entries.filter(e=>statuses.includes(e.status)))await api.transfer[action](entry.id);}catch(error){toast(uiText('Queue action failed'),errorMessage(error),'error');}finally{button.disabled=false;}};controls.append(button);
      }
      container.insertAdjacentElement('beforebegin',controls);
    }
    const badge = document.getElementById('queue-count');
    if (badge) {
      const active = entries.filter((entry) => entry.status !== 'completed').length;
      badge.textContent = String(active);
      badge.classList.toggle('has-active', active > 0);
    }
    if (!entries.length) {
      container.innerHTML = '<div class="queue-empty">No transfers</div>';
      return;
    }
    const statusOrder = { transferring: 0, queued: 1, pausing: 2, paused: 3, failed: 4, completed: 5 };
    const sorted = [...entries].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
    container.replaceChildren();
    const visibleLimit = state.transferQueue.visibleLimit || 200;
    for (const entry of sorted.slice(0, visibleLimit)) {
      const pct = entry.total > 0 ? Math.min(100, Math.round((entry.transferred / entry.total) * 100)) : 0;
      const statusIcon = entry.status === 'transferring' ? '↻' : entry.status === 'queued' ? '⋯' : entry.status === 'paused' || entry.status === 'pausing' ? '⏸' : entry.status === 'failed' ? '✗' : entry.status === 'completed' ? '✓' : '?';
      const actionButton = (entry.status === 'transferring' || entry.status === 'queued') && entry.pausable !== false
        ? node('button', { type: 'button', className: 'queue-action', text: '⏸', title: uiText('Pause') })
        : entry.status === 'paused'
          ? node('button', { type: 'button', className: 'queue-action', text: '▶', title: uiText('Resume') })
          : entry.status === 'failed'
            ? node('button', { type: 'button', className: 'queue-action', text: '↻', title: uiText('Retry') })
            : null;
      const cancelButton = entry.status === 'transferring' || entry.status === 'queued' || entry.status === 'paused'
        ? node('button', { type: 'button', className: 'queue-action queue-cancel', text: '×', title: uiText('Cancel') })
        : null;
      const progressBar = entry.status !== 'completed'
        ? node('div', { className: 'queue-progress-bg' }, [
            node('div', { className: 'queue-progress-fill', attrs: { style: `width:${pct}%` } })
          ])
        : null;
      const row = node('div', { className: `queue-row status-${entry.status}` }, [
        node('span', { className: 'queue-icon', text: statusIcon }),
        node('div', { className: 'queue-info' }, [
          node('strong', { className: 'queue-name', text: entry.fileName }),
          node('small', { className: 'queue-detail', text: `${entry.direction === 'upload' ? '↑' : '↓'} ${entry.status === 'failed' ? entry.error : entry.status === 'completed' ? 'Done' : `${formatBytes(entry.transferred)} / ${formatBytes(entry.total)}`}` }),
          progressBar
        ]),
        node('span', { className: 'queue-actions' }, [actionButton, cancelButton].filter(Boolean))
      ]);
      if (actionButton) actionButton.addEventListener('click', () => {
        if (entry.status === 'transferring' || entry.status === 'queued') api.transfer.pause(entry.id).catch(() => {});
        else if (entry.status === 'paused') api.transfer.resume(entry.id).catch(() => {});
        else if (entry.status === 'failed') api.transfer.retry(entry.id).catch(() => {});
      });
      if (cancelButton) cancelButton.addEventListener('click', () => api.transfer.cancel(entry.id).catch(() => {}));
      container.append(row);
    }
    if (sorted.length > visibleLimit) {
      const more = node('button', { type: 'button', className: 'queue-clear-completed', text: uiText('Show more ({count} remaining)', { count: sorted.length - visibleLimit }) });
      more.addEventListener('click', () => { state.transferQueue.visibleLimit = visibleLimit + 200; renderTransferQueue(); }); container.append(more);
    }
    if (sorted.some((entry) => entry.status === 'completed')) {
      const clearButton = node('button', { type: 'button', className: 'queue-clear-completed', text: uiText('Clear completed') });
      clearButton.addEventListener('click', async () => {
        try {
          state.transferQueue.entries = await api.transfer.clearCompleted() || [];
          renderTransferQueue();
        } catch (error) {
          toast(uiText('Could not clear transfers'), errorMessage(error), 'error');
        }
      });
      container.append(clearButton);
    }
  }

  async function uploadFile() {
    if (!state.sftp.profile) return;
    try {
      const result = await api.sftp.upload(state.sftp.profile, state.sftp.path);
      if (!result.canceled) {
        reviewTransfers(result);
      }
    } catch (error) { toast(uiText('Upload failed'), errorMessage(error), 'error'); }
  }

  async function handleSftpDrop(event) {
    event.stopPropagation();
    event.preventDefault();
    elements.sftpPanel.classList.remove('drag-over');
    if (!state.sftp.profile) {
      toast(uiText('Open SFTP first'), uiText('Drag files onto an active SFTP panel to upload.'), 'error');
      return;
    }
    const files = [...(event.dataTransfer?.files || [])];
    const localPaths = files.map((file) => api.system.filePath(file)).filter(Boolean);
    if (!localPaths.length) {
      toast(uiText('No uploadable files'), uiText('Aux Command could not resolve local paths for the dropped files.'), 'error');
      return;
    }
    try {
      elements.transferStatus.textContent = uiText("Preparing {p0} files for review…", { p0: localPaths.length });
      const result = await api.sftp.uploadPaths(state.sftp.profile, state.sftp.path, localPaths);
      reviewTransfers(result);
    } catch (error) {
      toast(uiText('Drop upload failed'), errorMessage(error), 'error');
    }
  }

  function bindSftpDragAndDrop() {
    for (const target of [elements.sftpPanel, elements.fileList]) {
      target.addEventListener('dragover', (event) => {
        if (!state.sftp.profile) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        elements.sftpPanel.classList.add('drag-over');
        elements.transferStatus.textContent = uiText('Drag files here to upload');
      });
      target.addEventListener('dragleave', (event) => {
        if (!elements.sftpPanel.contains(event.relatedTarget)) elements.sftpPanel.classList.remove('drag-over');
      });
      target.addEventListener('drop', (event) => handleSftpDrop(event));
    }
  }

  async function downloadSelected() {
    const files = state.sftp.entries.filter((entry) => state.sftp.selection.has(entry.path));
    if (!files.length || !state.sftp.profile) return;
    const profile = state.sftp.profile;
    try {
      const directory = await api.sftp.chooseDirectory();
      if (!directory) return;
      reviewTransfers(await api.sftp.planBatch({ profile, direction: 'download', paths: files.map((entry) => entry.path), directory }));
    } catch (error) { toast(uiText('Download failed'), errorMessage(error), 'error'); }
  }

  function reviewTransfers(plan) {
    const conflicts = plan.items.filter((item) => item.conflict).length;
    const policy = selectInput('conflictPolicy', [['skip', uiText('Skip existing files')], ['rename', uiText('Keep both with a new name')], ['replace', uiText('Replace existing files')]], 'skip');
    const list = node('div', { className: 'transfer-review-list' }, plan.items.map((item) => node('div', { className: 'transfer-review-item' }, [
      node('strong', { text: item.name }), node('span', { text: `${item.directory ? uiText('Folder') : formatBytes(item.size)}${item.conflict ? ` · ${uiText('Already exists')}` : ` · ${uiText('New file')}`}` })
    ])));
    showModal({ title: uiText('Review transfers'), description: uiText('{files} files · {folders} folders · {direction} · {directory}', { files: plan.items.filter((item) => !item.directory).length, folders: plan.items.filter((item) => item.directory).length, direction: uiText(plan.direction === 'upload' ? 'Upload' : 'Download'), directory: plan.directory }), body: node('div', { className: 'modal-sections' }, [
      list, field(uiText('When a destination file exists'), policy, uiText('{count} file conflicts detected. Existing folders are merged. Folders and transfers are created only after you confirm.', { count: conflicts }))
    ]), className: 'wide', actions: [
      { label: uiText('Cancel'), busy: false },
      { label: uiText('Queue transfers'), className: 'primary', run: async () => {
        const result = await api.sftp.applyBatch(plan.token, policy.value);
        toast(uiText('Transfers queued'), uiText('{queued} queued · {folders} folders created · {skipped} skipped', { queued: result.queued, folders: result.directories || 0, skipped: result.skipped }), 'success');
        return true;
      } }
    ] });
  }

  async function openFileManager() {
    const profile = state.sftp.profile;
    if (!profile) return;
    const panes = {};
    const body = node('div', { className: 'dual-file-browser' });
    let disposed = false;
    for (const side of ['local', 'remote']) {
      const input = textInput(`${side}Path`, side === 'remote' ? state.sftp.path : '', { placeholder: side === 'local' ? uiText('Home directory') : '/' });
      input.setAttribute('aria-label', uiText(side === 'local' ? 'Local directory' : 'Remote directory'));
      const up = node('button', { type: 'button', className: 'mini-button', text: '↑', title: uiText('Parent directory') });
      const refresh = node('button', { type: 'button', className: 'mini-button', text: '↻', title: uiText('Refresh directory') });
      const filter = textInput(`${side}Filter`, '', { placeholder: uiText('Filter files…') });
      filter.setAttribute('aria-label', uiText(side === 'local' ? 'Filter local files' : 'Filter remote files'));
      const all = node('button', { type: 'button', className: 'mini-button', text: uiText('Select all files') });
      const list = node('div', { className: 'dual-file-list' });
      const status = node('div', { className: 'dual-file-status', attrs: { role: 'status' } });
      const transfer = node('button', { type: 'button', className: 'mini-button primary', text: side === 'local' ? uiText('Upload selection →') : uiText('← Download selection'), disabled: true });
      const pane = panes[side] = { input, list, status, transfer, entries: [], selected: new Set(), token: 0, path: input.value };
      const render = () => {
        const visible = window.AuxWorkspace.visibleFiles(pane.entries, { query: filter.value });
        const paths = new Set(visible.map((entry) => entry.path));
        pane.selected = new Set([...pane.selected].filter((path) => paths.has(path)));
        list.replaceChildren();
        for (const entry of visible.slice(0, pane.renderLimit || 200)) {
          const row = node('div', { className: 'dual-file-row' });
          const select = checkbox('file', entry.directory ? '' : entry.name, pane.selected.has(entry.path));
          select.querySelector('input').setAttribute('aria-label', uiText('Select {name}', { name: entry.name }));
          select.querySelector('input').addEventListener('change', (event) => {
            if (event.target.checked) pane.selected.add(entry.path); else pane.selected.delete(entry.path);
            update();
          });
          row.append(select);
          if (entry.directory) {
            const open = node('button', { type: 'button', className: 'dual-directory', text: `▸ ${entry.name}`, title: uiText("Open {p0}", { p0: entry.name }) });
            open.addEventListener('click', () => load(entry.path)); row.append(open);
          } else row.append(node('small', { text: formatBytes(entry.size) }));
          list.append(row);
        }
        if(visible.length>(pane.renderLimit||200)){const more=node('button',{type:'button',text:uiText('Show 200 more files')});more.onclick=()=>{pane.renderLimit=(pane.renderLimit||200)+200;render();};list.append(more);}
        if (!visible.length) list.append(node('div', { className: 'list-empty', text: uiText('No matching files') }));
        update();
      };
      const update = () => { status.textContent = uiText('{entries} entries · {selected} selected', { entries: pane.entries.length, selected: pane.selected.size }); transfer.disabled = pane.selected.size === 0; };
      const load = async (directory) => {
        const token = ++pane.token; transfer.disabled = true; list.inert = true; status.textContent = uiText('Loading…');
        try {
          const result = side === 'local' ? await api.sftp.localList(directory) : { path: directory || '/', entries: await api.sftp.list(profile, directory || '/') };
          if (disposed || token !== pane.token) return;
          pane.path = result.path; input.value = result.path; pane.entries = result.entries; pane.renderLimit=200; pane.selected.clear(); render();
        } catch (error) {
          // A path that cannot be opened leaves the current folder in place.
          if (!disposed && token === pane.token) { input.value = pane.path || ''; status.textContent = errorMessage(error); render(); }
        }
        finally { if (!disposed && token === pane.token) list.inert = false; }
      };
      pane.load = load;
      up.addEventListener('click', () => load(parentRemote(pane.path || '/')));
      refresh.addEventListener('click', () => load(input.value));
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); load(input.value); } });
      filter.addEventListener('input', () => {pane.renderLimit=200;render();});
      all.addEventListener('click', () => { pane.selected = new Set(window.AuxWorkspace.visibleFiles(pane.entries, { query: filter.value }).filter((entry) => !entry.directory).map((entry) => entry.path)); render(); });
      transfer.addEventListener('click', async () => {
        transfer.disabled = true;
        try {
          const directory = side === 'local' ? panes.remote.path : panes.local.path;
          const plan = await api.sftp.planBatch({ profile, direction: side === 'local' ? 'upload' : 'download', paths: [...pane.selected], directory });
          reviewTransfers(plan);
        } catch (error) { toast(uiText('Transfer review failed'), errorMessage(error), 'error'); }
        finally { update(); }
      });
      body.append(node('section', { className: 'dual-file-pane', attrs: { 'aria-label': uiText(side === 'local' ? 'Local files' : 'Remote files') } }, [node('h3', { text: side === 'local' ? uiText('Local files') : profile.name }), node('div', { className: 'dual-pathbar' }, [up, input, refresh]), filter, all, list, status, transfer]));
    }
    const tools = node('div', { className:'button-row file-manager-tools' });
    const direction=selectInput('syncDirection',[['upload',uiText('Local → remote')],['download',uiText('Remote → local')]],'upload');
    const verify=checkbox('verifyComparison',uiText('Compare file contents using SHA-256 (reads both copies)'),false);
    const compare=node('button',{type:'button',className:'mini-button',text:uiText('Compare / sync folders'),id:'compare-folders'});
    compare.onclick=async()=>{compare.disabled=true;try{
      const plan=await api.sftp.compare({profile,localDirectory:panes.local.path,remoteDirectory:panes.remote.path,direction:direction.value,verify:verify.querySelector('input').checked});
      const rows=node('div',{className:'transfer-review-list'},(plan.comparison||[]).map(item=>node('div',{className:'transfer-review-item'},[node('span',{text:item.name}),node('small',{text:item.directory?uiText('Folder'):item.unchanged?(plan.verified?uiText('SHA-256 matches'):uiText('Metadata matches')):item.conflict?(plan.verified?uiText('Contents differ / replace'):uiText('Metadata differs / replace')):uiText('Missing / copy')})])));
      showModal({title:uiText('Directory comparison'),description:uiText("{p0} matching files skipped. {p1} This is a one-way update; destination-only files remain.", { p0: plan.unchanged, p1: plan.verified?'File contents verified.':'Comparison uses size and modification time; enable SHA-256 to verify contents.' }),className:'wide',body:rows,actions:[{label:uiText('Close')},{label:uiText('Review sync transfers'),className:'primary',run:()=>{if(plan.token)reviewTransfers(plan);return false;}}]});
    }catch(error){toast(uiText('Comparison failed'),errorMessage(error),'error');}finally{compare.disabled=false;}};
    const search=node('button',{type:'button',className:'mini-button',text:uiText('Search remote filenames'),id:'search-remote-files'});
    search.onclick=async()=>{const query=await askText({title:uiText('Search remote filenames'),label:uiText('Filename contains'),value:''});if(!query)return;search.disabled=true;try{
      const result=await api.sftp.search({profile,directory:panes.remote.path,query});
      const list=node('div',{className:'transfer-review-list'});let modal;
      for(const entry of result.results){const open=node('button',{type:'button',text:entry.path});open.onclick=()=>{panes.remote.load(entry.directory?entry.path:parentRemote(entry.path));modal.close();};list.append(open);}
      modal=showModal({title:uiText('Remote search results'),description:uiText("{p0} matches · {p1} entries examined{p2}", { p0: result.results.length, p1: result.visited, p2: result.limited?' · limit reached; narrow the search':'' }),body:list,className:'wide'});
    }catch(error){toast(uiText('Search failed'),errorMessage(error),'error');}finally{search.disabled=false;}};
    const checksum=node('button',{type:'button',className:'mini-button',text:uiText('Verify selected file pair'),id:'verify-file-pair'});
    checksum.onclick=async()=>{try{
      if(panes.local.selected.size!==1||panes.remote.selected.size!==1)throw new Error('Select one local file and one remote file');checksum.disabled=true;
      const result=await api.sftp.checksum({profile,localPath:[...panes.local.selected][0],remotePath:[...panes.remote.selected][0]});
      showModal({title:result.equal?uiText('SHA-256 verification passed'):uiText('File contents differ'),body:node('pre',{className:'multi-run-output',text:uiText("Local:  {p0}\nRemote: {p1}", { p0: result.localHash, p1: result.remoteHash })})});
    }catch(error){toast(uiText('Verification failed'),errorMessage(error),'error');}finally{checksum.disabled=false;}};
    tools.append(direction,verify,compare,search,checksum);body.append(tools);
    const controller = showModal({ title: uiText('File manager'), description: uiText('Select files or folders on either side, then review the transfer. Selected folders include their contents; symbolic links are not followed.'), body, className: 'file-manager-modal', actions: [{ label: uiText('Close'), busy: false }] });
    // Completed transfers refresh both sides and clear the finished selection.
    state.fileManager = { profileId: profile.id, panes };
    controller.onClose(() => { if (state.fileManager?.panes === panes) state.fileManager = null; });
    controller.onClose(() => { disposed = true; });
    await Promise.all([panes.local.load(''), panes.remote.load(state.sftp.path)]);
  }

  async function openRemoteTextEditor() {
    const entry = selectedSftpEntry();
    if (!entry || entry.directory || !state.sftp.profile) return;
    const editingProfile = state.sftp.profile;
    let original = '';
    try {
      elements.transferStatus.textContent = uiText("Opening {p0}…", { p0: entry.path });
      original = await api.sftp.readText(editingProfile, entry.path);
      elements.transferStatus.textContent = uiText("Editing {p0}", { p0: entry.path });
    } catch (error) {
      toast(uiText('Remote edit failed'), errorMessage(error), 'error');
      return;
    }
    const editor = node('textarea', {
      name: 'content',
      className: 'remote-editor',
      attrs: { spellcheck: 'false', autofocus: '' }
    });
    editor.value = original;
    const remotePath = textInput('path', entry.path, { required: true });
    remotePath.readOnly = true;
    const form = node('form', { className: 'form-grid compact-form' }, [
      field(uiText('Remote path'), remotePath, uiText('Path is read-only for this editor; use More → Rename to move files.'), 'full'),
      field(uiText('File contents'), editor, uiText('Inline editing is limited to UTF-8 text files up to 1 MB. Saving overwrites the remote file atomically via a temporary upload then rename.'), 'full'),
      node('div', { className: 'warning-box full', text: uiText('Remote edits are live changes. Verify the target file and keep a backup or version-control path for production systems.') })
    ]);
    let controller;
    const save = async () => {
      if (editor.value === original) {
        toast(uiText('No remote changes'), entry.name);
        return true;
      }
      await api.sftp.writeText(editingProfile, entry.path, editor.value);
      toast(uiText('Remote file saved'), entry.path, 'success');
      await loadSftp(state.sftp.path);
      return true;
    };
    controller = showModal({
      title: uiText("Edit {p0}", { p0: entry.name }),
      description: entry.path,
      body: form,
      className: 'wide',
      actions: [
        { label: uiText('Cancel'), busy: false },
        { label: uiText('Save remote file'), className: 'primary', run: save }
      ]
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const close = await save();
        if (close) controller.close();
      } catch (error) {
        toast(uiText('Remote save failed'), errorMessage(error), 'error');
      }
    });
  }

  async function makeRemoteDirectory() {
    if (!state.sftp.profile) return;
    const name = await askText({ title: uiText('New remote folder'), label: uiText('Folder name'), placeholder: 'logs' });
    if (name === null || name === undefined) return;
    try {
      const target = joinRemote(state.sftp.path, name);
      await api.sftp.mkdir(state.sftp.profile, target);
      await loadSftp(state.sftp.path);
      toast(uiText('Folder created'), name.trim(), 'success');
    } catch (error) { toast(uiText('Could not create folder'), errorMessage(error), 'error'); }
  }

  async function openSftpMore() {
    const entry = selectedSftpEntry();
    if (!entry || !state.sftp.profile) return;
    const body = node('div', { className: 'menu-stack' });
    const renameButton = node('button', { type: 'button', className: 'menu-action' }, [node('strong', { text: uiText('Rename') }), node('span', { text: entry.name })]);
    const deleteButton = node('button', { type: 'button', className: 'menu-action destructive' }, [node('strong', { text: uiText('Delete') }), node('span', { text: entry.directory ? uiText('Only empty remote folders can be removed.') : uiText('This cannot be undone.') })]);
    body.append(renameButton, deleteButton);
    const controller = showModal({ title: uiText('Remote item'), body, className: 'narrow', actions: [{ label: uiText('Close'), busy: false }] });
    renameButton.addEventListener('click', async () => {
      const name = await askText({ title: uiText('Rename remote item'), label: uiText('New name'), value: entry.name });
      if (!name || name === entry.name) return;
      try {
        await api.sftp.rename(state.sftp.profile, entry.path, joinRemote(state.sftp.path, name));
        controller.close();
        await loadSftp(state.sftp.path);
        toast(uiText('Remote item renamed'), name, 'success');
      } catch (error) { toast(uiText('Rename failed'), errorMessage(error), 'error'); }
    });
    deleteButton.addEventListener('click', async () => {
      const confirmed = await confirmAction({
        title: uiText("Delete {p0}?", { p0: entry.directory ? 'folder' : 'file' }),
        description: uiText("Permanently delete “{p0}” from {p1}?", { p0: entry.name, p1: state.sftp.path }),
        confirmLabel: uiText('Delete'),
        danger: true
      });
      if (!confirmed) return;
      try {
        await api.sftp.remove(state.sftp.profile, entry.path, entry.directory);
        controller.close();
        await loadSftp(state.sftp.path);
        toast(uiText('Remote item deleted'), entry.name, 'success');
      } catch (error) { toast(uiText('Delete failed'), errorMessage(error), 'error'); }
    });
  }

  function renderTunnelStatusCluster() {
    const cluster = elements.tunnelStatusCluster;
    if (!cluster) return;
    const active = [...state.tunnels.values()].filter((tunnel) => ['running', 'starting', 'stopping'].includes(tunnel.status));
    if (!active.length) {
      cluster.hidden = true;
      return;
    }
    cluster.hidden = false;
    const running = active.filter((tunnel) => tunnel.status === 'running').length;
    const pending = active.length - running;
    elements.tunnelStatusSummary.textContent = pending
      ? uiText("{p0}/{p1} tunnels", { p0: running, p1: active.length })
      : uiText("Tunnels: {p0}", { p0: running });
    elements.tunnelStatusDots.replaceChildren();
    for (const tunnel of active.slice(0, 8)) {
      elements.tunnelStatusDots.append(node('span', {
        className: `cluster-dot status-${tunnel.status}`,
        title: `${tunnel.name} · ${tunnel.status}`
      }));
    }
    cluster.setAttribute('aria-label', uiText("Active SSH tunnels: {p0} — open tunnel manager", { p0: active.length }));
  }

  function renderTunnelList(container) {
    container.replaceChildren();
    const tunnels = [...state.tunnels.values()].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    if (!tunnels.length) {
      container.append(node('div', { className: 'list-empty', text: uiText('No tunnels have been started in this session.') }));
      return;
    }
    for (const tunnel of tunnels) {
      const endpoint = tunnel.type === 'dynamic'
        ? `${tunnel.bindHost}:${tunnel.bindPort} (SOCKS)`
        : `${tunnel.bindHost}:${tunnel.bindPort} → ${tunnel.targetHost}:${tunnel.targetPort}`;
      const stop = node('button', { type: 'button', className: 'mini-button', text: tunnel.status === 'stopped' || tunnel.status === 'failed' ? uiText('Dismiss') : uiText('Stop') });
      const row = node('div', { className: `tunnel-row status-${tunnel.status}` }, [
        node('span', { className: 'tunnel-indicator' }),
        node('div', {}, [node('strong', { text: tunnel.name }), node('small', { text: `${tunnel.type.toUpperCase()} · ${endpoint}${tunnel.lastError ? ` · ${tunnel.lastError}` : ''}` })]),
        stop
      ]);
      stop.addEventListener('click', async () => {
        if (tunnel.status === 'stopped' || tunnel.status === 'failed') state.tunnels.delete(tunnel.id);
        else await api.tunnels.stop(tunnel.id).catch((error) => toast(uiText('Tunnel stop failed'), errorMessage(error), 'error'));
        renderTunnelList(container);
        renderTunnelStatusCluster();
      });
      container.append(row);
    }
    renderTunnelStatusCluster();
  }

  function openTunnelsModal() {
    const sshProfiles = state.profiles.filter((profile) => profile.protocol === 'ssh');
    const profileSelect = selectInput('profileId', sshProfiles.map((profile) => [profile.id, profile.name]), state.selectedProfileId);
    const type = selectInput('type', [['local', uiText('Local forward')], ['remote', uiText('Remote forward')], ['dynamic', uiText('Dynamic SOCKS proxy')]], 'local');
    const name = textInput('name', 'Local tunnel');
    const bindHost = textInput('bindHost', '127.0.0.1');
    const bindPort = textInput('bindPort', '8080', { type: 'number', min: 1, max: 65535 });
    const targetHost = textInput('targetHost', '127.0.0.1');
    const targetPort = textInput('targetPort', '80', { type: 'number', min: 1, max: 65535 });
    const targetHostField = field(uiText('Target host'), targetHost);
    const targetPortField = field(uiText('Target port'), targetPort);
    const formRows = [
      field(uiText('SSH profile'), profileSelect),
      field(uiText('Tunnel type'), type),
      field(uiText('Name'), name),
      field(uiText('Bind address'), bindHost),
      field(uiText('Bind port'), bindPort),
      targetHostField,
      targetPortField,
      node('div', { className: 'warning-box full', text: uiText('Managed tunnels use OpenSSH BatchMode. Configure key or SSH-agent authentication; interactive password and MFA prompts are not available for background tunnels.') })
    ];
    if (!sshProfiles.length) {
      formRows.unshift(node('div', { className: 'warning-box full', text: uiText('Create an SSH profile before starting a tunnel. Local, RDP, VNC, Telnet and serial profiles cannot own OpenSSH forwarding processes.') }));
    }
    const form = node('form', { className: 'form-grid compact-form' }, formRows);
    const list = node('div', { className: 'tunnel-list', attrs: { 'data-live-tunnel-list': 'true' } });
    const body = node('div', { className: 'modal-sections' }, [
      node('div', {}, [node('div', { className: 'section-title', text: uiText('Start tunnel') }), form]),
      node('div', {}, [node('div', { className: 'section-title', text: uiText('Session tunnels') }), list])
    ]);
    const updateType = () => {
      const dynamic = type.value === 'dynamic';
      targetHostField.hidden = dynamic;
      targetPortField.hidden = dynamic;
      targetHost.disabled = dynamic;
      targetPort.disabled = dynamic;
      name.value = type.value === 'dynamic' ? 'SOCKS proxy' : type.value === 'remote' ? 'Remote tunnel' : 'Local tunnel';
    };
    type.addEventListener('change', updateType);
    updateType();
    renderTunnelList(list);

    showModal({
      title: uiText('SSH tunnels'),
      description: uiText('Create local, remote, and dynamic OpenSSH forwarding processes.'),
      body,
      className: 'wide',
      actions: [
        { label: uiText('Close'), busy: false },
        {
          label: uiText('Start tunnel'),
          className: 'primary',
          disabled: !sshProfiles.length,
          run: async () => {
            if (!sshProfiles.length) throw new Error('Create an SSH profile before starting a tunnel');
            const values = new FormData(form);
            const tunnel = await api.tunnels.start({
              id: self.crypto.randomUUID(),
              profileId: String(values.get('profileId')),
              type: String(values.get('type')),
              name: String(values.get('name') || '').trim(),
              bindHost: String(values.get('bindHost') || '127.0.0.1').trim(),
              bindPort: Number(values.get('bindPort')),
              targetHost: String(values.get('targetHost') || '127.0.0.1').trim(),
              targetPort: Number(values.get('targetPort') || 80)
            });
            state.tunnels.set(tunnel.id, tunnel);
            renderTunnelList(list);
            toast(uiText('Tunnel starting'), tunnel.name);
            return false;
          }
        }
      ]
    });
  }

  async function openDiagnosticsModal() {
    try { state.diagnostics = await api.system.diagnostics(); } catch (error) { toast(uiText('Diagnostics failed'), errorMessage(error), 'error'); return; }
    const info = state.diagnostics;
    const list = node('div', { className: 'diagnostic-list' });
    for (const tool of info.tools || []) {
      list.append(node('div', { className: `diagnostic-row${tool.available ? ' available' : ''}` }, [
        node('span', { className: 'indicator' }),
        node('div', {}, [node('strong', { text: tool.name }), node('small', { text: tool.available ? tool.executable : uiText("Missing · {p0}", { p0: tool.candidates.join(' / ') }) })]),
        node('span', { className: 'diagnostic-state', text: tool.available ? uiText('Ready') : uiText('Install') })
      ]));
    }
    const protocolList = node('div', { className: 'diagnostic-list' });
    for (const capability of info.protocols || []) {
      protocolList.append(node('div', { className: `diagnostic-row${capability.available ? ' available' : ''}` }, [
        node('span', { className: 'indicator' }),
        node('div', {}, [
          node('strong', { text: capability.protocol.toUpperCase() }),
          node('small', { text: `${capability.mode} · ${capability.detail || ''}` })
        ]),
        node('span', { className: 'diagnostic-state', text: capability.available ? uiText('Ready') : uiText('Missing') })
      ]));
    }
    const updateStatus = state.updates || { supported: false };
    const body = node('div', { className: 'modal-sections' }, [
      node('div', { className: 'system-summary' }, [
        node('div', {}, [node('span', { text: uiText('Platform') }), node('strong', { text: `${info.platform} · ${info.architecture}` })]),
        node('div', {}, [node('span', { text: uiText('Host') }), node('strong', { text: info.hostname })]),
        node('div', {}, [node('span', { text: uiText('Shell') }), node('strong', { text: info.shell || 'Unknown' })]),
        node('div', {}, [node('span', { text: uiText('SSH agent') }), node('strong', { text: info.sshAgent ? uiText('Available') : uiText('Not detected') })])
      ]),
      updateReleaseSection(updateStatus, () => {
        // Refresh by replacing the open dialog instead of stacking a second one.
        controller.close();
        openDiagnosticsModal();
      }),
      node('div', {}, [node('div', { className: 'section-title', text: uiText('Protocol capabilities') }), protocolList]),
      node('div', {}, [node('div', { className: 'section-title', text: uiText('Runtime tools') }), list]),
      node('div', { className: 'warning-box', text: uiText('Aux Command bundles local PTY, graphical SFTP, Telnet and serial bridges. RDP, VNC and Mosh still depend on host-installed clients/servers; X11 forwarding uses OpenSSH -X and the host display.') })
    ]);
    const controller = showModal({ title: uiText('System diagnostics'), description: uiText('Protocol support detected on this Linux host.'), body, className: 'wide', actions: [{ label: uiText('Close'), busy: false }] });
  }

  function openLiveMonitor() {
    const sshProfiles = state.profiles.filter((profile) => profile.protocol === 'ssh');
    if (!sshProfiles.length) {
      showModal({
        title: uiText('Live server monitor'),
        description: uiText('Read-only CPU, memory, disk, process and listening-socket data over SSH.'),
        body: node('div', { className: 'empty-state', text: uiText('Create or import an SSH profile before using the live monitor.') }),
        className: 'wide',
        actions: [{ label: uiText('Close'), busy: false }]
      });
      return;
    }
    const profileSelect = selectInput('profileId', sshProfiles.map((profile) => [profile.id, profile.name]), sshProfiles[0].id);
    const autoRefresh = checkbox('autoRefresh', uiText('Refresh every 10 seconds'));
    const output = node('div', { className: 'modal-sections' }, node('div', { className: 'empty-state', text: uiText('Select an SSH profile and capture a snapshot.') }));
    const refresh = node('button', { type: 'button', className: 'button primary', text: uiText('Capture snapshot') });
    const controls = node('div', { className: 'modal-sections' }, [
      node('div', { className: 'form-grid' }, [field(uiText('SSH profile'), profileSelect, '', 'full'), node('div', { className: 'full' }, autoRefresh)]),
      node('div', { className: 'button-row' }, refresh),
      output
    ]);
    let running = false;
    let timer = null;
    const capture = async () => {
      if (running) return;
      running = true;
      refresh.disabled = true;
      refresh.textContent = uiText('Capturing…');
      try {
        const profile = sshProfiles.find((item) => item.id === profileSelect.value);
        const result = await api.monitor.snapshot(profile);
        output.replaceChildren();
        for (const [key, value] of Object.entries(result.sections || {})) {
          output.append(node('section', {}, [
            node('div', { className: 'section-title', text: key.replaceAll('_', ' ') }),
            node('pre', { className: 'network-output monitor-output', text: value || uiText('No data') })
          ]));
        }
        if (!output.childElementCount) output.append(node('div', { className: 'empty-state', text: uiText('The host returned no monitor data.') }));
        setStatus(uiText("Monitor snapshot captured for {p0}", { p0: profile.name }));
      } catch (error) {
        output.replaceChildren(node('div', { className: 'warning-box danger-box', text: errorMessage(error) }));
        toast(uiText('Monitor snapshot failed'), errorMessage(error), 'error');
      } finally {
        running = false;
        refresh.disabled = false;
        refresh.textContent = uiText('Capture snapshot');
      }
    };
    refresh.addEventListener('click', capture);
    autoRefresh.querySelector('input').addEventListener('change', (event) => {
      if (timer) window.clearInterval(timer);
      timer = event.target.checked ? window.setInterval(capture, 10_000) : null;
      if (event.target.checked) capture();
    });
    const controller = showModal({
      title: uiText('Live server monitor'),
      description: uiText('Read-only CPU, memory, disk, process and listening-socket data over SSH.'),
      body: controls,
      className: 'wide',
      actions: [{ label: uiText('Close'), busy: false }]
    });
    controller.onClose(() => { if (timer) window.clearInterval(timer); });
  }

  async function openRemoteDesktopGateway() {
    const sshProfiles = state.profiles.filter((profile) => profile.protocol === 'ssh');
    if (!sshProfiles.length) {
      showModal({
        title: uiText('Remote desktop gateway'),
        description: uiText('Open RDP or VNC through an SSH local-forwarding gateway.'),
        body: node('div', { className: 'empty-state', text: uiText('Create or import an SSH profile before opening a remote desktop gateway.') }),
        className: 'wide',
        actions: [{ label: uiText('Close'), busy: false }]
      });
      return;
    }
    const gatewaySelect = selectInput('gatewayProfileId', sshProfiles.map((profile) => [profile.id, profile.name]), sshProfiles[0].id);
    const protocolSelect = selectInput('protocol', [['rdp', 'RDP'], ['vnc', 'VNC']], 'rdp');
    const hostInput = textInput('targetHost', '', { placeholder: '10.0.0.10', required: 'required' });
    const portInput = textInput('targetPort', '3389', { type: 'number', min: '1', max: '65535' });
    const localPortInput = textInput('localPort', '', { type: 'number', min: '1024', max: '65535', placeholder: 'automatic' });
    const usernameInput = textInput('username', '', { autocomplete: 'username', placeholder: 'optional' });
    const domainInput = textInput('rdpDomain', '', { placeholder: uiText('optional, e.g. CORP') });
    const connectButton = node('button', { type: 'button', className: 'button primary', text: uiText('Open remote desktop') });
    const sessionsHost = node('div', { className: 'modal-sections' });
    const renderSessions = async () => {
      const sessions = await api.gateway.list();
      sessionsHost.replaceChildren(node('div', { className: 'section-title', text: uiText('Active gateways') }));
      if (!sessions.length) {
        sessionsHost.append(node('div', { className: 'empty-state', text: uiText('No remote desktop gateways are running.') }));
        return;
      }
      for (const session of sessions) {
        const stop = node('button', { type: 'button', className: 'button', text: uiText('Stop') });
        stop.addEventListener('click', async () => {
          try {
            await api.gateway.disconnect(session.id);
            await renderSessions();
          } catch (error) {
            toast(uiText('Gateway stop failed'), errorMessage(error), 'error');
          }
        });
        sessionsHost.append(node('div', { className: 'diagnostic-row' }, [
          node('span', { className: 'indicator' }),
          node('div', {}, [node('strong', { text: `${session.protocol.toUpperCase()} ${session.targetHost}:${session.targetPort}` }), node('small', { text: uiText("{p0} via localhost:{p1}", { p0: session.gatewayName, p1: session.localPort }) })]),
          stop
        ]));
      }
    };
    const domainField = () => domainInput.closest('.field');
    protocolSelect.addEventListener('change', () => {
      portInput.value = protocolSelect.value === 'rdp' ? '3389' : '5900';
      const rdp = protocolSelect.value === 'rdp';
      if (domainField()) domainField().hidden = !rdp;
      domainInput.disabled = !rdp;
    });
    connectButton.addEventListener('click', async () => {
      connectButton.disabled = true;
      connectButton.textContent = uiText('Opening gateway...');
      try {
        const gatewayProfile = sshProfiles.find((profile) => profile.id === gatewaySelect.value);
        const result = await api.gateway.connect({
          gatewayProfile,
          protocol: protocolSelect.value,
          targetHost: hostInput.value.trim(),
          targetPort: Number(portInput.value),
          localPort: localPortInput.value ? Number(localPortInput.value) : undefined,
          username: usernameInput.value.trim(),
          rdpDomain: protocolSelect.value === 'rdp' ? domainInput.value.trim() : ''
        });
        setStatus(uiText("{p0} gateway connected on localhost:{p1}", { p0: result.protocol.toUpperCase(), p1: result.localPort }));
        // Without a native VNC client, the built-in viewer opens through the tunnel.
        if (result.embedded) {
          const viewerProfile = { id: `gateway-vnc-${result.id}`, name: uiText("VNC via {p0}", { p0: result.gatewayName }), protocol: 'vnc', host: '127.0.0.1', port: result.localPort };
          const bridge = await api.vnc.start(viewerProfile);
          const desktop = createRemoteDesktopTab(bridge, viewerProfile, 'vnc');
          desktop.gatewayId = result.id;
          desktop.transient = true;
        }
        await renderSessions();
      } catch (error) {
        toast(uiText('Could not open remote desktop gateway'), errorMessage(error), 'error');
      } finally {
        connectButton.disabled = false;
        connectButton.textContent = uiText('Open remote desktop');
      }
    });
    const body = node('div', { className: 'modal-sections' }, [
      node('div', { className: 'form-grid' }, [
        field(uiText('SSH gateway'), gatewaySelect),
        field(uiText('Desktop protocol'), protocolSelect),
        field(uiText('Target host'), hostInput),
        field(uiText('Target port'), portInput),
        field(uiText('Local forwarding port'), localPortInput, uiText('Leave empty to choose a free local port.')),
        field(uiText('Remote desktop username'), usernameInput, uiText('The native client handles any password prompt.')),
        field(uiText('RDP domain'), domainInput, uiText('Windows logon domain passed to FreeRDP as /d:.'))
      ]),
      node('div', { className: 'button-row' }, connectButton),
      node('div', { className: 'warning-box', text: uiText('The SSH tunnel must confirm forwarding readiness before Aux Command starts the native RDP or VNC client.') }),
      sessionsHost
    ]);
    const controller = showModal({
      title: uiText('Remote desktop gateway'),
      description: uiText('Reach an internal RDP or VNC service through a saved SSH gateway profile.'),
      body,
      className: 'wide',
      actions: [{ label: uiText('Close'), busy: false }]
    });
    const unsubscribe = api.gateway.onStatus(() => { if (controller.modal.isConnected) renderSessions().catch(() => {}); });
    controller.onClose(unsubscribe);
    await renderSessions();
  }

  async function openProfileSync() {
    const [config, initialStatus] = await Promise.all([api.sync.config(), api.sync.status()]);
    let currentStatus = initialStatus;
    const sshProfiles = state.profiles.filter((profile) => profile.protocol === 'ssh');
    const typeSelect = selectInput('type', [['file', uiText('Local file')], ['https', 'HTTPS'], ['http', uiText('HTTP (this computer only)')], ['ssh', uiText('SSH / SFTP')]], config?.type || 'file');
    const sourceInput = textInput('source', config?.url || '', { placeholder: '/path/to/profiles.json' });
    const profileSelect = selectInput('profileId', sshProfiles.map((profile) => [profile.id, profile.name]), config?.profileId || sshProfiles[0]?.id || '');
    const intervalInput = textInput('intervalMinutes', String(config?.intervalMinutes || 60), { type: 'number', min: '1', max: '1440' });
    const sourceField = field(uiText('Profile source'), sourceInput, uiText('A JSON array or an object with a profiles array. Sync shares connection names, hosts, ports, users, groups and tags; startup commands, keys, jump hosts and forwarding stay as set on this computer.'), 'full');
    const profileField = field(uiText('SSH profile'), profileSelect, uiText('The remote file is read through this saved SSH profile.'), 'full');
    const statusBox = node('div', { className: 'warning-box' });
    const renderStatus = () => {
      statusBox.textContent = currentStatus.configured
        ? uiText("Configured: {p0}. Last sync: {p1}. {p2}", { p0: currentStatus.type, p1: currentStatus.lastSyncAt || 'never', p2: currentStatus.lastError ? `Last error: ${currentStatus.lastError}` : '' })
        : uiText('Profile synchronization is disabled.');
      statusBox.classList.toggle('danger-box', Boolean(currentStatus.lastError));
    };
    const updateFields = () => {
      const ssh = typeSelect.value === 'ssh';
      profileField.hidden = !ssh;
      sourceInput.placeholder = ssh ? '/remote/path/profiles.json' : typeSelect.value === 'file' ? '/path/to/profiles.json' : uiText("{p0}://host/profiles.json", { p0: typeSelect.value });
    };
    typeSelect.addEventListener('change', updateFields);
    updateFields();
    renderStatus();
    const body = node('div', { className: 'modal-sections' }, [
      node('div', { className: 'form-grid' }, [
        field(uiText('Source type'), typeSelect),
        field(uiText('Sync interval in minutes'), intervalInput),
        sourceField,
        profileField
      ]),
      statusBox,
      node('div', { className: 'warning-box', text: uiText('Credentials and private-key material are never imported from a sync source. Existing local credentials stay local.') })
    ]);
    // showModal restores every footer button's pre-click disabled state after
    // an action resolves, so availability is re-derived one tick later.
    const refreshAvailability = () => window.setTimeout(() => {
      const configured = Boolean(currentStatus.configured);
      for (const footerButton of controller.footer.querySelectorAll('button')) {
        if (footerButton.textContent === uiText('Disable') || footerButton.textContent === uiText('Sync now')) {
          footerButton.disabled = !configured;
        }
      }
    }, 0);
    const controller = showModal({
      title: uiText('Profile synchronization'),
      description: uiText('Keep non-secret connection profiles aligned from a local, web or SSH-hosted JSON file.'),
      body,
      className: 'wide',
      actions: [
        { label: uiText('Close'), busy: false },
        {
          label: uiText('Disable'),
          disabled: !currentStatus.configured,
          run: async () => {
            currentStatus = await api.sync.disable();
            renderStatus();
            refreshAvailability();
            setStatus(uiText('Profile synchronization disabled'));
            return false;
          }
        },
        {
          label: uiText('Sync now'),
          className: 'button',
          disabled: !currentStatus.configured,
          run: async () => {
            const result = await api.sync.syncNow();
            currentStatus = await api.sync.status();
            state.profiles = await api.profiles.list();
            renderProfiles();
            renderStatus();
            refreshAvailability();
            setStatus(uiText("Profile sync complete: {p0} added, {p1} updated", { p0: result.added, p1: result.updated }));
            return false;
          }
        },
        {
          label: uiText('Save configuration'),
          className: 'primary',
          run: async () => {
            const intervalMinutes = Number(intervalInput.value);
            const next = { type: typeSelect.value, url: sourceInput.value.trim(), intervalMinutes };
            if (typeSelect.value === 'ssh') next.profileId = profileSelect.value;
            await api.sync.configure(next);
            currentStatus = await api.sync.status();
            renderStatus();
            refreshAvailability();
            setStatus(uiText('Profile synchronization configured'));
            return false;
          }
        }
      ]
    });
  }

  async function openSshKeyManager() {
    const name = textInput('name', 'id_aux_command', { required: true, maxlength: 64 });
    const type = selectInput('type', [['ed25519', 'Ed25519'], ['rsa', uiText('RSA 4096')]], 'ed25519');
    const passphrase = textInput('passphrase', '', { type: 'password', required: false, maxlength: 4096 });
    const generate = node('button', { type: 'button', className: 'button primary', text: uiText('Generate key') });
    const form = node('form', { className: 'form-grid compact-form' }, [
      field(uiText('Key name'), name, uiText('Letters, numbers, dots, underscores, and hyphens only.')),
      field(uiText('Type'), type),
      field(uiText('Passphrase'), passphrase, uiText('Optional. The passphrase is never stored by Aux Command.'), 'full'),
      node('div', { className: 'full' }, generate)
    ]);
    const list = node('div', { className: 'tunnel-list', attrs: { 'aria-live': 'polite' } });
    const body = node('div', { className: 'modal-sections' }, [
      node('div', {}, [node('div', { className: 'section-title', text: uiText('Generate key pair') }), form]),
      node('div', {}, [node('div', { className: 'section-title', text: uiText('Local SSH keys') }), list])
    ]);
    showModal({
      title: uiText('SSH Key Manager'),
      description: uiText('Generate and manage key pairs in your local SSH directory. Private key contents never enter the renderer.'),
      body,
      actions: [{ label: uiText('Close'), busy: false }]
    });

    const refresh = async () => {
      list.replaceChildren(node('div', { className: 'list-empty', text: uiText('Loading SSH keys…') }));
      const keys = await api.sshKeys.list();
      list.replaceChildren();
      if (!keys.length) {
        list.append(node('div', { className: 'list-empty', text: uiText('No SSH key pairs were found.') }));
        return;
      }
      for (const key of keys) {
        const copy = node('button', { type: 'button', className: 'mini-button', text: uiText('Copy public') });
        const remove = node('button', { type: 'button', className: 'mini-button destructive', text: uiText('Delete') });
        const controls = node('div', { className: 'row-actions' }, [copy, remove]);
        const row = node('div', { className: 'tunnel-row' }, [
          node('span', { className: 'tunnel-indicator' }),
          node('div', {}, [
            node('strong', { text: key.name }),
            node('small', { text: `${key.type} · ${key.fingerprint}${key.comment ? ` · ${key.comment}` : ''}` })
          ]),
          controls
        ]);
        copy.addEventListener('click', async () => {
          try {
            const publicKey = await api.sshKeys.getPublicKey(key.name);
            await api.system.clipboardWrite(publicKey);
            toast(uiText('Public key copied'), key.name, 'success');
          } catch (error) {
            toast(uiText('Public key copy failed'), errorMessage(error), 'error');
          }
        });
        remove.addEventListener('click', async () => {
          const confirmed = await confirmAction({
            title: uiText('Delete SSH key pair?'),
            description: uiText("Delete the local private and public key files for “{p0}”? This cannot be undone.", { p0: key.name }),
            confirmLabel: uiText('Delete key pair'),
            danger: true
          });
          if (!confirmed) return;
          try {
            await api.sshKeys.delete(key.name);
            toast(uiText('SSH key deleted'), key.name, 'success');
            await refresh();
          } catch (error) {
            toast(uiText('SSH key delete failed'), errorMessage(error), 'error');
          }
        });
        list.append(row);
      }
    };

    generate.addEventListener('click', async () => {
      if (!form.reportValidity()) return;
      generate.disabled = true;
      try {
        const created = await api.sshKeys.generate(name.value.trim(), type.value, passphrase.value);
        passphrase.value = '';
        toast(uiText('SSH key generated'), `${created.name} · ${created.fingerprint}`, 'success');
        await refresh();
      } catch (error) {
        toast(uiText('SSH key generation failed'), errorMessage(error), 'error');
      } finally {
        generate.disabled = false;
      }
    });
    form.addEventListener('submit', (event) => { event.preventDefault(); generate.click(); });
    await refresh();
  }

  function openNetworkTools() {
    const toolTabs = ['Ping', 'Traceroute', 'DNS lookup', 'Port scan', 'Whois', 'Wake-on-LAN'];
    const tabBar = node('div', { className: 'network-tabbar', attrs: { role: 'tablist', 'aria-label': uiText('Network tool') } });
    const output = node('div', { className: 'network-output', attrs: { role: 'status', 'aria-live': 'polite', style: 'min-height:200px;overflow:auto;font-family:var(--mono);font-size:11px;white-space:pre-wrap;line-height:1.5' } });
    const inputRow = node('div', { className: 'network-input-row', attrs: { style: 'display:grid;grid-template-columns:1fr auto auto;gap:8px' } });
    const input = node('input', { type: 'text', placeholder: uiText('hostname or IP'), attrs: { 'aria-label': uiText('Network target'), style: 'height:34px;border:1px solid var(--line);border-radius:8px;background:rgba(5,15,22,.72);color:var(--text);padding:0 10px' } });
    const runButton = node('button', { type: 'button', className: 'button primary', text: uiText('Run') });
    const cancelButton = node('button', { type: 'button', className: 'button', text: uiText('Cancel'), attrs: { 'aria-label': uiText('Cancel running network command') } });
    cancelButton.hidden = true;
    inputRow.append(input, runButton, cancelButton);
    const extraInput = node('input', { type: 'text', placeholder: uiText('optional: count / port list / DNS type'), attrs: { 'aria-label': uiText('Network tool options'), style: 'height:34px;border:1px solid var(--line);border-radius:8px;background:rgba(5,15,22,.72);color:var(--text);padding:0 10px;display:none' } });
    let activeTool = 'Ping';
    // Each tool keeps its own options, so a port list never becomes a DNS
    // record type when switching tools.
    const toolOptions = new Map();

    const tabs = toolTabs.map((name) => {
      const btn = node('button', { type: 'button', className: 'mini-button', text: name, attrs: { role: 'tab', 'aria-selected': 'false' } });
      btn.addEventListener('click', () => {
        tabs.forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        toolOptions.set(activeTool, extraInput.value);
        activeTool = name;
        extraInput.value = toolOptions.get(name) || '';
        extraInput.style.display = ['Ping', 'Port scan', 'DNS lookup'].includes(name) ? 'block' : 'none';
        extraInput.placeholder = name === 'Ping' ? uiText('Count (default 4)') : name === 'Port scan' ? uiText('Comma-separated ports') : uiText('Record type (A/MX/TXT/AAAA)');
        input.placeholder = name === 'Whois' ? uiText('Domain or IP') : name === 'Wake-on-LAN' ? uiText('MAC address (xx:xx:xx:xx:xx:xx)') : uiText('Hostname or IP');
        output.textContent = uiText('Ready. Enter a target and click Run.');
      });
      return btn;
    });
    tabBar.append(...tabs);
    tabs[0].classList.add('active');
    tabs[0].setAttribute('aria-selected', 'true');

    runButton.addEventListener('click', async () => {
      const target = input.value.trim();
      if (!target) { output.textContent = uiText('Enter a target first.'); return; }
      output.textContent = uiText('Running…');
      runButton.disabled = true;
      cancelButton.hidden = false;
      cancelButton.disabled = false;
      tabs.forEach((tab) => { tab.disabled = true; });
      const selectedTool = activeTool;
      try {
        let result;
        switch (selectedTool) {
          case 'Ping': {
            const count = parseInt(extraInput.value) || 4;
            result = await api.network.ping(target, Math.min(20, Math.max(1, count)));
            break;
          }
          case 'Traceroute':
            result = await api.network.traceroute(target);
            break;
          case 'DNS lookup': {
            const type = (extraInput.value || 'A').toUpperCase().trim();
            result = await api.network.dns(target, type);
            break;
          }
          case 'Port scan': {
            const entries = (extraInput.value || '22,80,443,8080,3306,8443,9090,3000').split(',').map((p) => p.trim()).filter(Boolean);
            const invalid = entries.filter((p) => !/^\d+$/u.test(p) || Number(p) < 1 || Number(p) > 65535);
            if (invalid.length) throw new Error(uiText('Invalid ports: {p0}. Use numbers from 1 to 65535, separated by commas.', { p0: invalid.join(', ') }));
            result = await api.network.portScan(target, [...new Set(entries.map(Number))]);
            break;
          }
          case 'Whois':
            result = await api.network.whois(target);
            break;
          case 'Wake-on-LAN':
            result = await api.network.wakeOnLan(target);
            break;
        }
        if (selectedTool === 'Port scan' && Array.isArray(result)) {
          const open = result.filter((r) => r.open);
          const closed = result.filter((r) => !r.open);
          output.textContent = ['Port scan: ' + target, '', 'OPEN (' + open.length + '):', ...open.map((r) => '  ' + r.port + '/tcp'), '', 'CLOSED (' + closed.length + '):', ...closed.map((r) => '  ' + r.port + '/tcp')].join('\n');
        } else if (result && result.stdout) {
          output.textContent = result.stdout || 'No output';
          if (result.stderr) output.textContent += '\n\nSTDERR:\n' + result.stderr;
        } else {
          output.textContent = JSON.stringify(result, null, 2);
        }
      } catch (error) {
        output.textContent = errorMessage(error);
      }
      runButton.disabled = false;
      cancelButton.hidden = true;
      tabs.forEach((tab) => { tab.disabled = false; });
    });

    cancelButton.addEventListener('click', async () => {
      const cancelled = await api.network.cancelAll();
      output.textContent = cancelled ? uiText('Cancelling network command…') : uiText('No cancellable network command is running.');
      cancelButton.disabled = true;
    });

    const body = node('div', { className: 'modal-sections' }, [
      node('div', {}, [node('div', { className: 'section-title', text: uiText('Tool') }), tabBar]),
      node('div', {}, [node('div', { className: 'section-title', text: uiText('Target') }), inputRow, extraInput]),
      node('div', {}, [node('div', { className: 'section-title', text: uiText('Output') }), output])
    ]);
    const controller = showModal({ title: uiText('Network tools'), description: uiText('Ping, traceroute, DNS, port scan, whois, and Wake-on-LAN.'), body, className: 'wide', actions: [{ label: uiText('Close'), busy: false }] });
    controller.onClose(() => { api.network.cancelAll().catch(() => {}); });
    setTimeout(() => input.focus(), 0);
  }

  function queuePrompt(request) {
    state.promptQueue.push(request);
    processNextPrompt();
  }

  function processNextPrompt() {
    if (state.promptActive || !state.promptQueue.length) return;
    state.promptActive = true;
    const request = state.promptQueue.shift();
    if (request.kind === 'host-key') showHostKeyPrompt(request);
    else if (request.kind === 'keyboard-interactive') showKeyboardPrompt(request);
    else finishPrompt(request, {});
  }

  async function finishPrompt(request, response, controller = null) {
    try { await api.prompts.respond(request.id, response); } catch { /* prompt may have expired */ }
    controller?.close();
    state.promptActive = false;
    processNextPrompt();
  }

  function showHostKeyPrompt(request) {
    const data = request.payload || {};
    const rdp = data.kind === 'rdp';
    const target = `${data.host}:${data.port}`;
    const message = rdp
      ? (data.changed
        ? uiText('The certificate for the RDP server {p0} has changed. This can mean the server was reinstalled or someone is intercepting the connection. Check the fingerprint with the server’s administrator before continuing.', { p0: target })
        : uiText('Aux Command has not connected to the RDP server {p0} before. Check that this fingerprint matches the server’s certificate before trusting it.', { p0: target }))
      : (data.changed
        ? uiText('The host key for {p0} has changed. This can indicate a rebuilt server or a man-in-the-middle attack. Verify the fingerprint through a trusted channel before continuing.', { p0: target })
        : uiText('Aux Command has not seen the host key for {p0}. Verify the fingerprint before trusting this server.', { p0: target }));
    const details = rdp ? [
      data.subject ? [uiText('Issued to'), data.subject] : null,
      data.issuer ? [uiText('Issued by'), data.issuer] : null,
      data.validTo ? [uiText('Valid until'), data.validTo] : null
    ].filter(Boolean) : [];
    const body = node('div', { className: 'prompt-stack' }, [
      node('div', { className: data.changed ? 'warning-box danger-box' : 'warning-box', text: message }),
      node('div', { className: 'fingerprint', text: data.fingerprint || uiText('Fingerprint unavailable') }),
      ...details.map(([label, value]) => node('div', { className: 'previous-fingerprint' }, [node('span', { text: label }), node('code', { text: value })])),
      data.previousFingerprint ? node('div', { className: 'previous-fingerprint' }, [node('span', { text: uiText('Previously trusted') }), node('code', { text: data.previousFingerprint })]) : null
    ]);
    let controller;
    controller = showModal({
      title: data.changed ? (rdp ? uiText('RDP certificate changed') : uiText('Host identity changed')) : (rdp ? uiText('Trust RDP server?') : uiText('Trust SSH host?')),
      description: `${data.profileName || (rdp ? 'RDP' : 'SSH')} · ${target}`,
      body,
      className: 'narrow',
      closeable: false,
      actions: [
        { label: uiText('Reject'), className: data.changed ? 'danger' : '', busy: false, run: () => { finishPrompt(request, { accept: false }, controller); return false; } },
        { label: uiText('Accept once'), busy: false, run: () => { finishPrompt(request, { accept: true, remember: false }, controller); return false; } },
        { label: uiText('Trust and remember'), className: 'primary', busy: false, run: () => { finishPrompt(request, { accept: true, remember: true }, controller); return false; } }
      ]
    });
  }

  function showKeyboardPrompt(request) {
    const data = request.payload || {};
    const form = node('form', { className: 'prompt-stack' });
    if (data.instructions) form.append(node('div', { className: 'warning-box', text: data.instructions }));
    const controls = [];
    for (const [index, prompt] of (data.prompts || []).entries()) {
      const control = textInput(`answer-${index}`, '', {
        type: prompt.echo ? 'text' : 'password',
        autocomplete: 'off'
      });
      controls.push(control);
      form.append(field(prompt.prompt || `Response ${index + 1}`, control));
    }
    let controller;
    const submit = () => {
      finishPrompt(request, { answers: controls.map((control) => control.value) }, controller);
    };
    controller = showModal({
      title: data.name || 'SSH authentication',
      description: `${data.profileName || 'SSH profile'} · ${data.host || ''}`,
      body: form,
      className: 'narrow',
      closeable: false,
      actions: [
        { label: uiText('Cancel'), busy: false, run: () => { finishPrompt(request, { answers: [] }, controller); return false; } },
        { label: uiText('Continue'), className: 'primary', busy: false, run: () => { submit(); return false; } }
      ]
    });
    form.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
  }

  function subscribeEvents() {
    api.terminal.onDetachedInput(({id,data})=>{const tab=state.tabs.get(id);if(!tab?.detached||tab.closed)return;if(state.assist.enabled&&state.assist.dangerGuard&&tab.assist?.mirror.preview(data).committed.some(commit=>commit.tracked&&window.AuxAssist.dangerCheck(commit.line)))api.app.focus();handleTerminalInput(tab,data);});
    api.terminal.onDetached(({id,detached})=>{if(detached&&state.broadcastInput)applyBroadcastState(false);const tab=state.tabs.get(id);if(!tab)return;tab.detached=detached;tab.view.classList.toggle('detached',detached);tab.tabElement.classList.toggle('detached',detached);applyTerminalLayout();});
    api.terminal.onDirectory(({ id, cwd }) => {
      const tab = state.tabs.get(id);
      if (tab && !tab.explicitCwd) { tab.cwd = cwd; persistSessions(); }
    });
    api.terminal.onLogError(({ id, message }) => {
      const tab = state.tabs.get(id); if (tab) tab.logging = null;
      updateSessionActions(); toast(uiText('Terminal logging stopped'), message, 'error');
    });
    api.terminal.onPower(({ event }) => {
      if (event === 'resume') {
        toast(uiText('Computer resumed'), uiText('Check your connections; use Reconnect for sessions that disconnected.'));
        probeConnectionHealth(); fitVisibleTerminals();
      } else applyBroadcastState(false);
    });
    api.terminal.onData(({ id, data }) => {
      const tab = state.tabs.get(id);
      if (tab) {
        writeTerminalData(tab, data);
        handleAssistOutput(tab, data);
        multiRunCaptureTap(id, data);
      } else {
        const previous = state.pendingTerminalData.get(id) || '';
        state.pendingTerminalData.set(id, `${previous}${data}`.slice(-1_048_576));
      }
    });
    api.terminal.onExit(({ id, exitCode, signal, diagnosis }) => {
      const tab = state.tabs.get(id);
      if (!tab) return;
      tab.closed = true;
      if (state.broadcastInput) {
        const liveCount = [...state.tabs.values()].filter((candidate) => candidate.terminal && !candidate.closed).length;
        applyBroadcastState(liveCount >= 2);
      }
      updateSessionActions();
      renderProfiles();
      tab.tabElement.classList.add('closed');
      const reconnect = node('button', { type: 'button', className: 'mini-button', text: uiText('Reconnect') });
      reconnect.addEventListener('click', async () => {
        reconnect.disabled = true;
        try { const next = await connectProfile(tab.profile, tab); if (next) await closeTab(tab.id); }
        finally { reconnect.disabled = false; }
      });
      tab.view.append(node('div', { className: 'session-exit-banner', attrs: { role: 'status' } }, [node('span', { text: diagnosis?.title || `Session ended (${signal || exitCode})` }), reconnect]));
      persistSessions();
      tab.terminal.write(`\r\n\x1b[90m[Process exited${signal ? ` with signal ${signal}` : ` with code ${exitCode}`} — press Ctrl+W to close]\x1b[0m\r\n`);
      if (diagnosis) {
        tab.terminal.write(`\r\n${diagnosis.title}: ${diagnosis.guidance}\r\n`);
        toast(diagnosis.title, diagnosis.guidance, 'error');
      } else if (state.activeTabId === id) setStatus(uiText("Session exited with {p0}", { p0: signal || exitCode }), exitCode || signal ? 'error' : 'ready');
    });
    api.tunnels.onStatus((tunnel) => {
      state.tunnels.set(tunnel.id, tunnel);
      document.querySelectorAll('[data-live-tunnel-list]').forEach((container) => renderTunnelList(container));
      renderTunnelStatusCluster();
      if (tunnel.status === 'running') toast(uiText('Tunnel ready'), tunnel.name, 'success');
      if (tunnel.status === 'failed') toast(uiText('Tunnel failed'), tunnel.lastError || tunnel.name, 'error');
    });
    api.sync.onStatus((status) => {
      // Background timer syncs mutate the profile store in the main process;
      // the sidebar must follow without requiring a manual refresh.
      if (!status?.configured) return;
      if (status.lastError) {
        toast(uiText('Profile sync failed'), status.lastError, 'error');
        return;
      }
      api.profiles.list().then((profiles) => {
        updateProfiles(profiles);
        renderProfiles();
      }).catch(() => { /* next successful sync will refresh the sidebar */ });
    });
    api.sftp.onProgress(({ profileId, direction, path, transferred, total }) => {
      if (state.sftp.profile?.id !== profileId) return;
      const percentage = total ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
      elements.transferStatus.textContent = `${direction === 'upload' ? 'Uploading' : 'Downloading'} ${path} · ${percentage}% (${formatBytes(transferred)} / ${formatBytes(total)})`;
    });
    api.sftp.onError(({ profileId, message }) => {
      if (state.sftp.profile?.id === profileId) toast(uiText('SFTP connection error'), message, 'error');
    });
    api.transfer.onUpdate((entry) => {
      const idx = state.transferQueue.entries.findIndex((e) => e.id === entry.id);
      if (entry.status === 'cancelled') {
        if (idx >= 0) state.transferQueue.entries.splice(idx, 1);
        scheduleTransferQueueRender();
        return;
      }
      if (idx >= 0) state.transferQueue.entries[idx] = entry;
      else state.transferQueue.entries.push(entry);
      if (entry.status === 'completed' && !state.transferQueue.expanded) {
        toast(uiText('Transfer complete'), entry.fileName, 'success');
      }
      if (entry.status === 'completed' && entry.direction === 'upload' && state.sftp.open && state.sftp.profile?.id === entry.profileId) {
        clearTimeout(state.transferQueue.refreshTimer);
        state.transferQueue.refreshTimer = setTimeout(() => { if (state.sftp.open && state.sftp.profile?.id === entry.profileId) loadSftp(state.sftp.path).catch(() => {}); }, 300);
      }
      if (entry.status === 'completed' && state.fileManager?.profileId === entry.profileId) {
        clearTimeout(state.transferQueue.managerTimer);
        state.transferQueue.managerTimer = setTimeout(() => {
          for (const pane of Object.values(state.fileManager?.panes || {})) { pane.selected.clear(); pane.load?.(pane.path).catch?.(() => {}); }
        }, 400);
      }
      if (entry.status === 'failed' && !state.transferQueue.expanded) {
        toast(uiText('Transfer failed'), `${entry.fileName}: ${entry.error}`, 'error');
      }
      scheduleTransferQueueRender();
    });
    api.transfer.onList((entries) => {
      state.transferQueue.entries = Array.isArray(entries) ? entries : [];
      scheduleTransferQueueRender();
    });
    api.updates.onStatus((status) => updateUpdateState(status));
    api.prompts.onRequest(queuePrompt);
  }

  function bindUi() {
    $('#collapse-sidebar').addEventListener('click', () => elements.sidebarToggle.click());
    elements.maximizeTerminal.addEventListener('click', () => setTerminalMaximized(!state.focusMode));
    $('#fullscreen-button').addEventListener('click', toggleFullscreen);
    $('#session-fullscreen').addEventListener('click', toggleFullscreen);
    api.app.onFullscreen(updateFullscreen);
    // Capture before xterm consumes F11; Escape remains available to terminal applications.
    window.addEventListener('keydown', (event) => {
      if (event.key === 'F11' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) toggleFullscreen();
      }
    }, true);
    bindPanelResizer('#sidebar-resizer', 'sidebarWidth', 240, 500, 1);
    bindPanelResizer('#files-resizer', 'filesWidth', 320, 700, -1);
    elements.sidebarToggle.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        const open = elements.appShell.classList.toggle('sidebar-open');
        elements.sidebarToggle.setAttribute('aria-expanded', String(open));
      } else {
        saveAppearance({ sidebarHidden: !state.ui.sidebarHidden }).catch((error) => toast(uiText('Settings failed'), errorMessage(error), 'error'));
      }
    });
    elements.retryInitialization.addEventListener('click', () => window.location.reload());
    elements.errorDiagnostics.addEventListener('click', openDiagnosticsModal);
    elements.brandButton.addEventListener('click', () => activateTab(''));
    elements.quickButton.addEventListener('click', quickConnect);
    elements.quickInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') quickConnect(); });
    elements.localButton.addEventListener('click', () => connectProfile(localProfile()));
    elements.snippetsButton.addEventListener('click', openSnippetsModal);
    elements.tunnelsButton.addEventListener('click', openTunnelsModal);
    elements.tunnelStatusCluster.addEventListener('click', openTunnelsModal);
    elements.welcomeTour.addEventListener('click', startTour);
    elements.tourNext.addEventListener('click', tourNext);
    elements.tourPrev.addEventListener('click', tourPrev);
    elements.tourSkip.addEventListener('click', () => endTour(true));
    elements.tourBackdrop.addEventListener('click', () => endTour(true));
    elements.updatesButton.addEventListener('click', openUpdatesModal);
    elements.diagnosticsButton.addEventListener('click', openDiagnosticsModal);
    elements.assistButton.addEventListener('click', openAssistModal);
    elements.sshKeysButton.addEventListener('click', () => openSshKeyManager().catch((error) => toast(uiText('Could not open SSH Key Manager'), errorMessage(error), 'error')));
    elements.networkToolsButton = document.getElementById('network-tools-button');
    if (elements.networkToolsButton) elements.networkToolsButton.addEventListener('click', openNetworkTools);
    elements.monitorButton.addEventListener('click', openLiveMonitor);
    elements.gatewayButton.addEventListener('click', () => openRemoteDesktopGateway().catch((error) => toast(uiText('Could not open desktop gateway'), errorMessage(error), 'error')));
    elements.syncButton.addEventListener('click', () => openProfileSync().catch((error) => toast(uiText('Could not open profile sync'), errorMessage(error), 'error')));
    elements.websiteButton.addEventListener('click', () => api.system.openWebsite().catch((error) => toast(uiText('Could not open website'), errorMessage(error), 'error')));
    elements.newProfileButton.addEventListener('click', () => openProfileModal());
    elements.newGroupButton.addEventListener('click', () => createGroup().catch((error) => toast(uiText('Could not create group'), errorMessage(error), 'error')));
    elements.paletteButton.addEventListener('click', () => openCommandPalette());
    elements.statusbarWebsite.addEventListener('click', () => api.system.openWebsite().catch((error) => toast(uiText('Could not open website'), errorMessage(error), 'error')));
    $('#workspaces-button').addEventListener('click', () => openWorkspaces().catch((error) => toast(uiText('Workspace error'), errorMessage(error), 'error')));
    const flow=selectInput('paneFlow',[['auto',uiText('Auto tiles')],['columns',uiText('Side by side')],['rows',uiText('Stacked panes')]],'auto');flow.id='pane-flow';for(const option of flow.options)option.dataset.uiMessage=option.value==='auto'?'Auto tiles':option.value==='columns'?'Side by side':'Stacked panes';flow.setAttribute('aria-label',uiText('Terminal split arrangement'));elements.layoutToggle.insertAdjacentElement('afterend',flow);flow.onchange=()=>{state.paneFlow=flow.value;state.layout='grid';applyTerminalLayout();persistWorkspaceSettings();};
    const manageConnections = node('button', { type:'button', id:'manage-connections', className:'mini-button', text:uiText('Manage connections'), title:uiText('Bulk edit, organize and find duplicate connections'), attrs:{ 'data-ui-message':'Manage connections', 'data-ui-title':'Bulk edit, organize and find duplicate connections' } });
    document.querySelector('.sidebar-tools').append(manageConnections);
    manageConnections.addEventListener('click', openConnectionManager);
    $('#preferences-button').addEventListener('click', openPreferences);
    for (const mode of ['all', 'favorites', 'active']) {
      $(`#profiles-${mode}`).addEventListener('click', () => { state.profileView = mode; renderProfiles(); });
    }
    elements.profileSearch.addEventListener('input', renderProfiles);
    elements.profileSearch.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); elements.profileList.querySelector('.profile-connect')?.focus(); }
      if (event.key === 'Escape') { elements.profileSearch.value = ''; renderProfiles(); }
    });
    $('#file-manager-button').addEventListener('click', () => openFileManager().catch((error) => toast(uiText('File manager failed'), errorMessage(error), 'error')));
    $('#file-select-all').addEventListener('click', () => {
      state.sftp.selection = new Set(window.AuxWorkspace.visibleFiles(state.sftp.entries, state.sftp.filter).filter((entry) => !entry.directory).map((entry) => entry.path));
      state.sftp.selectedPath = [...state.sftp.selection][0] || ''; updateFileSelection();
    });
    $('#file-search').addEventListener('input', (event) => { state.sftp.filter.query = event.target.value; renderSftpEntries(); });
    $('#file-sort').addEventListener('change', (event) => { state.sftp.filter.sort = event.target.value; renderSftpEntries(); });
    $('#file-hidden').addEventListener('click', (event) => {
      state.sftp.filter.hidden = !state.sftp.filter.hidden;
      event.currentTarget.setAttribute('aria-pressed', String(state.sftp.filter.hidden));
      renderSftpEntries();
    });
    elements.importSshButton.addEventListener('click', () => importSshConfig().catch(() => {}));
    elements.profileMenuButton.addEventListener('click', openProfileDataMenu);
    elements.welcomeLocal.addEventListener('click', () => connectProfile(localProfile()));
    elements.welcomeProfile.addEventListener('click', () => openProfileModal());
    elements.welcomeImport.addEventListener('click', () => importSshConfig().catch(() => {}));
    elements.layoutToggle.addEventListener('click', toggleTerminalLayout);
    elements.broadcastToggle.addEventListener('click', toggleBroadcastInput);
    elements.terminalSearchToggle.addEventListener('click', openTerminalSearch);
    elements.highlightToggle.addEventListener('click', () => openHighlightManager());
    elements.exportTranscriptButton.addEventListener('click', () => exportActiveTranscript().catch((error) => toast(uiText('Transcript export failed'), errorMessage(error), 'error')));
    elements.terminalLogButton.addEventListener('click', () => toggleTerminalLogging().catch((error) => toast(uiText('Terminal logging failed'), errorMessage(error), 'error')));
    elements.macroRecordButton.addEventListener('click', () => toggleMacroRecording().catch((error) => toast(uiText('Macro recording failed'), errorMessage(error), 'error')));
    elements.duplicateSessionButton.addEventListener('click', () => duplicateActiveSession().catch((error) => toast(uiText('Duplicate failed'), errorMessage(error), 'error')));
    elements.reconnectSessionButton.addEventListener('click', () => reconnectActiveSession().catch((error) => toast(uiText('Reconnect failed'), errorMessage(error), 'error')));
    elements.paneShrinkButton.addEventListener('click', () => adjustPaneSize(-40));
    elements.paneGrowButton.addEventListener('click', () => adjustPaneSize(40));
    elements.sftpToggle.addEventListener('click', () => toggleSftp());
    elements.sftpClose.addEventListener('click', () => toggleSftp(false));
    elements.sftpUp.addEventListener('click', () => loadSftp(parentRemote(state.sftp.path)));
    elements.sftpRefresh.addEventListener('click', () => loadSftp(elements.sftpPath.value));
    elements.sftpPath.addEventListener('keydown', (event) => { if (event.key === 'Enter') loadSftp(elements.sftpPath.value); });
    elements.sftpUpload.addEventListener('click', uploadFile);
    elements.sftpDownload.addEventListener('click', downloadSelected);
    elements.sftpEdit.addEventListener('click', openRemoteTextEditor);
    elements.sftpMkdir.addEventListener('click', makeRemoteDirectory);
    elements.sftpMore.addEventListener('click', openSftpMore);
    bindSftpDragAndDrop();

    const queueToggle = document.getElementById('queue-toggle');
    if (queueToggle) {
      queueToggle.addEventListener('click', () => {
        const expanded = queueToggle.getAttribute('aria-expanded') === 'true';
        queueToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        state.transferQueue.expanded = !expanded;
        const queue = document.getElementById('transfer-queue');
        if (queue) queue.hidden = expanded;
        if (state.transferQueue.expanded) renderTransferQueue();
      });
    }

    window.addEventListener('resize', () => {
      elements.sidebarToggle.setAttribute('aria-expanded', String(window.innerWidth <= 1024 ? elements.appShell.classList.contains('sidebar-open') : !state.ui.sidebarHidden));
      fitVisibleTerminals();
    });

    // Bundled fonts can finish loading after a terminal has measured its cell
    // size; refit so glyph metrics match the final typeface.
    document.fonts?.ready?.then(() => fitVisibleTerminals()).catch(() => {});

    window.addEventListener('keydown', (event) => {
      if (tourState) {
        if (event.key === 'Escape') { event.preventDefault(); endTour(true); }
        else if (event.key === 'ArrowRight' || event.key === 'Enter') { event.preventDefault(); tourNext(); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); tourPrev(); }
        return;
      }
      const modalOpen = Boolean(elements.modalRoot.querySelector('.modal-backdrop'));
      if (modalOpen && event.key !== 'Escape') return;
      if (!isEditableShortcutTarget(event.target)) handleWorkspaceShortcut(event);
      if (event.key === 'Escape') {
        const backdrops = elements.modalRoot.querySelectorAll('.modal-backdrop');
        const top = backdrops[backdrops.length - 1];
        const closeButton = top?.querySelector('.modal-close:not([hidden])');
        closeButton?.click();
      }
    });
  }

  function handleWorkspaceShortcut(event) {
    if (event.auxShortcutHandled) return true;
    let handled = false;
    const run = (action) => {
      event.preventDefault();
      handled = true;
      action();
    };
    const modifier = event.ctrlKey || event.metaKey;
    const shortcut = (id) => window.AuxPreferences.matches(event, state.ui.shortcuts?.[id] || window.AuxPreferences.DEFAULT_SHORTCUTS[id]);
    if (shortcut('workspaces')) run(() => openWorkspaces().catch((error) => toast(uiText('Workspace error'), errorMessage(error), 'error')));
    if (modifier && event.key === 'Tab') {
      run(() => {
        const tabs = [...state.tabs.values()];
        if (!tabs.length) return;
        const index = tabs.findIndex((tab) => tab.id === state.activeTabId);
        activateTab(tabs[(index + (event.shiftKey ? -1 : 1) + tabs.length) % tabs.length].id);
      });
    }
    if (shortcut('connections')) run(() => {
      if (window.innerWidth <= 1024) elements.appShell.classList.add('sidebar-open');
      else { state.ui.sidebarHidden = false; applyAppearance(); }
      elements.sidebarToggle.setAttribute('aria-expanded', 'true');
      elements.profileSearch.focus();
    });
    if (modifier && !event.shiftKey && event.key.toLowerCase() === 'k') {
      run(() => {
        elements.quickInput.focus();
        elements.quickInput.select();
      });
    }
    if (modifier && !event.shiftKey && event.code === 'KeyF') run(() => openTerminalSearch());
    if (shortcut('local')) run(() => connectProfile(localProfile()));
    if (shortcut('palette')) run(() => openCommandPalette());
    if (shortcut('duplicate')) {
      run(() => duplicateActiveSession().catch((error) => toast(uiText('Duplicate failed'), errorMessage(error), 'error')));
    }
    if (shortcut('reconnect')) {
      run(() => reconnectActiveSession().catch((error) => toast(uiText('Reconnect failed'), errorMessage(error), 'error')));
    }
    if (modifier && !event.altKey && ['PageUp', 'PageDown'].includes(event.code) && state.tabs.size) {
      const direction = event.code === 'PageUp' ? -1 : 1;
      run(() => {
        const current = activeTab();
        if (event.shiftKey) { if (current) moveSessionTab(current, direction, false); return; }
        const tabs = [...state.tabs.values()];
        const index = tabs.indexOf(current);
        activateTab(tabs[(index + direction + tabs.length) % tabs.length].id);
      });
    }
    if (modifier && !event.shiftKey && !event.altKey && activeTab()?.terminal) {
      if (['Equal', 'NumpadAdd'].includes(event.code)) run(() => zoomTerminal(activeTab(), 1));
      if (['Minus', 'NumpadSubtract'].includes(event.code)) run(() => zoomTerminal(activeTab(), -1));
      if (['Digit0', 'Numpad0'].includes(event.code)) run(() => zoomTerminal(activeTab(), 0));
    }
    if (modifier && event.shiftKey && event.code === 'Minus') run(() => adjustPaneSize(-40));
    if (modifier && event.shiftKey && event.code === 'Equal') run(() => adjustPaneSize(40));
    if (shortcut('files')) run(() => toggleSftp());
    if (shortcut('layout')) run(() => toggleTerminalLayout());
    if (shortcut('broadcast')) run(() => toggleBroadcastInput());
    if (shortcut('snippets')) run(() => openSnippetsModal());
    if (shortcut('highlight')) run(() => toggleHighlighting());
    if (shortcut('history')) run(() => openHistorySearch());
    if (shortcut('multiRun')) run(() => openMultiRunModal());
    if (shortcut('ai')) run(() => openAiAssistModal());
    if (modifier && !event.shiftKey && event.key.toLowerCase() === 'w' && state.activeTabId) {
      run(() => requestCloseTab(state.activeTabId));
    }
    if (handled) event.auxShortcutHandled = true;
    return handled;
  }

  async function initialize() {
    subscribeEvents();
    bindUi();
    enableTabBarDrop();
    applyPaneSize();
    elements.appShell.setAttribute('aria-busy', 'true');
    elements.initializationError.hidden = true;
    setStatus(uiText('Loading workspace…'), 'busy');
    try {
      const initial = await api.app.getState();
      updateFullscreen(initial.fullscreen);
      initializeLanguage(initial.settings);
      applyPersistedWorkspaceSettings(initial.settings);
      api.system.osInfo().then((info) => {
        state.assist.localOsInfo = window.AuxAssist.osInfoFromRelease(info.platform, info.releaseText);
        // Local tabs opened before this resolved still deserve their badge.
        for (const tab of state.tabs.values()) {
          if (tab.assist && tab.profile?.protocol === 'local' && !tab.assist.osInfo) {
            tab.assist.osInfo = state.assist.localOsInfo;
            tab.assist.detector.osInfo = state.assist.localOsInfo;
            tab.assist.detector.locked = true;
            updateOsBadge(tab);
          }
        }
      }).catch(() => { /* assist works without local OS info */ });
      state.snippets = initial.snippets || [];
      state.diagnostics = initial.diagnostics || null;
      updateUpdateState(initial.updates || {});
      state.vault = initial.vault || null;
      for (const tunnel of initial.tunnels || []) state.tunnels.set(tunnel.id, tunnel);
      renderTunnelStatusCluster();
      updateProfiles(initial.profiles || []);
      state.initialProfiles = initial.profiles || [];
      // Probe reachability only after the profile list is populated.
      startHealthMonitoring();
      startHostStats();
      state.savedSessions = initial.settings?.sessions || [];
      state.namedWorkspaces = initial.settings?.namedWorkspaces || [];
      restoreInitialSessions(initial.sessions || []);
      api.transfer.list().then((entries) => {
        state.transferQueue.entries = Array.isArray(entries) ? entries : [];
        renderTransferQueue();
      }).catch(() => { /* queue hydration is best-effort */ });

      // Restore persisted sessions only after reattaching still-live backend sessions.
      await restoreSavedSessions();
      elements.appVersion.textContent = uiText("Aux Command {p0}", { p0: initial.version });
      state.agentAvailable = Boolean(initial.diagnostics?.sshAgent);
      renderAgentStatus();
      elements.sftpEmpty.classList.add('visible');
      elements.appShell.setAttribute('aria-busy', 'false');
      state.initializing = false;
      persistSessions();
      elements.initializationError.hidden = true;
      setStatus(window.AuxI18n.t('status.ready'));
      maybeStartFirstRunTour(initial.settings);
    } catch (error) {
      state.initializing = false;
      const detail = errorMessage(error);
      elements.appShell.setAttribute('aria-busy', 'false');
      elements.welcome.classList.add('hidden');
      elements.initializationErrorDetail.textContent = detail;
      elements.initializationError.hidden = false;
      setStatus(detail, 'error');
    }
  }

  initialize();
})();
