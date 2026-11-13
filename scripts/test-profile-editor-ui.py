#!/usr/bin/env python3
"""The connection editor, driven through the real window with the keyboard.

Starts its own Aux Command (the source tree under Electron, in a throwaway X
display and profile store) with these stored connections:

  * an SSH row saved before the username rules were tightened (invalid: a
    DOMAIN\\user name), which also holds RDP and serial values;
  * a valid SSH twin of it;
  * a valid RDP row and a valid serial row that also hold SSH values;
  * SSH, RDP, serial and FTPS rows exactly as Aux Command 0.4.0 saved them.

Then, with the keyboard only, at the smallest window size (980x640) and at the
default size (1480x920), it checks that:

  * saving keeps the stored value of every field the editor does not show for
    the selected protocol, for invalid and valid rows alike (the file on disk
    is compared field by field with what was stored);
  * the "Fix this connection first" alert from Enter on an invalid row is gone
    once the editor opens, so it never covers Save or Cancel;
  * saving an invalid row that has two faults (a bad username and a startup
    command over the maximum) with only the username fixed is refused with the
    startup command's reason, and that row on disk is unchanged;
  * the same for a CRLF startup command, CRLF notes, and long identity file,
    known hosts, SFTP root, jump host, font family and name values whose cut
    ends in a space or holds a line break, which the editor changes (trim,
    LF line ends, dropped line breaks) before it sends them back;
  * when the editor closes (Save or Escape) focus is back on the connection's
    actions button, visibly, and the first-run tour, once skipped, does not
    come back after a save.

There are no fixed sleeps: every wait polls for the state it needs and fails
with the observed state after a generous limit.
"""

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

try:
    import websocket
except ImportError as exc:  # pragma: no cover - operator guidance path
    raise SystemExit('Missing Python package websocket-client. Install in the active venv with: python3 -m pip install websocket-client') from exc

ROOT = Path(__file__).resolve().parent.parent
WAIT_LIMIT = float(os.environ.get('AUX_PROFILE_EDITOR_WAIT', '20'))

