#!/usr/bin/env python3
"""Exercise workspace views, preferences and keyboard navigation in a disposable app."""
import importlib.util, json, os, time
from pathlib import Path
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('e2e-cdp-smoke.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
c=m.CDP(m.get_ws_url())
def wait(expr,seconds=30):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  if c.eval(expr):return
  time.sleep(.1)
 raise AssertionError('not reached within %ss: %s'%(seconds,expr))
def until(check,what,seconds=30):
 # Poll a Python-side condition (the state a key press or click should have produced)
 # for a bounded time and fail loudly with the value it last saw.
 end=time.monotonic()+seconds;last=None
 while time.monotonic()<end:
  last=check()
  if last:return last
  time.sleep(.1)
 raise AssertionError('not reached within %ss: %s (last: %r)'%(seconds,what,last))
def click_modal(s):
 # A closing modal returns focus to its opener from a timer, which can run after
 # the next step has already moved focus (or started a rename). Wait for the
 # backdrop to go and for that timer to have fired before going on.
 before=c.eval('document.querySelectorAll(".modal-backdrop").length')
 click(s)
 wait('(async()=>{await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));return document.querySelectorAll(".modal-backdrop").length<'+str(before)+'})()')
def click(selector):
 # Click where the control is once it has stopped moving: a layout change (window resize, panel
 # transition) can still be animating when the control first exists, and a click aimed at
 # the old position lands on whatever is there now.
 pos=c.eval('''(async()=>{const e=document.querySelector(%s);if(!e)throw Error('Missing control');e.scrollIntoView({block:'nearest'});let r=e.getBoundingClientRect();for(let i=0,same=0;i<100&&same<3;i++){await new Promise(f=>{requestAnimationFrame(()=>requestAnimationFrame(f));setTimeout(f,100)});const n=e.getBoundingClientRect();same=(n.x===r.x&&n.y===r.y&&n.width===r.width&&n.height===r.height)?same+1:0;r=n;}return {x:r.x+r.width/2,y:r.y+r.height/2};})()'''%json.dumps(selector))
 # After a viewport change the browser can keep hit-testing against the old layout for a
 # moment, so a press aimed at the new position lands on whatever used to be there. The
 # pointer reaching the control (:hover) shows hit-testing has caught up.
 c.call('Input.dispatchMouseEvent',dict(type='mouseMoved',**pos))
 until(lambda:c.eval('document.querySelector(%s)?.matches(":hover")'%json.dumps(selector)),'pointer reaches '+selector)
 c.call('Input.dispatchMouseEvent',dict(type='mousePressed',button='left',clickCount=1,**pos))
 c.call('Input.dispatchMouseEvent',dict(type='mouseReleased',button='left',clickCount=1,**pos))
def key(key,code,modifiers=0):
 for kind in ['keyDown','keyUp']:c.call('Input.dispatchKeyEvent',{'type':kind,'key':key,'code':code,'modifiers':modifiers})
def fill(selector,value):
 c.eval('''(()=>{const e=document.querySelector(%s);e.value=%s;e.dispatchEvent(new Event('input',{bubbles:true}));})()'''%(json.dumps(selector),json.dumps(value)))
try:
 wait('document.querySelector("#app-shell").getAttribute("aria-busy")==="false"')
 c.dismiss_tour()
 c.clear_sessions("await auxCommand.app.saveUiSettings({density:'comfortable',sidebarHidden:false});")
 c.eval('''(async()=>{await auxCommand.profiles.save({id:'ui-prod',name:'Production database',host:'db.example.invalid',username:'operator',protocol:'ssh',favorite:true});await auxCommand.profiles.save({id:'ui-stage',name:'Staging web',host:'web.example.invalid',protocol:'ssh'});})()''')
 c.reload();
 wait('document.querySelector("#app-shell").getAttribute("aria-busy")==="false"')
 click('#profiles-favorites');wait('document.querySelectorAll(".profile-item").length===1')
 fill('#profile-search','operator database');assert c.eval('document.querySelectorAll(".profile-item").length')==1
 fill('#profile-search','unknown');assert '0 of' in c.eval('document.querySelector("#connection-count").textContent')
 click('.list-empty button');wait('document.querySelectorAll(".profile-item").length>=3')
 click('#local-button');wait('document.querySelectorAll(".session-tab").length===1')
 click('#local-button');wait('document.querySelectorAll(".session-tab").length===2')
 # Both tabs exist, the newest one is active and both terminals are on screen.
 wait('(()=>{const t=[...document.querySelectorAll(".session-tab")];return t.length===2&&t[1].classList.contains("active")&&t.every(e=>!!document.querySelector("#terminal-panel-"+e.dataset.sessionId+" .xterm-rows"));})()')
 before=c.eval('document.querySelector(".session-tab.active").dataset.sessionId')
 key('Tab','Tab',2)
 until(lambda:c.eval('document.querySelector(".session-tab.active").dataset.sessionId')!=before,'Ctrl+Tab switches tab')
 key('Tab','Tab',10)
 until(lambda:c.eval('document.querySelector(".session-tab.active").dataset.sessionId')==before,'Ctrl+Shift+Tab switches back')
 # Ctrl+PageUp/PageDown switch tabs; Ctrl+Shift+PageUp/PageDown move the active tab.
 order=lambda:c.eval('[...document.querySelectorAll(".session-tab")].map(e=>e.dataset.sessionId)')
 active=lambda:c.eval('document.querySelector(".session-tab.active").dataset.sessionId')
 key('PageDown','PageDown',2)
 until(lambda:active()!=before,'Ctrl+PageDown switches tab')
 key('PageUp','PageUp',2)
 until(lambda:active()==before,'Ctrl+PageUp switches back')
 start=order();moving=active();first=start.index(moving)==0
 key('PageDown' if first else 'PageUp','PageDown' if first else 'PageUp',10)
 until(lambda:order()==start[::-1],'Ctrl+Shift+Page key moves the active tab (order %r)'%(start,))
 key('PageUp' if first else 'PageDown','PageUp' if first else 'PageDown',10)
 until(lambda:order()==start and active()==moving,'the opposite key moves it back (order %r)'%(start,))
 # Ctrl+= / Ctrl+- / Ctrl+0 change only the active terminal's text size.
 size=lambda sid:c.eval('parseFloat(getComputedStyle(document.querySelector("#terminal-panel-%s .xterm-rows")).fontSize)'%sid)
 other=[sid for sid in start if sid!=moving][0];base=size(moving);other_base=size(other)
 key('=','Equal',2);key('=','Equal',2)
 until(lambda:size(moving)==base+2,'Ctrl+= twice grows the active terminal text by 2 (base %r)'%(base,))
 key('-','Minus',2)
 until(lambda:size(moving)==base+1,'Ctrl+- shrinks it by 1')
 assert size(other)==other_base
 assert c.eval('document.querySelector("#global-status").textContent').startswith('Text size')
 key('0','Digit0',2)
 until(lambda:size(moving)==base,'Ctrl+0 resets the text size')
 click('#profiles-active');wait('document.querySelectorAll(".profile-item").length===1');assert c.eval('document.querySelectorAll(".profile-item").length')==1,c.eval('({profiles:document.querySelector("#profile-list").innerText,sessions:[...document.querySelectorAll(".session-tab")].map(e=>({text:e.innerText,classes:e.className}))})')
 click('#palette-button');wait('!!document.querySelector(".palette-shell input")')
 fill('.palette-shell input','switch to:');assert c.eval('document.querySelectorAll(".palette-row").length')==2
 fill('.palette-shell input','monitor live');assert 'Live server monitor' in c.eval('document.querySelector(".palette-list").textContent')
 click_modal('.modal-close')
 # Tab context menu is accessible from the keyboard and names survive shell title updates.
 c.eval('document.querySelector(".session-tab.active .tab-select").focus()');key('F10','F10',8)
 wait('!!document.querySelector(".context-menu")');click('.context-menu-item')
 # Wait for the rename field and fill it in one evaluate: a second round trip leaves a window in which the field can be gone.
 c.eval('''(async()=>{for(let n=0;n<150;n++){const i=document.querySelector(".tab-rename-input");if(i){i.value="Operations shell";i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));return true;}await new Promise(r=>setTimeout(r,100));}throw Error("tab rename field did not open");})()''',timeout=30)
 wait('document.querySelector(".session-tab.active .tab-title").textContent==="Operations shell"')
 c.eval('auxCommand.terminal.write(document.querySelector(".session-tab.active").dataset.sessionId,'+json.dumps("printf 'WORKSPACE_SEARCH_MARKER\\n'\r")+')')
 # Search only sees what the terminal has drawn: wait for the marker line itself (not the typed command).
 wait('(()=>{const id=document.querySelector(".session-tab.active").dataset.sessionId;return [...document.querySelectorAll("#terminal-panel-"+id+" .xterm-rows > div")].some(r=>r.textContent.trim()==="WORKSPACE_SEARCH_MARKER");})()')
 click('#terminal-search-toggle');fill('.terminal-search-panel input','WORKSPACE_SEARCH_MARKER')
 wait('document.querySelector(".terminal-search-status").textContent==="Match found"')
 fill('.terminal-search-panel input','ABSENT_MARKER_91fe');assert c.eval('document.querySelector(".terminal-search-status").textContent')=='No matches'
 click('.terminal-search-panel button:nth-child(4)')
 click('#broadcast-toggle');wait('!!document.querySelector(".modal-footer .danger-confirm")');click_modal('.modal-footer .danger-confirm')
 wait('document.querySelector("#broadcast-toggle").getAttribute("aria-pressed")==="true"')
 c.eval('auxCommand.terminal.write(document.querySelector(".session-tab.active").dataset.sessionId,"exit\\r")')
 wait('document.querySelector(".session-tab.active").classList.contains("closed")')
 assert c.eval('document.querySelector("#broadcast-toggle").getAttribute("aria-pressed")')=='false'
 assert c.eval('document.querySelector("#terminal-log-button").disabled') is True
 assert c.eval('document.querySelector("#reconnect-session-button").disabled') is False
 click('#preferences-button');wait('!!document.querySelector("select[name=density]")')
 c.eval('document.querySelector("select[name=density]").value="compact"')
 click('input[name=sidebarHidden]');click_modal('.modal-footer .primary');wait('document.querySelector("#app-shell").dataset.density==="compact"')
 wait('document.querySelector("#app-shell").classList.contains("sidebar-hidden")')
 assert c.eval('(async()=>(await auxCommand.app.getState()).settings.ui.sidebarHidden)()') is True
 key('E','KeyE',10);wait('document.activeElement.id==="profile-search"')
 assert not c.eval('document.querySelector("#app-shell").classList.contains("sidebar-hidden")')
 # Save visible, comfortable workspace for layout verification.
 click('#preferences-button');wait('!!document.querySelector("select[name=density]")');c.eval('document.querySelector("select[name=density]").value="comfortable"');click_modal('.modal-footer .primary')
 wait('document.querySelector("#app-shell").dataset.density==="comfortable"')
 for width,height in [(1600,1000),(1280,800),(900,650),(700,600)]:
  c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':1,'mobile':False})
  wait('innerWidth==='+str(width)+'&&innerHeight==='+str(height))
  assert c.eval('document.documentElement.scrollWidth<=innerWidth'),f'page overflow at {width}'
  assert c.eval('document.querySelector("#quick-button").getBoundingClientRect().right<=innerWidth'),f'connect offscreen at {width}'
  click('#preferences-button');wait('!!document.querySelector(".modal")');assert c.eval('document.querySelector(".modal").getBoundingClientRect().right<=innerWidth')
  click_modal('.modal-close')
  if width==1280:
   c.eval('document.querySelector("#profiles-all").click()')
   m.SCREENSHOT_PATH=os.environ.get('AUX_WORKSPACE_SCREENSHOT','/tmp/aux-workspace-after.png');m.capture_screenshot(c)
 c.call('Emulation.clearDeviceMetricsOverride')
 # A connection's tab colour marks its list entry and its tabs; unknown colours are dropped.
 saved=c.eval('''(async()=>{const p=(await auxCommand.profiles.list()).find(x=>x.id==="ui-stage");const a=await auxCommand.profiles.save({...p,tabColor:"red"});const b=await auxCommand.profiles.save({...p,id:"ui-bad",name:"Bad colour",tabColor:"url(javascript:x)"});await auxCommand.profiles.delete("ui-bad");return [a.tabColor,b.tabColor];})()''')
 assert saved==['red',''],saved
 c.reload();wait('document.querySelector("#app-shell").getAttribute("aria-busy")==="false"')
 c.eval('document.querySelector("#profiles-all").click()')
 wait('!!document.querySelector(".profile-item[data-tab-color=red]")')
 assert 'Staging web' in c.eval('document.querySelector(".profile-item[data-tab-color=red]").textContent')
 assert c.eval('getComputedStyle(document.querySelector(".profile-item[data-tab-color=red]")).boxShadow').find('255, 92, 119')>=0
 click('.profile-item[data-tab-color=red] .profile-connect')
 wait('!!document.querySelector(".session-tab[data-tab-color=red]")')
 print('WORKSPACE_FILTERS_PALETTE_PREFERENCES_KEYBOARD_RESPONSIVE_PASSED')
finally:c.close()
