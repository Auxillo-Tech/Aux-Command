#!/usr/bin/env python3
"""Exercise panel dragging, persistence and terminal maximize/fullscreen on Linux."""
import importlib.util, json, os, time
from pathlib import Path
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('e2e-cdp-smoke.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
c=m.CDP(m.get_ws_url())
def wait(expr):
 for _ in range(100):
  if c.eval(expr):return
  time.sleep(.1)
 raise AssertionError(expr)
def click(selector):
 c.eval('document.querySelector('+json.dumps(selector)+').click()')
def key(key,code,modifiers=0):
 for kind in ['keyDown','keyUp']:c.call('Input.dispatchKeyEvent',dict(type=kind,key=key,code=code,modifiers=modifiers))
try:
 wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 click('#tour-skip')
 c.eval("(async()=>{await auxCommand.app.saveOnboardingSettings({tourCompleted:true});await auxCommand.app.saveUiSettings({sidebarHidden:false,sidebarWidth:280});})()")
 c.call('Page.reload');wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 c.call('Emulation.setDeviceMetricsOverride',{'width':1480,'height':920,'deviceScaleFactor':1,'mobile':False})
 time.sleep(.4)
 # Real mouse drag, followed by keyboard adjustment and backend persistence.
 pos=c.eval("(()=>{const r=document.querySelector('#sidebar-resizer').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+100};})()")
 c.call('Input.dispatchMouseEvent',dict(type='mousePressed',button='left',clickCount=1,**pos))
 c.call('Input.dispatchMouseEvent',dict(type='mouseMoved',button='left',buttons=1,x=pos['x']+80,y=pos['y']))
 c.call('Input.dispatchMouseEvent',dict(type='mouseReleased',button='left',clickCount=1,x=pos['x']+80,y=pos['y']))
 wait('(async()=>(await auxCommand.app.getState()).settings.ui.sidebarWidth===360)()')
 c.eval("document.querySelector('#sidebar-resizer').focus()")
 key('ArrowLeft','ArrowLeft')
 wait('(async()=>(await auxCommand.app.getState()).settings.ui.sidebarWidth===340)()')
 click('#collapse-sidebar');wait("document.querySelector('#app-shell').classList.contains('sidebar-hidden')")
 click('#sidebar-toggle');wait("!document.querySelector('#app-shell').classList.contains('sidebar-hidden')")
 c.call('Page.reload');wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 assert c.eval("document.querySelector('#sidebar-resizer').getAttribute('aria-valuenow')")=='340'
 click('#local-button');click('#local-button');wait('document.querySelectorAll(".terminal-view").length>=2')
 if not c.eval("document.querySelector('#terminal-stack').classList.contains('layout-grid')"):click('#layout-toggle')
 wait("document.querySelector('#terminal-stack').classList.contains('layout-grid')")
 c.eval("document.querySelector('.terminal-view').style.width='450px'")
 click('.terminal-view .pane-maximize')
 wait("document.querySelector('#app-shell').classList.contains('focus-mode')")
 assert c.eval("document.querySelectorAll('.terminal-view.active').length")==1
 wait("document.querySelector('.terminal-view.active').getBoundingClientRect().width>=1470")
 assert not c.eval("document.querySelector('#terminal-stack').classList.contains('layout-grid')")
 click('#maximize-terminal')
 assert c.eval("document.querySelector('#terminal-stack').classList.contains('layout-grid')")
 assert c.eval("document.querySelector('.terminal-view').style.width")=='450px'
 # Every terminal can be activated then maximized; regular Escape stays with shell.
 for i in range(c.eval('document.querySelectorAll(".session-tab").length')):
  c.eval(f"document.querySelectorAll('.tab-select')[{i}].click()")
  click('#maximize-terminal');key('Escape','Escape')
  assert c.eval("document.querySelector('#app-shell').classList.contains('focus-mode')")
  click('#maximize-terminal')
 key('F11','F11');wait('(async()=>(await auxCommand.app.getState()).fullscreen)()')
 key('F11','F11');wait('(async()=>!(await auxCommand.app.getState()).fullscreen)()')
 # Native full-screen button remains reachable while terminal is maximized.
 click('#maximize-terminal');click('#session-fullscreen');wait('(async()=>(await auxCommand.app.getState()).fullscreen)()')
 click('#session-fullscreen');wait('(async()=>!(await auxCommand.app.getState()).fullscreen)()')
 time.sleep(.6)
 wait("document.querySelector('.terminal-view.active .xterm-screen').getBoundingClientRect().width>1400")
 m.SCREENSHOT_PATH=os.environ.get('AUX_PANELS_SCREENSHOT','/tmp/aux-panels-maximized.png');m.capture_screenshot(c)
 click('#maximize-terminal')
 # Closing the final maximized tab must restore normal layout for the next shell.
 click('#maximize-terminal')
 while c.eval('document.querySelectorAll(".session-tab").length'):
  count=c.eval('document.querySelectorAll(".session-tab").length')
  click('.session-tab.active .tab-close');time.sleep(.1)
  c.eval("document.querySelector('.modal-footer .danger-confirm')?.click()")
  wait(f'document.querySelectorAll(".session-tab").length==={count-1}')
 assert not c.eval("document.querySelector('#app-shell').classList.contains('focus-mode')")
 click('#local-button');wait('document.querySelectorAll(".session-tab").length===1')
 assert c.eval("document.querySelector('#terminal-stack').classList.contains('layout-grid')")
 c.call('Emulation.clearDeviceMetricsOverride')
 print('PANEL_DRAG_KEYBOARD_PERSIST_COLLAPSE_MAXIMIZE_RESTORE_FULLSCREEN_PASSED')
finally:c.close()