# Rows exactly as Aux Command 0.4.0 wrote them (its own ProfileStore.save and
# normalizeProfile, src/main/lib at a9d71c5, the last 0.4.0 commit). They hold
# values for every protocol and predate fields such as ftpsMode.
LEGACY_040_ROWS = [
    {'id': 'v040-ssh', 'name': 'Old SSH', 'protocol': 'ssh', 'group': 'Old', 'host': 'old-ssh.example', 'port': 2201, 'username': 'ops', 'identityFile': '/home/ops/.ssh/id_old', 'knownHostsFile': '', 'sshAlias': '', 'sshAliases': [], 'transferMode': 'sftp', 'credentialId': '', 'credentialKind': 'passphrase', 'tags': ['old'], 'favorite': True, 'tabColor': '', 'useSshConfig': True, 'startupCommand': 'echo old', 'proxyJump': 'jump.old:2201', 'trackRemoteCwd': False, 'keepAliveSeconds': 45, 'compression': True, 'agentForwarding': False, 'x11Forwarding': False, 'sftpRoot': '/var/www', 'device': '/dev/ttyS4', 'baudRate': 19200, 'rdpAudio': True, 'rdpWidth': 1366, 'rdpHeight': 768, 'rdpDomain': 'OLD', 'inheritTerminalDefaults': False, 'terminalTheme': 'aux-dark', 'terminalFontFamily': 'JetBrains Mono, Fira Code, Cascadia Code, DejaVu Sans Mono, monospace', 'terminalFontSize': 17, 'terminalCursorStyle': 'block', 'terminalCursorBlink': True, 'terminalScrollback': 33333, 'notes': 'written by 0.4.0', 'createdAt': '2026-11-13T13:37:38.963Z', 'updatedAt': '2026-11-13T13:37:38.962Z'},
    {'id': 'v040-rdp', 'name': 'Old RDP', 'protocol': 'rdp', 'group': 'Old', 'host': 'old-rdp.example', 'port': 3390, 'username': 'ops', 'identityFile': '', 'knownHostsFile': '', 'sshAlias': '', 'sshAliases': [], 'transferMode': 'sftp', 'credentialId': '', 'credentialKind': 'password', 'tags': ['old'], 'favorite': True, 'tabColor': '', 'useSshConfig': True, 'startupCommand': 'echo old', 'proxyJump': 'jump.old:2201', 'trackRemoteCwd': False, 'keepAliveSeconds': 45, 'compression': True, 'agentForwarding': False, 'x11Forwarding': False, 'sftpRoot': '/var/www', 'device': '/dev/ttyS4', 'baudRate': 19200, 'rdpAudio': True, 'rdpWidth': 1366, 'rdpHeight': 768, 'rdpDomain': 'OLD', 'inheritTerminalDefaults': False, 'terminalTheme': 'aux-dark', 'terminalFontFamily': 'JetBrains Mono, Fira Code, Cascadia Code, DejaVu Sans Mono, monospace', 'terminalFontSize': 17, 'terminalCursorStyle': 'block', 'terminalCursorBlink': True, 'terminalScrollback': 33333, 'notes': 'written by 0.4.0', 'createdAt': '2026-11-13T13:37:38.963Z', 'updatedAt': '2026-11-13T13:37:38.963Z'},
    {'id': 'v040-serial', 'name': 'Old serial', 'protocol': 'serial', 'group': 'Old', 'host': '', 'port': 22, 'username': '', 'identityFile': '', 'knownHostsFile': '', 'sshAlias': '', 'sshAliases': [], 'transferMode': 'sftp', 'credentialId': '', 'credentialKind': 'password', 'tags': ['old'], 'favorite': True, 'tabColor': '', 'useSshConfig': True, 'startupCommand': 'echo old', 'proxyJump': 'jump.old:2201', 'trackRemoteCwd': False, 'keepAliveSeconds': 45, 'compression': True, 'agentForwarding': False, 'x11Forwarding': False, 'sftpRoot': '/var/www', 'device': '/dev/ttyS4', 'baudRate': 19200, 'rdpAudio': True, 'rdpWidth': 1366, 'rdpHeight': 768, 'rdpDomain': 'OLD', 'inheritTerminalDefaults': False, 'terminalTheme': 'aux-dark', 'terminalFontFamily': 'JetBrains Mono, Fira Code, Cascadia Code, DejaVu Sans Mono, monospace', 'terminalFontSize': 17, 'terminalCursorStyle': 'block', 'terminalCursorBlink': True, 'terminalScrollback': 33333, 'notes': 'written by 0.4.0', 'createdAt': '2026-11-13T13:37:38.964Z', 'updatedAt': '2026-11-13T13:37:38.964Z'},
    {'id': 'v040-ftps', 'name': 'Old FTPS', 'protocol': 'ftps', 'group': 'Old', 'host': 'old-ftp.example', 'port': 990, 'username': 'ops', 'identityFile': '', 'knownHostsFile': '', 'sshAlias': '', 'sshAliases': [], 'transferMode': 'sftp', 'credentialId': '', 'credentialKind': 'password', 'tags': ['old'], 'favorite': True, 'tabColor': '', 'useSshConfig': True, 'startupCommand': 'echo old', 'proxyJump': 'jump.old:2201', 'trackRemoteCwd': False, 'keepAliveSeconds': 45, 'compression': True, 'agentForwarding': False, 'x11Forwarding': False, 'sftpRoot': '/var/www', 'device': '/dev/ttyS4', 'baudRate': 19200, 'rdpAudio': True, 'rdpWidth': 1366, 'rdpHeight': 768, 'rdpDomain': 'OLD', 'inheritTerminalDefaults': False, 'terminalTheme': 'aux-dark', 'terminalFontFamily': 'JetBrains Mono, Fira Code, Cascadia Code, DejaVu Sans Mono, monospace', 'terminalFontSize': 17, 'terminalCursorStyle': 'block', 'terminalCursorBlink': True, 'terminalScrollback': 33333, 'notes': 'written by 0.4.0', 'createdAt': '2026-11-13T13:37:38.965Z', 'updatedAt': '2026-11-13T13:37:38.965Z'},
]

