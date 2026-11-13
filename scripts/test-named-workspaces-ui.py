#!/usr/bin/env python3
"""Save, reopen and update a named workspace through the actual controls."""
import importlib.util, json, time
from pathlib import Path
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('e2e-cdp-smoke.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
c=m.CDP(m.get_ws_url())
def wait(expr):
 for _ in range(100):
  if c.eval(expr):return
  time.sleep(.1)
 state=c.eval('JSON.stringify({tabs:[...document.querySelectorAll(".session-tab")].map(e=>e.textContent.trim()),busy:document.querySelector("#app-shell")?.getAttribute("aria-busy"),toasts:[...document.querySelectorAll(".toast")].map(e=>e.textContent),modals:document.querySelectorAll(".modal").length,preReload:!!window.__auxPreReload})')
 raise AssertionError(expr+' page state: '+str(state))
def click(s):c.eval('document.querySelector('+json.dumps(s)+').click()')
def textbutton(text):c.eval('([...document.querySelectorAll(".modal button")].find(b=>b.textContent==='+json.dumps(text)+')).click()')
try:
 wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"');c.dismiss_tour()
 c.clear_sessions("await auxCommand.app.saveWorkspaceSettings({layout:'single'});")
 c.reload();wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 for n in (1,2):click('#local-button');wait('document.querySelectorAll(".session-tab").length==='+str(n))
 c.eval("auxCommand.terminal.write(document.querySelector('.session-tab.active').dataset.sessionId,'cd /tmp\\r')")
 wait("(async()=>(await auxCommand.terminal.list()).some(s=>s.cwd==='/tmp'))()")
 # Rename active tab through its accessible context menu.
 c.eval("document.querySelector('.session-tab.active .tab-select').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}))")
 c.eval("[...document.querySelectorAll('.context-menu-item')].find(b=>b.textContent.includes('Rename')).click()")
 # Wait for the rename field and fill it in one evaluate: a second round trip leaves a window in which the field can be gone.
 c.eval('''(async()=>{for(let n=0;n<150;n++){const i=document.querySelector(".tab-rename-input");if(i){i.value="Saved operations";i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));return true;}await new Promise(r=>setTimeout(r,100));}throw Error("tab rename field did not open");})()''',timeout=30)
 click('#layout-toggle');c.eval("document.querySelector('.terminal-view[data-session-id=\"'+document.querySelector('.session-tab.active').dataset.sessionId+'\"]').style.width='480px'")
 click('#workspaces-button');wait('!!document.querySelector(".modal")');textbutton('Save current workspace')
 wait('document.querySelectorAll(".modal").length===2');c.eval("document.querySelector('.modal-backdrop:last-child input').value='Operations desk'");click('.modal-backdrop:last-child .primary')
 wait('(async()=>(await auxCommand.app.getState()).settings.namedWorkspaces.length===1)()')
 snapshot=c.eval('(async()=>(await auxCommand.app.getState()).settings.namedWorkspaces[0])()')
 assert snapshot['name']=='Operations desk';assert snapshot['workspace']['layout']=='grid';assert len(snapshot['sessions'])==2
 assert snapshot['sessions'][1]['title']=='Saved operations';assert snapshot['sessions'][1]['cwd']=='/tmp';assert snapshot['sessions'][1]['paneWidth']==480
 wait('document.querySelectorAll(".modal").length===1');textbutton('Open')
 wait('document.querySelectorAll(".session-tab").length===4')
 assert c.eval('document.querySelector(".session-tab.active .tab-title").textContent')=='Saved operations'
 wait('(async()=>(await auxCommand.terminal.list()).filter(s=>s.cwd==="/tmp").length===2)()')
 # Persistence survives renderer restart without duplicating live backend sessions.
 time.sleep(.8);c.reload();wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 assert c.eval('document.querySelectorAll(".session-tab").length')==4
 assert c.eval('document.querySelector(".session-tab.active .tab-title").textContent')=='Saved operations'
 click('#workspaces-button');wait('!!document.querySelector(".modal")');textbutton('Update')
 wait('(async()=>(await auxCommand.app.getState()).settings.namedWorkspaces[0].sessions.length===4)()')
 click('.modal-close')
 # Remap local-shell shortcut; settings reach renderer after save and restore.
 click('#preferences-button');wait('!!document.querySelector("input[name=shortcut-local]")')
 c.eval("document.querySelector('input[name=shortcut-local]').value='Ctrl+Shift+Q'");click('.modal-footer .primary')
 wait('!document.querySelector(".modal")')
 for kind in ['keyDown','keyUp']:c.call('Input.dispatchKeyEvent',dict(type=kind,key='Q',code='KeyQ',modifiers=10))
 wait('document.querySelectorAll(".session-tab").length===5')
 c.eval("auxCommand.app.saveUiSettings({shortcuts:window.AuxPreferences.DEFAULT_SHORTCUTS})")
 print('NAMED_WORKSPACE_TITLE_CWD_GEOMETRY_RELOAD_UPDATE_CUSTOM_SHORTCUT_PASSED')
finally:c.close()
