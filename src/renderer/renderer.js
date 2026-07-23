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
    updatesButton: $('#updates-button'),
    diagnosticsButton: $('#diagnostics-button'),
    websiteButton: $('#website-button'),
    newProfileButton: $('#new-profile-button'),
    profileSearch: $('#profile-search'),
    importSshButton: $('#import-ssh-button'),
    profileMenuButton: $('#profile-menu-button'),
    profileList: $('#profile-list'),
    connectionCount: $('#connection-count'),
    agentStatus: $('#agent-status'),
    tabbar: $('#session-tabs'),
    tabbarSpacer: $('.tabbar-spacer'),
    layoutToggle: $('#layout-toggle'),
    broadcastToggle: $('#broadcast-toggle'),
    broadcastWarning: $('#broadcast-warning'),
    terminalSearchToggle: $('#terminal-search-toggle'),
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
    modalRoot: $('#modal-root')
  };

  const state = {
    profiles: [],
    snippets: [],
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
      syncToken: 0,
      path: '/',
      entries: [],
      selectedPath: '',
      requestToken: 0,
      lastError: ''
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
    if (status.downloaded) return `Downloaded ${status.latestVersion || 'update'}; restart to install.`;
    if (status.updateAvailable) return `Available: ${status.latestVersion || 'new version'}`;
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
        node('span', { className: 'diagnostic-state', text: updateStatus.supported ? 'GitHub' : 'Source' })
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
      node('div', { className: 'warning-box', text: 'Updates are delivered through GitHub Releases. Draft releases are internal review artifacts; updater discovery requires a published release.' })
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
        try {
          if (action.busy !== false) buttons.forEach((item) => { item.disabled = true; });
          const shouldClose = action.run ? await action.run({ close, modal, body: bodyElement, button }) : true;
          if (shouldClose !== false) close();
          else buttons.forEach((item) => { item.disabled = false; });
        } catch (error) {
          toast('Operation failed', errorMessage(error), 'error');
          buttons.forEach((item) => { item.disabled = false; });
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

    const sortedGroups = [...grouped.entries()].sort(([a], [b]) => {
      if (a === 'Local') return -1;
      if (b === 'Local') return 1;
      return a.localeCompare(b);
    });

    for (const [group, profiles] of sortedGroups) {
      const section = node('section', { className: 'profile-group' });
      section.append(node('div', { className: 'profile-group-title' }, [
        node('span', { text: group }),
        node('span', { text: profiles.length })
      ]));
      profiles.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
      for (const profile of profiles) {
        const connectButton = node('button', {
          type: 'button',
          className: 'profile-connect',
          attrs: { 'aria-label': `Connect to ${profile.name}, ${formatTarget(profile)}` }
        }, [
          node('span', { className: 'protocol-badge', text: profile.protocol === 'local' ? 'TERM' : profile.protocol }),
          node('span', { className: 'profile-copy' }, [
            node('strong', { text: `${profile.favorite ? '★ ' : ''}${profile.name}` }),
            node('small', { text: formatTarget(profile) })
          ]),
          node('span', { className: 'profile-connect-label', text: 'Connect' })
        ]);
        const editButton = node('button', { type: 'button', className: 'profile-edit', text: '•••', title: `Edit ${profile.name}`, attrs: { 'aria-label': `Edit ${profile.name}` } });
        const item = node('div', {
          className: `profile-item${profile.id === state.selectedProfileId ? ' selected' : ''}`,
          attrs: { role: 'listitem' }
        }, [connectButton, editButton]);
        connectButton.addEventListener('focus', () => {
          state.selectedProfileId = profile.id;
          elements.profileList.querySelectorAll('.profile-item.selected').forEach((candidate) => candidate.classList.remove('selected'));
          item.classList.add('selected');
        });
        connectButton.addEventListener('click', () => connectProfile(profile));
        editButton.addEventListener('click', () => openProfileModal(profile));
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
      try {
        const result = await runTask(`Launching ${profile.protocol.toUpperCase()}…`, () => api.external.launch(profile), `${profile.protocol.toUpperCase()} launched`);
        toast(`${profile.protocol.toUpperCase()} client launched`, result.executable, 'success');
      } catch { /* runTask already surfaced the error */ }
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
      resizeTimer: 0
    };
    state.tabs.set(session.id, tab);
    observeResizablePane(tab);

    terminal.onData((data) => {
      const targets = state.broadcastInput ? [...state.tabs.values()] : [tab];
      for (const target of targets) {
        if (!target.closed) api.terminal.write(target.id, data).catch((error) => toast('Terminal input failed', errorMessage(error), 'error'));
      }
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

  function closeTerminalSearch() {
    const panel = elements.terminalSearchHost.querySelector('.terminal-search-panel');
    panel?.remove();
    state.terminalSearchOpen = false;
    elements.terminalSearchToggle.classList.remove('active');
    elements.terminalSearchToggle.setAttribute('aria-pressed', 'false');
    activeTab()?.terminal.focus();
  }

  function runTerminalSearch(direction = 'next') {
    const tab = activeTab();
    const query = state.terminalSearchQuery.trim();
    if (!tab || !query) return false;
    const options = { caseSensitive: false, wholeWord: false, regex: false, incremental: false };
    return direction === 'previous' ? tab.searchAddon.findPrevious(query, options) : tab.searchAddon.findNext(query, options);
  }

  function openTerminalSearch() {
    const tab = activeTab();
    if (!tab) {
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
    const ssh = tab?.profile?.protocol === 'ssh';
    elements.layoutToggle.disabled = tabCount < 2 && state.layout !== 'grid';
    elements.broadcastToggle.disabled = tabCount < 2;
    elements.terminalSearchToggle.disabled = !tab;
    elements.duplicateSessionButton.disabled = !tab;
    elements.reconnectSessionButton.disabled = !tab;
    elements.paneShrinkButton.disabled = state.layout !== 'grid';
    elements.paneGrowButton.disabled = state.layout !== 'grid';
    elements.sftpToggle.disabled = !ssh;
    elements.sftpToggle.title = ssh ? 'Toggle SFTP panel (Ctrl+Shift+F)' : 'SFTP requires an active SSH session';
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
      const names = [...state.tabs.values()].map((tab) => tab.title).join(', ');
      elements.broadcastWarning.querySelector('span').textContent = `Keyboard input is being sent to ${state.tabs.size} terminals: ${names}`;
    }
  }

  async function toggleBroadcastInput() {
    if (state.tabs.size < 2 && !state.broadcastInput) {
      toast('Open another session first', 'Broadcast input needs at least two terminal sessions.', 'error');
      return;
    }
    if (!state.broadcastInput) {
      const names = [...state.tabs.values()].map((tab) => tab.title).join(', ');
      const confirmed = await confirmAction({
        title: 'Enable broadcast input?',
        description: `Every keystroke will be sent to ${state.tabs.size} terminals: ${names}. Commands cannot be recalled after transmission.`,
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
    tab.terminal.write(data, () => {
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
        activeTab.terminal.focus();
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

  async function closeTab(id) {
    const tab = state.tabs.get(id);
    if (!tab) return;
    if (state.sftp.ownerTabId === tab.id) {
      state.sftp.open = false;
      elements.appShell.classList.remove('sftp-open');
      elements.sftpPanel.setAttribute('aria-hidden', 'true');
      await disconnectSftp(tab.profile, { reset: true, status: 'SFTP disconnected' });
    }
    if (!tab.closed) {
      try { await api.terminal.close(id); } catch { /* process may already have exited */ }
    }
    tab.terminal.dispose();
    unobserveResizablePane(tab);
    tab.tabElement.remove();
    tab.view.remove();
    state.tabs.delete(id);
    state.pendingTerminalData.delete(id);
    if (state.tabs.size < 2 && state.broadcastInput) {
      applyBroadcastState(false);
      toast('Broadcast input disabled', 'Fewer than two terminal sessions remain.');
    }

    if (state.activeTabId === id) {
      const remaining = [...state.tabs.keys()];
      activateTab(remaining.at(-1) || '');
    }
    if (!state.tabs.size) activateTab('');
  }

  async function duplicateActiveSession() {
    const tab = activeTab();
    if (!tab) {
      toast('No active session', 'Open a terminal tab before duplicating a session.', 'error');
      return;
    }
    await connectProfile(tab.profile);
  }

  async function reconnectActiveSession() {
    const tab = activeTab();
    if (!tab) {
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
      if (!['ssh', 'mosh', 'telnet', 'rdp', 'vnc'].includes(protocol)) throw new Error(`Unsupported protocol: ${protocol}`);
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
    const defaultPorts = { ssh: 22, mosh: 22, telnet: 23, rdp: 3389, vnc: 5900 };
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

  async function openProfileModal(existing = null) {
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
      terminalScrollback: 20_000
    };
    const hasCredential = profile.credentialId ? await api.vault.has(profile.credentialId).catch(() => false) : false;
    const protocol = selectInput('protocol', [
      ['ssh', 'SSH'], ['mosh', 'Mosh'], ['rdp', 'RDP'], ['vnc', 'VNC'], ['telnet', 'Telnet'], ['serial', 'Serial'], ['local', 'Local shell']
    ], profile.protocol);
    if (existing?.id === 'local-shell') protocol.disabled = true;
    const name = textInput('name', profile.name, { required: true, placeholder: 'Production gateway' });
    const group = textInput('group', profile.group || 'Connections', { placeholder: 'Connections' });
    const host = textInput('host', profile.host, { placeholder: 'server.example.com' });
    const port = textInput('port', profile.port || 22, { type: 'number', min: 1, max: 65535 });
    const username = textInput('username', profile.username, { placeholder: 'admin' });
    const identityFile = textInput('identityFile', profile.identityFile, { placeholder: '~/.ssh/id_ed25519' });
    const proxyJump = textInput('proxyJump', profile.proxyJump, { placeholder: 'bastion.example.com' });
    const keepAlive = textInput('keepAliveSeconds', profile.keepAliveSeconds ?? 30, { type: 'number', min: 0, max: 600 });
    const startupCommand = node('textarea', { name: 'startupCommand', value: profile.startupCommand || '', placeholder: 'tmux attach || tmux new' });
    startupCommand.value = profile.startupCommand || '';
    const sftpRoot = textInput('sftpRoot', profile.sftpRoot || '/', { placeholder: '/' });
    const device = textInput('device', profile.device || '/dev/ttyUSB0', { placeholder: '/dev/ttyUSB0' });
    const baudRate = textInput('baudRate', profile.baudRate || 115200, { type: 'number', min: 50, max: 4000000 });
    const rdpDomain = textInput('rdpDomain', profile.rdpDomain, { placeholder: 'CORP' });
    const terminalTheme = selectInput('terminalTheme', [
      ['aux-dark', 'Aux dark'], ['light', 'Light'], ['high-contrast', 'High contrast']
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
    const secret = textInput('secret', '', { type: 'password', autocomplete: 'new-password', placeholder: hasCredential ? 'Stored credential exists — leave blank to keep' : 'Optional SFTP credential' });
    const persistentAvailable = Boolean(state.vault?.persistentEncryptionAvailable);

    const optionsRow = node('div', { className: 'checkbox-row full', attrs: { 'data-when': 'ssh,mosh' } }, [
      checkbox('useSshConfig', 'Use ~/.ssh/config', profile.useSshConfig !== false),
      checkbox('compression', 'Compression', profile.compression),
      checkbox('agentForwarding', 'Agent forwarding', profile.agentForwarding),
      checkbox('x11Forwarding', 'X11 forwarding', profile.x11Forwarding)
    ]);
    const credentialRow = node('div', { className: 'credential-grid full', attrs: { 'data-when': 'ssh' } }, [
      field('Credential type', credentialKind, 'Prevents a private-key passphrase from being sent as an account password.'),
      field('SFTP credential', secret, 'Used only by graphical SFTP. Terminal SSH authentication remains interactive through OpenSSH.'),
      node('div', { className: 'checkbox-column' }, [
        checkbox('persistentSecret', persistentAvailable ? 'Store encrypted on this desktop' : 'Encrypted storage unavailable', persistentAvailable, !persistentAvailable),
        hasCredential ? checkbox('clearSecret', 'Remove stored credential', false) : null
      ])
    ]);
    const form = node('form', { className: 'form-grid', attrs: { id: 'profile-form' } }, [
      field('Name', name),
      field('Protocol', protocol),
      field('Group', group),
      field('Host', host, '', '',),
      field('Port', port),
      field('Username', username, '', '',),
      field('Identity file', identityFile, 'OpenSSH key path. Agent authentication is used automatically when available.'),
      field('ProxyJump', proxyJump, 'SSH terminal sessions and tunnels use the OpenSSH -J option.'),
      field('Keepalive seconds', keepAlive),
      field('SFTP start path', sftpRoot, '', '',),
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
      [host.closest('.field'), 'ssh,mosh,rdp,vnc,telnet'],
      [port.closest('.field'), 'ssh,mosh,rdp,vnc,telnet'],
      [username.closest('.field'), 'ssh,mosh,rdp'],
      [identityFile.closest('.field'), 'ssh,mosh'],
      [proxyJump.closest('.field'), 'ssh'],
      [keepAlive.closest('.field'), 'ssh'],
      [sftpRoot.closest('.field'), 'ssh'],
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
      const defaultPorts = { ssh: 22, mosh: 22, telnet: 23, rdp: 3389, vnc: 5900 };
      if (defaultPorts[selected] && (!port.value || Object.values(defaultPorts).includes(Number(port.value)))) port.value = defaultPorts[selected];
      host.required = ['ssh', 'mosh', 'rdp', 'vnc', 'telnet'].includes(selected);
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
        proxyJump: String(values.get('proxyJump') || '').trim(),
        keepAliveSeconds: Number(values.get('keepAliveSeconds') || 0),
        startupCommand: String(values.get('startupCommand') || ''),
        sftpRoot: String(values.get('sftpRoot') || '/').trim(),
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
      await api.sftp.disconnect(saved.id).catch(() => {});
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
          const confirmed = await confirmAction({
            title: 'Delete connection?',
            description: `Delete “${existing.name}” from Aux Command? Stored credentials for this profile will also be removed.`,
            confirmLabel: 'Delete',
            danger: true
          });
          if (!confirmed) return false;
          await api.sftp.disconnect(existing.id).catch(() => {});
          await api.profiles.delete(existing.id);
          if (existing.credentialId) {
            await api.vault.delete(existing.credentialId).catch((error) => {
              toast('Credential cleanup required', errorMessage(error), 'error');
            });
          }
          updateProfiles(await api.profiles.list());
          toast('Connection deleted', existing.name, 'success');
          controller.close();
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
    if (!tab) throw new Error('Open a terminal tab before running a snippet');
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
        await api.snippets.delete(snippet.id);
        await refreshSnippets();
        toast('Snippet deleted', snippet.name, 'success');
        controller.close();
        openSnippetsModal();
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

  function paletteActions() {
    const actions = [
      { label: 'New local terminal', category: 'Action', detail: 'Open a local shell tab', run: () => connectProfile(localProfile()) },
      { label: 'Find in terminal', category: 'Action', detail: 'Search the active terminal buffer', run: () => openTerminalSearch() },
      { label: 'Command snippets', category: 'Action', detail: 'Open snippet manager', run: () => openSnippetsModal() },
      { label: 'New connection profile', category: 'Action', detail: 'Create SSH, Mosh, Telnet, RDP, VNC or serial profile', run: () => openProfileModal() },
      { label: 'SSH tunnels', category: 'Action', detail: 'Open tunnel manager', run: () => openTunnelsModal() },
      { label: 'System diagnostics', category: 'Action', detail: 'Show runtime tool status', run: () => openDiagnosticsModal() },
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
      await api.sftp.disconnect(profileId);
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
    if (!tab || tab.profile.protocol !== 'ssh') {
      toast('SFTP requires an SSH session', 'Activate an SSH tab before opening the file browser.', 'error');
      return;
    }
    state.sftp.open = true;
    elements.appShell.classList.add('sftp-open');
    elements.sftpPanel.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => tab.fitAddon.fit(), 200);
    await syncSftpToActiveTab();
  }

  async function syncSftpToActiveTab() {
    if (!state.sftp.open) return;
    const syncToken = ++state.sftp.syncToken;
    const tab = activeTab();
    const previousProfile = state.sftp.profile;
    if (!tab || tab.profile.protocol !== 'ssh') {
      if (previousProfile) await disconnectSftp(previousProfile, { reset: true, message: 'Activate an SSH session to browse files.' });
      else resetSftpState('Activate an SSH session to browse files.');
      return;
    }
    const profileChanged = previousProfile?.id !== tab.profile.id;
    if (profileChanged && previousProfile) {
      await disconnectSftp(previousProfile, { reset: true, status: 'Switching SFTP session…' });
      if (syncToken !== state.sftp.syncToken) return;
    }
    state.sftp.profile = tab.profile;
    state.sftp.ownerTabId = tab.id;
    elements.sftpTitle.textContent = tab.profile.name;
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

  async function uploadFile() {
    if (!state.sftp.profile) return;
    try {
      const result = await api.sftp.upload(state.sftp.profile, state.sftp.path);
      if (!result.canceled) {
        toast('Upload complete', result.remotePath, 'success');
        await loadSftp(state.sftp.path);
      }
    } catch (error) { toast('Upload failed', errorMessage(error), 'error'); }
  }

  async function downloadSelected() {
    const entry = selectedSftpEntry();
    if (!entry || entry.directory || !state.sftp.profile) return;
    try {
      const result = await api.sftp.download(state.sftp.profile, entry.path);
      if (!result.canceled) toast('Download complete', result.localPath, 'success');
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
      });
      container.append(row);
    }
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
      updateReleaseSection(updateStatus, openDiagnosticsModal),
      node('div', {}, [node('div', { className: 'section-title', text: 'Protocol capabilities' }), protocolList]),
      node('div', {}, [node('div', { className: 'section-title', text: 'Runtime tools' }), list]),
      node('div', { className: 'warning-box', text: 'Aux Command bundles local PTY, graphical SFTP, Telnet and serial bridges. RDP, VNC and Mosh still depend on host-installed clients/servers; X11 forwarding uses OpenSSH -X and the host display.' })
    ]);
    showModal({ title: 'System diagnostics', description: 'Protocol support detected on this Linux host.', body, className: 'wide', actions: [{ label: 'Close', busy: false }] });
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
      if (tab) writeTerminalData(tab, data);
      else {
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
      if (tunnel.status === 'running') toast('Tunnel ready', tunnel.name, 'success');
      if (tunnel.status === 'failed') toast('Tunnel failed', tunnel.lastError || tunnel.name, 'error');
    });
    api.sftp.onProgress(({ profileId, direction, path, transferred, total }) => {
      if (state.sftp.profile?.id !== profileId) return;
      const percentage = total ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
      elements.transferStatus.textContent = `${direction === 'upload' ? 'Uploading' : 'Downloading'} ${path} · ${percentage}% (${formatBytes(transferred)} / ${formatBytes(total)})`;
    });
    api.sftp.onError(({ profileId, message }) => {
      if (state.sftp.profile?.id === profileId) toast('SFTP connection error', message, 'error');
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
    elements.updatesButton.addEventListener('click', openUpdatesModal);
    elements.diagnosticsButton.addEventListener('click', openDiagnosticsModal);
    elements.websiteButton.addEventListener('click', () => api.system.openWebsite().catch((error) => toast('Could not open website', errorMessage(error), 'error')));
    elements.newProfileButton.addEventListener('click', () => openProfileModal());
    elements.profileSearch.addEventListener('input', renderProfiles);
    elements.importSshButton.addEventListener('click', () => importSshConfig().catch(() => {}));
    elements.profileMenuButton.addEventListener('click', openProfileDataMenu);
    elements.welcomeLocal.addEventListener('click', () => connectProfile(localProfile()));
    elements.welcomeProfile.addEventListener('click', () => openProfileModal());
    elements.welcomeImport.addEventListener('click', () => importSshConfig().catch(() => {}));
    elements.layoutToggle.addEventListener('click', toggleTerminalLayout);
    elements.broadcastToggle.addEventListener('click', toggleBroadcastInput);
    elements.terminalSearchToggle.addEventListener('click', openTerminalSearch);
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

    window.addEventListener('resize', () => {
      fitVisibleTerminals();
    });

    window.addEventListener('keydown', (event) => {
      const modalOpen = Boolean(elements.modalRoot.querySelector('.modal-backdrop'));
      if (modalOpen && event.key !== 'Escape') return;
      if (isEditableShortcutTarget(event.target)) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        elements.quickInput.focus();
        elements.quickInput.select();
      }
      if (modifier && !event.shiftKey && event.code === 'KeyF') {
        event.preventDefault();
        openTerminalSearch();
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 't') {
        event.preventDefault();
        connectProfile(localProfile());
      }
      if (modifier && event.shiftKey && event.code === 'KeyP') {
        event.preventDefault();
        openCommandPalette();
      }
      if (modifier && event.shiftKey && event.code === 'KeyD') {
        event.preventDefault();
        duplicateActiveSession().catch((error) => toast('Duplicate failed', errorMessage(error), 'error'));
      }
      if (modifier && event.shiftKey && event.code === 'KeyR') {
        event.preventDefault();
        reconnectActiveSession().catch((error) => toast('Reconnect failed', errorMessage(error), 'error'));
      }
      if (modifier && event.shiftKey && event.code === 'Minus') {
        event.preventDefault();
        adjustPaneSize(-40);
      }
      if (modifier && event.shiftKey && event.code === 'Equal') {
        event.preventDefault();
        adjustPaneSize(40);
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        toggleSftp();
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        toggleTerminalLayout();
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleBroadcastInput();
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        openSnippetsModal();
      }
      if (modifier && !event.shiftKey && event.key.toLowerCase() === 'w' && state.activeTabId) {
        event.preventDefault();
        requestCloseTab(state.activeTabId);
      }
      if (event.key === 'Escape') {
        const backdrops = elements.modalRoot.querySelectorAll('.modal-backdrop');
        const top = backdrops[backdrops.length - 1];
        const closeButton = top?.querySelector('.modal-close:not([hidden])');
        closeButton?.click();
      }
    });
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
      state.snippets = initial.snippets || [];
      state.diagnostics = initial.diagnostics || null;
      updateUpdateState(initial.updates || {});
      state.vault = initial.vault || null;
      for (const tunnel of initial.tunnels || []) state.tunnels.set(tunnel.id, tunnel);
      updateProfiles(initial.profiles || []);
      restoreInitialSessions(initial.sessions || []);
      elements.appVersion.textContent = `Aux Command ${initial.version}`;
      const agentAvailable = Boolean(initial.diagnostics?.sshAgent);
      elements.agentStatus.textContent = agentAvailable ? 'SSH agent ready' : 'No SSH agent';
      elements.agentStatus.classList.toggle('good', agentAvailable);
      elements.sftpEmpty.classList.add('visible');
      elements.appShell.setAttribute('aria-busy', 'false');
      state.initializing = false;
      elements.initializationError.hidden = true;
      setStatus('Ready');
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