FIXTURE = r"""
'use strict';
// Test-only Electron entry: seeds a profile store, then loads the real app.
const { app } = require('electron');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const root = process.env.AUX_PROFILE_EDITOR_ROOT;
const directory = process.env.AUX_PROFILE_EDITOR_DIR;
const home = path.join(directory, 'home');
fs.mkdirSync(path.join(home, '.ssh'), { recursive: true });
os.homedir = () => home;
app.setPath('userData', path.join(directory, 'app'));
app.getVersion = () => require(path.join(root, 'package.json')).version;
app.getAppPath = () => root;
const { defaultLocalProfile } = require(path.join(root, 'src/main/lib/command-builder.cjs'));
const { normalizeProfile } = require(path.join(root, 'src/main/lib/validation.cjs'));
const created = '2020-01-02T03:04:05.000Z'; const updated = '2021-01-02T03:04:05.000Z';
// Values a form for another protocol does not show.
const rdpValues = { rdpDomain: 'CORP', rdpWidth: 1280, rdpHeight: 800, rdpAudio: true };
const serialValues = { device: '/dev/ttyUSB7', baudRate: 9600 };
const sshValues = {
  identityFile: '/home/ops/.ssh/id_ops', knownHostsFile: '/home/ops/.ssh/known_hosts_ops', proxyJump: 'bastion:2200',
  keepAliveSeconds: 77, compression: true, agentForwarding: true, x11Forwarding: true, useSshConfig: false,
  startupCommand: 'tmux attach || tmux new', trackRemoteCwd: false, sftpRoot: '/srv', credentialKind: 'passphrase'
};
const common = {
  group: 'Work', tags: ['a', 'b'], favorite: true, notes: 'line one\nline two', terminalTheme: 'aux-dark', terminalFontSize: 19,
  terminalScrollback: 54321, terminalCursorStyle: 'bar', terminalCursorBlink: false, terminalFontFamily: 'Hack, monospace',
  inheritTerminalDefaults: false, createdAt: created, updatedAt: updated
};
const rich = { ...common, ...sshValues, ...rdpValues, ...serialValues, id: 'legacy-rich', name: 'Rich legacy', protocol: 'ssh',
  host: 'rich.example', port: 2222, username: 'CORP\\jd', transferMode: 'scp' };
const twin = normalizeProfile({ ...rich, id: 'valid-twin', name: 'Valid twin', username: 'jd@corp' }, 'valid-twin');
const rdp = normalizeProfile({ ...common, ...sshValues, ...serialValues, ...rdpValues, id: 'valid-rdp', name: 'Windows desk', protocol: 'rdp',
  host: 'win.example', port: 3389, username: 'ops', credentialKind: 'password', rdpWidth: 1600, rdpHeight: 900 }, 'valid-rdp');
const serial = normalizeProfile({ ...common, ...sshValues, ...rdpValues, id: 'valid-serial', name: 'Console line', protocol: 'serial',
  host: '', port: 22, username: 'console', device: '/dev/ttyUSB3', baudRate: 57600 }, 'valid-serial');
const legacy = JSON.parse(fs.readFileSync(path.join(directory, 'legacy-040.json'), 'utf8'));
// Two faults in one row: a username that fails validation, and a startup command
// over the 2,048-character maximum whose cut copy ends in a different command.
const cutTail = '; rm -rf /';
const twoFaults = { ...common, id: 'two-faults', name: 'Two faults', protocol: 'ssh', host: 'two.example', port: 22, username: 'CORP\\jd',
  startupCommand: 'echo ' + 'a'.repeat(2048 - 5 - cutTail.length) + cutTail + 'tmp/build-cache-keepme' };
// More invalid rows, each with one oversized field whose cut copy the editor does not send back
// unchanged: textareas return CRLF as LF, inputs are trimmed (the cut ends in a space), and an
// input drops line breaks. Each is invalid on its username too, so only the username is fixed.
const cutBase = { ...common, ...sshValues, protocol: 'ssh', host: 'cut.example', port: 22, username: 'CORP\\jd' };
const crlfLines = 'echo one\r\n'.repeat(100);
const spaced = (length, prefix) => prefix + 'k'.repeat(length - prefix.length - 2) + ' x';
const cutRows = [
  { ...cutBase, id: 'cut-command', name: 'Cut CRLF command',
    startupCommand: crlfLines + 'echo ' + 'a'.repeat(2048 - crlfLines.length - 5 - cutTail.length) + cutTail + 'tmp/build-cache-keepme' },
  { ...cutBase, id: 'cut-notes', name: 'Cut CRLF notes', notes: 'note line\r\n'.repeat(400) },
  { ...cutBase, id: 'cut-identity', name: 'Cut identity file', identityFile: spaced(4097, '/home/ops/.ssh/') },
  { ...cutBase, id: 'cut-known-hosts', name: 'Cut known hosts', knownHostsFile: spaced(4097, '/home/ops/.ssh/') },
  { ...cutBase, id: 'cut-sftp-root', name: 'Cut SFTP root', sftpRoot: '/' + 'd'.repeat(4094) + ' x' },
  { ...cutBase, id: 'cut-proxy', name: 'Cut jump host', proxyJump: 'a'.repeat(511) + ' b' },
  { ...cutBase, id: 'cut-font', name: 'Cut font family', terminalFontFamily: 'F'.repeat(239) + ' x' },
  { ...cutBase, id: 'cut-name', name: 'Name ' + 'N'.repeat(114) + ' tail' },
  { ...cutBase, id: 'cut-newline', name: 'Cut line break', proxyJump: 'a'.repeat(300) + '\n' + 'b'.repeat(300) }
];
const seed = { version: 2, profiles: [defaultLocalProfile(), rich, twin, rdp, serial, ...legacy, twoFaults, ...cutRows], snippets: [] };
const dataDir = path.join(directory, 'app', 'aux-command-data');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'profiles.json'), JSON.stringify(seed, null, 2));
fs.writeFileSync(path.join(directory, 'seed.json'), JSON.stringify(seed, null, 2));
require(path.join(root, 'src/main/index.cjs'));
"""


