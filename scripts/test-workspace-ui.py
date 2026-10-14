#!/usr/bin/env python3
"""Exercise workspace views, preferences and keyboard navigation in a disposable app."""
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
 pos=c.eval('''(()=>{const e=document.querySelector(%s);if(!e)throw Error('Missing control');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()'''%json.dumps(selector))
 c.call('Input.dispatchMouseEvent',dict(type='mousePressed',button='left',clickCount=1,**pos))
 c.call('Input.dispatchMouseEvent',dict(type='mouseReleased',button='left',clickCount=1,**pos))
def key(key,code,modifiers=0):
 for kind in ['keyDown','keyUp']:c.call('Input.dispatchKeyEvent',{'type':kind,'key':key,'code':code,'modifiers':modifiers})
def fill(selector,value):
 c.eval('''(()=>{const e=document.querySelector(%s);e.value=%s;e.dispatchEvent(new Event('input',{bubbles:true}));})()'''%(json.dumps(selector),json.dumps(value)))
try:
 wait('document.querySelector("#app-shell").getAttribute("aria-busy")==="false"')
 time.sleep(1);c.eval('document.querySelector("#tour-skip").click()')
 c.eval('''(async()=>{for(const e of document.querySelectorAll('.session-tab')) await auxCommand.terminal.close(e.dataset.sessionId);await auxCommand.app.saveSessions([]);await auxCommand.app.saveUiSettings({density:'comfortable',sidebarHidden:false});})()''')
 c.eval('''(async()=>{await auxCommand.profiles.save({id:'ui-prod',name:'Production database',host:'db.example.invalid',username:'operator',protocol:'ssh',favorite:true});await auxCommand.profiles.save({id:'ui-stage',name:'Staging web',host:'web.example.invalid',protocol:'ssh'});})()''')
 c.call('Page.reload');time.sleep(.5)
 wait('document.querySelector("#app-shell").getAttribute("aria-busy")==="false"')
 click('#profiles-favorites');assert c.eval('document.querySelectorAll(".profile-item").length')==1
 fill('#profile-search','operator database');assert c.eval('document.querySelectorAll(".profile-item").length')==1
 fill('#profile-search','unknown');assert '0 of' in c.eval('document.querySelector("#connection-count").textContent')
 click('.list-empty button');assert c.eval('document.querySelectorAll(".profile-item").length')>=3
 click('#local-button');wait('document.querySelectorAll(".session-tab").length===1')
 click('#local-button');wait('document.querySelectorAll(".session-tab").length===2')
 time.sleep(.3)
 before=c.eval('document.querySelector(".session-tab.active").dataset.sessionId')
 key('Tab','Tab',2);time.sleep(.2)
 assert c.eval('document.querySelector(".session-tab.active").dataset.sessionId')!=before
 key('Tab','Tab',10);time.sleep(.2)
 assert c.eval('document.querySelector(".session-tab.active").dataset.sessionId')==before
 click('#profiles-active');assert c.eval('document.querySelectorAll(".profile-item").length')==1,c.eval('({profiles:document.querySelector("#profile-list").innerText,sessions:[...document.querySelectorAll(".session-tab")].map(e=>({text:e.innerText,classes:e.className}))})')
 click('#palette-button');wait('!!document.querySelector(".palette-shell input")')
 fill('.palette-shell input','switch to:');assert c.eval('document.querySelectorAll(".palette-row").length')==2
 fill('.palette-shell input','monitor live');assert 'Live server monitor' in c.eval('document.querySelector(".palette-list").textContent')
 click('.modal-close')
 # Tab context menu is accessible from the keyboard and names survive shell title updates.
 c.eval('document.querySelector(".session-tab.active .tab-select").focus()');key('F10','F10',8)
 wait('!!document.querySelector(".context-menu")');click('.context-menu-item')
 wait('!!document.querySelector(".modal input")');fill('.modal input','Operations shell');click('.modal-footer .primary')
 wait('document.querySelector(".session-tab.active .tab-title").textContent==="Operations shell"')
 c.eval('auxCommand.terminal.write(document.querySelector(".session-tab.active").dataset.sessionId,'+json.dumps("printf 'WORKSPACE_SEARCH_MARKER\\n'\r")+')')
 time.sleep(.3);click('#terminal-search-toggle');fill('.terminal-search-panel input','WORKSPACE_SEARCH_MARKER')
 wait('document.querySelector(".terminal-search-status").textContent==="Match found"')
 fill('.terminal-search-panel input','ABSENT_MARKER_91fe');assert c.eval('document.querySelector(".terminal-search-status").textContent')=='No matches'
 click('.terminal-search-panel button:nth-child(4)')
 click('#broadcast-toggle');wait('!!document.querySelector(".modal-footer .danger-confirm")');click('.modal-footer .danger-confirm')
 wait('document.querySelector("#broadcast-toggle").getAttribute("aria-pressed")==="true"')
 c.eval('auxCommand.terminal.write(document.querySelector(".session-tab.active").dataset.sessionId,"exit\\r")')
 wait('document.querySelector(".session-tab.active").classList.contains("closed")')
 assert c.eval('document.querySelector("#broadcast-toggle").getAttribute("aria-pressed")')=='false'
 assert c.eval('document.querySelector("#terminal-log-button").disabled') is True
 assert c.eval('document.querySelector("#reconnect-session-button").disabled') is False
 click('#preferences-button');wait('!!document.querySelector("select[name=density]")')
 c.eval('document.querySelector("select[name=density]").value="compact"')
 click('input[name=sidebarHidden]');click('.modal-footer .primary');wait('document.querySelector("#app-shell").dataset.density==="compact"')
 wait('document.querySelector("#app-shell").classList.contains("sidebar-hidden")')
 assert c.eval('(async()=>(await auxCommand.app.getState()).settings.ui.sidebarHidden)()') is True
 key('E','KeyE',10);wait('document.activeElement.id==="profile-search"')
 assert not c.eval('document.querySelector("#app-shell").classList.contains("sidebar-hidden")')
 # Save visible, comfortable workspace for layout verification.
 click('#preferences-button');c.eval('document.querySelector("select[name=density]").value="comfortable"');click('.modal-footer .primary')
 wait('document.querySelector("#app-shell").dataset.density==="comfortable"')
 for width,height in [(1600,1000),(1280,800),(900,650),(700,600)]:
  c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':1,'mobile':False});time.sleep(.3)
  assert c.eval('document.documentElement.scrollWidth<=innerWidth'),f'page overflow at {width}'
  assert c.eval('document.querySelector("#quick-button").getBoundingClientRect().right<=innerWidth'),f'connect offscreen at {width}'
  click('#preferences-button');assert c.eval('document.querySelector(".modal").getBoundingClientRect().right<=innerWidth')
  click('.modal-close')
  if width==1280:
   c.eval('document.querySelector("#profiles-all").click()')
   m.SCREENSHOT_PATH=os.environ.get('AUX_WORKSPACE_SCREENSHOT','/tmp/aux-workspace-after.png');m.capture_screenshot(c)
 c.call('Emulation.clearDeviceMetricsOverride')
 print('WORKSPACE_FILTERS_PALETTE_PREFERENCES_KEYBOARD_RESPONSIVE_PASSED')
finally:c.close()
