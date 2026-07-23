'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src/preload/index.cjs'), 'utf8');
const logoPng = fs.statSync(path.join(root, 'src/renderer/assets/logo.png'));

test('renderer reattaches or closes existing main-process terminal sessions after reload', () => {
  assert.match(renderer, /function restoreInitialSessions\(sessions = \[\]\)/u);
  assert.match(renderer, /createTerminalTab\(session, profile\)/u);
  assert.match(renderer, /api\.terminal\.close\(session\.id\)\.catch\(\(\) => \{\}\)/u);
  assert.match(renderer, /restoreInitialSessions\(initial\.sessions \|\| \[\]\)/u);
});

test('renderer disconnects graphical SFTP on panel close and owning tab close', () => {
  assert.match(renderer, /async function disconnectSftp\(profile = state\.sftp\.profile/u);
  assert.match(renderer, /await disconnectSftp\(profile, \{ reset: true, status: 'SFTP disconnected' \}\)/u);
  assert.match(renderer, /state\.sftp\.ownerTabId === tab\.id/u);
  assert.match(renderer, /const previousProfile = state\.sftp\.profile/u);
  assert.match(renderer, /await disconnectSftp\(previousProfile, \{ reset: true/u);
  assert.match(renderer, /state\.sftp\.ownerTabId = tab\.id/u);
  assert.match(renderer, /state\.sftp\.requestToken \+= 1/u);
});

test('renderer preserves a keyboard route from Home back into the terminal tablist', () => {
  assert.match(renderer, /const roving = active \|\| \(!state\.activeTabId && tabId === fallbackTabId\)/u);
  assert.match(renderer, /tab\.view\.classList\.toggle\('active', Boolean\(state\.activeTabId\)/u);
});

test('renderer does not reinterpret an existing credential after its kind changes', () => {
  assert.match(renderer, /credential kind changes/u);
  assert.match(renderer, /secret\.setCustomValidity/u);
  assert.match(renderer, /secret\.reportValidity\(\)/u);
});

test('SFTP keyboard activation opens directories and stale requests retain busy state', () => {
  assert.match(renderer, /function activateSftpEntry\(entry\)/u);
  assert.match(renderer, /if \(event\.key === 'Enter'\)/u);
  assert.match(renderer, /if \(token === state\.sftp\.requestToken\) \{/u);
});

test('tunnel feedback distinguishes starting from evidence-backed running', () => {
  assert.doesNotMatch(renderer, /toast\('Tunnel started', tunnel\.name, 'success'\)/u);
  assert.match(renderer, /Tunnel starting/u);
  assert.match(renderer, /tunnel\.status === 'running'/u);
});

test('session controls derive enabled state from active protocol and tab count', () => {
  assert.equal((renderer.match(/function updateSessionActions\(\)/gu) || []).length, 1);
  assert.match(renderer, /function updateSessionActions\(\)/u);
  assert.match(renderer, /elements\.sftpToggle\.disabled = !ssh/u);
  assert.match(renderer, /elements\.broadcastToggle\.disabled = tabCount < 2/u);
});

test('renderer scopes SFTP progress events to the visible profile', () => {
  assert.match(renderer, /api\.sftp\.onProgress\(\(\{ profileId, direction, path, transferred, total \}\) => \{/u);
  assert.match(renderer, /if \(state\.sftp\.profile\?\.id !== profileId\) return;/u);
});

test('renderer prevents modal-global shortcut collisions and disables impossible tunnel start', () => {
  assert.match(renderer, /const modalOpen = Boolean\(elements\.modalRoot\.querySelector\('\.modal-backdrop'\)\);/u);
  assert.match(renderer, /if \(modalOpen && event\.key !== 'Escape'\) return;/u);
  assert.match(renderer, /function isEditableShortcutTarget\(target\)/u);
  assert.match(renderer, /if \(isEditableShortcutTarget\(event\.target\)\) return;/u);
  assert.match(renderer, /Create an SSH profile before starting a tunnel/u);
  assert.match(renderer, /disabled: !sshProfiles\.length/u);
});

test('modals trap keyboard focus and restore the invoking control', () => {
  assert.match(renderer, /const previousFocus = document\.activeElement/u);
  assert.match(renderer, /function modalFocusableElements\(modal\)/u);
  assert.match(renderer, /button:not\(\[disabled\]\):not\(\[hidden\]\)/u);
  assert.match(renderer, /modal\.addEventListener\('keydown', \(event\) => \{/u);
  assert.match(renderer, /if \(event\.key !== 'Tab'\) return;/u);
  assert.match(renderer, /previousFocus\?\.isConnected/u);
  assert.match(renderer, /previousFocus\.focus\(\)/u);
});

test('modals isolate background content and nested dialogs', () => {
  assert.match(renderer, /elements\.appShell\.inert = true/u);
  assert.match(renderer, /existingBackdrop\.inert = true/u);
  assert.match(renderer, /elements\.appShell\.inert = false/u);
});

test('status regions are concise and SFTP loading exposes busy state', () => {
  assert.doesNotMatch(indexHtml, /id="terminal-stack"[^>]*aria-live/u);
  assert.match(indexHtml, /id="global-status"[^>]*role="status"[^>]*aria-live="polite"/u);
  assert.match(indexHtml, /id="transfer-status"[^>]*role="status"[^>]*aria-live="polite"/u);
  assert.match(indexHtml, /id="file-list"[^>]*aria-busy="false"/u);
  assert.match(renderer, /elements\.fileList\.setAttribute\('aria-busy'/u);
});

test('notifications are accessible and capped to avoid obscuring terminal content', () => {
  assert.match(renderer, /role: kind === 'error' \? 'alert' : 'status'/u);
  assert.match(renderer, /querySelectorAll\('\.toast'\)/u);
  assert.match(renderer, /toasts\.length - 2/u);
});

test('primary text inputs have explicit accessible names and motion can be reduced', () => {
  assert.match(indexHtml, /id="quick-input"[^>]*aria-label="Quick connect target"/u);
  assert.match(indexHtml, /id="profile-search"[^>]*aria-label="Filter connections"/u);
  assert.match(indexHtml, /id="sftp-path"[^>]*aria-label="Remote path"/u);
  assert.match(indexHtml, /id="new-profile-button"[^>]*aria-label="New connection"/u);
  assert.match(indexHtml, /id="sftp-close"[^>]*aria-label="Close SFTP"/u);
  assert.match(renderer, /className: 'modal-close'[^\n]*text: '×'[^\n]*title: 'Close'[^\n]*attrs: \{ 'aria-label': 'Close dialog' \}/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/u);
});

test('welcome copy advertises every supported quick-connect protocol', () => {
  assert.match(indexHtml, /SSH, Mosh, Telnet, RDP, VNC or serial/u);
  assert.match(indexHtml, /<option value="serial">Serial<\/option>/u);
  assert.match(renderer, /if \(protocol === 'serial'\) \{/u);
  assert.match(renderer, /device: value/u);
});

test('renderer exposes a command snippets manager that can run snippets in the active terminal', () => {
  assert.match(indexHtml, /id="snippets-button"/u);
  assert.match(renderer, /function openSnippetsModal\(\)/u);
  assert.match(renderer, /function runSnippet\(snippet\)/u);
  assert.match(renderer, /api\.terminal\.write\(tab\.id, `\$\{snippet\.command\}\\r`\)/u);
  assert.match(renderer, /api\.snippets\.save/u);
  assert.match(renderer, /api\.snippets\.delete/u);
});

test('renderer uses the supplied Auxillo logo raster asset', () => {
  assert.match(indexHtml, /src="\.\/assets\/logo\.png"/u);
  assert.doesNotMatch(indexHtml, /logo\.svg/u);
  assert.ok(logoPng.size > 1024, 'logo asset should be a real PNG, not a placeholder');
});

test('renderer exposes a tiled multi-session layout for split-pane operations', () => {
  assert.match(indexHtml, /id="layout-toggle"/u);
  assert.match(renderer, /function toggleTerminalLayout\(\)/u);
  assert.match(renderer, /state\.layout = state\.layout === 'single' \? 'grid' : 'single'/u);
  assert.match(renderer, /elements\.terminalStack\.classList\.toggle\('layout-grid', state\.layout === 'grid'\)/u);
  assert.match(renderer, /for \(const tab of state\.tabs\.values\(\)\) \{/u);
  assert.match(styles, /\.terminal-stack\.layout-grid/u);
  assert.match(styles, /grid-template-columns: repeat\(auto-fit, minmax\(var\(--pane-min-width\), 1fr\)\)/u);
  assert.match(styles, /grid-auto-rows: minmax\(var\(--pane-min-height\), 1fr\)/u);
});

test('renderer persists workstation layout and pane-size toolbar preferences', () => {
  assert.match(preload, /saveWorkspaceSettings: \(workspace\) => invoke\('app:save-workspace-settings', workspace\)/u);
  assert.match(renderer, /function applyPersistedWorkspaceSettings\(settings\)/u);
  assert.match(renderer, /function persistWorkspaceSettings\(\)/u);
  assert.match(renderer, /api\.app\.saveWorkspaceSettings\(\{/u);
  assert.match(renderer, /state\.initializing \? null : persistWorkspaceSettings\(\)/u);
});

test('renderer exposes guarded broadcast input across terminal sessions', () => {
  assert.match(indexHtml, /id="broadcast-toggle"/u);
  assert.match(indexHtml, /id="broadcast-warning"[^>]*role="alert"/u);
  assert.match(renderer, /broadcastInput: false/u);
  assert.match(renderer, /async function toggleBroadcastInput\(\)/u);
  assert.match(renderer, /await confirmAction\(\{/u);
  assert.match(renderer, /Enable broadcast input\?/u);
  assert.match(renderer, /elements\.broadcastWarning\.hidden = !state\.broadcastInput/u);
  assert.match(renderer, /const targets = state\.broadcastInput \? \[\.\.\.state\.tabs\.values\(\)\] : \[tab\]/u);
  assert.match(renderer, /api\.terminal\.write\(target\.id, data\)/u);
  assert.match(renderer, /elements\.broadcastToggle\.classList\.toggle\('active', state\.broadcastInput\)/u);
});

test('renderer CSP permits xterm runtime style updates without allowing inline scripts', () => {
  assert.match(indexHtml, /style-src 'self' 'unsafe-inline'/u);
  assert.match(indexHtml, /script-src 'self'/u);
  assert.doesNotMatch(indexHtml, /script-src[^;]*'unsafe-inline'/u);
});

test('renderer forces xterm refresh after PTY data writes', () => {
  assert.match(renderer, /function writeTerminalData\(tab, data\)/u);
  assert.match(renderer, /tab\.terminal\.write\(data, \(\) => \{/u);
  assert.match(renderer, /tab\.terminal\.refresh\(0, tab\.terminal\.rows - 1\)/u);
});

test('snippets modal refreshes persisted state before rendering rows', () => {
  assert.match(renderer, /async function openSnippetsModal\(\)/u);
  assert.match(renderer, /await refreshSnippets\(\)/u);
});

test('renderer exposes terminal search using xterm search addon and shortcuts', () => {
  assert.match(indexHtml, /addon-search\/lib\/addon-search\.js/u);
  assert.match(renderer, /const searchAddon = new window\.SearchAddon\.SearchAddon\(\)/u);
  assert.match(renderer, /terminal\.loadAddon\(searchAddon\)/u);
  assert.match(renderer, /function openTerminalSearch\(\)/u);
  assert.match(renderer, /findNext\(query/u);
  assert.match(renderer, /findPrevious\(query/u);
  assert.match(renderer, /event\.code === 'KeyF'/u);
});

test('renderer exposes terminal transcript export from the session toolbar', () => {
  assert.match(indexHtml, /id="export-transcript-button"/u);
  assert.match(preload, /exportTranscript: \(id\) => invoke\('terminal:export-transcript', id\)/u);
  assert.match(renderer, /async function exportActiveTranscript\(\)/u);
  assert.match(renderer, /await api\.terminal\.exportTranscript\(tab\.id\)/u);
});

test('renderer exposes a command palette for actions, profiles and snippets', () => {
  assert.match(renderer, /function paletteActions\(\)/u);
  assert.match(renderer, /function openCommandPalette\(\)/u);
  assert.match(renderer, /Command palette/u);
  assert.match(renderer, /role: 'combobox'/u);
  assert.match(renderer, /role: 'listbox'/u);
  assert.match(renderer, /role: 'option'/u);
  assert.match(renderer, /aria-activedescendant/u);
  assert.match(renderer, /aria-selected/u);
  assert.match(renderer, /Run snippet/u);
  assert.match(renderer, /Connect profile/u);
  assert.match(renderer, /event\.code === 'KeyP'/u);
});

test('renderer exposes duplicate and reconnect session operations', () => {
  assert.match(renderer, /async function duplicateActiveSession\(\)/u);
  assert.match(renderer, /async function reconnectActiveSession\(\)/u);
  assert.match(renderer, /const replacement = await connectProfile\(tab\.profile\)/u);
  assert.match(renderer, /if \(replacement\) await closeTab\(tab\.id\)/u);
  assert.match(renderer, /Duplicate session/u);
  assert.match(renderer, /Reconnect session/u);
  assert.match(renderer, /event\.code === 'KeyD'/u);
  assert.match(renderer, /event\.code === 'KeyR'/u);
});

test('live terminal closure requires explicit confirmation', () => {
  assert.match(renderer, /async function requestCloseTab\(id\)/u);
  assert.match(renderer, /Close live session\?/u);
  assert.match(renderer, /await confirmAction\(\{/u);
  assert.match(renderer, /requestCloseTab\(state\.activeTabId\)/u);
});

test('terminal tabs use linked panels, roving tabindex and keyboard navigation', () => {
  assert.match(renderer, /role: 'tabpanel'/u);
  assert.match(renderer, /'aria-controls': panelId/u);
  assert.match(renderer, /'aria-labelledby': tabId/u);
  assert.match(renderer, /event\.key === 'ArrowRight'/u);
  assert.match(renderer, /event\.key === 'ArrowLeft'/u);
  assert.match(renderer, /event\.key === 'Home'/u);
  assert.match(renderer, /event\.key === 'End'/u);
  assert.match(renderer, /tab\.tabButton\.setAttribute\('tabindex', roving \? '0' : '-1'\)/u);
  assert.match(styles, /\.tab-close[^\{]*\{[^}]*min-width: 24px[^}]*min-height: 24px/su);
});

test('renderer exposes resizable tiled panes with pane size controls', () => {
  assert.match(renderer, /function adjustPaneSize\(delta\)/u);
  assert.match(renderer, /--pane-min-width/u);
  assert.match(renderer, /--pane-min-height/u);
  assert.match(renderer, /event\.code === 'Equal'/u);
  assert.match(renderer, /event\.code === 'Minus'/u);
  assert.match(indexHtml, /pane-grow-button/u);
  assert.match(indexHtml, /pane-shrink-button/u);
  assert.match(styles, /resize: both/u);
});

test('diagnostics exposes GitHub release update controls', () => {
  assert.match(renderer, /function updateUpdateState\(status = \{\}\)/u);
  assert.match(renderer, /function describeUpdateState\(status = state\.updates \|\| \{\}\)/u);
  assert.match(indexHtml, /id="updates-button"/u);
  assert.match(renderer, /elements\.updatesButton/u);
  assert.match(renderer, /function openUpdatesModal\(\)/u);
  assert.match(renderer, /elements\.updatesButton\.addEventListener\('click', openUpdatesModal\)/u);
  assert.match(renderer, /GitHub release updates/u);
  assert.match(renderer, /api\.updates\.check\(\)/u);
  assert.match(renderer, /api\.updates\.download\(\)/u);
  assert.match(renderer, /api\.updates\.onStatus\(\(status\) => updateUpdateState\(status\)\)/u);
});

test('graphical SFTP exposes remote text file view and edit actions', () => {
  assert.match(indexHtml, /id="sftp-edit"/u);
  assert.match(indexHtml, /id="sftp-more"[^>]*>More/u);
  assert.match(preload, /readText: \(profile, remotePath\) => invoke\('sftp:read-text', profile, remotePath\)/u);
  assert.match(preload, /writeText: \(profile, remotePath, content\) => invoke\('sftp:write-text', profile, remotePath, content\)/u);
  assert.match(renderer, /async function openRemoteTextEditor\(\)/u);
  assert.match(renderer, /await api\.sftp\.readText\(state\.sftp\.profile, entry\.path\)/u);
  assert.match(renderer, /await api\.sftp\.writeText\(state\.sftp\.profile, entry\.path, editor\.value\)/u);
  assert.match(renderer, /elements\.sftpEdit\.addEventListener\('click', openRemoteTextEditor\)/u);
  assert.match(renderer, /else openRemoteTextEditor\(\)/u);
});

test('UI separates session navigation from contextual commands and labels global actions', () => {
  assert.match(indexHtml, /id="session-tabs"[^>]*role="tablist"/u);
  assert.match(indexHtml, /class="session-toolbar"/u);
  assert.match(indexHtml, /class="action-label">Local shell/u);
  assert.match(indexHtml, /class="action-label">Snippets/u);
  assert.match(indexHtml, /class="action-label">Tunnels/u);
  assert.match(indexHtml, /class="action-label">Diagnostics/u);
  assert.doesNotMatch(indexHtml, />Pane[−+]</u);
});

test('profile rows expose separate Connect and Edit buttons', () => {
  assert.match(renderer, /className: 'profile-connect'/u);
  assert.match(renderer, /className: 'profile-connect-label', text: 'Connect'/u);
  assert.match(renderer, /attrs: \{ role: 'listitem'/u);
  assert.doesNotMatch(renderer, /attrs: \{ role: 'button', tabindex: '0', 'aria-label': `\$\{profile\.name\}/u);
});

test('compact UI provides sidebar and SFTP drawer behavior', () => {
  assert.match(indexHtml, /id="sidebar-toggle"/u);
  assert.match(styles, /@media \(max-width: 1024px\)/u);
  assert.match(styles, /#app-shell\.sidebar-open \.sidebar/u);
  assert.match(styles, /#app-shell\.sftp-open \.sftp-panel[^\{]*\{[^}]*position: fixed/su);
});

test('initialization failure has a durable recovery surface', () => {
  assert.match(indexHtml, /id="initialization-error"/u);
  assert.match(indexHtml, /id="retry-initialization"/u);
  assert.match(renderer, /elements\.initializationError\.hidden = false/u);
  assert.match(renderer, /window\.location\.reload\(\)/u);
});

test('low-value pane resizing uses coalesced status instead of stacked toasts', () => {
  assert.doesNotMatch(renderer, /toast\('Pane size updated'/u);
  assert.match(renderer, /setStatus\(`Pane size/u);
  assert.match(renderer, /if \(kind !== 'error'\) \{[\s\S]*setStatus/u);
  assert.match(renderer, /existing\.remove\(\)/u);
});

test('diagnostics modal renders protocol capabilities and avoids stale host-tool claims', () => {
  assert.match(renderer, /info\.protocols/u);
  assert.match(renderer, /Protocol capabilities/u);
  assert.match(renderer, /capability\.mode/u);
  assert.doesNotMatch(renderer, /Picocom and Telnet clients/u);
});

test('renderer exposes and applies per-profile terminal appearance settings', () => {
  assert.match(renderer, /const terminalThemes = Object\.freeze/u);
  assert.match(renderer, /function terminalOptionsForProfile\(profile\)/u);
  assert.match(renderer, /theme: terminalThemes\[themeName\]/u);
  assert.match(renderer, /terminalFontFamily/u);
  assert.match(renderer, /terminalFontSize/u);
  assert.match(renderer, /terminalCursorStyle/u);
  assert.match(renderer, /terminalScrollback/u);
  assert.match(renderer, /field\('Terminal theme'/u);
  assert.match(renderer, /field\('Terminal font'/u);
  assert.match(renderer, /field\('Scrollback lines'/u);
});
