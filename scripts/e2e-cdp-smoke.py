#!/usr/bin/env python3
"""CDP smoke test for a running Aux Command Electron instance.

Launch source or AppImage first with, for example:

  ./dist/Aux-Command-0.1.0-x86_64.AppImage \
    --remote-debugging-port=9226 \
    --remote-allow-origins=http://127.0.0.1:9226

Then run:

  AUX_COMMAND_CDP_PORT=9226 python3 scripts/e2e-cdp-smoke.py
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.request

try:
    import websocket
except ImportError as exc:  # pragma: no cover - operator guidance path
    raise SystemExit('Missing Python package websocket-client. Install in the active venv with: python3 -m pip install websocket-client') from exc

PORT = os.environ.get('AUX_COMMAND_CDP_PORT', '9223')
TARGET = f'http://127.0.0.1:{PORT}/json'
SCREENSHOT_PATH = os.environ.get('AUX_COMMAND_SCREENSHOT', '/tmp/aux-command-smoke.png')


def get_ws_url() -> str:
    pages = json.load(urllib.request.urlopen(TARGET, timeout=2))
    for page in pages:
        if page.get('type') == 'page' and page.get('title') == 'Aux Command':
            return page['webSocketDebuggerUrl']
    raise RuntimeError(f'Aux Command page not found: {pages!r}')


class CDP:
    def __init__(self, url: str):
        self.ws = websocket.create_connection(url, timeout=30)
        self.next_id = 1
        self.events = []

    def call(self, method: str, params: dict | None = None, timeout: int = 10) -> dict:
        msg_id = self.next_id
        self.next_id += 1
        self.ws.send(json.dumps({'id': msg_id, 'method': method, 'params': params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = self.ws.recv()
            msg = json.loads(raw)
            if msg.get('id') == msg_id:
                if 'error' in msg:
                    raise RuntimeError(f'{method} failed: {msg["error"]}')
                return msg.get('result', {})
            self.events.append(msg)
        raise TimeoutError(method)

    def eval(self, expression: str, await_promise: bool = True, timeout: int = 10):
        result = self.call('Runtime.evaluate', {
            'expression': expression,
            'awaitPromise': await_promise,
            'returnByValue': True,
            'userGesture': True,
        }, timeout=timeout)
        if result.get('exceptionDetails'):
            raise RuntimeError(f'Eval exception: {result["exceptionDetails"]}')
        return result.get('result', {}).get('value')

    def close(self) -> None:
        self.ws.close()


def require(condition: bool, message: str, details=None) -> None:
    if not condition:
        raise AssertionError(json.dumps({'message': message, 'details': details}, indent=2))


def capture_screenshot(cdp: CDP) -> dict:
    try:
        screenshot = cdp.call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False}, timeout=30)
        with open(SCREENSHOT_PATH, 'wb') as handle:
            handle.write(base64.b64decode(screenshot['data']))
        return {'path': SCREENSHOT_PATH, 'warning': None}
    except Exception as exc:  # pragma: no cover - diagnostic artifact path depends on compositor/CDP timing
        return {'path': None, 'warning': f'screenshot capture skipped after functional smoke passed: {exc}'}


def main() -> int:
    cdp = CDP(get_ws_url())
    try:
        cdp.call('Page.enable')
        cdp.call('Runtime.enable')
        cdp.call('Log.enable')
        cdp.call('Page.bringToFront')

        baseline = cdp.eval("""
          (async () => ({
            readyState: document.readyState,
            title: document.title,
            apiKeys: Object.keys(window.auxCommand || {}).sort(),
            state: await window.auxCommand.app.getState(),
            buttonTexts: [...document.querySelectorAll('button')].slice(0, 24).map(b => b.id + ':' + b.textContent.trim())
          }))()
        """, timeout=20)
        expected_namespaces = [
            'app', 'external', 'gateway', 'monitor', 'network', 'profiles', 'prompts', 'rdp',
            'sftp', 'snippets', 'sshKeys', 'sync', 'system', 'terminal', 'transfer', 'tunnels',
            'updates', 'vault', 'vnc',
        ]
        require(baseline['title'] == 'Aux Command', 'wrong document title', baseline)
        require(baseline['apiKeys'] == expected_namespaces, 'unexpected preload API namespaces', baseline['apiKeys'])
        require(any('snippets-button' in text for text in baseline['buttonTexts']), 'snippets button missing', baseline['buttonTexts'])

        ui_foundation = cdp.eval("""
          ({
            sessionTablist: document.getElementById('session-tabs')?.getAttribute('role') === 'tablist',
            toolbar: document.querySelector('.session-toolbar')?.getAttribute('role') === 'toolbar',
            profileConnect: Boolean(document.querySelector('.profile-connect')),
            profileEdit: Boolean(document.querySelector('.profile-edit')),
            durableStartupError: Boolean(document.getElementById('initialization-error') && document.getElementById('retry-initialization')),
            updateButton: Boolean(document.getElementById('updates-button')),
            sftpEditButton: Boolean(document.getElementById('sftp-edit')),
            labeledTopActions: [...document.querySelectorAll('.top-action .action-label')].map(node => node.textContent.trim())
          })
        """)
        require(
            ui_foundation['sessionTablist'] and ui_foundation['toolbar'] and ui_foundation['profileConnect']
            and ui_foundation['profileEdit'] and ui_foundation['durableStartupError']
            and ui_foundation['updateButton'] and ui_foundation['sftpEditButton']
            and ui_foundation['labeledTopActions'] == [
                'Local shell', 'Snippets', 'Tunnels', 'Network', 'Monitor', 'Gateway',
                'Keys', 'Sync', 'Diagnostics', 'Updates'
            ],
            'remediated UI foundation missing from packaged app',
            ui_foundation,
        )

        terminal_smoke = cdp.eval("""
          (async () => {
            const marker = 'AUX_SMOKE_OK';
            const events = [];
            const unsubscribe = window.auxCommand.terminal.onData((payload) => events.push(payload));
            document.getElementById('welcome-local').click();
            await new Promise(r => setTimeout(r, 1000));
            const state1 = await window.auxCommand.app.getState();
            const session = state1.sessions[state1.sessions.length - 1];
            if (!session) return { ok: false, reason: 'no session after local click', state1 };
            await window.auxCommand.terminal.write(session.id, "printf '%s\\\\n' " + marker + String.fromCharCode(10));
            for (let i = 0; i < 40; i++) {
              await new Promise(r => setTimeout(r, 100));
              const eventText = events.map(event => event.data || '').join('');
              if (eventText.includes(marker)) {
                unsubscribe();
                return {
                  ok: true,
                  session,
                  containsSmoke: true,
                  activeLabel: document.getElementById('active-session-label').textContent,
                  tabs: [...document.querySelectorAll('.session-tab')].map(tab => tab.textContent.trim()),
                  observedVia: 'terminal:data IPC event',
                  bodyText: document.body.innerText.slice(-2000)
                };
              }
              const text = document.body.innerText;
              if (text.includes('AUX_SMOKE_OK')) return {
                ok: true,
                session,
                containsSmoke: true,
                observedVia: 'document body text',
                activeLabel: document.getElementById('active-session-label').textContent,
                tabs: [...document.querySelectorAll('.session-tab')].map(tab => tab.textContent.trim())
              };
            }
            unsubscribe();
            return { ok: false, reason: 'smoke marker not observed in terminal events or DOM text', session, bodyText: document.body.innerText.slice(-2000), events: events.map(event => event.data || '').join('').slice(-2000) };
          })()
        """, timeout=25)
        require(terminal_smoke.get('ok'), 'local terminal smoke failed', terminal_smoke)

        workstation_smoke = cdp.eval("""
          (async () => {
            document.getElementById('local-button').click();
            await new Promise(r => setTimeout(r, 1000));
            const sessionCount = (await window.auxCommand.app.getState()).sessions.length;
            if (!document.getElementById('terminal-stack').classList.contains('layout-grid')) {
              document.getElementById('layout-toggle').click();
              await new Promise(r => setTimeout(r, 250));
            }
            const tiled = document.getElementById('terminal-stack').classList.contains('layout-grid');
            const visibleTerminals = [...document.querySelectorAll('.terminal-view.active')].length;
            document.getElementById('broadcast-toggle').click();
            await new Promise(r => setTimeout(r, 100));
            const confirmBroadcast = [...document.querySelectorAll('#modal-root button')]
              .find((button) => button.textContent.trim() === 'Enable broadcast');
            confirmBroadcast?.click();
            await new Promise(r => setTimeout(r, 150));
            const broadcastOn = document.getElementById('broadcast-toggle').classList.contains('active');
            const broadcastWarningVisible = !document.getElementById('broadcast-warning').hidden;
            document.getElementById('broadcast-toggle').click();
            if (document.getElementById('terminal-stack').classList.contains('layout-grid')) document.getElementById('layout-toggle').click();
            return { ok: sessionCount >= 2 && tiled && visibleTerminals >= 2 && Boolean(confirmBroadcast) && broadcastOn && broadcastWarningVisible, sessionCount, tiled, visibleTerminals, confirmed: Boolean(confirmBroadcast), broadcastOn, broadcastWarningVisible };
          })()
        """, timeout=20)
        require(workstation_smoke.get('ok'), 'tiled layout / broadcast UI smoke failed', workstation_smoke)

        workstation_ops_smoke = cdp.eval("""
          (async () => {
            const closeTopModal = () => document.querySelector('#modal-root .modal-close:not([hidden])')?.click();
            const dispatchShortcut = (code, key, shiftKey = true) => {
              window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, shiftKey, code, key }));
            };
            const before = await window.auxCommand.app.getState();

            document.getElementById('terminal-search-toggle').click();
            await new Promise(r => setTimeout(r, 150));
            const searchPanel = document.querySelector('.terminal-search-panel');
            const searchInput = searchPanel?.querySelector('input');
            if (searchInput) {
              searchInput.value = 'AUX_SMOKE_OK';
              searchInput.dispatchEvent(new Event('input', { bubbles: true }));
              searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
            }
            const searchInToolbar = searchPanel?.parentElement?.id === 'terminal-search-host';
            const searchOpen = Boolean(searchPanel) && searchInToolbar && document.getElementById('terminal-search-toggle').classList.contains('active');
            searchPanel?.querySelector('button[title="Close search"]')?.click();

            dispatchShortcut('KeyP', 'P');
            await new Promise(r => setTimeout(r, 150));
            const paletteText = document.getElementById('modal-root').innerText;
            const paletteOpen = paletteText.includes('Command palette') && paletteText.includes('Duplicate session') && paletteText.includes('Grow tiled panes');
            closeTopModal();
            await new Promise(r => setTimeout(r, 100));

            const beforeDuplicate = (await window.auxCommand.app.getState()).sessions;
            document.getElementById('duplicate-session-button').click();
            await new Promise(r => setTimeout(r, 1000));
            const afterDuplicate = (await window.auxCommand.app.getState()).sessions;
            const duplicateWorked = afterDuplicate.length >= beforeDuplicate.length + 1;

            const activeBeforeReconnect = afterDuplicate[afterDuplicate.length - 1]?.id || '';
            document.getElementById('reconnect-session-button').click();
            await new Promise(r => setTimeout(r, 1200));
            const afterReconnect = (await window.auxCommand.app.getState()).sessions;
            const activeAfterReconnect = afterReconnect[afterReconnect.length - 1]?.id || '';
            const reconnectWorked = afterReconnect.length >= beforeDuplicate.length + 1 && activeAfterReconnect && activeAfterReconnect !== activeBeforeReconnect;

            const stack = document.getElementById('terminal-stack');
            if (!stack.classList.contains('layout-grid')) document.getElementById('layout-toggle').click();
            await new Promise(r => setTimeout(r, 200));
            const paneBefore = getComputedStyle(stack).getPropertyValue('--pane-min-width').trim();
            document.getElementById('pane-grow-button').click();
            await new Promise(r => setTimeout(r, 100));
            const paneAfterGrow = getComputedStyle(stack).getPropertyValue('--pane-min-width').trim();
            document.getElementById('pane-shrink-button').click();
            await new Promise(r => setTimeout(r, 100));
            const paneAfterShrink = getComputedStyle(stack).getPropertyValue('--pane-min-width').trim();
            const resizable = getComputedStyle(document.querySelector('.terminal-view.active')).resize === 'both';

            return {
              ok: searchOpen && paletteOpen && duplicateWorked && reconnectWorked && paneBefore !== paneAfterGrow && paneAfterShrink === paneBefore && resizable,
              beforeSessionCount: before.sessions.length,
              searchOpen,
              searchInToolbar,
              paletteOpen,
              duplicateWorked,
              reconnectWorked,
              paneBefore,
              paneAfterGrow,
              paneAfterShrink,
              resizable,
              sessionIdsAfterReconnect: afterReconnect.map(session => session.id)
            };
          })()
        """, timeout=35)
        require(workstation_ops_smoke.get('ok'), 'find / palette / duplicate / reconnect / pane-size smoke failed', workstation_ops_smoke)

        snippet_smoke = cdp.eval("""
          (async () => {
            const marker = 'AUX_SNIPPET_OK';
            const events = [];
            const unsubscribe = window.auxCommand.terminal.onData((payload) => events.push(payload));
            const snippet = await window.auxCommand.snippets.save({
              name: 'E2E snippet smoke',
              command: "printf '%s\\\\n' AUX_SNIPPET_OK",
              description: 'Created by packaged CDP smoke test'
            });
            document.getElementById('snippets-button').click();
            await new Promise(r => setTimeout(r, 200));
            const modalText = document.getElementById('modal-root').innerText;
            const rows = [...document.querySelectorAll('.snippet-row')];
            const row = rows.find(candidate => candidate.innerText.includes('E2E snippet smoke'));
            if (!row) return { ok: false, reason: 'snippet row missing', modalText };
            const runButton = [...row.querySelectorAll('button')].find(button => button.textContent.trim() === 'Run');
            if (!runButton || runButton.disabled) return { ok: false, reason: 'run button unavailable', modalText };
            runButton.click();
            for (let i = 0; i < 40; i++) {
              await new Promise(r => setTimeout(r, 100));
              const eventText = events.map(event => event.data || '').join('');
              if (eventText.includes(marker) || document.body.innerText.includes(marker)) {
                await window.auxCommand.snippets.delete(snippet.id);
                unsubscribe();
                return { ok: true, snippetId: snippet.id, observedVia: eventText.includes(marker) ? 'terminal:data IPC event' : 'document body text', modalText };
              }
            }
            await window.auxCommand.snippets.delete(snippet.id).catch(() => {});
            unsubscribe();
            return { ok: false, reason: 'snippet output not observed in terminal events or DOM text', bodyText: document.body.innerText.slice(-2000), events: events.map(event => event.data || '').join('').slice(-2000) };
          })()
        """, timeout=25)
        require(snippet_smoke.get('ok'), 'snippet UI smoke failed', snippet_smoke)

        updates_smoke = cdp.eval("""
          (async () => {
            document.getElementById('updates-button').click();
            await new Promise(r => setTimeout(r, 200));
            const modalText = document.getElementById('modal-root').innerText;
            document.querySelector('#modal-root .modal-close:not([hidden])')?.click();
            const normalized = modalText.toLowerCase();
            return { opened: normalized.includes('aux command updates') && (normalized.includes('github release') || normalized.includes('github releases')), modalText: modalText.slice(0, 1000) };
          })()
        """, timeout=5)
        require(updates_smoke.get('opened'), 'top-level updates modal smoke failed', updates_smoke)

        diagnostics_smoke = cdp.eval("""
          (async () => {
            document.getElementById('diagnostics-button').click();
            await new Promise(r => setTimeout(r, 200));
            const modalText = document.getElementById('modal-root').innerText;
            document.querySelector('#modal-root button')?.click();
            const normalized = modalText.toLowerCase();
            return { opened: normalized.includes('system diagnostics') && normalized.includes('runtime tools'), modalText: modalText.slice(0, 1000) };
          })()
        """, timeout=5)
        require(diagnostics_smoke.get('opened'), 'diagnostics modal smoke failed', diagnostics_smoke)

        operations_tools_smoke = cdp.eval("""
          (async () => {
            const checks = {};
            const openAndRead = async (buttonId) => {
              document.getElementById(buttonId)?.click();
              await new Promise(r => setTimeout(r, 250));
              const text = document.getElementById('modal-root').innerText;
              document.querySelector('#modal-root .modal-close:not([hidden])')?.click();
              await new Promise(r => setTimeout(r, 80));
              return text;
            };
            checks.network = (await openAndRead('network-tools-button')).includes('Network tools');
            checks.keys = (await openAndRead('sshkeys-button')).includes('SSH Key Manager');
            checks.monitor = (await openAndRead('monitor-button')).includes('Live server monitor');
            checks.gateway = (await openAndRead('gateway-button')).includes('Remote desktop gateway');
            checks.sync = (await openAndRead('sync-button')).includes('Profile synchronization');
            const state = await window.auxCommand.app.getState();
            const privateDefaults = state.profiles.some(p => String(p.id).startsWith('infra-'));
            const defaultsOk = state.profiles.length === 1
              && state.profiles[0].id === 'local-shell'
              && state.profiles[0].protocol === 'local'
              && !privateDefaults;
            return { ok: Object.values(checks).every(Boolean) && defaultsOk, checks, privateDefaults, defaultsOk };
          })()
        """, timeout=10)
        require(operations_tools_smoke.get('ok'), 'operations tools or privacy-safe profile defaults smoke failed', operations_tools_smoke)

        state_after = cdp.eval('(async () => await window.auxCommand.app.getState())()', timeout=10)
        screenshot = capture_screenshot(cdp)

        print(json.dumps({
            'baseline': baseline,
            'localTerminalSmoke': terminal_smoke,
            'workstationSmoke': workstation_smoke,
            'workstationOpsSmoke': workstation_ops_smoke,
            'snippetSmoke': snippet_smoke,
            'updatesModalSmoke': updates_smoke,
            'diagnosticsModalSmoke': diagnostics_smoke,
            'operationsToolsSmoke': operations_tools_smoke,
            'stateAfter': state_after,
            'screenshot': screenshot['path'],
            'screenshotWarning': screenshot['warning'],
            'eventsCaptured': len(cdp.events),
        }, indent=2))
        return 0
    finally:
        cdp.close()


if __name__ == '__main__':
    sys.exit(main())