class Page:
    def __init__(self, url, origin):
        self.ws = websocket.create_connection(url, origin=origin, timeout=30)
        self.seq = 0

    def call(self, method, params=None):
        self.seq += 1
        self.ws.send(json.dumps({'id': self.seq, 'method': method, 'params': params or {}}))
        while True:
            message = json.loads(self.ws.recv())
            if message.get('id') == self.seq:
                if message.get('error'):
                    raise RuntimeError(method + ': ' + json.dumps(message['error']))
                return message.get('result', {})

    def ev(self, expression):
        result = self.call('Runtime.evaluate', {'expression': '(async()=>(' + expression + '))()', 'awaitPromise': True, 'returnByValue': True})
        if result.get('exceptionDetails'):
            raise RuntimeError(json.dumps(result['exceptionDetails'])[:800])
        return result.get('result', {}).get('value')

    def close(self):
        self.ws.close()


KEYS = {'Tab': 9, 'Enter': 13, 'Escape': 27, 'ArrowDown': 40, 'a': 65}
ACTIVE = '''(()=>{const a=document.activeElement;return {tag:a?.tagName,cls:a?.className||'',name:a?.getAttribute?.('name'),
  aria:a?.getAttribute?.('aria-label'),text:(a?.textContent||'').trim().slice(0,60),inModal:!!a?.closest?.('.modal'),
  focusVisible:!!a?.matches?.(':focus-visible'),profileId:a?.closest?.('.profile-item')?.dataset?.profileId||null}})()'''


def wait(page, expression, what):
    deadline = time.monotonic() + WAIT_LIMIT
    while time.monotonic() < deadline:
        if page.ev('!!(' + expression + ')'):
            return
        time.sleep(0.05)
    raise AssertionError('Timed out waiting for ' + what + '; focus: ' + json.dumps(page.ev(ACTIVE)))


def key(page, name, modifiers=0):
    params = {'key': name, 'code': 'Key' + name.upper() if len(name) == 1 else name,
              'windowsVirtualKeyCode': KEYS[name], 'nativeVirtualKeyCode': KEYS[name], 'modifiers': modifiers}
    down = dict(params, type='rawKeyDown')
    if name == 'Enter':
        down = dict(params, type='keyDown', text='\r')
    page.call('Input.dispatchKeyEvent', down)
    page.call('Input.dispatchKeyEvent', dict(params, type='keyUp'))


def tab_until(page, predicate, what, limit=300):
    for _ in range(limit):
        key(page, 'Tab')
        if page.ev('(()=>{const a=document.activeElement;return !!(' + predicate + ')})()'):
            return
    raise AssertionError('Tab never reached ' + what + '; focus: ' + json.dumps(page.ev(ACTIVE)))


def editor_open(page):
    return page.ev('!!document.querySelector(".modal [name=username]")')


def open_editor(page, name, invalid):
    """Keyboard only: the row, Enter (invalid rows raise an alert), the actions button, Edit."""
    page.ev('(document.activeElement?.blur(), true)')
    label = json.dumps(name + ' cannot be used') if invalid else json.dumps('Connect to ' + name + ',')
    tab_until(page, 'a.classList?.contains("profile-connect") && (a.getAttribute("aria-label")||"").startsWith(' + label + ')', 'the row for ' + name)
    alert = None
    if invalid:
        key(page, 'Enter')
        wait(page, '[...document.querySelectorAll("#toast-region .toast")].some(t=>t.dataset.toastTitle==="Fix this connection first")', 'the invalid-row alert')
        alert = page.ev('[...document.querySelectorAll("#toast-region .toast")].map(t=>({role:t.getAttribute("role"),text:t.textContent.trim().slice(0,160)}))')
    tab_until(page, 'a.classList?.contains("profile-edit") && (a.getAttribute("aria-label")||"").endsWith(' + json.dumps(name) + ')', 'the actions button for ' + name)
    key(page, 'Enter')
    wait(page, 'document.querySelector(".context-menu")', 'the actions menu')
    if not page.ev('!!document.activeElement?.closest?.("[role=menu]")'):
        key(page, 'ArrowDown')
    for _ in range(12):
        if 'Edit' in (page.ev(ACTIVE).get('text') or ''):
            break
        key(page, 'ArrowDown')
    else:
        raise AssertionError('Edit is not in the actions menu: ' + json.dumps(page.ev(ACTIVE)))
    key(page, 'Enter')
    wait(page, 'document.querySelector(".modal [name=username]") && document.activeElement?.closest?.(".modal")', 'the editor with focus inside it')
    return alert


