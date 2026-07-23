#!/usr/bin/env python3
"""Repeated CDP runtime soak for a running Aux Command Electron instance.

Launch source/AppImage with a remote debugging port, then run:
  AUX_COMMAND_CDP_PORT=9233 AUX_COMMAND_SOAK_ITERATIONS=10 python3 scripts/soak-cdp.py
"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.request

try:
    import websocket
except ImportError as exc:  # pragma: no cover
    raise SystemExit('Missing Python package websocket-client. Install in the active venv with: python3 -m pip install websocket-client') from exc

PORT = os.environ.get('AUX_COMMAND_CDP_PORT', '9223')
TARGET = f'http://127.0.0.1:{PORT}/json'
ITERATIONS = int(os.environ.get('AUX_COMMAND_SOAK_ITERATIONS', '8'))
SCREENSHOT_PATH = os.environ.get('AUX_COMMAND_SOAK_SCREENSHOT', '/tmp/aux-command-soak.png')


def get_ws_url() -> str:
    deadline = time.time() + 20
    last = None
    while time.time() < deadline:
        try:
            pages = json.load(urllib.request.urlopen(TARGET, timeout=2))
            for page in pages:
                if page.get('type') == 'page' and page.get('title') == 'Aux Command':
                    return page['webSocketDebuggerUrl']
            last = pages
        except Exception as exc:  # pragma: no cover - readiness wait path
            last = repr(exc)
        time.sleep(0.25)
    raise RuntimeError(f'Aux Command page not found: {last!r}')


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


def run_cycle(cdp: CDP, index: int) -> dict:
    return cdp.eval(f"""
      (async () => {{
        const marker = 'AUX_SOAK_{index}';
        const events = [];
        const unsubscribe = window.auxCommand.terminal.onData((payload) => events.push(payload));
        document.getElementById('welcome-local')?.click();
        if (!document.querySelector('.session-tab')) document.getElementById('local-button')?.click();
        await new Promise(r => setTimeout(r, 650));
        const state = await window.auxCommand.app.getState();
        const session = state.sessions[state.sessions.length - 1];
        if (!session) {{ unsubscribe(); return {{ ok: false, reason: 'no session', state }}; }}
        await window.auxCommand.terminal.write(session.id, "printf '%s\\\\n' " + marker + String.fromCharCode(10));
        let observed = false;
        for (let i = 0; i < 35; i++) {{
          await new Promise(r => setTimeout(r, 80));
          const text = events.map(event => event.data || '').join('');
          if (text.includes(marker) || document.body.innerText.includes(marker)) {{ observed = true; break; }}
        }}
        const tabsBeforeClose = document.querySelectorAll('.session-tab').length;
        await window.auxCommand.terminal.close(session.id);
        await new Promise(r => setTimeout(r, 150));
        const after = await window.auxCommand.app.getState();
        unsubscribe();
        return {{
          ok: observed && !after.sessions.some(candidate => candidate.id === session.id),
          marker,
          observed,
          sessionId: session.id,
          tabsBeforeClose,
          sessionCountAfterClose: after.sessions.length
        }};
      }})()
    """, timeout=20)


def main() -> int:
    cdp = CDP(get_ws_url())
    results: list[dict] = []
    try:
        cdp.call('Page.enable')
        cdp.call('Runtime.enable')
        cdp.call('Log.enable')
        cdp.call('Page.bringToFront')
        baseline = cdp.eval("""
          (async () => ({ title: document.title, readyState: document.readyState, api: Boolean(window.auxCommand) }))()
        """, timeout=20)
        require(baseline.get('title') == 'Aux Command' and baseline.get('api'), 'baseline failed', baseline)
        for index in range(ITERATIONS):
            result = run_cycle(cdp, index)
            require(result.get('ok'), f'soak cycle {index} failed', result)
            results.append(result)
            if index and index % 3 == 0:
                cdp.call('Page.reload', {'ignoreCache': True}, timeout=10)
                time.sleep(1.0)
                post_reload = cdp.eval("""
                  (async () => ({ title: document.title, api: Boolean(window.auxCommand), state: await window.auxCommand.app.getState() }))()
                """, timeout=20)
                require(post_reload.get('title') == 'Aux Command' and post_reload.get('api'), 'post-reload baseline failed', post_reload)
        screenshot = cdp.call('Page.captureScreenshot', {'format': 'png'}, timeout=20)
        with open(SCREENSHOT_PATH, 'wb') as handle:
            handle.write(base64.b64decode(screenshot['data']))
        print(json.dumps({
            'ok': True,
            'iterations': ITERATIONS,
            'screenshot': SCREENSHOT_PATH,
            'sessionIds': [result['sessionId'] for result in results],
        }, indent=2))
        return 0
    finally:
        cdp.close()


if __name__ == '__main__':
    raise SystemExit(main())
