'use strict';

(() => {
  const api = window.auxCommand;
  if (!api) {
    document.body.textContent = 'Aux Command preload API is unavailable.';
    return;
  }

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
    profileList: $('#profile-list'),
    connectionCount: $('#connection-count'),
    agentStatus: $('#agent-status'),
    tabbar: $('#session-tabs'),
    tabbarSpacer: $('.tabbar-spacer'),
    layoutToggle: $('#layout-toggle'),
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
      selectedPath: '',
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

  function setStatus(message, kind = 'ready') {
    elements.globalStatus.textContent = message;
    elements.globalStatusDot.className = 'status-dot';
    if (kind === 'busy') elements.globalStatusDot.classList.add('busy');
    if (kind === 'error') elements.globalStatusDot.classList.add('error');
  }

  function updateUpdateState(status = {}) {
    state.updates = { ...(state.updates || {}), ...(status || {}) };
    if (status.error) toast('Update check failed', status.error, 'error');
    else if (status.downloaded) toast('Update ready', `Aux Command ${status.latestVersion || ''} is ready to install.`, 'success');
    else if (status.updateAvailable) toast('Update available', `Aux Command ${status.latestVersion || ''} is available.`, 'success');
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
    const checkUpdateButton = node('button', { type: 'button', className: 'mini-button', text: updateStatus.checking ? 'Checking…' : 'Check for updates' });
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
      const downloadButton = node('button', { type: 'button', className: 'mini-button primary', text: 'Download update' });
      downloadButton.addEventListener('click', async () => {
        try { updateUpdateState(await api.updates.download()); }
        catch (error) { updateUpdateState({ error: errorMessage(error), checking: false }); }
        afterAction();
      });
      updateActions.push(downloadButton);
    }
    if (updateStatus.downloaded) {
      const installButton = node('button', { type: 'button', className: 'mini-button primary', text: 'Restart and install' });
      installButton.addEventListener('click', () => api.updates.quitAndInstall().catch((error) => updateUpdateState({ error: errorMessage(error) })));
      updateActions.push(installButton);
    }
    return updateActions;
  }

  function updateReleaseSection(updateStatus = state.updates || {}, afterAction = () => {}) {
    return node('div', {}, [
      node('div', { className: 'section-title', text: 'GitHub release updates' }),
      node('div', { className: `diagnostic-row${updateStatus.error ? '' : ' available'}` }, [
        node('span', { className: 'indicator' }),
        node('div', {}, [node('strong', { text: 'Update channel' }), node('small', { text: describeUpdateState(updateStatus) })]),
        node('span', { className: 'diagnostic-state', text: updateStatus.supported ? (updateStatus.authenticated ? 'Signed' : 'GitHub') : 'Source' })
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
      node('div', { className: 'warning-box', text: 'Updates install only after the published manifest and updater metadata pass OpenPGP verification with the bundled Aux Command signing key.' })
    ]);
    controller = showModal({
      title: 'Aux Command updates',
      description: 'Check the configured GitHub release channel and install downloaded updates.',
      body,
      className: 'narrow',
      actions: [{ label: 'Close', busy: false }]
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
      toast('Operation failed', detail, 'error');
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
    if (profile.protocol === 'local') return 'Local machine';
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

  function joinRemote(base, name) {
    return normalizeRemotePath(`${normalizeRemotePath(base)}/${String(name || '').replaceAll('/', '')}`);
  }

  function parentRemote(remotePath) {
    const path = normalizeRemotePath(remotePath);
    if (path === '/') return '/';
    return normalizeRemotePath(path.split('/').slice(0, -1).join('/'));
  }

  function terminalOptionsForProfile(profile) {
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
      rightClickSelectsWord: true,
      scrollback,
      smoothScrollDuration: 80,
      theme: terminalThemes[themeName]
    };
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
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
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
    const closeButton = node('button', { type: 'button', className: 'modal-close', text: '×', title: 'Close', attrs: { 'aria-label': 'Close dialog' } });
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
          toast('Operation failed', errorMessage(error), 'error');
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
          { label: 'Cancel', busy: false, run: () => { settle(null, controller); return false; } },
          {
            label: danger ? 'Confirm' : 'Continue',
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
          { label: 'Cancel', busy: false, run: () => { finish(false, controller); return false; } },
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
    renderProfiles();
  }

  // Connection health: a best-effort TCP reachability probe per network profile,
  // surfaced as a colored dot in the sidebar. Local and serial profiles have no
  // network endpoint and are skipped.
  function healthTargets() {
    return state.profiles
      .filter((profile) => !['local', 'serial'].includes(profile.protocol) && profile.host && profile.port)
      .map((profile) => ({ id: profile.id, host: profile.host, port: profile.port }));
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
          status: result.reachable ? 'up' : 'down',
          latencyMs: result.latencyMs,
          error: result.error,
          checkedAt: result.checkedAt
        });
      }
    } catch (error) {
      setStatus(`Reachability check failed: ${errorMessage(error)}`, 'error');
      for (const target of targets) state.health.delete(target.id);
    } finally {
      state.healthChecking = false;
      updateHealthDots();
    }
  }

  function healthTitle(profile) {
    const record = state.health.get(profile.id);
    if (!record || record.status === 'unknown') return `${profile.name} · reachability unknown`;
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
    { selector: '.workspace-commandbar', title: 'Quick connect', body: 'Type ssh://user@host, user@host, or a /dev/ttyUSB0 serial path and press Connect. Press Ctrl+K from anywhere to jump here.', placement: 'bottom' },
    { selector: '#new-group-button', title: 'Organize with groups', body: 'Create groups to file your connections. Each connection has a ⋯ menu (or right-click) to edit, duplicate, move, or delete it.', placement: 'bottom' },
    { selector: '#palette-button', title: 'Command palette', body: 'Press Ctrl+Shift+P to search every action, connection and snippet from the keyboard — the fastest way to drive Aux Command.', placement: 'bottom' },
    { selector: '#highlight-toggle', title: 'Log highlighting', body: 'Colour keywords in terminal output for fast log triage. Open it to add rules; toggle it any time with Ctrl+Shift+H.', placement: 'bottom' },
    { selector: '#tunnel-status-cluster', title: 'Live status', body: 'Active SSH tunnels show here in the status bar, and each saved connection carries a reachability dot in the sidebar. You are ready to go.', placement: 'top', optional: true }
  ];
  let tourState = null;

  function positionTourStep() {
    if (!tourState) return;
    const step = TOUR_STEPS[tourState.index];
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
    while (TOUR_STEPS[tourState.index]?.optional && !document.querySelector(TOUR_STEPS[tourState.index].selector)) {
      if (tourState.direction < 0 && tourState.index > 0) tourState.index -= 1;
      else if (tourState.index < TOUR_STEPS.length - 1) tourState.index += 1;
      else break;
    }
    const step = TOUR_STEPS[tourState.index];
    elements.tourStepCount.textContent = `Step ${tourState.index + 1} of ${TOUR_STEPS.length}`;
    elements.tourTitle.textContent = step.title;
    elements.tourBody.textContent = step.body;
    elements.tourPrev.disabled = tourState.index === 0;
    elements.tourNext.textContent = tourState.index === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';
    positionTourStep();
  }

  function endTour(completed) {
    if (!tourState) return;
    tourState = null;
    elements.tourRoot.hidden = true;
    window.removeEventListener('resize', positionTourStep);
    if (completed) {
      api.app.saveOnboardingSettings({ tourCompleted: true }).catch(() => {});
      toast('Tour complete', 'Reopen it any time from the command palette.', 'success');
    }
  }

  function startTour() {
    tourState = { index: 0, direction: 1 };
    elements.tourRoot.hidden = false;
    window.addEventListener('resize', positionTourStep);
    renderTourStep();
  }

  function tourNext() {
    if (!tourState) return;
    if (tourState.index >= TOUR_STEPS.length - 1) { endTour(true); return; }
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

  function openContextMenu(anchor, items, { title = '' } = {}) {
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
        Promise.resolve(item.run()).catch((error) => toast('Action failed', errorMessage(error), 'error'));
      });
      menu.append(button);
    }
    document.body.append(menu);
    const anchorRect = anchor.getBoundingClientRect();
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
      title: 'Delete connection?',
      description: `Delete “${profile.name}” from Aux Command? Stored credentials for this profile will also be removed.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!confirmed) return false;
    await api.sftp.disconnect(profile.id, profile.protocol).catch(() => {});
    await api.profiles.delete(profile.id);
    if (profile.credentialId) {
      await api.vault.delete(profile.credentialId).catch((error) => {
        toast('Credential cleanup required', errorMessage(error), 'error');
      });
    }
    updateProfiles(await api.profiles.list());
    toast('Connection deleted', profile.name, 'success');
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
    toast('Connection duplicated', saved.name, 'success');
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
      .catch((error) => setStatus(`Sidebar settings not saved: ${errorMessage(error)}`, 'error'));
  }

  async function moveProfileToGroup(profile) {
    const groups = knownGroupNames().filter((name) => name !== 'Local');
    return new Promise((resolve) => {
      const select = selectInput('group', groups.map((name) => [name, name]), profile.group || 'Connections');
      const newName = textInput('newGroup', '', { placeholder: 'Or type a new group name' });
      const body = node('div', { className: 'form-grid' }, [
        field('Existing group', select, '', 'full'),
        field('New group', newName, 'Leave blank to use the selected group above.', 'full')
      ]);
      showModal({
        title: `Move “${profile.name}”`,
        description: 'Choose the sidebar group this connection is filed under.',
        body,
        className: 'narrow',
        actions: [
          { label: 'Cancel', busy: false, run: () => { resolve(false); return true; } },
          {
            label: 'Move',
            className: 'primary',
            run: async () => {
              const target = newName.value.trim() || select.value || 'Connections';
              await api.profiles.save({ ...profile, group: target });
              if (newName.value.trim() && !state.customGroups.includes(target)) {
                state.customGroups.push(target);
                persistSidebarSettings();
              }
              updateProfiles(await api.profiles.list());
              toast('Connection moved', `${profile.name} → ${target}`, 'success');
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
      { icon: '⏵', label: 'Connect', run: () => connectProfile(profile) },
      { icon: '✎', label: 'Edit…', run: () => openProfileModal(profile) },
      { icon: '⧉', label: 'Duplicate', run: () => duplicateProfile(profile) },
      { icon: profile.favorite ? '☆' : '★', label: profile.favorite ? 'Remove from favorites' : 'Add to favorites', run: () => toggleProfileFavorite(profile) }
    ];
    if (profile.id !== 'local-shell') {
      items.push({ icon: '⇢', label: 'Move to group…', run: () => moveProfileToGroup(profile) });
      items.push('separator');
      items.push({ icon: '🗑', label: 'Delete…', danger: true, run: () => deleteProfileWithConfirm(profile) });
    } else {
      items.push('separator');
      items.push({
        icon: '🗑',
        label: 'Delete…',
        hint: 'Built-in',
        disabled: true,
        title: 'The default local shell profile cannot be deleted.',
        run: () => {}
      });
    }
    openContextMenu(anchor, items, { title: profile.name });
  }

  async function createGroup() {
    const name = await askText({
      title: 'New group',
      description: 'Groups organize the connections sidebar. Assign connections to a group from their context menu or editor.',
      label: 'Group name',
      placeholder: 'Production'
    });
    const trimmed = String(name || '').trim().slice(0, 60);
    if (!trimmed) return;
    if (knownGroupNames().some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      toast('Group already exists', trimmed, 'error');
      return;
    }
    state.customGroups.push(trimmed);
    persistSidebarSettings();
    renderProfiles();
    toast('Group created', trimmed, 'success');
  }

  async function renameGroup(groupName) {
    const name = await askText({
      title: `Rename “${groupName}”`,
      label: 'Group name',
      value: groupName
    });
    const trimmed = String(name || '').trim().slice(0, 60);
    if (!trimmed || trimmed === groupName) return;
    const members = state.profiles.filter((profile) => (profile.group || 'Connections') === groupName);
    for (const member of members) {
      await api.profiles.save({ ...member, group: trimmed });
    }
    state.customGroups = state.customGroups.filter((existing) => existing !== groupName);
    if (!state.customGroups.includes(trimmed)) state.customGroups.push(trimmed);
    persistSidebarSettings();
    updateProfiles(await api.profiles.list());
    toast('Group renamed', `${groupName} → ${trimmed}`, 'success');
  }

  async function deleteGroup(groupName) {
    const members = state.profiles.filter((profile) => (profile.group || 'Connections') === groupName);
    const confirmed = await confirmAction({
      title: `Delete group “${groupName}”?`,
      description: members.length
        ? `${members.length} connection${members.length === 1 ? '' : 's'} will move to the “Connections” group. No connections are deleted.`
        : 'The empty group is removed from the sidebar.',
      confirmLabel: 'Delete group',
      danger: true
    });
    if (!confirmed) return;
    for (const member of members) {
      await api.profiles.save({ ...member, group: 'Connections' });
    }
    state.customGroups = state.customGroups.filter((existing) => existing !== groupName);
    state.collapsedGroups.delete(groupName);
    persistSidebarSettings();
    updateProfiles(await api.profiles.list());
    toast('Group deleted', groupName, 'success');
  }

  function openGroupContextMenu(groupName, anchor) {
    const items = [
      { icon: '＋', label: 'New connection here…', run: () => openProfileModal(null, { group: groupName }) }
    ];
    if (groupName !== 'Local') {
      items.push({ icon: '✎', label: 'Rename group…', run: () => renameGroup(groupName) });
      items.push('separator');
      items.push({ icon: '🗑', label: 'Delete group…', danger: true, run: () => deleteGroup(groupName) });
    }
    openContextMenu(anchor, items, { title: groupName });
  }

  function renderProfiles() {
    elements.profileList.replaceChildren();
    const query = elements.profileSearch.value.trim().toLowerCase();
    const filtered = state.profiles.filter((profile) => {
      if (!query) return true;
      return [profile.name, profile.host, profile.username, profile.group, profile.protocol, ...(profile.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    if (!filtered.length) {
      const empty = node('div', { className: 'list-empty' }, [
        node('strong', { text: query ? 'No matching connections' : 'No saved connections' }),
        node('span', { text: query ? `Nothing matches “${elements.profileSearch.value.trim()}”.` : 'Create or import a connection to get started.' })
      ]);
      if (query) {
        const clear = node('button', { type: 'button', className: 'mini-button', text: 'Clear filter' });
        clear.addEventListener('click', () => {
          elements.profileSearch.value = '';
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
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(profile);
    }
    // Custom groups stay visible even while empty (outside of searches), so a
    // freshly created group has somewhere to receive connections.
    if (!query) {
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
      const collapsed = state.collapsedGroups.has(group) && !query;
      const section = node('section', { className: `profile-group${collapsed ? ' collapsed' : ''}` });
      const caret = node('span', { className: 'group-caret', text: collapsed ? '▸' : '▾', attrs: { 'aria-hidden': 'true' } });
      const collapseButton = node('button', {
        type: 'button',
        className: 'group-collapse',
        attrs: { 'aria-expanded': String(!collapsed), 'aria-label': `${collapsed ? 'Expand' : 'Collapse'} group ${group}` }
      }, [caret, node('span', { className: 'group-name', text: group }), node('span', { className: 'group-count', text: String(profiles.length) })]);
      collapseButton.addEventListener('click', () => {
        if (state.collapsedGroups.has(group)) state.collapsedGroups.delete(group);
        else state.collapsedGroups.add(group);
        renderProfiles();
      });
      const groupMenuButton = node('button', {
        type: 'button',
        className: 'group-menu',
        text: '⋯',
        title: `Group actions for ${group}`,
        attrs: { 'aria-label': `Group actions for ${group}`, 'aria-haspopup': 'menu' }
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
        section.append(node('div', { className: 'group-empty', text: 'No connections yet' }));
        elements.profileList.append(section);
        continue;
      }
      profiles.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
      for (const profile of profiles) {
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
          attrs: { 'aria-label': `Connect to ${profile.name}, ${formatTarget(profile)}` }
        }, [
          badge,
          node('span', { className: 'profile-copy' }, [
            node('strong', { text: `${profile.favorite ? '★ ' : ''}${profile.name}` }),
            node('small', { text: formatTarget(profile) })
          ]),
          node('span', { className: 'profile-connect-label', text: 'Connect' })
        ]);
        const editButton = node('button', {
          type: 'button',
          className: 'profile-edit',
          text: '⋯',
          title: `Actions for ${profile.name}`,
          attrs: { 'aria-label': `Actions for ${profile.name}`, 'aria-haspopup': 'menu' }
        });
        const item = node('div', {
          className: `profile-item${profile.id === state.selectedProfileId ? ' selected' : ''}`,
          attrs: { role: 'listitem' }
        }, [connectButton, editButton]);
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
      elements.profileList.append(section);
    }

    if (!filtered.length) {
      elements.profileList.append(node('div', { className: 'list-empty', text: 'No matching connections.' }));
    }
    elements.connectionCount.textContent = `${state.profiles.length} profile${state.profiles.length === 1 ? '' : 's'}`;
  }

  function profileById(id) {
    return state.profiles.find((profile) => profile.id === id) || null;
  }

  async function importSshConfig() {
    const result = await runTask('Importing SSH configuration…', () => api.profiles.importSshConfig(), 'SSH configuration imported');
    updateProfiles(result.profiles);
    toast('SSH import complete', `${result.added} new profile${result.added === 1 ? '' : 's'} added from ${result.found} host entr${result.found === 1 ? 'y' : 'ies'}.`, 'success');
  }

  async function connectProfile(profile) {
    if (!profile) return;
    state.selectedProfileId = profile.id;
    renderProfiles();

    if (profile.protocol === 'rdp' || profile.protocol === 'vnc') {
      const kind = profile.protocol.toUpperCase();
      try {
        const result = profile.protocol === 'vnc'
          ? await runTask(`Connecting VNC to ${profile.name}…`, () => api.vnc.start(profile), 'VNC connected')
          : await runTask(`Starting embedded RDP to ${profile.name}…`, () => api.rdp.startEmbedded(profile), 'RDP connected');
        createRemoteDesktopTab(result, profile, profile.protocol);
        toast(`${kind} session started`, profile.name, 'success');
        return;
      } catch (error) {
        toast(`Embedded ${kind} unavailable, launching external client`, errorMessage(error), 'info');
      }
      // Fall through to the external native client.
      try {
        const result = await runTask(`Launching ${kind}…`, () => api.external.launch(profile), `${kind} launched`);
        toast(`${kind} client launched`, result.executable, 'success');
      } catch { /* runTask already surfaced the error */ }
      return;
    }

    if (profile.protocol === 'ftp' || profile.protocol === 'ftps') {
      if (profile.protocol === 'ftp') {
        const confirmed = await confirmAction({
          title: 'Open insecure FTP?',
          description: 'Plain FTP is not encrypted. Credentials and file contents can be observed on the network. Use FTPS unless this is a trusted legacy target.',
          confirmLabel: 'Open FTP file browser'
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
      updateSessionActions();
      return;
    }

    if (!window.Terminal || !window.FitAddon?.FitAddon || !window.SearchAddon?.SearchAddon) {
      toast('Terminal runtime unavailable', 'Install dependencies with npm install before starting Aux Command.', 'error');
      return;
    }

    let session;
    try {
      session = await runTask(`Connecting to ${profile.name}…`, () => api.terminal.create({ profile, cols: 120, rows: 34 }), `Connected to ${profile.name}`);
    } catch {
      return;
    }
    return createTerminalTab(session, profile);
  }

  // Keyword highlighting for log triage. Matches in plain-text terminal output
  // are wrapped in ANSI SGR colors at display time — the same technique as
  // `grep --color`. It is display-only: the main-process transcript, session
  // logs, and exports keep the unmodified stream.
  const HIGHLIGHT_COLORS = {
    red: { rgb: [255, 92, 119], label: 'Red' },
    amber: { rgb: [255, 199, 92], label: 'Amber' },
    green: { rgb: [73, 222, 140], label: 'Green' },
    blue: { rgb: [94, 168, 255], label: 'Blue' },
    magenta: { rgb: [180, 139, 234], label: 'Magenta' },
    cyan: { rgb: [69, 210, 255], label: 'Cyan' }
  };
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
      setStatus(`Highlight settings not saved: ${errorMessage(error)}`, 'error');
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
    toast('Log highlighting', state.highlight.enabled ? 'Enabled for terminal output' : 'Disabled', state.highlight.enabled ? 'success' : 'info');
  }

  function defaultHighlightRules() {
    return [
      { id: `rule-${Date.now()}-1`, label: 'Errors', pattern: '/(error|fatal|failed|panic|denied)/', color: 'red', caseSensitive: false, wholeWord: false, enabled: true },
      { id: `rule-${Date.now()}-2`, label: 'Warnings', pattern: '/(warn|warning|deprecated)/', color: 'amber', caseSensitive: false, wholeWord: false, enabled: true },
      { id: `rule-${Date.now()}-3`, label: 'Success', pattern: '/(success|succeeded|ok|ready|listening|started)/', color: 'green', caseSensitive: false, wholeWord: false, enabled: true },
      { id: `rule-${Date.now()}-4`, label: 'IP addresses', pattern: '/\\b\\d{1,3}(\\.\\d{1,3}){3}\\b/', color: 'cyan', caseSensitive: false, wholeWord: false, enabled: true }
    ];
  }

  function openHighlightManager() {
    const list = node('div', { className: 'highlight-list' });
    const renderList = () => {
      list.replaceChildren();
      if (!state.highlight.rules.length) {
        list.append(node('div', { className: 'empty-state', text: 'No highlight rules yet. Add one below, or load the log-triage starter set.' }));
        return;
      }
      state.highlight.rules.forEach((rule, index) => {
        const enabledBox = node('input', { type: 'checkbox' });
        enabledBox.checked = rule.enabled !== false;
        enabledBox.addEventListener('change', () => { rule.enabled = enabledBox.checked; applyHighlightChange(); });

        const patternInput = textInput('pattern', rule.pattern, { placeholder: 'text or /regex/' });
        patternInput.addEventListener('input', () => { rule.pattern = patternInput.value; applyHighlightChange(); });

        const labelInput = textInput('label', rule.label || '', { placeholder: 'Label (optional)' });
        labelInput.addEventListener('input', () => { rule.label = labelInput.value; });

        const colorSelect = selectInput('color', Object.entries(HIGHLIGHT_COLORS).map(([value, def]) => [value, def.label]), rule.color || 'amber');
        colorSelect.addEventListener('change', () => { rule.color = colorSelect.value; applyHighlightChange(); });
        colorSelect.style.borderLeft = `4px solid ${HIGHLIGHT_COLORS[rule.color]?.fg || '#ffe9b8'}`;

        const caseBox = checkbox('caseSensitive', 'Aa', rule.caseSensitive);
        caseBox.title = 'Case sensitive';
        caseBox.querySelector('input').addEventListener('change', (event) => { rule.caseSensitive = event.target.checked; applyHighlightChange(); });
        const wordBox = checkbox('wholeWord', 'W', rule.wholeWord);
        wordBox.title = 'Whole word';
        wordBox.querySelector('input').addEventListener('change', (event) => { rule.wholeWord = event.target.checked; applyHighlightChange(); });

        const removeButton = node('button', { type: 'button', className: 'mini-button destructive', text: '✕', title: 'Delete rule' });
        removeButton.addEventListener('click', () => {
          state.highlight.rules.splice(index, 1);
          applyHighlightChange();
          renderList();
        });

        list.append(node('div', { className: 'highlight-row' }, [
          node('label', { className: 'highlight-enable', title: 'Enabled' }, [enabledBox]),
          node('div', { className: 'highlight-fields' }, [patternInput, labelInput]),
          colorSelect,
          node('div', { className: 'highlight-flags' }, [caseBox, wordBox]),
          removeButton
        ]));
      });
    };

    const enableToggle = checkbox('enabled', 'Highlight terminal output', state.highlight.enabled);
    enableToggle.querySelector('input').addEventListener('change', (event) => {
      state.highlight.enabled = event.target.checked;
      if (state.highlight.enabled && !state.highlight.rules.length) state.highlight.rules = defaultHighlightRules();
      applyHighlightChange();
      renderList();
    });

    const addButton = node('button', { type: 'button', className: 'mini-button', text: '+ Add rule' });
    addButton.addEventListener('click', () => {
      state.highlight.rules.push({ id: `rule-${Date.now()}`, label: '', pattern: '', color: 'amber', caseSensitive: false, wholeWord: false, enabled: true });
      renderList();
    });
    const starterButton = node('button', { type: 'button', className: 'mini-button', text: 'Load starter set' });
    starterButton.addEventListener('click', () => {
      state.highlight.rules = defaultHighlightRules();
      applyHighlightChange();
      renderList();
    });

    renderList();
    const body = node('div', { className: 'modal-sections' }, [
      node('div', { className: 'checkbox-row' }, [enableToggle]),
      node('div', {}, [
        node('div', { className: 'section-title', text: 'Rules' }),
        list,
        node('div', { className: 'button-row', attrs: { style: 'margin-top:10px' } }, [addButton, starterButton])
      ]),
      node('div', { className: 'warning-box', text: 'Plain text matches literally; wrap a pattern in /slashes/ for a regular expression. Highlighting applies to normal terminal output, not full-screen apps like vim or htop.' })
    ]);
    showModal({
      title: 'Log highlighting',
      description: 'Color keywords in terminal output to speed up log triage. Rules apply to every terminal and persist across restarts.',
      body,
      className: 'wide',
      actions: [{ label: 'Done', busy: false }]
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
    badge.title = `Detected operating system: ${tab.assist.osInfo.label}`;
  }

  function clearAssistBar(tab) {
    if (!tab.assist) return;
    tab.assist.suggestion = null;
    tab.assist.bar.classList.remove('visible');
    tab.assist.bar.replaceChildren();
  }

  function updateAssistSuggestion(tab) {
    if (!tab.assist) return;
    if (tab.assist.correction) return; // the correction chip owns the bar until dismissed
    if (!state.assist.enabled || !state.assist.suggestions || !tab.assist.mirror.tracked) {
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
      node('span', { className: 'assist-hint', text: 'Ctrl+Space' })
    );
    tab.assist.bar.classList.add('visible');
  }

  function acceptAssistSuggestion(tab) {
    const suggestion = tab.assist?.suggestion;
    if (!suggestion) return;
    tab.assist.mirror.feed(suggestion.completion);
    api.terminal.write(tab.id, suggestion.completion).catch((error) => toast('Terminal input failed', errorMessage(error), 'error'));
    updateAssistSuggestion(tab);
  }

  function showAssistCorrection(tab, correction) {
    if (!tab.assist) return;
    tab.assist.correction = correction;
    tab.assist.suggestion = null;
    const insert = node('button', { type: 'button', className: 'assist-chip-action', text: 'Insert' });
    insert.addEventListener('click', () => {
      tab.assist.correction = null;
      tab.assist.mirror.feed(correction.corrected);
      api.terminal.write(tab.id, correction.corrected).catch((error) => toast('Terminal input failed', errorMessage(error), 'error'));
      clearAssistBar(tab);
      tab.terminal.focus();
      updateAssistSuggestion(tab);
    });
    const dismiss = node('button', { type: 'button', className: 'assist-chip-dismiss', text: '×', title: 'Dismiss' });
    dismiss.addEventListener('click', () => {
      tab.assist.correction = null;
      clearAssistBar(tab);
      tab.terminal.focus();
    });
    tab.assist.bar.replaceChildren(
      node('span', { className: 'assist-chip-label', text: 'Did you mean:' }),
      node('code', { className: 'assist-chip-command', text: correction.corrected }),
      insert,
      dismiss
    );
    tab.assist.bar.classList.add('visible');
  }

  function dispatchTerminalInput(tab, data) {
    const targets = state.broadcastInput ? [...state.tabs.values()].filter((candidate) => candidate.terminal) : [tab];
    for (const target of targets) {
      if (!target.closed) api.terminal.write(target.id, data).catch((error) => toast('Terminal input failed', errorMessage(error), 'error'));
    }
  }

  function commitTerminalInput(tab, data) {
    if (state.assist.enabled && tab.assist) {
      if (tab.assist.correction) {
        tab.assist.correction = null;
        clearAssistBar(tab);
      }
      const result = tab.assist.mirror.feed(data);
      for (const commit of result.committed) {
        if (commit.tracked && commit.line.trim()) {
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
      const hit = preview.committed
        .filter((commit) => commit.tracked)
        .map((commit) => window.AuxAssist.dangerCheck(commit.line))
        .find(Boolean);
      if (hit) {
        confirmAction({
          title: 'Run dangerous command?',
          description: `${hit.reason}\n\n${hit.command}`,
          confirmLabel: 'Run command',
          danger: true
        }).then((confirmed) => {
          // The typed line stays visible either way; only Enter was held back.
          if (confirmed) commitTerminalInput(tab, data);
          tab.terminal.focus();
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

  function openAssistModal() {
    const activeTab = state.tabs.get(state.activeTabId);
    const detected = activeTab?.assist?.osInfo?.label;
    const enabled = checkbox('enabled', 'Enable terminal assist', state.assist.enabled);
    const suggestions = checkbox('suggestions', 'Inline command suggestions (accept with Ctrl+Space)', state.assist.suggestions);
    const autocorrect = checkbox('autocorrect', '“Did you mean” fixes after command-not-found errors', state.assist.autocorrect);
    const dangerGuard = checkbox('dangerGuard', 'Confirm before running destructive commands', state.assist.dangerGuard);
    const osDetection = checkbox('osDetection', 'Detect the session operating system (tab badge, per-OS suggestions)', state.assist.osDetection);
    const body = node('div', { className: 'assist-settings' }, [
      node('p', { className: 'muted', text: 'Assist watches only what you type and what the session prints back. Command history for suggestions stays in memory and is never written to disk. No probe commands are ever sent to your servers.' }),
      node('div', { className: 'checkbox-column' }, [enabled, suggestions, autocorrect, dangerGuard, osDetection]),
      detected ? node('p', { className: 'muted', text: `Active session detected as: ${detected}` }) : null
    ]);
    const controller = showModal({
      title: 'Terminal assist',
      description: 'Typing help, safety checks and OS awareness for every terminal session.',
      body,
      className: 'narrow',
      actions: [
        { label: 'Cancel', run: () => { controller.close(); return false; } },
        {
          label: 'Save',
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
            Object.assign(state.assist, next);
            refreshAssistUi();
            toast('Terminal assist updated', next.enabled ? 'Assist is on for all terminal sessions.' : 'Assist is off.', 'success');
            controller.close();
            return false;
          }
        }
      ]
    });
  }

  function createTerminalTab(session, profile) {
    const terminal = new window.Terminal(terminalOptionsForProfile(profile));
    const fitAddon = new window.FitAddon.FitAddon();
    const searchAddon = new window.SearchAddon.SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);

    const panelId = `terminal-panel-${session.id}`;
    const tabId = `terminal-tab-${session.id}`;
    const view = node('div', {
      id: panelId,
      className: 'terminal-view',
      attrs: { role: 'tabpanel', 'aria-labelledby': tabId, 'data-session-id': session.id }
    });
    const closeButton = node('button', { type: 'button', className: 'tab-close', text: '×', title: `Close ${session.title}` });
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

    elements.tabbar.insertBefore(tabElement, elements.tabbarSpacer);
    elements.terminalStack.append(view);
    terminal.open(view);

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
      resizeTimer: 0
    };
    state.tabs.set(session.id, tab);
    observeResizablePane(tab);
    setupTabAssist(tab, profile);

    terminal.onData((data) => {
      recordTerminalMacroInput(data);
      handleTerminalInput(tab, data);
    });
    terminal.onResize(({ cols, rows }) => {
      window.clearTimeout(tab.resizeTimer);
      tab.resizeTimer = window.setTimeout(() => {
        api.terminal.resize(session.id, cols, rows).catch(() => {});
      }, 60);
    });
    terminal.onTitleChange((title) => {
      const clean = String(title || '').trim().slice(0, 100);
      if (!clean) return;
      tab.title = clean;
      tab.tabElement.querySelector('.tab-title').textContent = clean;
      if (state.activeTabId === tab.id) elements.activeSessionLabel.textContent = `${clean} · ${profile.protocol.toUpperCase()}`;
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.code === 'Space'
        && state.assist.enabled && state.assist.suggestions && tab.assist?.suggestion) {
        acceptAssistSuggestion(tab);
        return false;
      }
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        const selection = terminal.getSelection();
        if (selection) api.system.clipboardWrite(selection).catch(() => {});
        return false;
      }
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyV') {
        api.system.clipboardRead().then((text) => {
          if (text) terminal.paste(text);
        }).catch(() => {});
        return false;
      }
      // Ctrl+Shift chords are workspace shortcuts even while the terminal has
      // focus; plain Ctrl combinations (Ctrl+W, Ctrl+K, …) stay with the shell
      // until the session has exited.
      if (event.ctrlKey && event.shiftKey && handleWorkspaceShortcut(event)) return false;
      if (tab.closed && event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        requestCloseTab(tab.id);
        return false;
      }
      return true;
    });
    view.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      try {
        if (terminal.hasSelection()) await api.system.clipboardWrite(terminal.getSelection());
        else {
          const text = await api.system.clipboardRead();
          if (text) terminal.paste(text);
        }
      } catch { /* clipboard support is best effort */ }
    });

    tabButton.addEventListener('click', () => activateTab(session.id));
    tabButton.addEventListener('keydown', (event) => {
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
      toast('Existing sessions could not be restored', 'Terminal runtime is unavailable; closing orphaned backend sessions.', 'error');
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
        toast('Stale terminal session closed', session.title || session.id, 'error');
        continue;
      }
      createTerminalTab(session, profile);
      restored += 1;
    }
    if (restored) toast('Terminal sessions restored', `${restored} session${restored === 1 ? '' : 's'} reattached after renderer reload.`, 'success');
  }

  async function restoreSavedSessions() {
    try {
      const saved = await api.app.getSessions();
      if (!Array.isArray(saved) || !saved.length) return;
      const liveSessionIds = new Set(state.tabs.keys());
      const restoreable = saved.slice(0, 16).filter((s) => (
        s.profileId && s.protocol && !liveSessionIds.has(s.startedAt)
      ));
      if (!restoreable.length) return;
      let restored = 0;
      for (const savedSession of restoreable) {
        const profile = state.initialProfiles?.find((p) => p.id === savedSession.profileId);
        if (!profile) continue;
        if (profile.protocol === 'local' || profile.protocol === 'ssh') {
          await connectProfile(profile);
          restored += 1;
        }
      }
      if (restored) toast('Session persistence', `${restored} session${restored === 1 ? '' : 's'} restored from previous workspace.`, 'success');
    } catch { /* session restore is best-effort */ }
  }

  function closeTerminalSearch() {
    const panel = elements.terminalSearchHost.querySelector('.terminal-search-panel');
    panel?.remove();
    state.terminalSearchOpen = false;
    elements.terminalSearchToggle.classList.remove('active');
    elements.terminalSearchToggle.setAttribute('aria-pressed', 'false');
    activeTab()?.terminal?.focus();
  }

  function runTerminalSearch(direction = 'next') {
    const tab = activeTab();
    const query = state.terminalSearchQuery.trim();
    if (!tab?.searchAddon || !query) return false;
    const options = { caseSensitive: false, wholeWord: false, regex: false, incremental: false };
    return direction === 'previous' ? tab.searchAddon.findPrevious(query, options) : tab.searchAddon.findNext(query, options);
  }

  function openTerminalSearch() {
    const tab = activeTab();
    if (!tab?.terminal) {
      toast('Open a terminal first', 'Terminal search needs an active session.', 'error');
      return;
    }
    let panel = elements.terminalSearchHost.querySelector('.terminal-search-panel');
    if (!panel) {
      const input = node('input', {
        type: 'search',
        value: state.terminalSearchQuery,
        placeholder: 'Find in terminal',
        attrs: { 'aria-label': 'Find in terminal', spellcheck: 'false' }
      });
      const previous = node('button', { type: 'button', text: '↑', title: 'Previous match' });
      const next = node('button', { type: 'button', text: '↓', title: 'Next match' });
      const close = node('button', { type: 'button', text: '×', title: 'Close search' });
      panel = node('div', { className: 'terminal-search-panel' }, [input, previous, next, close]);
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
      toast('Replay unavailable', errorMessage(error), 'error');
      return;
    }
    if (!recording.chunks?.length) {
      toast('Nothing to replay yet', 'This session has not produced any output.', 'info');
      return;
    }

    const host = node('div', { className: 'replay-terminal' });
    const statusText = node('span', { className: 'replay-status', text: 'Ready' });
    const playButton = node('button', { type: 'button', className: 'button primary', text: 'Play' });
    const restartButton = node('button', { type: 'button', className: 'button', text: 'Restart' });
    const speedSelect = node('select', { attrs: { 'aria-label': 'Replay speed' } },
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
      statusText.textContent = `${Math.min(player.index, recording.chunks.length)}/${recording.chunks.length} chunks${recording.truncated ? ' · bounded to recent activity' : ''}`;
      playButton.textContent = player.playing ? 'Pause' : (player.index >= recording.chunks.length ? 'Done' : 'Play');
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
      title: 'Session replay',
      description: `${recording.title || tab.title} · recorded from session start${recording.truncated ? ' (oldest output dropped)' : ''}`,
      body: node('div', { className: 'replay' }, [
        node('div', { className: 'replay-controls' }, [playButton, restartButton, speedSelect, statusText]),
        host
      ]),
      className: 'wide',
      actions: [{ label: 'Close', run: () => { player.playing = false; player.token += 1; player.terminal?.dispose(); controller.close(); return false; } }]
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
      toast('Open a terminal first', 'Transcript export needs an active session.', 'error');
      return;
    }
    let transcript;
    try {
      transcript = await api.terminal.exportTranscript(tab.id);
    } catch (error) {
      toast('Transcript export failed', errorMessage(error), 'error');
      return;
    }
    const output = node('textarea', {
      className: 'remote-editor transcript-export',
      attrs: { readonly: '', spellcheck: 'false' }
    });
    output.value = transcript.text || '';
    const body = node('div', { className: 'form-grid compact-form' }, [
      node('div', { className: 'warning-box full', text: transcript.truncated ? 'This transcript was bounded to the most recent 1 MB of output.' : 'This transcript is captured locally from the active session output stream.' }),
      field('Session', textInput('session', `${transcript.title || tab.title} · ${transcript.protocol || tab.profile.protocol}`, { required: false }), '', 'full'),
      field('Transcript', output, 'Review before copying. Transcripts may contain secrets, commands, hostnames, or customer data.', 'full')
    ]);
    showModal({
      title: 'Export terminal transcript',
      description: `${transcript.title || tab.title} · ${transcript.exportedAt || ''}`,
      body,
      className: 'wide',
      actions: [
        { label: 'Copy transcript', className: 'primary', busy: false, run: async () => {
          await api.system.clipboardWrite(output.value);
          toast('Transcript copied', `${output.value.length} characters copied to clipboard.`, 'success');
          return false;
        } },
        { label: 'Save transcript', busy: false, run: async () => {
          const result = await api.terminal.saveTranscript(tab.id);
          if (!result?.canceled) toast('Transcript saved', result.filePath, 'success');
          return false;
        } },
        { label: 'Print transcript', busy: false, run: async () => {
          const result = await api.terminal.printTranscript(tab.id);
          toast(result?.printed ? 'Print job sent' : 'Print canceled', transcript.title || tab.title, result?.printed ? 'success' : 'info');
          return false;
        } },
        { label: 'Replay session', busy: false, run: async () => {
          await openSessionReplay(tab);
          return false;
        } },
        { label: 'Close', busy: false }
      ]
    });
    window.setTimeout(() => output.focus(), 0);
  }

  async function toggleTerminalLogging() {
    const tab = activeTab();
    if (!tab) {
      toast('Open a terminal first', 'Terminal logging needs an active session.', 'error');
      return;
    }
    if (tab.logging?.active) {
      const result = await api.terminal.stopLogging(tab.id);
      tab.logging = result?.filePath ? { filePath: result.filePath, active: false } : null;
      updateSessionActions();
      toast('Terminal logging stopped', result?.filePath || tab.title, 'success');
      return;
    }
    const confirmed = await confirmAction({
      title: 'Start terminal log?',
      description: 'Terminal logs may capture secrets, commands, hostnames, customer data, and remote output. Choose the log file carefully and stop logging when finished.',
      confirmLabel: 'Choose log file'
    });
    if (!confirmed) return;
    const result = await api.terminal.startLogging(tab.id);
    if (result?.canceled) return;
    tab.logging = { filePath: result.filePath, active: true };
    updateSessionActions();
    toast('Terminal logging started', result.filePath, 'success');
  }

  function fitVisibleTerminals() {
    const tabs = state.layout === 'grid' ? [...state.tabs.values()] : [activeTab()].filter(Boolean);
    for (const tab of tabs) {
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
        paneMinHeight: state.paneMinHeight
      }).catch((error) => setStatus(`Workspace settings not saved: ${errorMessage(error)}`, 'error'));
    }, 250);
  }

  let sessionPersistTimer = null;
  function persistSessions() {
    if (sessionPersistTimer) clearTimeout(sessionPersistTimer);
    sessionPersistTimer = setTimeout(() => {
      sessionPersistTimer = null;
      const sessions = [...state.tabs.values()].map((tab) => ({
        profileId: tab.profile.id,
        protocol: tab.profile.protocol,
        title: tab.title,
        startedAt: tab.id
      }));
      api.app.saveSessions(sessions).catch(() => {});
    }, 500);
  }

  function adjustPaneSize(delta) {
    const step = Number(delta) || 0;
    state.paneMinWidth = Math.max(240, Math.min(720, state.paneMinWidth + step));
    state.paneMinHeight = Math.max(160, Math.min(520, state.paneMinHeight + Math.round(step * 0.65)));
    applyPaneSize();
    state.initializing ? null : persistWorkspaceSettings();
    setStatus(`Pane size ${state.paneMinWidth}px × ${state.paneMinHeight}px`);
  }

  function updateSessionActions() {
    const tab = activeTab();
    const tabCount = state.tabs.size;
    // The tab bar and its toolbar only appear once a session exists; the
    // welcome screen stays uncluttered.
    elements.appShell.classList.toggle('no-sessions', tabCount === 0);
    const terminalTab = Boolean(tab?.terminal);
    const terminalCount = [...state.tabs.values()].filter((candidate) => candidate.terminal).length;
    const fileTransfer = isFileTransferProfile(tab?.profile);
    elements.layoutToggle.disabled = tabCount < 2 && state.layout !== 'grid';
    elements.broadcastToggle.disabled = terminalCount < 2;
    elements.terminalSearchToggle.disabled = !terminalTab;
    elements.highlightToggle.classList.toggle('active', state.highlight.enabled);
    elements.highlightToggle.setAttribute('aria-pressed', state.highlight.enabled ? 'true' : 'false');
    elements.exportTranscriptButton.disabled = !terminalTab;
    elements.terminalLogButton.disabled = !terminalTab || tab.closed;
    elements.terminalLogButton.textContent = tab?.logging?.active ? 'Stop log' : 'Log';
    elements.macroRecordButton.disabled = !terminalTab || tab.closed;
    elements.macroRecordButton.textContent = state.macroRecording ? 'Stop macro' : 'Macro';
    elements.macroRecordButton.classList.toggle('active', Boolean(state.macroRecording));
    elements.macroRecordButton.setAttribute('aria-pressed', state.macroRecording ? 'true' : 'false');
    elements.duplicateSessionButton.disabled = !terminalTab;
    elements.reconnectSessionButton.disabled = !terminalTab;
    elements.paneShrinkButton.disabled = state.layout !== 'grid';
    elements.paneGrowButton.disabled = state.layout !== 'grid';
    elements.sftpToggle.disabled = !fileTransfer;
    elements.sftpToggle.textContent = tab?.profile?.protocol === 'ftp' || tab?.profile?.protocol === 'ftps' ? 'Files' : 'SFTP';
    elements.sftpToggle.title = fileTransfer ? 'Toggle file browser (Ctrl+Shift+F)' : 'File browser requires an SSH, FTP, or FTPS session';
  }

  function applyTerminalLayout() {
    applyPaneSize();
    elements.terminalStack.classList.toggle('layout-grid', state.layout === 'grid');
    elements.layoutToggle.classList.toggle('active', state.layout === 'grid');
    elements.layoutToggle.textContent = state.layout === 'grid' ? 'Tiled' : 'Single';
    elements.layoutToggle.title = state.layout === 'grid' ? 'Switch to single-session view (Ctrl+Shift+L)' : 'Switch to tiled-session view (Ctrl+Shift+L)';
    elements.layoutToggle.setAttribute('aria-pressed', state.layout === 'grid' ? 'true' : 'false');
    for (const tab of state.tabs.values()) {
      const visible = Boolean(state.activeTabId) && (state.layout === 'grid' || tab.id === state.activeTabId);
      tab.view.classList.toggle('active', visible);
      tab.view.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    updateSessionActions();
    fitVisibleTerminals();
  }

  function toggleTerminalLayout() {
    if (state.tabs.size < 2 && state.layout !== 'grid') {
      toast('Open another session first', 'Tiled layout needs at least two terminal sessions.', 'error');
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
      const terminals = [...state.tabs.values()].filter((tab) => tab.terminal);
      const names = terminals.map((tab) => tab.title).join(', ');
      elements.broadcastWarning.querySelector('span').textContent = `Keyboard input is being sent to ${terminals.length} terminals: ${names}`;
    }
  }

  async function toggleBroadcastInput() {
    const terminals = [...state.tabs.values()].filter((tab) => tab.terminal);
    if (terminals.length < 2 && !state.broadcastInput) {
      toast('Open another session first', 'Broadcast input needs at least two terminal sessions.', 'error');
      return;
    }
    if (!state.broadcastInput) {
      const names = terminals.map((tab) => tab.title).join(', ');
      const confirmed = await confirmAction({
        title: 'Enable broadcast input?',
        description: `Every keystroke will be sent to ${terminals.length} terminals: ${names}. Commands cannot be recalled after transmission.`,
        confirmLabel: 'Enable broadcast',
        danger: true
      });
      if (!confirmed) return;
    }
    applyBroadcastState(!state.broadcastInput);
    toast(
      state.broadcastInput ? 'Broadcast input enabled' : 'Broadcast input disabled',
      state.broadcastInput ? 'Keyboard input now goes to every open terminal.' : 'Keyboard input now goes only to the focused terminal.',
      state.broadcastInput ? 'success' : ''
    );
  }

  function writeTerminalData(tab, data) {
    // applyHighlighting is escape-aware: it colors only plain-text runs and
    // copies escape sequences through verbatim.
    const payload = state.highlight.enabled ? applyHighlighting(data) : data;
    tab.terminal.write(payload, () => {
      try { tab.terminal.refresh(0, tab.terminal.rows - 1); } catch { /* terminal may be closing */ }
    });
  }

  function activateTab(id) {
    state.activeTabId = id || '';
    const fallbackTabId = state.tabs.keys().next().value || '';
    for (const [tabId, tab] of state.tabs) {
      const active = tabId === state.activeTabId;
      const roving = active || (!state.activeTabId && tabId === fallbackTabId);
      tab.tabElement.classList.toggle('active', active);
      tab.tabButton.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabButton.setAttribute('tabindex', roving ? '0' : '-1');
      tab.view.classList.toggle('active', Boolean(state.activeTabId) && (state.layout === 'grid' || active));
      tab.view.setAttribute('aria-hidden', state.activeTabId && (state.layout === 'grid' || active) ? 'false' : 'true');
    }
    const activeTab = state.tabs.get(state.activeTabId);
    elements.welcome.classList.toggle('hidden', Boolean(activeTab));
    if (activeTab) {
      elements.activeSessionLabel.textContent = `${activeTab.title} · ${activeTab.profile.protocol.toUpperCase()}`;
      window.setTimeout(() => {
        fitVisibleTerminals();
        if (activeTab.terminal) activeTab.terminal.focus();
        else activeTab.view.querySelector('iframe')?.focus();
      }, 0);
    } else {
      elements.activeSessionLabel.textContent = 'No active session';
    }
    updateSessionActions();
    // Roving tabindex uses a fallback tab when Home is active; do not regress to: tab.tabButton.setAttribute('tabindex', active ? '0' : '-1')
    if (state.sftp.open) syncSftpToActiveTab().catch((error) => toast('SFTP switch failed', errorMessage(error), 'error'));
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
        title: 'Close live session?',
        description: `Closing “${tab.title}” will terminate its active process and cannot preserve shell state.`,
        confirmLabel: 'Close session',
        danger: true
      });
      if (!confirmed) return;
    }
    await closeTab(id);
  }

  // Shared surface for embedded VNC and embedded RDP: both stream a remote
  // desktop into a noVNC iframe tab and differ only in the backend that owns
  // the session.
  function createRemoteDesktopTab(result, profile, protocol) {
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
        src: result.vncUrl,
        allow: 'clipboard-read; clipboard-write',
        sandbox: 'allow-scripts allow-same-origin',
        title: `${kind}: ${profile.name}`
      }
    }));

    const closeButton = node('button', { type: 'button', className: 'tab-close', text: '×', title: `Close ${kind} ${profile.name}` });
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
      closed: false
    };
    state.vncSessions = state.vncSessions || new Map();
    state.vncSessions.set(sessionId, desktopTab);
    state.tabs.set(sessionId, desktopTab);

    tabButton.addEventListener('click', () => activateTab(sessionId));
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      requestCloseVncTab(sessionId);
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
    state.tabs.delete(id);
    tab.tabElement?.remove();
    tab.view?.remove();
    state.vncSessions?.delete(id);
    if (state.activeTabId === id) {
      const remaining = [...state.tabs.keys()];
      activateTab(remaining.at(-1) || '');
    }
    if (!state.tabs.size) activateTab('');
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
    if ([...state.tabs.values()].filter((candidate) => candidate.terminal).length < 2 && state.broadcastInput) {
      applyBroadcastState(false);
      toast('Broadcast input disabled', 'Fewer than two terminal sessions remain.');
    }

    if (state.activeTabId === id) {
      const remaining = [...state.tabs.keys()];
      activateTab(remaining.at(-1) || '');
    }
    if (!state.tabs.size) activateTab('');
    persistSessions();
  }

  function recordTerminalMacroInput(data) {
    if (!state.macroRecording || typeof data !== 'string') return;
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
        title: 'Start macro recording?',
        description: 'Macro recording may capture secrets typed into this terminal. Do not record passwords, tokens, recovery codes, or private customer data.',
        confirmLabel: 'Start recording',
        danger: true
      });
      if (!confirmed) return;
      state.macroRecording = { tabId: tab.id, title: tab.title, startedAt: new Date().toISOString(), chunks: [] };
      updateSessionActions();
      toast('Macro recording', tab.title, 'success');
      return;
    }
    const command = macroCommandText();
    const recorded = state.macroRecording;
    state.macroRecording = null;
    updateSessionActions();
    if (!command) {
      toast('Macro discarded', 'No replayable terminal input was captured.', 'info');
      return;
    }
    const form = snippetForm({
      name: `Macro ${new Date().toLocaleString()}`,
      description: `Recorded from ${recorded.title} at ${recorded.startedAt}`,
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
      toast('Macro recorded', saved.name, 'success');
      return true;
    };
    controller = showModal({
      title: 'Save recorded macro',
      description: 'Review the captured input before saving. Remove secrets before you save or replay it.',
      body: form,
      className: 'narrow',
      actions: [
        { label: 'Discard', busy: false, run: () => true },
        { label: 'Save macro snippet', className: 'primary', run: save }
      ]
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const close = await save();
        if (close) controller.close();
      } catch (error) {
        toast('Could not save macro', errorMessage(error), 'error');
      }
    });
  }

  async function duplicateActiveSession() {
    const tab = activeTab();
    if (!tab?.terminal) {
      toast('No active session', 'Open a terminal tab before duplicating a session.', 'error');
      return;
    }
    await connectProfile(tab.profile);
  }

  async function reconnectActiveSession() {
    const tab = activeTab();
    if (!tab?.terminal) {
      toast('No active session', 'Open a terminal tab before reconnecting a session.', 'error');
      return;
    }
    const replacement = await connectProfile(tab.profile);
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
      toast('Invalid connection target', errorMessage(error), 'error');
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
      useSshConfig: true,
      compression: false,
      agentForwarding: false,
      x11Forwarding: false,
      credentialId: '',
      credentialKind: 'password',
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
      ['ssh', 'SSH'], ['mosh', 'Mosh'], ['ftp', 'FTP'], ['ftps', 'FTPS'], ['rdp', 'RDP'], ['vnc', 'VNC'], ['telnet', 'Telnet'], ['serial', 'Serial'], ['local', 'Local shell']
    ], profile.protocol);
    if (existing?.id === 'local-shell') protocol.disabled = true;
    const name = textInput('name', profile.name, { required: true, placeholder: 'Production gateway' });
    const group = textInput('group', profile.group || 'Connections', { placeholder: 'Connections' });
    group.setAttribute('list', 'group-options');
    const groupOptions = node('datalist', { attrs: { id: 'group-options' } },
      knownGroupNames().filter((groupName) => groupName !== 'Local').map((groupName) => node('option', { attrs: { value: groupName } })));
    const host = textInput('host', profile.host, { placeholder: 'server.example.com' });
    const port = textInput('port', profile.port || 22, { type: 'number', min: 1, max: 65535 });
    const username = textInput('username', profile.username, { placeholder: 'admin' });
    const identityFile = textInput('identityFile', profile.identityFile, { placeholder: '~/.ssh/id_ed25519' });
    const knownHostsFile = textInput('knownHostsFile', profile.knownHostsFile, { placeholder: '~/.ssh/known_hosts' });
    const proxyJump = textInput('proxyJump', profile.proxyJump, { placeholder: 'bastion or user@bastion:2222,inner' });
    const keepAlive = textInput('keepAliveSeconds', profile.keepAliveSeconds ?? 30, { type: 'number', min: 0, max: 600 });
    const startupCommand = node('textarea', { name: 'startupCommand', value: profile.startupCommand || '', placeholder: 'tmux attach || tmux new' });
    startupCommand.value = profile.startupCommand || '';
    const sftpRoot = textInput('sftpRoot', profile.sftpRoot || '/', { placeholder: '/' });
    const transferMode = selectInput('transferMode', [
      ['sftp', 'SFTP browser'], ['scp', 'SCP fallback']
    ], profile.transferMode || 'sftp');
    const device = textInput('device', profile.device || '/dev/ttyUSB0', { placeholder: '/dev/ttyUSB0' });
    const baudRate = textInput('baudRate', profile.baudRate || 115200, { type: 'number', min: 50, max: 4000000 });
    const rdpDomain = textInput('rdpDomain', profile.rdpDomain, { placeholder: 'CORP' });
    const terminalTheme = selectInput('terminalTheme', [
      ['aux-dark', 'Aux dark'], ['light', 'Light'], ['high-contrast', 'High contrast'],
      ['nord', 'Nord'], ['dracula', 'Dracula'], ['solarized-dark', 'Solarized dark'],
      ['solarized-light', 'Solarized light'], ['one-dark', 'One dark'], ['catppuccin-mocha', 'Catppuccin mocha'],
      ['tokyo-night', 'Tokyo night'], ['gruvbox-dark', 'Gruvbox dark'], ['monokai', 'Monokai'],
      ['oceanic-next', 'Oceanic next'], ['material', 'Material']
    ], profile.terminalTheme || 'aux-dark');
    const terminalFontFamily = textInput('terminalFontFamily', profile.terminalFontFamily || defaultTerminalFont, { placeholder: defaultTerminalFont });
    const terminalFontSize = textInput('terminalFontSize', profile.terminalFontSize || 13, { type: 'number', min: 8, max: 32 });
    const terminalCursorStyle = selectInput('terminalCursorStyle', [
      ['block', 'Block'], ['underline', 'Underline'], ['bar', 'Bar']
    ], profile.terminalCursorStyle || 'block');
    const terminalScrollback = textInput('terminalScrollback', profile.terminalScrollback || 20000, { type: 'number', min: 1000, max: 200000 });
    const notes = node('textarea', { name: 'notes', placeholder: 'Operational notes' });
    notes.value = profile.notes || '';
    const credentialKind = selectInput('credentialKind', [
      ['password', 'Account password'], ['passphrase', 'Private-key passphrase']
    ], profile.credentialKind || (profile.identityFile ? 'passphrase' : 'password'));
    const secret = textInput('secret', '', { type: 'password', autocomplete: 'new-password', placeholder: hasCredential ? 'Stored credential exists — leave blank to keep' : 'Optional file-transfer credential' });
    const persistentAvailable = Boolean(state.vault?.persistentEncryptionAvailable);

    const optionsRow = node('div', { className: 'checkbox-row full', attrs: { 'data-when': 'ssh,mosh' } }, [
      checkbox('useSshConfig', 'Use ~/.ssh/config', profile.useSshConfig !== false),
      checkbox('compression', 'Compression', profile.compression),
      checkbox('agentForwarding', 'Agent forwarding', profile.agentForwarding),
      checkbox('x11Forwarding', 'X11 forwarding', profile.x11Forwarding)
    ]);
    const credentialRow = node('div', { className: 'credential-grid full', attrs: { 'data-when': 'ssh,ftp,ftps' } }, [
      field('Credential type', credentialKind, 'Prevents a private-key passphrase from being sent as an account password.'),
      field('File-transfer credential', secret, 'Used by graphical SFTP/FTP/FTPS. Terminal SSH authentication remains interactive through OpenSSH.'),
      node('div', { className: 'checkbox-column' }, [
        checkbox('persistentSecret', persistentAvailable ? 'Store encrypted on this desktop' : 'Encrypted storage unavailable', persistentAvailable, !persistentAvailable),
        hasCredential ? checkbox('clearSecret', 'Remove stored credential', false) : null
      ])
    ]);
    const form = node('form', { className: 'form-grid', attrs: { id: 'profile-form' } }, [
      field('Name', name),
      field('Protocol', protocol),
      field('Group', group),
      groupOptions,
      field('Host', host, '', '',),
      field('Port', port),
      field('Username', username, '', '',),
      field('Identity file', identityFile, 'OpenSSH key path. Agent authentication is used automatically when available.'),
      field('Known-hosts file', knownHostsFile, 'Optional OpenSSH known-hosts override for isolated lab or fixture hosts.'),
      field('ProxyJump', proxyJump, 'One or more bastion hops for the OpenSSH -J option, e.g. bastion or user@bastion:2222,inner. Applies to terminals, tunnels, and graphical SFTP.'),
      field('Keepalive seconds', keepAlive),
      field('SFTP start path', sftpRoot, '', '',),
      field('SSH transfer mode', transferMode, 'SCP is upload/download fallback only for legacy SSH servers without SFTP.'),
      field('Serial device', device, '', '',),
      field('Baud rate', baudRate, '', '',),
      field('RDP domain', rdpDomain, '', '',),
      field('Startup command', startupCommand, 'Runs after connecting.', 'full'),
      optionsRow,
      node('div', { className: 'section-title full', text: 'Terminal appearance' }),
      field('Terminal theme', terminalTheme, 'Applied to new terminal tabs for this profile.'),
      field('Terminal font', terminalFontFamily, 'Font family stack used by xterm.js.'),
      field('Font size', terminalFontSize, '8–32 px.'),
      field('Cursor style', terminalCursorStyle),
      field('Scrollback lines', terminalScrollback, '1,000–200,000 lines.'),
      node('div', { className: 'checkbox-column' }, checkbox('terminalCursorBlink', 'Blinking cursor', profile.terminalCursorBlink !== false)),
      credentialRow,
      node('div', { className: 'checkbox-row full' }, checkbox('favorite', 'Favorite connection', profile.favorite)),
      field('Notes', notes, '', 'full')
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
      [startupCommand.closest('.field'), 'ssh,mosh,local']
    ]);
    for (const [element, when] of conditional) element.dataset.when = when;

    const updateConditionalFields = () => {
      const selected = protocol.value;
      for (const element of form.querySelectorAll('[data-when]')) {
        const visible = element.dataset.when.split(',').includes(selected);
        element.hidden = !visible;
        element.querySelectorAll('input, select, textarea').forEach((control) => { control.disabled = !visible; });
      }
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
        sftpRoot: String(values.get('sftpRoot') || '/').trim(),
        transferMode: String(values.get('transferMode') || 'sftp'),
        device: String(values.get('device') || '').trim(),
        baudRate: Number(values.get('baudRate') || 115200),
        rdpDomain: String(values.get('rdpDomain') || '').trim(),
        notes: String(values.get('notes') || ''),
        favorite: values.has('favorite'),
        useSshConfig: values.has('useSshConfig'),
        compression: values.has('compression'),
        agentForwarding: values.has('agentForwarding'),
        x11Forwarding: values.has('x11Forwarding'),
        credentialId: existing?.credentialId || '',
        credentialKind: String(values.get('credentialKind') || 'password'),
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
          toast('Profile rollback failed', errorMessage(rollbackError), 'error');
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
            toast('Credential cleanup required', errorMessage(error), 'error');
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
      toast(existing ? 'Connection updated' : 'Connection created', saved.name, 'success');
      return true;
    };

    const actions = [];
    if (existing && existing.id !== 'local-shell') {
      actions.push({
        label: 'Delete',
        className: 'danger',
        run: async () => {
          const deleted = await deleteProfileWithConfirm(existing);
          if (deleted) controller.close();
          return false;
        }
      });
    }
    actions.push(
      { label: 'Cancel', busy: false, run: () => true },
      { label: existing ? 'Save changes' : 'Create connection', className: 'primary', run: saveProfile }
    );
    controller = showModal({
      title: existing ? `Edit ${existing.name}` : 'New connection',
      description: 'Profiles contain connection settings only. Exported profiles never include credentials.',
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
        toast('Could not save connection', errorMessage(error), 'error');
      }
    });
  }

  function openProfileDataMenu() {
    const body = node('div', { className: 'menu-stack' });
    const importButton = node('button', { type: 'button', className: 'menu-action' }, [
      node('strong', { text: 'Import Aux Command profiles' }),
      node('span', { text: 'Merge a JSON export. Credentials are never imported.' })
    ]);
    const exportButton = node('button', { type: 'button', className: 'menu-action' }, [
      node('strong', { text: 'Export profiles' }),
      node('span', { text: 'Create a portable JSON backup without secrets.' })
    ]);
    body.append(importButton, exportButton);
    const controller = showModal({ title: 'Profile data', body, className: 'narrow', actions: [{ label: 'Close', busy: false }] });
    importButton.addEventListener('click', async () => {
      try {
        const result = await api.profiles.import();
        if (!result.canceled) {
          updateProfiles(result.profiles);
          toast('Profiles imported', `${result.added} profile${result.added === 1 ? '' : 's'} added.`, 'success');
          controller.close();
        }
      } catch (error) { toast('Import failed', errorMessage(error), 'error'); }
    });
    exportButton.addEventListener('click', async () => {
      try {
        const result = await api.profiles.export();
        if (!result.canceled) {
          toast('Profiles exported', result.filePath, 'success');
          controller.close();
        }
      } catch (error) { toast('Export failed', errorMessage(error), 'error'); }
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
    await api.terminal.write(tab.id, `${snippet.command}\r`);
    toast('Snippet sent', snippet.name, 'success');
  }

  function snippetForm(snippet = {}) {
    const name = textInput('name', snippet.name || '', { required: true, placeholder: 'Restart service' });
    const description = textInput('description', snippet.description || '', { placeholder: 'Optional note' });
    const command = node('textarea', { name: 'command', placeholder: 'systemctl status nginx --no-pager' });
    command.value = snippet.command || '';
    command.required = true;
    return node('form', { className: 'form-grid compact-form', attrs: { id: 'snippet-form' } }, [
      field('Name', name),
      field('Description', description),
      field('Command', command, 'Sent to the active terminal exactly as written, followed by Enter.', 'full')
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
      toast(existing ? 'Snippet updated' : 'Snippet created', saved.name, 'success');
      parentController?.close();
      openSnippetsModal();
      return true;
    };
    let controller;
    controller = showModal({
      title: existing ? `Edit ${existing.name}` : 'New command snippet',
      description: 'Reusable commands and macros for the active terminal.',
      body: form,
      className: 'narrow',
      actions: [
        { label: 'Cancel', busy: false, run: () => true },
        { label: existing ? 'Save snippet' : 'Create snippet', className: 'primary', run: save }
      ]
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const close = await save();
        if (close) controller.close();
      } catch (error) {
        toast('Could not save snippet', errorMessage(error), 'error');
      }
    });
  }

  async function openSnippetsModal() {
    try { await refreshSnippets(); } catch (error) { toast('Could not refresh snippets', errorMessage(error), 'error'); }
    const body = node('div', { className: 'menu-stack' });
    const current = activeTab();
    if (!state.snippets.length) {
      body.append(node('div', { className: 'list-empty', text: 'No snippets yet. Add commands you run often, then send them to the active terminal.' }));
    }
    for (const snippet of [...state.snippets].sort((a, b) => a.name.localeCompare(b.name))) {
      const runButton = node('button', { type: 'button', className: 'mini-button', text: 'Run', title: current ? `Run ${snippet.name}` : 'Open a terminal tab first' });
      runButton.disabled = !current;
      const editButton = node('button', { type: 'button', className: 'mini-button', text: 'Edit' });
      const deleteButton = node('button', { type: 'button', className: 'mini-button', text: 'Delete' });
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
        catch (error) { toast('Snippet failed', errorMessage(error), 'error'); }
      });
      editButton.addEventListener('click', () => openSnippetEditor(snippet, controller));
      deleteButton.addEventListener('click', async () => {
        const confirmed = await confirmAction({
          title: 'Delete snippet?',
          description: `Delete “${snippet.name}” from the command snippet library?`,
          confirmLabel: 'Delete',
          danger: true
        });
        if (!confirmed) return;
        try {
          await api.snippets.delete(snippet.id);
          await refreshSnippets();
          toast('Snippet deleted', snippet.name, 'success');
          controller.close();
          openSnippetsModal();
        } catch (error) {
          toast('Snippet delete failed', errorMessage(error), 'error');
        }
      });
    }
    let controller;
    controller = showModal({
      title: 'Command snippets',
      description: 'Reusable terminal macros. Select Run to send a command to the active tab.',
      body,
      className: 'wide',
      actions: [
        { label: 'New snippet', className: 'primary', busy: false, run: () => { openSnippetEditor(null, controller); return false; } },
        { label: 'Close', busy: false }
      ]
    });
  }

  // ---------------------------------------------------------------------------
  // Multi-session command runner: send one command to selected live terminals
  // and collect each session's output side by side.
  // ---------------------------------------------------------------------------

  async function refreshHostStats() {
    try {
      const stats = await api.system.stats();
      if (!stats?.supported) {
        elements.hostStats.hidden = true;
        return;
      }
      const load = stats.load1 === null ? '–' : stats.load1.toFixed(2);
      elements.hostStats.textContent = `load ${load} · mem ${stats.memUsedPct ?? '–'}% · disk ${stats.diskUsedPct ?? '–'}%`;
      elements.hostStats.title = `Local host — load ${load} of ${stats.cpuCount} cores, memory ${stats.memUsedPct}% used, root disk ${stats.diskUsedPct}% used, up ${Math.floor(stats.uptimeSec / 3600)}h`;
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
    const capture = state.multiRun?.captures.get(id);
    if (!capture) return;
    capture.text = `${capture.text}${data}`.slice(-20000);
    capture.pre.textContent = window.AuxAssist.stripAnsi(capture.text).trim().slice(-4000);
  }

  function stopMultiRunCapture() {
    if (!state.multiRun) return;
    window.clearTimeout(state.multiRun.timer);
    state.multiRun = null;
  }

  function openMultiRunModal() {
    const liveTerminals = [...state.tabs.values()].filter((tab) => tab.terminal && !tab.closed);
    if (!liveTerminals.length) {
      toast('No live sessions', 'Open at least one terminal session first.', 'error');
      return;
    }
    stopMultiRunCapture();
    const boxes = liveTerminals.map((tab) => ({ tab, box: checkbox(`target-${tab.id}`, `${tab.title} (${tab.profile.protocol.toUpperCase()})`, true) }));
    const input = node('input', {
      type: 'text',
      placeholder: 'Command to run on every selected session…',
      attrs: { 'aria-label': 'Command to run' }
    });
    const results = node('div', { className: 'multi-run-results' });
    const statusLine = node('p', { className: 'muted', text: `${liveTerminals.length} live session${liveTerminals.length === 1 ? '' : 's'} available. Output is captured for 6 seconds per run.` });

    const startRun = async () => {
      const command = input.value.trim();
      if (!command) return false;
      const targets = boxes.filter(({ box }) => box.querySelector('input').checked).map(({ tab }) => tab);
      if (!targets.length) {
        toast('No sessions selected', 'Tick at least one session to run against.', 'error');
        return false;
      }
      const hit = window.AuxAssist.dangerCheck(command);
      if (state.assist.enabled && state.assist.dangerGuard && hit) {
        const confirmed = await confirmAction({
          title: 'Run dangerous command on every selected session?',
          description: `${hit.reason}\n\n${hit.command}\n\nTargets: ${targets.map((tab) => tab.title).join(', ')}`,
          confirmLabel: `Run on ${targets.length} session${targets.length === 1 ? '' : 's'}`,
          danger: true
        });
        if (!confirmed) return false;
      }
      stopMultiRunCapture();
      results.replaceChildren();
      const captures = new Map();
      for (const tab of targets) {
        const pre = node('pre', { className: 'multi-run-output', text: '…' });
        results.append(node('div', { className: 'multi-run-block' }, [
          node('div', { className: 'multi-run-host' }, [
            node('strong', { text: tab.title }),
            tab.assist?.osInfo ? node('span', { className: 'history-search-host', text: tab.assist.osInfo.label }) : null
          ]),
          pre
        ]));
        captures.set(tab.id, { pre, text: '' });
      }
      state.multiRun = { captures, timer: window.setTimeout(() => stopMultiRunCapture(), 6000) };
      for (const tab of targets) {
        tab.assist?.mirror.feed(`${command}\r`);
        tab.assist?.history.add(command);
        api.terminal.write(tab.id, `${command}\r`).catch((error) => {
          const capture = captures.get(tab.id);
          if (capture) capture.pre.textContent = `Write failed: ${errorMessage(error)}`;
        });
      }
      return false;
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        startRun();
      }
    });

    const controller = showModal({
      title: 'Run on multiple sessions',
      description: 'One command, every selected live terminal, output collected per session.',
      body: node('div', { className: 'multi-run' }, [
        statusLine,
        node('div', { className: 'checkbox-column' }, boxes.map(({ box }) => box)),
        input,
        results
      ]),
      actions: [
        { label: 'Close', run: () => { stopMultiRunCapture(); controller.close(); return false; } },
        { label: 'Run', className: 'primary', run: () => { startRun(); return false; } }
      ]
    });
    controller.onClose(() => stopMultiRunCapture());
    window.setTimeout(() => input.focus(), 0);
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
      placeholder: 'Search commands from every open session…',
      attrs: { 'aria-label': 'Search command history' }
    });
    const list = node('div', { className: 'history-search-list', attrs: { role: 'listbox' } });
    let matches = [];
    let selected = 0;

    const insert = (entry) => {
      const target = state.tabs.get(state.activeTabId);
      if (!target || !target.terminal || target.closed) {
        toast('No active terminal', 'Open a terminal session to insert a command.', 'error');
        return;
      }
      controller.close();
      target.assist?.mirror.feed(entry.command);
      api.terminal.write(target.id, entry.command).catch((error) => toast('Terminal input failed', errorMessage(error), 'error'));
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
        list.append(node('div', { className: 'list-empty', text: state.assist.history.size ? 'No matching commands.' : 'Type in a terminal first — history fills as you work (memory only, never saved to disk).' }));
      }
    };

    input.addEventListener('input', () => { selected = 0; render(); });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(selected + 1, matches.length - 1); render(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(selected - 1, 0); render(); }
      else if (event.key === 'Enter' && matches[selected]) { event.preventDefault(); insert(matches[selected]); }
    });

    const controller = showModal({
      title: 'Session history search',
      description: activeTab ? `Insert into “${activeTab.title}” without running it.` : 'Commands are inserted into the active terminal, never executed.',
      body: node('div', { className: 'history-search' }, [input, list]),
      className: 'narrow',
      actions: []
    });
    render();
    window.setTimeout(() => input.focus(), 0);
  }

  function paletteActions() {
    const actions = [
      { label: 'New local terminal', category: 'Action', detail: 'Open a local shell tab', run: () => connectProfile(localProfile()) },
      { label: 'Find in terminal', category: 'Action', detail: 'Search the active terminal buffer', run: () => openTerminalSearch() },
      { label: 'Search session history', category: 'Action', detail: 'Find a command typed in any open session and insert it (Ctrl+Shift+Y)', run: () => openHistorySearch() },
      { label: 'Run on multiple sessions', category: 'Action', detail: 'Send one command to selected sessions and collect per-host output (Ctrl+Shift+M)', run: () => openMultiRunModal() },
      { label: 'Command snippets', category: 'Action', detail: 'Open snippet manager', run: () => openSnippetsModal() },
      { label: 'New connection profile', category: 'Action', detail: 'Create SSH, Mosh, Telnet, RDP, VNC or serial profile', run: () => openProfileModal() },
      { label: 'SSH tunnels', category: 'Action', detail: 'Open tunnel manager', run: () => openTunnelsModal() },
      { label: 'System diagnostics', category: 'Action', detail: 'Show runtime tool status', run: () => openDiagnosticsModal() },
      { label: 'Log highlighting rules', category: 'Action', detail: 'Configure keyword highlighting for terminal output', run: () => openHighlightManager() },
      { label: 'Check connection reachability', category: 'Action', detail: 'Probe every saved connection now', run: () => probeConnectionHealth() },
      { label: 'Take the guided tour', category: 'Action', detail: 'Replay the first-run walkthrough', run: () => startTour() },
      { label: state.highlight.enabled ? 'Disable log highlighting' : 'Enable log highlighting', category: 'Action', detail: 'Toggle keyword highlighting (Ctrl+Shift+H)', run: () => toggleHighlighting() },
      { label: 'Duplicate session', category: 'Action', detail: 'Open another session with the active profile', run: () => duplicateActiveSession() },
      { label: 'Reconnect session', category: 'Action', detail: 'Close and reopen the active session from its profile', run: () => reconnectActiveSession() },
      { label: 'Toggle tiled layout', category: 'Action', detail: 'Switch single/tiled terminal workspace', run: () => toggleTerminalLayout() },
      { label: 'Grow tiled panes', category: 'Action', detail: 'Increase tiled pane minimum size', run: () => adjustPaneSize(40) },
      { label: 'Shrink tiled panes', category: 'Action', detail: 'Decrease tiled pane minimum size', run: () => adjustPaneSize(-40) },
      { label: 'Toggle broadcast input', category: 'Action', detail: 'Send keyboard input to all sessions', run: () => toggleBroadcastInput() }
    ];
    for (const profile of state.profiles) {
      actions.push({
        label: `Connect profile: ${profile.name}`,
        category: 'Connect profile',
        detail: `${profile.protocol.toUpperCase()} · ${formatTarget(profile)}`,
        run: () => connectProfile(profile)
      });
    }
    for (const snippet of state.snippets) {
      actions.push({
        label: `Run snippet: ${snippet.name}`,
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
      placeholder: 'Search actions, profiles, snippets…',
      attrs: {
        'aria-label': 'Search command palette',
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
      const actions = paletteActions().filter((action) => `${action.label} ${action.category} ${action.detail}`.toLowerCase().includes(query)).slice(0, 80);
      list.replaceChildren();
      if (!actions.length) {
        input.removeAttribute('aria-activedescendant');
        list.append(node('div', { className: 'list-empty', text: 'No matching commands.' }));
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
          catch (error) { toast('Command failed', errorMessage(error), 'error'); }
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
      title: 'Command palette',
      description: 'Run actions, connect profiles, and launch snippets from one keyboard-driven menu.',
      body,
      className: 'wide',
      actions: [{ label: 'Close', busy: false }]
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
    state.sftp.lastError = '';
    elements.sftpTitle.textContent = 'SFTP';
    elements.sftpPath.value = '/';
    elements.sftpEmpty.textContent = message;
    elements.transferStatus.textContent = status;
    elements.fileList.classList.remove('loading');
    elements.fileList.setAttribute('aria-busy', 'false');
    renderSftpEntries();
  }

  async function disconnectSftp(profile = state.sftp.profile, options = {}) {
    const profileId = profile?.id || '';
    if (options.reset) resetSftpState(options.message, options.status);
    if (!profileId) return;
    try {
      await api.sftp.disconnect(profileId, profile?.protocol);
    } catch (error) {
      toast('SFTP disconnect failed', errorMessage(error), 'error');
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
      toast('File browser unavailable', 'Activate an SSH, FTP, or FTPS session before opening the file browser.', 'error');
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
    state.sftp.selectedPath = '';
    state.sftp.lastError = '';
    elements.sftpPath.value = path;
    elements.transferStatus.textContent = `Loading ${path}…`;
    elements.fileList.classList.add('loading');
    elements.fileList.setAttribute('aria-busy', 'true');
    updateSftpButtons();
    try {
      const entries = await api.sftp.list(profile, path);
      if (token !== state.sftp.requestToken) return;
      state.sftp.entries = entries;
      elements.transferStatus.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
      renderSftpEntries();
    } catch (error) {
      if (token !== state.sftp.requestToken) return;
      state.sftp.entries = [];
      state.sftp.lastError = errorMessage(error);
      elements.sftpEmpty.textContent = state.sftp.lastError;
      elements.transferStatus.textContent = 'SFTP connection failed';
      renderSftpEntries();
      toast('SFTP error', errorMessage(error), 'error');
    } finally {
      if (token === state.sftp.requestToken) {
        elements.fileList.classList.remove('loading');
        elements.fileList.setAttribute('aria-busy', 'false');
      }
    }
  }

  function renderSftpEntries() {
    elements.fileList.replaceChildren();
    for (const entry of state.sftp.entries) {
      const row = node('button', {
        type: 'button',
        className: `file-row${entry.path === state.sftp.selectedPath ? ' selected' : ''}`,
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
      row.addEventListener('click', () => {
        state.sftp.selectedPath = entry.path;
        for (const candidate of elements.fileList.querySelectorAll('.file-row')) {
          candidate.classList.toggle('selected', candidate.dataset.path === entry.path);
        }
        updateSftpButtons();
      });
      row.addEventListener('dblclick', () => activateSftpEntry(entry));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          activateSftpEntry(entry);
        }
      });
      elements.fileList.append(row);
    }
    const empty = !state.sftp.profile || state.sftp.entries.length === 0;
    elements.sftpEmpty.classList.toggle('visible', empty);
    if (state.sftp.profile && !state.sftp.entries.length && !state.sftp.lastError) {
      elements.sftpEmpty.textContent = 'This directory is empty.';
    }
    updateSftpButtons();
  }

  function activateSftpEntry(entry) {
    // Keyboard activation can land on a row that was never clicked, so the
    // activated entry must become the selection before the editor opens.
    state.sftp.selectedPath = entry.path;
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

  function updateSftpButtons() {
    const selected = selectedSftpEntry();
    const ready = Boolean(state.sftp.profile);
    elements.sftpUpload.disabled = !ready;
    elements.sftpMkdir.disabled = !ready;
    elements.sftpDownload.disabled = !selected || selected.directory;
    elements.sftpEdit.disabled = !selected || selected.directory;
    elements.sftpMore.disabled = !selected;
    elements.sftpUp.disabled = !ready || state.sftp.path === '/';
  }

  function renderTransferQueue() {
    const entries = state.transferQueue.entries;
    const container = document.getElementById('transfer-queue');
    if (!container) return;
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
    for (const entry of sorted) {
      const pct = entry.total > 0 ? Math.min(100, Math.round((entry.transferred / entry.total) * 100)) : 0;
      const statusIcon = entry.status === 'transferring' ? '↻' : entry.status === 'queued' ? '⋯' : entry.status === 'paused' || entry.status === 'pausing' ? '⏸' : entry.status === 'failed' ? '✗' : entry.status === 'completed' ? '✓' : '?';
      const actionButton = (entry.status === 'transferring' || entry.status === 'queued') && entry.pausable !== false
        ? node('button', { type: 'button', className: 'queue-action', text: '⏸', title: 'Pause' })
        : entry.status === 'paused'
          ? node('button', { type: 'button', className: 'queue-action', text: '▶', title: 'Resume' })
          : entry.status === 'failed'
            ? node('button', { type: 'button', className: 'queue-action', text: '↻', title: 'Retry' })
            : null;
      const cancelButton = entry.status === 'transferring' || entry.status === 'queued' || entry.status === 'paused'
        ? node('button', { type: 'button', className: 'queue-action queue-cancel', text: '×', title: 'Cancel' })
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
    if (sorted.some((entry) => entry.status === 'completed')) {
      const clearButton = node('button', { type: 'button', className: 'queue-clear-completed', text: 'Clear completed' });
      clearButton.addEventListener('click', async () => {
        try {
          state.transferQueue.entries = await api.transfer.clearCompleted() || [];
          renderTransferQueue();
        } catch (error) {
          toast('Could not clear transfers', errorMessage(error), 'error');
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
        toast('Upload queued', result.remotePath, 'success');
      }
    } catch (error) { toast('Upload failed', errorMessage(error), 'error'); }
  }

  async function handleSftpDrop(event) {
    event.preventDefault();
    elements.sftpPanel.classList.remove('drag-over');
    if (!state.sftp.profile) {
      toast('Open SFTP first', 'Drag files onto an active SFTP panel to upload.', 'error');
      return;
    }
    const files = [...(event.dataTransfer?.files || [])];
    const localPaths = files.map((file) => api.system.filePath(file)).filter(Boolean);
    if (!localPaths.length) {
      toast('No uploadable files', 'Aux Command could not resolve local paths for the dropped files.', 'error');
      return;
    }
    try {
      elements.transferStatus.textContent = `Uploading ${localPaths.length} dropped file${localPaths.length === 1 ? '' : 's'}…`;
      const result = await api.sftp.uploadPaths(state.sftp.profile, state.sftp.path, localPaths);
      const count = result.uploaded?.length || 0;
      toast('Uploads queued', `${count} file${count === 1 ? '' : 's'} added to the transfer queue`, 'success');
    } catch (error) {
      toast('Drop upload failed', errorMessage(error), 'error');
    }
  }

  function bindSftpDragAndDrop() {
    for (const target of [elements.sftpPanel, elements.fileList]) {
      target.addEventListener('dragover', (event) => {
        if (!state.sftp.profile) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        elements.sftpPanel.classList.add('drag-over');
        elements.transferStatus.textContent = 'Drag files here to upload';
      });
      target.addEventListener('dragleave', (event) => {
        if (!elements.sftpPanel.contains(event.relatedTarget)) elements.sftpPanel.classList.remove('drag-over');
      });
      target.addEventListener('drop', (event) => handleSftpDrop(event));
    }
  }

  async function downloadSelected() {
    const entry = selectedSftpEntry();
    if (!entry || entry.directory || !state.sftp.profile) return;
    try {
      const result = await api.sftp.download(state.sftp.profile, entry.path);
      if (!result.canceled) toast('Download queued', result.localPath, 'success');
    } catch (error) { toast('Download failed', errorMessage(error), 'error'); }
  }

  async function openRemoteTextEditor() {
    const entry = selectedSftpEntry();
    if (!entry || entry.directory || !state.sftp.profile) return;
    let original = '';
    try {
      elements.transferStatus.textContent = `Opening ${entry.path}…`;
      original = await api.sftp.readText(state.sftp.profile, entry.path);
      elements.transferStatus.textContent = `Editing ${entry.path}`;
    } catch (error) {
      toast('Remote edit failed', errorMessage(error), 'error');
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
      field('Remote path', remotePath, 'Path is read-only for this editor; use More → Rename to move files.', 'full'),
      field('File contents', editor, 'Inline editing is limited to UTF-8 text files up to 1 MB. Saving overwrites the remote file atomically via a temporary upload then rename.', 'full'),
      node('div', { className: 'warning-box full', text: 'Remote edits are live changes. Verify the target file and keep a backup or version-control path for production systems.' })
    ]);
    let controller;
    const save = async () => {
      if (editor.value === original) {
        toast('No remote changes', entry.name);
        return true;
      }
      await api.sftp.writeText(state.sftp.profile, entry.path, editor.value);
      toast('Remote file saved', entry.path, 'success');
      await loadSftp(state.sftp.path);
      return true;
    };
    controller = showModal({
      title: `Edit ${entry.name}`,
      description: entry.path,
      body: form,
      className: 'wide',
      actions: [
        { label: 'Cancel', busy: false },
        { label: 'Save remote file', className: 'primary', run: save }
      ]
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const close = await save();
        if (close) controller.close();
      } catch (error) {
        toast('Remote save failed', errorMessage(error), 'error');
      }
    });
  }

  async function makeRemoteDirectory() {
    if (!state.sftp.profile) return;
    const name = await askText({ title: 'New remote folder', label: 'Folder name', placeholder: 'logs' });
    if (!name) return;
    try {
      await api.sftp.mkdir(state.sftp.profile, joinRemote(state.sftp.path, name));
      await loadSftp(state.sftp.path);
      toast('Folder created', name, 'success');
    } catch (error) { toast('Could not create folder', errorMessage(error), 'error'); }
  }

  async function openSftpMore() {
    const entry = selectedSftpEntry();
    if (!entry || !state.sftp.profile) return;
    const body = node('div', { className: 'menu-stack' });
    const renameButton = node('button', { type: 'button', className: 'menu-action' }, [node('strong', { text: 'Rename' }), node('span', { text: entry.name })]);
    const deleteButton = node('button', { type: 'button', className: 'menu-action destructive' }, [node('strong', { text: 'Delete' }), node('span', { text: entry.directory ? 'Only empty remote folders can be removed.' : 'This cannot be undone.' })]);
    body.append(renameButton, deleteButton);
    const controller = showModal({ title: 'Remote item', body, className: 'narrow', actions: [{ label: 'Close', busy: false }] });
    renameButton.addEventListener('click', async () => {
      const name = await askText({ title: 'Rename remote item', label: 'New name', value: entry.name });
      if (!name || name === entry.name) return;
      try {
        await api.sftp.rename(state.sftp.profile, entry.path, joinRemote(state.sftp.path, name));
        controller.close();
        await loadSftp(state.sftp.path);
        toast('Remote item renamed', name, 'success');
      } catch (error) { toast('Rename failed', errorMessage(error), 'error'); }
    });
    deleteButton.addEventListener('click', async () => {
      const confirmed = await confirmAction({
        title: `Delete ${entry.directory ? 'folder' : 'file'}?`,
        description: `Permanently delete “${entry.name}” from ${state.sftp.path}?`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (!confirmed) return;
      try {
        await api.sftp.remove(state.sftp.profile, entry.path, entry.directory);
        controller.close();
        await loadSftp(state.sftp.path);
        toast('Remote item deleted', entry.name, 'success');
      } catch (error) { toast('Delete failed', errorMessage(error), 'error'); }
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
      ? `${running}/${active.length} tunnels`
      : `${running} tunnel${running === 1 ? '' : 's'}`;
    elements.tunnelStatusDots.replaceChildren();
    for (const tunnel of active.slice(0, 8)) {
      elements.tunnelStatusDots.append(node('span', {
        className: `cluster-dot status-${tunnel.status}`,
        title: `${tunnel.name} · ${tunnel.status}`
      }));
    }
    cluster.setAttribute('aria-label', `${active.length} active SSH tunnel${active.length === 1 ? '' : 's'} — open tunnel manager`);
  }

  function renderTunnelList(container) {
    container.replaceChildren();
    const tunnels = [...state.tunnels.values()].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    if (!tunnels.length) {
      container.append(node('div', { className: 'list-empty', text: 'No tunnels have been started in this session.' }));
      return;
    }
    for (const tunnel of tunnels) {
      const endpoint = tunnel.type === 'dynamic'
        ? `${tunnel.bindHost}:${tunnel.bindPort} (SOCKS)`
        : `${tunnel.bindHost}:${tunnel.bindPort} → ${tunnel.targetHost}:${tunnel.targetPort}`;
      const stop = node('button', { type: 'button', className: 'mini-button', text: tunnel.status === 'stopped' || tunnel.status === 'failed' ? 'Dismiss' : 'Stop' });
      const row = node('div', { className: `tunnel-row status-${tunnel.status}` }, [
        node('span', { className: 'tunnel-indicator' }),
        node('div', {}, [node('strong', { text: tunnel.name }), node('small', { text: `${tunnel.type.toUpperCase()} · ${endpoint}${tunnel.lastError ? ` · ${tunnel.lastError}` : ''}` })]),
        stop
      ]);
      stop.addEventListener('click', async () => {
        if (tunnel.status === 'stopped' || tunnel.status === 'failed') state.tunnels.delete(tunnel.id);
        else await api.tunnels.stop(tunnel.id).catch((error) => toast('Tunnel stop failed', errorMessage(error), 'error'));
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
    const type = selectInput('type', [['local', 'Local forward'], ['remote', 'Remote forward'], ['dynamic', 'Dynamic SOCKS proxy']], 'local');
    const name = textInput('name', 'Local tunnel');
    const bindHost = textInput('bindHost', '127.0.0.1');
    const bindPort = textInput('bindPort', '8080', { type: 'number', min: 1, max: 65535 });
    const targetHost = textInput('targetHost', '127.0.0.1');
    const targetPort = textInput('targetPort', '80', { type: 'number', min: 1, max: 65535 });
    const targetHostField = field('Target host', targetHost);
    const targetPortField = field('Target port', targetPort);
    const formRows = [
      field('SSH profile', profileSelect),
      field('Tunnel type', type),
      field('Name', name),
      field('Bind address', bindHost),
      field('Bind port', bindPort),
      targetHostField,
      targetPortField,
      node('div', { className: 'warning-box full', text: 'Managed tunnels use OpenSSH BatchMode. Configure key or SSH-agent authentication; interactive password and MFA prompts are not available for background tunnels.' })
    ];
    if (!sshProfiles.length) {
      formRows.unshift(node('div', { className: 'warning-box full', text: 'Create an SSH profile before starting a tunnel. Local, RDP, VNC, Telnet and serial profiles cannot own OpenSSH forwarding processes.' }));
    }
    const form = node('form', { className: 'form-grid compact-form' }, formRows);
    const list = node('div', { className: 'tunnel-list', attrs: { 'data-live-tunnel-list': 'true' } });
    const body = node('div', { className: 'modal-sections' }, [
      node('div', {}, [node('div', { className: 'section-title', text: 'Start tunnel' }), form]),
      node('div', {}, [node('div', { className: 'section-title', text: 'Session tunnels' }), list])
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
      title: 'SSH tunnels',
      description: 'Create local, remote, and dynamic OpenSSH forwarding processes.',
      body,
      className: 'wide',
      actions: [
        { label: 'Close', busy: false },
        {
          label: 'Start tunnel',
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
            toast('Tunnel starting', tunnel.name);
            return false;
          }
        }
      ]
    });
  }

  async function openDiagnosticsModal() {
    try { state.diagnostics = await api.system.diagnostics(); } catch (error) { toast('Diagnostics failed', errorMessage(error), 'error'); return; }
    const info = state.diagnostics;
    const list = node('div', { className: 'diagnostic-list' });
    for (const tool of info.tools || []) {
      list.append(node('div', { className: `diagnostic-row${tool.available ? ' available' : ''}` }, [
        node('span', { className: 'indicator' }),
        node('div', {}, [node('strong', { text: tool.name }), node('small', { text: tool.available ? tool.executable : `Missing · ${tool.candidates.join(' / ')}` })]),
        node('span', { className: 'diagnostic-state', text: tool.available ? 'Ready' : 'Install' })
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
        node('span', { className: 'diagnostic-state', text: capability.available ? 'Ready' : 'Missing' })
      ]));
    }
    const updateStatus = state.updates || { supported: false };
    const body = node('div', { className: 'modal-sections' }, [
      node('div', { className: 'system-summary' }, [
        node('div', {}, [node('span', { text: 'Platform' }), node('strong', { text: `${info.platform} · ${info.architecture}` })]),
        node('div', {}, [node('span', { text: 'Host' }), node('strong', { text: info.hostname })]),
        node('div', {}, [node('span', { text: 'Shell' }), node('strong', { text: info.shell || 'Unknown' })]),
        node('div', {}, [node('span', { text: 'SSH agent' }), node('strong', { text: info.sshAgent ? 'Available' : 'Not detected' })])
      ]),
      updateReleaseSection(updateStatus, () => {
        // Refresh by replacing the open dialog instead of stacking a second one.
        controller.close();
        openDiagnosticsModal();
      }),
      node('div', {}, [node('div', { className: 'section-title', text: 'Protocol capabilities' }), protocolList]),
      node('div', {}, [node('div', { className: 'section-title', text: 'Runtime tools' }), list]),
      node('div', { className: 'warning-box', text: 'Aux Command bundles local PTY, graphical SFTP, Telnet and serial bridges. RDP, VNC and Mosh still depend on host-installed clients/servers; X11 forwarding uses OpenSSH -X and the host display.' })
    ]);
    const controller = showModal({ title: 'System diagnostics', description: 'Protocol support detected on this Linux host.', body, className: 'wide', actions: [{ label: 'Close', busy: false }] });
  }

  function openLiveMonitor() {
    const sshProfiles = state.profiles.filter((profile) => profile.protocol === 'ssh');
    if (!sshProfiles.length) {
      showModal({
        title: 'Live server monitor',
        description: 'Read-only CPU, memory, disk, process and listening-socket data over SSH.',
        body: node('div', { className: 'empty-state', text: 'Create or import an SSH profile before using the live monitor.' }),
        className: 'wide',
        actions: [{ label: 'Close', busy: false }]
      });
      return;
    }
    const profileSelect = selectInput('profileId', sshProfiles.map((profile) => [profile.id, profile.name]), sshProfiles[0].id);
    const autoRefresh = checkbox('autoRefresh', 'Refresh every 10 seconds');
    const output = node('div', { className: 'modal-sections' }, node('div', { className: 'empty-state', text: 'Select an SSH profile and capture a snapshot.' }));
    const refresh = node('button', { type: 'button', className: 'button primary', text: 'Capture snapshot' });
    const controls = node('div', { className: 'modal-sections' }, [
      node('div', { className: 'form-grid' }, [field('SSH profile', profileSelect, '', 'full'), node('div', { className: 'full' }, autoRefresh)]),
      node('div', { className: 'button-row' }, refresh),
      output
    ]);
    let running = false;
    let timer = null;
    const capture = async () => {
      if (running) return;
      running = true;
      refresh.disabled = true;
      refresh.textContent = 'Capturing...';
      try {
        const profile = sshProfiles.find((item) => item.id === profileSelect.value);
        const result = await api.monitor.snapshot(profile);
        output.replaceChildren();
        for (const [key, value] of Object.entries(result.sections || {})) {
          output.append(node('section', {}, [
            node('div', { className: 'section-title', text: key.replaceAll('_', ' ') }),
            node('pre', { className: 'network-output', text: value || 'No data' })
          ]));
        }
        if (!output.childElementCount) output.append(node('div', { className: 'empty-state', text: 'The host returned no monitor data.' }));
        setStatus(`Monitor snapshot captured for ${profile.name}`);
      } catch (error) {
        output.replaceChildren(node('div', { className: 'warning-box danger-box', text: errorMessage(error) }));
        toast('Monitor snapshot failed', errorMessage(error), 'error');
      } finally {
        running = false;
        refresh.disabled = false;
        refresh.textContent = 'Capture snapshot';
      }
    };
    refresh.addEventListener('click', capture);
    autoRefresh.querySelector('input').addEventListener('change', (event) => {
      if (timer) window.clearInterval(timer);
      timer = event.target.checked ? window.setInterval(capture, 10_000) : null;
      if (event.target.checked) capture();
    });
    const controller = showModal({
      title: 'Live server monitor',
      description: 'Read-only CPU, memory, disk, process and listening-socket data over SSH.',
      body: controls,
      className: 'wide',
      actions: [{ label: 'Close', busy: false }]
    });
    controller.onClose(() => { if (timer) window.clearInterval(timer); });
  }

  async function openRemoteDesktopGateway() {
    const sshProfiles = state.profiles.filter((profile) => profile.protocol === 'ssh');
    if (!sshProfiles.length) {
      showModal({
        title: 'Remote desktop gateway',
        description: 'Open RDP or VNC through an SSH local-forwarding gateway.',
        body: node('div', { className: 'empty-state', text: 'Create or import an SSH profile before opening a remote desktop gateway.' }),
        className: 'wide',
        actions: [{ label: 'Close', busy: false }]
      });
      return;
    }
    const gatewaySelect = selectInput('gatewayProfileId', sshProfiles.map((profile) => [profile.id, profile.name]), sshProfiles[0].id);
    const protocolSelect = selectInput('protocol', [['rdp', 'RDP'], ['vnc', 'VNC']], 'rdp');
    const hostInput = textInput('targetHost', '', { placeholder: '10.0.0.10', required: 'required' });
    const portInput = textInput('targetPort', '3389', { type: 'number', min: '1', max: '65535' });
    const localPortInput = textInput('localPort', '', { type: 'number', min: '1024', max: '65535', placeholder: 'automatic' });
    const usernameInput = textInput('username', '', { autocomplete: 'username', placeholder: 'optional' });
    const domainInput = textInput('rdpDomain', '', { placeholder: 'optional, e.g. CORP' });
    const connectButton = node('button', { type: 'button', className: 'button primary', text: 'Open remote desktop' });
    const sessionsHost = node('div', { className: 'modal-sections' });
    const renderSessions = async () => {
      const sessions = await api.gateway.list();
      sessionsHost.replaceChildren(node('div', { className: 'section-title', text: 'Active gateways' }));
      if (!sessions.length) {
        sessionsHost.append(node('div', { className: 'empty-state', text: 'No remote desktop gateways are running.' }));
        return;
      }
      for (const session of sessions) {
        const stop = node('button', { type: 'button', className: 'button', text: 'Stop' });
        stop.addEventListener('click', async () => {
          try {
            await api.gateway.disconnect(session.id);
            await renderSessions();
          } catch (error) {
            toast('Gateway stop failed', errorMessage(error), 'error');
          }
        });
        sessionsHost.append(node('div', { className: 'diagnostic-row' }, [
          node('span', { className: 'indicator' }),
          node('div', {}, [node('strong', { text: `${session.protocol.toUpperCase()} ${session.targetHost}:${session.targetPort}` }), node('small', { text: `${session.gatewayName} via localhost:${session.localPort}` })]),
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
      connectButton.textContent = 'Opening gateway...';
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
        setStatus(`${result.protocol.toUpperCase()} gateway connected on localhost:${result.localPort}`);
        await renderSessions();
      } catch (error) {
        toast('Could not open remote desktop gateway', errorMessage(error), 'error');
      } finally {
        connectButton.disabled = false;
        connectButton.textContent = 'Open remote desktop';
      }
    });
    const body = node('div', { className: 'modal-sections' }, [
      node('div', { className: 'form-grid' }, [
        field('SSH gateway', gatewaySelect),
        field('Desktop protocol', protocolSelect),
        field('Target host', hostInput),
        field('Target port', portInput),
        field('Local forwarding port', localPortInput, 'Leave empty to choose a free local port.'),
        field('Remote desktop username', usernameInput, 'The native client handles any password prompt.'),
        field('RDP domain', domainInput, 'Windows logon domain passed to FreeRDP as /d:.')
      ]),
      node('div', { className: 'button-row' }, connectButton),
      node('div', { className: 'warning-box', text: 'The SSH tunnel must confirm forwarding readiness before Aux Command starts the native RDP or VNC client.' }),
      sessionsHost
    ]);
    const controller = showModal({
      title: 'Remote desktop gateway',
      description: 'Reach an internal RDP or VNC service through a saved SSH gateway profile.',
      body,
      className: 'wide',
      actions: [{ label: 'Close', busy: false }]
    });
    const unsubscribe = api.gateway.onStatus(() => { if (controller.modal.isConnected) renderSessions().catch(() => {}); });
    controller.onClose(unsubscribe);
    await renderSessions();
  }

  async function openProfileSync() {
    const [config, initialStatus] = await Promise.all([api.sync.config(), api.sync.status()]);
    let currentStatus = initialStatus;
    const sshProfiles = state.profiles.filter((profile) => profile.protocol === 'ssh');
    const typeSelect = selectInput('type', [['file', 'Local file'], ['http', 'HTTP'], ['https', 'HTTPS'], ['ssh', 'SSH / SFTP']], config?.type || 'file');
    const sourceInput = textInput('source', config?.url || '', { placeholder: '/path/to/profiles.json' });
    const profileSelect = selectInput('profileId', sshProfiles.map((profile) => [profile.id, profile.name]), config?.profileId || sshProfiles[0]?.id || '');
    const intervalInput = textInput('intervalMinutes', String(config?.intervalMinutes || 60), { type: 'number', min: '1', max: '1440' });
    const sourceField = field('Profile source', sourceInput, 'A JSON array or an object with a profiles array.', 'full');
    const profileField = field('SSH profile', profileSelect, 'The remote file is read through this saved SSH profile.', 'full');
    const statusBox = node('div', { className: 'warning-box' });
    const renderStatus = () => {
      statusBox.textContent = currentStatus.configured
        ? `Configured: ${currentStatus.type}. Last sync: ${currentStatus.lastSyncAt || 'never'}. ${currentStatus.lastError ? `Last error: ${currentStatus.lastError}` : ''}`
        : 'Profile synchronization is disabled.';
      statusBox.classList.toggle('danger-box', Boolean(currentStatus.lastError));
    };
    const updateFields = () => {
      const ssh = typeSelect.value === 'ssh';
      profileField.hidden = !ssh;
      sourceInput.placeholder = ssh ? '/remote/path/profiles.json' : typeSelect.value === 'file' ? '/path/to/profiles.json' : `${typeSelect.value}://host/profiles.json`;
    };
    typeSelect.addEventListener('change', updateFields);
    updateFields();
    renderStatus();
    const body = node('div', { className: 'modal-sections' }, [
      node('div', { className: 'form-grid' }, [
        field('Source type', typeSelect),
        field('Sync interval in minutes', intervalInput),
        sourceField,
        profileField
      ]),
      statusBox,
      node('div', { className: 'warning-box', text: 'Credentials and private-key material are never imported from a sync source. Existing local credentials stay local.' })
    ]);
    // showModal restores every footer button's pre-click disabled state after
    // an action resolves, so availability is re-derived one tick later.
    const refreshAvailability = () => window.setTimeout(() => {
      const configured = Boolean(currentStatus.configured);
      for (const footerButton of controller.footer.querySelectorAll('button')) {
        if (footerButton.textContent === 'Disable' || footerButton.textContent === 'Sync now') {
          footerButton.disabled = !configured;
        }
      }
    }, 0);
    const controller = showModal({
      title: 'Profile synchronization',
      description: 'Keep non-secret connection profiles aligned from a local, web or SSH-hosted JSON file.',
      body,
      className: 'wide',
      actions: [
        { label: 'Close', busy: false },
        {
          label: 'Disable',
          disabled: !currentStatus.configured,
          run: async () => {
            currentStatus = await api.sync.disable();
            renderStatus();
            refreshAvailability();
            setStatus('Profile synchronization disabled');
            return false;
          }
        },
        {
          label: 'Sync now',
          className: 'button',
          disabled: !currentStatus.configured,
          run: async () => {
            const result = await api.sync.syncNow();
            currentStatus = await api.sync.status();
            state.profiles = await api.profiles.list();
            renderProfiles();
            renderStatus();
            refreshAvailability();
            setStatus(`Profile sync complete: ${result.added} added, ${result.updated} updated`);
            return false;
          }
        },
        {
          label: 'Save configuration',
          className: 'primary',
          run: async () => {
            const intervalMinutes = Number(intervalInput.value);
            const next = { type: typeSelect.value, url: sourceInput.value.trim(), intervalMinutes };
            if (typeSelect.value === 'ssh') next.profileId = profileSelect.value;
            await api.sync.configure(next);
            currentStatus = await api.sync.status();
            renderStatus();
            refreshAvailability();
            setStatus('Profile synchronization configured');
            return false;
          }
        }
      ]
    });
  }

  async function openSshKeyManager() {
    const name = textInput('name', 'id_aux_command', { required: true, maxlength: 64 });
    const type = selectInput('type', [['ed25519', 'Ed25519'], ['rsa', 'RSA 4096']], 'ed25519');
    const passphrase = textInput('passphrase', '', { type: 'password', required: false, maxlength: 4096 });
    const generate = node('button', { type: 'button', className: 'primary', text: 'Generate key' });
    const form = node('form', { className: 'form-grid compact-form' }, [
      field('Key name', name, 'Letters, numbers, dots, underscores, and hyphens only.'),
      field('Type', type),
      field('Passphrase', passphrase, 'Optional. The passphrase is never stored by Aux Command.', 'full'),
      node('div', { className: 'full' }, generate)
    ]);
    const list = node('div', { className: 'tunnel-list', attrs: { 'aria-live': 'polite' } });
    const body = node('div', { className: 'modal-sections' }, [
      node('div', {}, [node('div', { className: 'section-title', text: 'Generate key pair' }), form]),
      node('div', {}, [node('div', { className: 'section-title', text: 'Local SSH keys' }), list])
    ]);
    showModal({
      title: 'SSH Key Manager',
      description: 'Generate and manage key pairs in your local SSH directory. Private key contents never enter the renderer.',
      body,
      actions: [{ label: 'Close', busy: false }]
    });

    const refresh = async () => {
      list.replaceChildren(node('div', { className: 'list-empty', text: 'Loading SSH keys…' }));
      const keys = await api.sshKeys.list();
      list.replaceChildren();
      if (!keys.length) {
        list.append(node('div', { className: 'list-empty', text: 'No SSH key pairs were found.' }));
        return;
      }
      for (const key of keys) {
        const copy = node('button', { type: 'button', className: 'mini-button', text: 'Copy public' });
        const remove = node('button', { type: 'button', className: 'mini-button destructive', text: 'Delete' });
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
            toast('Public key copied', key.name, 'success');
          } catch (error) {
            toast('Public key copy failed', errorMessage(error), 'error');
          }
        });
        remove.addEventListener('click', async () => {
          const confirmed = await confirmAction({
            title: 'Delete SSH key pair?',
            description: `Delete the local private and public key files for “${key.name}”? This cannot be undone.`,
            confirmLabel: 'Delete key pair',
            danger: true
          });
          if (!confirmed) return;
          try {
            await api.sshKeys.delete(key.name);
            toast('SSH key deleted', key.name, 'success');
            await refresh();
          } catch (error) {
            toast('SSH key delete failed', errorMessage(error), 'error');
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
        toast('SSH key generated', `${created.name} · ${created.fingerprint}`, 'success');
        await refresh();
      } catch (error) {
        toast('SSH key generation failed', errorMessage(error), 'error');
      } finally {
        generate.disabled = false;
      }
    });
    form.addEventListener('submit', (event) => { event.preventDefault(); generate.click(); });
    await refresh();
  }

  function openNetworkTools() {
    const toolTabs = ['Ping', 'Traceroute', 'DNS lookup', 'Port scan', 'Whois', 'Wake-on-LAN'];
    const tabBar = node('div', { className: 'network-tabbar', attrs: { role: 'tablist', 'aria-label': 'Network tool' } });
    const output = node('div', { className: 'network-output', attrs: { role: 'status', 'aria-live': 'polite', style: 'min-height:200px;overflow:auto;font-family:var(--mono);font-size:11px;white-space:pre-wrap;line-height:1.5' } });
    const inputRow = node('div', { className: 'network-input-row', attrs: { style: 'display:grid;grid-template-columns:1fr auto auto;gap:8px' } });
    const input = node('input', { type: 'text', placeholder: 'hostname or IP', attrs: { 'aria-label': 'Network target', style: 'height:34px;border:1px solid var(--line);border-radius:8px;background:rgba(5,15,22,.72);color:var(--text);padding:0 10px' } });
    const runButton = node('button', { type: 'button', className: 'button primary', text: 'Run' });
    const cancelButton = node('button', { type: 'button', className: 'button', text: 'Cancel', attrs: { 'aria-label': 'Cancel running network command' } });
    cancelButton.hidden = true;
    inputRow.append(input, runButton, cancelButton);
    const extraInput = node('input', { type: 'text', placeholder: 'optional: count / port list / DNS type', attrs: { 'aria-label': 'Network tool options', style: 'height:34px;border:1px solid var(--line);border-radius:8px;background:rgba(5,15,22,.72);color:var(--text);padding:0 10px;display:none' } });
    let activeTool = 'Ping';

    const tabs = toolTabs.map((name) => {
      const btn = node('button', { type: 'button', className: 'mini-button', text: name, attrs: { role: 'tab', 'aria-selected': 'false' } });
      btn.addEventListener('click', () => {
        tabs.forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        activeTool = name;
        extraInput.style.display = ['Ping', 'Port scan', 'DNS lookup'].includes(name) ? 'block' : 'none';
        extraInput.placeholder = name === 'Ping' ? 'Count (default 4)' : name === 'Port scan' ? 'Comma-separated ports' : 'Record type (A/MX/TXT/AAAA)';
        input.placeholder = name === 'Whois' ? 'Domain or IP' : name === 'Wake-on-LAN' ? 'MAC address (xx:xx:xx:xx:xx:xx)' : 'Hostname or IP';
        output.textContent = 'Ready. Enter a target and click Run.';
      });
      return btn;
    });
    tabBar.append(...tabs);
    tabs[0].classList.add('active');
    tabs[0].setAttribute('aria-selected', 'true');

    runButton.addEventListener('click', async () => {
      const target = input.value.trim();
      if (!target) { output.textContent = 'Enter a target first.'; return; }
      output.textContent = 'Running...';
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
            const ports = (extraInput.value || '22,80,443,8080,3306,8443,9090,3000').split(',').map((p) => parseInt(p.trim())).filter((p) => p > 0 && p < 65536);
            result = await api.network.portScan(target, ports);
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
        output.textContent = 'Error: ' + (error.message || String(error));
      }
      runButton.disabled = false;
      cancelButton.hidden = true;
      tabs.forEach((tab) => { tab.disabled = false; });
    });

    cancelButton.addEventListener('click', async () => {
      const cancelled = await api.network.cancelAll();
      output.textContent = cancelled ? 'Cancelling network command…' : 'No cancellable network command is running.';
      cancelButton.disabled = true;
    });

    const body = node('div', { className: 'modal-sections' }, [
      node('div', {}, [node('div', { className: 'section-title', text: 'Tool' }), tabBar]),
      node('div', {}, [node('div', { className: 'section-title', text: 'Target' }), inputRow, extraInput]),
      node('div', {}, [node('div', { className: 'section-title', text: 'Output' }), output])
    ]);
    const controller = showModal({ title: 'Network tools', description: 'Ping, traceroute, DNS, port scan, whois, and Wake-on-LAN.', body, className: 'wide' });
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
    const message = data.changed
      ? `The host key for ${data.host}:${data.port} has changed. This can indicate a rebuilt server or a man-in-the-middle attack. Verify the fingerprint through a trusted channel before continuing.`
      : `Aux Command has not seen the host key for ${data.host}:${data.port}. Verify the fingerprint before trusting this server.`;
    const body = node('div', { className: 'prompt-stack' }, [
      node('div', { className: data.changed ? 'warning-box danger-box' : 'warning-box', text: message }),
      node('div', { className: 'fingerprint', text: data.fingerprint || 'Fingerprint unavailable' }),
      data.previousFingerprint ? node('div', { className: 'previous-fingerprint' }, [node('span', { text: 'Previously trusted' }), node('code', { text: data.previousFingerprint })]) : null
    ]);
    let controller;
    controller = showModal({
      title: data.changed ? 'Host identity changed' : 'Trust SSH host?',
      description: `${data.profileName || 'SSH profile'} · ${data.host}:${data.port}`,
      body,
      className: 'narrow',
      closeable: false,
      actions: [
        { label: 'Reject', className: data.changed ? 'danger' : '', busy: false, run: () => { finishPrompt(request, { accept: false }, controller); return false; } },
        { label: 'Accept once', busy: false, run: () => { finishPrompt(request, { accept: true, remember: false }, controller); return false; } },
        { label: 'Trust and remember', className: 'primary', busy: false, run: () => { finishPrompt(request, { accept: true, remember: true }, controller); return false; } }
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
        { label: 'Cancel', busy: false, run: () => { finishPrompt(request, { answers: [] }, controller); return false; } },
        { label: 'Continue', className: 'primary', busy: false, run: () => { submit(); return false; } }
      ]
    });
    form.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
  }

  function subscribeEvents() {
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
    api.terminal.onExit(({ id, exitCode, signal }) => {
      const tab = state.tabs.get(id);
      if (!tab) return;
      tab.closed = true;
      tab.tabElement.classList.add('closed');
      tab.terminal.write(`\r\n\x1b[90m[Process exited${signal ? ` with signal ${signal}` : ` with code ${exitCode}`} — press Ctrl+W to close]\x1b[0m\r\n`);
      if (state.activeTabId === id) setStatus(`Session exited with ${signal || exitCode}`);
    });
    api.tunnels.onStatus((tunnel) => {
      state.tunnels.set(tunnel.id, tunnel);
      document.querySelectorAll('[data-live-tunnel-list]').forEach((container) => renderTunnelList(container));
      renderTunnelStatusCluster();
      if (tunnel.status === 'running') toast('Tunnel ready', tunnel.name, 'success');
      if (tunnel.status === 'failed') toast('Tunnel failed', tunnel.lastError || tunnel.name, 'error');
    });
    api.sync.onStatus((status) => {
      // Background timer syncs mutate the profile store in the main process;
      // the sidebar must follow without requiring a manual refresh.
      if (!status?.configured) return;
      if (status.lastError) {
        toast('Profile sync failed', status.lastError, 'error');
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
      if (state.sftp.profile?.id === profileId) toast('SFTP connection error', message, 'error');
    });
    api.transfer.onUpdate((entry) => {
      const idx = state.transferQueue.entries.findIndex((e) => e.id === entry.id);
      if (entry.status === 'cancelled') {
        if (idx >= 0) state.transferQueue.entries.splice(idx, 1);
        renderTransferQueue();
        return;
      }
      if (idx >= 0) state.transferQueue.entries[idx] = entry;
      else state.transferQueue.entries.push(entry);
      if (entry.status === 'completed' && !state.transferQueue.expanded) {
        toast('Transfer complete', entry.fileName, 'success');
      }
      if (entry.status === 'completed' && entry.direction === 'upload' && state.sftp.open && state.sftp.profile?.id === entry.profileId) {
        loadSftp(state.sftp.path).catch(() => {});
      }
      if (entry.status === 'failed' && !state.transferQueue.expanded) {
        toast('Transfer failed', `${entry.fileName}: ${entry.error}`, 'error');
      }
      renderTransferQueue();
    });
    api.transfer.onList((entries) => {
      state.transferQueue.entries = Array.isArray(entries) ? entries : [];
      renderTransferQueue();
    });
    api.updates.onStatus((status) => updateUpdateState(status));
    api.prompts.onRequest(queuePrompt);
  }

  function bindUi() {
    elements.sidebarToggle.addEventListener('click', () => {
      const open = elements.appShell.classList.toggle('sidebar-open');
      elements.sidebarToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
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
    elements.sshKeysButton.addEventListener('click', () => openSshKeyManager().catch((error) => toast('Could not open SSH Key Manager', errorMessage(error), 'error')));
    elements.networkToolsButton = document.getElementById('network-tools-button');
    if (elements.networkToolsButton) elements.networkToolsButton.addEventListener('click', openNetworkTools);
    elements.monitorButton.addEventListener('click', openLiveMonitor);
    elements.gatewayButton.addEventListener('click', () => openRemoteDesktopGateway().catch((error) => toast('Could not open desktop gateway', errorMessage(error), 'error')));
    elements.syncButton.addEventListener('click', () => openProfileSync().catch((error) => toast('Could not open profile sync', errorMessage(error), 'error')));
    elements.websiteButton.addEventListener('click', () => api.system.openWebsite().catch((error) => toast('Could not open website', errorMessage(error), 'error')));
    elements.newProfileButton.addEventListener('click', () => openProfileModal());
    elements.newGroupButton.addEventListener('click', () => createGroup().catch((error) => toast('Could not create group', errorMessage(error), 'error')));
    elements.paletteButton.addEventListener('click', () => openCommandPalette());
    elements.statusbarWebsite.addEventListener('click', () => api.system.openWebsite().catch((error) => toast('Could not open website', errorMessage(error), 'error')));
    elements.profileSearch.addEventListener('input', renderProfiles);
    elements.importSshButton.addEventListener('click', () => importSshConfig().catch(() => {}));
    elements.profileMenuButton.addEventListener('click', openProfileDataMenu);
    elements.welcomeLocal.addEventListener('click', () => connectProfile(localProfile()));
    elements.welcomeProfile.addEventListener('click', () => openProfileModal());
    elements.welcomeImport.addEventListener('click', () => importSshConfig().catch(() => {}));
    elements.layoutToggle.addEventListener('click', toggleTerminalLayout);
    elements.broadcastToggle.addEventListener('click', toggleBroadcastInput);
    elements.terminalSearchToggle.addEventListener('click', openTerminalSearch);
    elements.highlightToggle.addEventListener('click', () => openHighlightManager());
    elements.exportTranscriptButton.addEventListener('click', () => exportActiveTranscript().catch((error) => toast('Transcript export failed', errorMessage(error), 'error')));
    elements.terminalLogButton.addEventListener('click', () => toggleTerminalLogging().catch((error) => toast('Terminal logging failed', errorMessage(error), 'error')));
    elements.macroRecordButton.addEventListener('click', () => toggleMacroRecording().catch((error) => toast('Macro recording failed', errorMessage(error), 'error')));
    elements.duplicateSessionButton.addEventListener('click', () => duplicateActiveSession().catch((error) => toast('Duplicate failed', errorMessage(error), 'error')));
    elements.reconnectSessionButton.addEventListener('click', () => reconnectActiveSession().catch((error) => toast('Reconnect failed', errorMessage(error), 'error')));
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
    if (modifier && !event.shiftKey && event.key.toLowerCase() === 'k') {
      run(() => {
        elements.quickInput.focus();
        elements.quickInput.select();
      });
    }
    if (modifier && !event.shiftKey && event.code === 'KeyF') run(() => openTerminalSearch());
    if (modifier && event.shiftKey && event.key.toLowerCase() === 't') run(() => connectProfile(localProfile()));
    if (modifier && event.shiftKey && event.code === 'KeyP') run(() => openCommandPalette());
    if (modifier && event.shiftKey && event.code === 'KeyD') {
      run(() => duplicateActiveSession().catch((error) => toast('Duplicate failed', errorMessage(error), 'error')));
    }
    if (modifier && event.shiftKey && event.code === 'KeyR') {
      run(() => reconnectActiveSession().catch((error) => toast('Reconnect failed', errorMessage(error), 'error')));
    }
    if (modifier && event.shiftKey && event.code === 'Minus') run(() => adjustPaneSize(-40));
    if (modifier && event.shiftKey && event.code === 'Equal') run(() => adjustPaneSize(40));
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'f') run(() => toggleSftp());
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'l') run(() => toggleTerminalLayout());
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'b') run(() => toggleBroadcastInput());
    if (modifier && event.shiftKey && event.key.toLowerCase() === 's') run(() => openSnippetsModal());
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'h') run(() => toggleHighlighting());
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'y') run(() => openHistorySearch());
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'm') run(() => openMultiRunModal());
    if (modifier && !event.shiftKey && event.key.toLowerCase() === 'w' && state.activeTabId) {
      run(() => requestCloseTab(state.activeTabId));
    }
    if (handled) event.auxShortcutHandled = true;
    return handled;
  }

  async function initialize() {
    subscribeEvents();
    bindUi();
    applyPaneSize();
    elements.appShell.setAttribute('aria-busy', 'true');
    elements.initializationError.hidden = true;
    setStatus('Loading workspace…', 'busy');
    try {
      const initial = await api.app.getState();
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
      restoreInitialSessions(initial.sessions || []);
      api.transfer.list().then((entries) => {
        state.transferQueue.entries = Array.isArray(entries) ? entries : [];
        renderTransferQueue();
      }).catch(() => { /* queue hydration is best-effort */ });

      // Restore persisted sessions only after reattaching still-live backend sessions.
      await restoreSavedSessions();
      elements.appVersion.textContent = `Aux Command ${initial.version}`;
      const agentAvailable = Boolean(initial.diagnostics?.sshAgent);
      elements.agentStatus.textContent = agentAvailable ? 'SSH agent ready' : 'No SSH agent';
      elements.agentStatus.classList.toggle('good', agentAvailable);
      elements.sftpEmpty.classList.add('visible');
      elements.appShell.setAttribute('aria-busy', 'false');
      state.initializing = false;
      elements.initializationError.hidden = true;
      setStatus('Ready');
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