def footer_unobstructed(page):
    """What is painted at the centre of Save and Cancel, and any toast still showing."""
    return page.ev('''(()=>{const out={};const m=document.querySelector('[role=dialog][aria-modal=true]');
      for (const b of m.querySelectorAll('.modal-footer button')){const label=b.textContent.trim();if(!/^(Save changes|Cancel)$/.test(label))continue;
        b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;
        const hit=document.elementFromPoint(x,y);
        const covered=[...document.querySelectorAll('#toast-region .toast')].some(t=>{const q=t.getBoundingClientRect();return q.left<r.right&&q.right>r.left&&q.top<r.bottom&&q.bottom>r.top;});
        out[label]={onTop:hit===b||b.contains(hit),covered,inView:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};}
      out.toasts=[...document.querySelectorAll('#toast-region .toast')].map(t=>t.dataset.toastTitle);return out;})()''')


def replace_field(page, field, text):
    tab_until(page, 'a.getAttribute("name")===' + json.dumps(field) + ' && a.closest(".modal")', 'the ' + field + ' field')
    key(page, 'a', 2)
    page.call('Input.insertText', {'text': text})


def save(page):
    if not page.ev('!!document.querySelector(".modal-backdrop")'):
        raise AssertionError('the editor closed before Save; toasts: ' + json.dumps(page.ev('[...document.querySelectorAll("#toast-region .toast")].map(t=>t.textContent.trim())')))
    tab_until(page, 'a.tagName==="BUTTON" && a.closest(".modal") && a.textContent.trim()==="Save changes"', 'Save changes')
    key(page, 'Enter')
    wait(page, '!document.querySelector(".modal-backdrop")', 'the editor to close after Save')


def focus_back_on(page, name, how):
    expression = ('document.activeElement?.classList?.contains("profile-edit") && '
                  '(document.activeElement.getAttribute("aria-label")||"").endsWith(' + json.dumps(name) + ')')
    deadline = time.monotonic() + WAIT_LIMIT
    while time.monotonic() < deadline:
        if page.ev('!!(' + expression + ')'):
            break
        time.sleep(0.05)
    focus = page.ev(ACTIVE)
    if not page.ev('!!(' + expression + ')'):
        focus['sidebar'] = page.ev('''(()=>{const shell=document.querySelector('#app-shell');const b=[...document.querySelectorAll('.profile-edit')].find(x=>(x.getAttribute('aria-label')||'').endsWith(''' + json.dumps(name) + '''));
          const r=b?.getBoundingClientRect();return {open:shell.classList.contains('sidebar-open'),hiddenPref:shell.className,inert:shell.inert,button:!!b,rect:r&&[r.left,r.top,r.width,r.height],
          visibility:b&&getComputedStyle(b).visibility,display:b&&getComputedStyle(b.closest('aside')||b).display}})()''')
    assert page.ev('!!(' + expression + ')'), 'after ' + how + ' focus is not on the actions button for ' + name + ': ' + json.dumps(focus)
    assert focus['focusVisible'], 'focus returned to ' + name + ' but is not visible: ' + json.dumps(focus)
    outline = page.ev('(()=>{const s=getComputedStyle(document.activeElement);return {style:s.outlineStyle,width:s.outlineWidth,shadow:s.boxShadow}})()')
    assert outline['style'] != 'none' or outline['shadow'] != 'none', 'the focused actions button has no focus ring: ' + json.dumps(outline)
    document = page.call('DOM.getDocument', {'depth': 0})
    node = page.call('DOM.querySelector', {'nodeId': document['root']['nodeId'], 'selector': '.profile-edit:focus'})['nodeId']
    ax = page.call('Accessibility.getPartialAXTree', {'nodeId': node, 'fetchRelatives': False})['nodes'][0]
    focus['role'] = ax.get('role', {}).get('value')
    focus['accessibleName'] = ax.get('name', {}).get('value')
    assert focus['role'] == 'button' and focus['accessibleName'] == 'Actions for ' + name, 'the focused control is not announced as the actions button: ' + json.dumps(focus)
    return focus


def tour_hidden(page):
    return page.ev('document.querySelector("#tour-root").hidden')


def stored(directory):
    data = json.loads((directory / 'app' / 'aux-command-data' / 'profiles.json').read_text())
    return {row['id']: row for row in data['profiles']}


def kept_every_field(before, after, changed, label):
    lost = {}
    for field, value in before.items():
        if field in changed or field == 'updatedAt':
            continue
        if after.get(field) != value:
            lost[field] = {'stored': value, 'after save': after.get(field)}
    assert not lost, label + ': saving changed fields the edit did not touch: ' + json.dumps(lost)
    for field, value in changed.items():
        assert after.get(field) == value, label + ': ' + field + ' is ' + json.dumps(after.get(field)) + ', expected ' + json.dumps(value)
    assert after.get('updatedAt') != before.get('updatedAt'), label + ': updatedAt did not move, so nothing was saved'


def set_size(page, width, height):
    page.call('Emulation.setDeviceMetricsOverride', {'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': False})
    wait(page, 'innerWidth===%d && innerHeight===%d' % (width, height), 'the window size %dx%d' % (width, height))


def open_sidebar_if_collapsed(page):
    """Under 1025 px the connections list is an overlay that starts closed."""
    if not page.ev('innerWidth<=1024 && !document.querySelector("#app-shell").classList.contains("sidebar-open")'):
        return False
    page.ev('(document.activeElement?.blur(), true)')
    tab_until(page, 'a.id==="sidebar-toggle"', 'the connections sidebar toggle')
    key(page, 'Enter')
    wait(page, 'document.querySelector("#app-shell").classList.contains("sidebar-open") && getComputedStyle(document.querySelector(".sidebar")).visibility==="visible" && document.querySelector(".profile-item").getBoundingClientRect().left>=0',
         'the sidebar to open')
    return True


# (row id, name as the list shows it, control, validation maximum (what the window's copy is cut to), field label in the reason)
CUT_CASES = [
    ('cut-command', 'Cut CRLF command', 'startupCommand', 2048, 'Startup command'),
    ('cut-notes', 'Cut CRLF notes', 'notes', 4096, 'Notes'),
    ('cut-identity', 'Cut identity file', 'identityFile', 4096, 'Identity file'),
    ('cut-known-hosts', 'Cut known hosts', 'knownHostsFile', 4096, 'Known-hosts file'),
    ('cut-sftp-root', 'Cut SFTP root', 'sftpRoot', 4096, 'SFTP start path'),
    ('cut-proxy', 'Cut jump host', 'proxyJump', 512, 'ProxyJump'),
    ('cut-font', 'Cut font family', 'terminalFontFamily', 240, 'terminalFontFamily'),
    ('cut-name', 'Name ' + 'N' * 114 + ' ', 'name', 120, 'Name'),
    ('cut-newline', 'Cut line break', 'proxyJump', 512, 'ProxyJump'),
]


def what_the_control_holds(field, text):
    """The window's cut copy as the control holds it: a textarea turns CRLF into LF, an input drops line breaks."""
    cut = text
    return cut.replace('\r\n', '\n').replace('\r', '\n') if field in ('startupCommand', 'notes') else cut.replace('\r', '').replace('\n', '')


def refused_cut_row(page, directory, seed, row_id, list_name, field, limit, label):
    """Fix only the username of an invalid row whose `field` is over the maximum: Save must be
    refused with that field's reason, the editor must stay open and the row on disk must not move."""
    before = seed[row_id]
    open_editor(page, list_name, invalid=True)
    shown = page.ev('document.querySelector(".modal [name=' + field + ']").value')
    assert len(before[field].strip()) > limit, row_id + ': the stored value is not over the maximum'
    expected = what_the_control_holds(field, before[field].strip()[:limit])
    assert shown == expected, '%s: the editor shows %d characters ending %r, expected %d ending %r' % (row_id, len(shown), shown[-14:], len(expected), expected[-14:])
    replace_field(page, 'username', 'jd@corp')
    tab_until(page, 'a.tagName==="BUTTON" && a.closest(".modal") && a.textContent.trim()==="Save changes"', 'Save changes')
    key(page, 'Enter')
    wait(page, '!document.querySelector(".modal-backdrop") || [...document.querySelectorAll("#toast-region .toast")].some(t=>/too long/i.test(t.textContent))',
         'the save of ' + row_id + ' to be answered')
    answer = page.ev('[...document.querySelectorAll("#toast-region .toast")].map(t=>t.textContent.trim().slice(0,160))')
    after = stored(directory)[row_id]
    assert after.get(field) == before[field], '%s: the save stored a changed %s (%d characters, ends %r)' % (row_id, field, len(after.get(field) or ''), (after.get(field) or '')[-14:])
    assert after == before, row_id + ': the refused save changed the stored row: ' + json.dumps({k: [before.get(k), after.get(k)] for k in set(before) | set(after) if before.get(k) != after.get(k)})[:400]
    assert page.ev('!!document.querySelector(".modal-backdrop")'), row_id + ': the editor closed although the save was refused'
    assert any(label in text and 'too long' in text.lower() for text in answer), '%s: the save was not refused with the %s reason: %s' % (row_id, label, json.dumps(answer))
    key(page, 'Escape')
    wait(page, '!document.querySelector(".modal-backdrop")', 'the editor to close on Escape')
    assert stored(directory)[row_id] == before, row_id + ': closing the editor changed the stored row'
    return answer


def run(page, directory):
    report = {}
    seed = {row['id']: row for row in json.loads((directory / 'seed.json').read_text())['profiles']}
    page.call('DOM.enable')
    page.call('Accessibility.enable')
    wait(page, 'document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"', 'the app to finish loading')
    # The first-run tour opens by itself; skip it with the keyboard.
    wait(page, '!document.querySelector("#tour-root").hidden', 'the first-run tour')
    key(page, 'Escape')
    wait(page, 'document.querySelector("#tour-root").hidden', 'the tour to close on Escape')

    # Smallest window: fix the invalid row.
    set_size(page, 980, 640)
    report['narrow_sidebar_opened'] = open_sidebar_if_collapsed(page)
    report['alert_on_enter'] = open_editor(page, 'Rich legacy', invalid=True)
    footer = footer_unobstructed(page)
    report['narrow_footer'] = footer
    assert 'Fix this connection first' not in footer['toasts'], 'the invalid-row alert is still showing over the editor: ' + json.dumps(footer)
    for label in ['Save changes', 'Cancel']:
        assert footer[label]['onTop'] and not footer[label]['covered'], label + ' is covered at 980x640: ' + json.dumps(footer)
    alert = page.ev('document.querySelector(".modal .danger-box")?.getAttribute("role")')
    assert alert == 'alert', 'the editor does not say why the connection cannot be used'
    replace_field(page, 'username', 'jd@corp')
    save(page)
    report['narrow_focus_after_save'] = focus_back_on(page, 'Rich legacy', 'saving the invalid row')
    assert tour_hidden(page), 'the first-run tour came back after the first save'
    after = stored(directory)
    kept_every_field(seed['legacy-rich'], after['legacy-rich'], {'username': 'jd@corp'}, 'invalid SSH row')
    # (The row with two faults further down stays invalid, so look at this row only.)
    assert page.ev('![...document.querySelectorAll(".profile-item.invalid .profile-connect")].some(b=>(b.getAttribute("aria-label")||"").startsWith("Rich legacy cannot be used"))'), 'the fixed row is still shown as invalid'

    # Default window: valid rows of three protocols, and Escape.
    set_size(page, 1480, 920)
    for pid, name, new_name in [('valid-twin', 'Valid twin', 'Valid twin edited'), ('valid-rdp', 'Windows desk', 'Windows desk edited'),
                                ('valid-serial', 'Console line', 'Console line edited')]:
        if pid == 'valid-serial':
            open_editor(page, name, invalid=False)
            key(page, 'Escape')
            wait(page, '!document.querySelector(".modal-backdrop")', 'the editor to close on Escape')
            report['focus_after_escape'] = focus_back_on(page, name, 'Escape')
            assert stored(directory)[pid] == seed[pid], 'Escape changed the stored serial row'
        open_editor(page, name, invalid=False)
        replace_field(page, 'name', new_name)
        save(page)
        report['focus_after_save_' + pid] = focus_back_on(page, new_name, 'saving ' + name)
        kept_every_field(seed[pid], stored(directory)[pid], {'name': new_name}, pid)
        assert tour_hidden(page), 'the first-run tour came back after saving ' + name
    # Rows written by 0.4.0 load, and an edit keeps every field they hold.
    for row in LEGACY_040_ROWS:
        print('editing ' + row['id'], file=sys.stderr, flush=True)
        open_editor(page, row['name'], invalid=False)
        replace_field(page, 'name', row['name'] + ' edited')
        save(page)
        report['focus_after_save_' + row['id']] = focus_back_on(page, row['name'] + ' edited', 'saving ' + row['name'])
        kept_every_field(seed[row['id']], stored(directory)[row['id']], {'name': row['name'] + ' edited'}, row['id'] + ' (written by 0.4.0)')
        assert tour_hidden(page), 'the first-run tour came back after saving ' + row['name']
    # An invalid row with two faults: fixing only the username must not store the cut copy of the
    # startup command (2,070 characters, shown as 2,048 ending in "rm -rf /").
    two = seed['two-faults']
    assert len(two['startupCommand']) == 2070
    open_editor(page, 'Two faults', invalid=True)
    shown = page.ev('document.querySelector(".modal [name=startupCommand]").value')
    assert len(shown) == 2048 and shown.endswith('; rm -rf /'), 'the editor does not show the cut copy this test is about: ' + json.dumps(shown[-24:])
    replace_field(page, 'username', 'jd@corp')
    tab_until(page, 'a.tagName==="BUTTON" && a.closest(".modal") && a.textContent.trim()==="Save changes"', 'Save changes')
    key(page, 'Enter')
    wait(page, '!document.querySelector(".modal-backdrop") || [...document.querySelectorAll("#toast-region .toast")].some(t=>/too long/i.test(t.textContent))', 'the save of the two-fault row to be answered')
    answer = page.ev('[...document.querySelectorAll("#toast-region .toast")].map(t=>t.textContent.trim().slice(0,160))')
    after_two = stored(directory)['two-faults']
    assert after_two['startupCommand'] == two['startupCommand'], 'the save over the two-fault row stored a changed startup command (%d characters, ends %r)' % (len(after_two['startupCommand']), after_two['startupCommand'][-12:])
    assert after_two == two, 'the refused save changed the stored two-fault row: ' + json.dumps({k: [two.get(k), after_two.get(k)] for k in set(two) | set(after_two) if two.get(k) != after_two.get(k)})[:400]
    assert page.ev('!!document.querySelector(".modal-backdrop")'), 'the editor closed although the save was refused'
    assert any('Startup command is too long' in text for text in answer), 'the save was not refused with the field reason: ' + json.dumps(answer)
    report['two_faults_refused'] = answer
    key(page, 'Escape')
    wait(page, '!document.querySelector(".modal-backdrop")', 'the editor to close on Escape')
    assert stored(directory)['two-faults'] == two, 'closing the editor changed the stored two-fault row'
    # The same, for a CRLF startup command, CRLF notes, fields whose cut ends in a space (the editor
    # trims it) and a field with a line break in it (an input drops it): each cut copy comes back from
    # the form different from the one shown, and must still never be saved.
    # Every row is tried before the test fails, so one run names each row that saved a cut copy.
    report['cut_rows_refused'] = {}
    failures = []
    for row_id, list_name, field, limit, label in CUT_CASES:
        try:
            report['cut_rows_refused'][row_id] = refused_cut_row(page, directory, seed, row_id, list_name, field, limit, label)
        except AssertionError as error:
            failures.append(str(error))
            if page.ev('!!document.querySelector(".modal-backdrop")'):
                key(page, 'Escape')
                wait(page, '!document.querySelector(".modal-backdrop")', 'the editor to close on Escape after a failed row')
    assert not failures, '%d of %d cut rows failed:\n  ' % (len(failures), len(CUT_CASES)) + '\n  '.join(failures)
    # Nothing else in the store moved.
    final = stored(directory)
    assert final['local-shell'] == seed['local-shell'], 'the local shell profile changed'
    return report


def main():
    directory = Path(tempfile.mkdtemp(prefix='aux-profile-editor-ui-'))
    (directory / 'fixture.cjs').write_text(FIXTURE)
    (directory / 'legacy-040.json').write_text(json.dumps(LEGACY_040_ROWS))
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    env = dict(os.environ, AUX_PROFILE_EDITOR_ROOT=str(ROOT), AUX_PROFILE_EDITOR_DIR=str(directory),
               AUX_COMMAND_HEADLESS='0', HOME=str(directory / 'home'), XDG_CONFIG_HOME=str(directory / 'config'))
    (directory / 'home').mkdir()
    log = (directory / 'electron.log').open('w')
    electron = str(ROOT / 'node_modules/electron/dist/electron')
    # Docker gives a container a 64 MB /dev/shm, which Chromium can exhaust
    # (the renderer then dies with exit 133 part way through). The flag moves
    # that shared memory to the temp directory; it changes nothing in the app.
    shm = os.statvfs('/dev/shm') if os.path.isdir('/dev/shm') else None
    small_shm = ['--disable-dev-shm-usage'] if shm is None or shm.f_blocks * shm.f_frsize < 512 * 1024 * 1024 else []
    process = subprocess.Popen(['xvfb-run', '-a', electron, str(directory / 'fixture.cjs'), *small_shm,
                                '--remote-debugging-port=' + str(port), '--remote-allow-origins=http://127.0.0.1:' + str(port)],
                               cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    page = None
    passed = False
    try:
        deadline = time.monotonic() + WAIT_LIMIT * 2
        url = None
        while time.monotonic() < deadline and not url:
            if process.poll() is not None:
                raise AssertionError('Electron exited with code ' + str(process.returncode))
            try:
                pages = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % port, timeout=1))
                url = next((p['webSocketDebuggerUrl'] for p in pages if p.get('type') == 'page' and p.get('title') == 'Aux Command'), None)
            except (OSError, ValueError):
                pass
            if not url:
                time.sleep(0.2)
        if not url:
            raise AssertionError('the Aux Command window did not open')
        page = Page(url, 'http://127.0.0.1:%d' % port)
        report = run(page, directory)
        print(json.dumps(report, indent=1))
        print('PROFILE_EDITOR_UI_PASSED')
        passed = True
    finally:
        if page:
            page.close()
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=10)
        log.close()
        if passed:
            shutil.rmtree(directory, ignore_errors=True)
        else:
            print('Evidence: ' + str(directory), file=sys.stderr)


if __name__ == '__main__':
    main()
