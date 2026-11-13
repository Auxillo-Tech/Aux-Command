#!/usr/bin/env python3
"""Click the real renderer import/backup controls against disposable dialogs."""
import json, os, time, urllib.request
import websocket
port=os.environ.get('AUX_COMMAND_CDP_PORT','9351')
for attempt in range(100):
 try:
  pages=json.load(urllib.request.urlopen('http://127.0.0.1:'+port+'/json',timeout=1))
  target=next(p for p in pages if p.get('title')=='Aux Command');break
 except Exception:time.sleep(.2)
else:raise RuntimeError('Renderer did not open')
ws=websocket.create_connection(target['webSocketDebuggerUrl'],origin='http://127.0.0.1:'+port,timeout=20)
sequence=0
def call(method,params=None):
 global sequence
 sequence+=1;ws.send(json.dumps({'id':sequence,'method':method,'params':params or {}}))
 while True:
  result=json.loads(ws.recv())
  if result.get('id')==sequence:
   if result.get('error'):raise RuntimeError(result['error'])
   return result.get('result',{})
def evaluate(expression):
 result=call('Runtime.evaluate',{'expression':'(async()=>('+expression+'))()','awaitPromise':True,'returnByValue':True})
 if result.get('exceptionDetails'):raise RuntimeError(result['exceptionDetails'])
 return result.get('result',{}).get('value')
def wait(expression,seconds=30):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  if evaluate(expression):return
  time.sleep(.1)
 raise AssertionError('not reached within %ss: %s'%(seconds,expression))
def click(selector,text=None,seconds=30):
 # Wait for the control to exist, be visible and have stopped moving (a layout change or a
 # drawer transition can still be running), then click where it is now.
 expression='''(async()=>{const find=()=>[...document.querySelectorAll(SELECTOR)].find(e=>e.getClientRects().length&&getComputedStyle(e).visibility==='visible'&&!e.closest('[inert]')&&(TEXT===null||e.textContent.trim()===TEXT||e.querySelector('strong')?.textContent===TEXT));let e=find();if(!e)return null;e.scrollIntoView({block:'center'});let r=e.getBoundingClientRect();for(let i=0,same=0;i<100&&same<3;i++){await new Promise(f=>{requestAnimationFrame(()=>requestAnimationFrame(f));setTimeout(f,100)});e=find();if(!e)return null;const n=e.getBoundingClientRect();same=(n.x===r.x&&n.y===r.y&&n.width===r.width&&n.height===r.height)?same+1:0;r=n}return {x:r.x+r.width/2,y:r.y+r.height/2}})()'''.replace('SELECTOR',json.dumps(selector)).replace('TEXT',json.dumps(text))
 end=time.monotonic()+seconds
 while True:
  pos=evaluate(expression)
  if pos:break
  if time.monotonic()>end:raise AssertionError('button not found: '+repr(selector)+' '+repr(text))
  time.sleep(.1)
 # After a viewport change the browser can keep hit-testing against the old layout for a
 # moment; the pointer reaching a matching control (:hover) shows it has caught up.
 call('Input.dispatchMouseEvent',{'type':'mouseMoved',**pos})
 wait('[...document.querySelectorAll('+json.dumps(selector)+')].some(e=>e.matches(":hover"))')
 call('Input.dispatchMouseEvent',{'type':'mousePressed','button':'left','clickCount':1,**pos})
 call('Input.dispatchMouseEvent',{'type':'mouseReleased','button':'left','clickCount':1,**pos})
def click_modal(selector,text=None):
 # A closing modal returns focus to its opener from a timer and its backdrop is still
 # on screen until it is removed, so a click made straight away can land on the
 # backdrop or lose focus. Wait for the backdrop to go and for that timer to have run.
 before=evaluate('document.querySelectorAll(".modal-backdrop").length')
 click(selector,text)
 wait('(async()=>{await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));return document.querySelectorAll(".modal-backdrop").length<'+str(before)+'})()')
def title(text):wait('[...document.querySelectorAll(".modal h2")].some(e=>e.textContent==='+json.dumps(text)+')')
wait('document.querySelector("#app-shell").getAttribute("aria-busy")==="false"')
import importlib.util
from pathlib import Path
_spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('e2e-cdp-smoke.py'))
_smoke=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_smoke)
evaluate(_smoke.DISMISS_TOUR_JS)
for _ in range(2):
 click('#import-ssh-button');title('SSH import complete')
 assert '1 SSH host entries found' in evaluate('document.querySelector(".modal").textContent')
 click_modal('.modal-footer button','Done')
assert evaluate('(await window.auxCommand.profiles.list()).filter(p=>p.sshAlias==="fixture-import").length')==1
print('SSH_IMPORT_BUTTON_VISIBLE_RESULT_AND_REIMPORT_PASSED')
for _ in range(2):
 click('#profile-menu-button');click('.menu-action','Import Aux Command profiles');title('Review profile import');click_modal('.modal-footer button','Import')
 wait('document.querySelectorAll(".modal").length===0')
assert evaluate('(await window.auxCommand.profiles.list()).filter(p=>p.id==="json-fixture").length')==1
click('#profile-menu-button');click('.menu-action','Export profiles')
# Each action reports in the status line when it has finished: wait for the export before
# starting the backup (a late export would overwrite the backup's message), then for the backup
# itself, so the profile saved next is not part of it.
wait('document.querySelector("#global-status").textContent.startsWith("Profiles exported")')
click('.menu-action','Back up workspace')
wait('document.querySelector("#global-status").textContent.startsWith("Workspace backed up")')
click_modal('.modal-footer button','Close')
evaluate('window.auxCommand.profiles.save({id:"after-backup",name:"After backup",host:"127.0.0.1"})')
click('#profile-menu-button');click('.menu-action','Restore workspace backup');title('Restore workspace backup?');click_modal('.modal-footer button','Restore');wait('document.querySelectorAll(".modal").length===0')
wait('(await window.auxCommand.profiles.list()).every(p=>p.id!=="after-backup")')
assert evaluate('(await window.auxCommand.profiles.list()).some(p=>p.id==="after-backup")') is False
click('#profile-menu-button');click('.menu-action','Recovery points');title('Recovery points');click('.menu-action');title('Restore recovery point?');click_modal('.modal-footer button','Restore')
wait('(await window.auxCommand.profiles.list()).some(p=>p.id==="after-backup")')
assert evaluate('(await window.auxCommand.profiles.list()).some(p=>p.id==="after-backup")') is True
click_modal('.modal-footer button','Close')
print('JSON_IMPORT_EXPORT_WORKSPACE_RESTORE_AND_UNDO_PASSED')
# Keyboard operation at a compact desktop size and doubled display scale.
call('Emulation.setDeviceMetricsOverride',{'width':900,'height':650,'deviceScaleFactor':2,'mobile':False})
click('#sidebar-toggle');wait('document.querySelector("#app-shell").classList.contains("sidebar-open")')
click('#profile-menu-button');title('Import / Export and recovery')
assert evaluate('document.querySelector(".modal").getBoundingClientRect().right<=innerWidth')
assert evaluate('[...document.querySelectorAll(".modal button")].filter(e=>!e.hidden).every(e=>e.textContent.trim()||e.getAttribute("aria-label"))')
evaluate('document.querySelector(".modal-footer button").focus()')
call('Input.dispatchKeyEvent',{'type':'keyDown','key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
call('Input.dispatchKeyEvent',{'type':'keyUp','key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
assert evaluate('document.activeElement===document.querySelector(".modal-close")')
call('Accessibility.enable');tree=call('Accessibility.getFullAXTree')
assert any(n.get('role',{}).get('value')=='dialog' and n.get('name',{}).get('value')=='Import / Export and recovery' for n in tree['nodes'])
click_modal('.modal-footer button','Close')
print('KEYBOARD_FOCUS_ACCESSIBLE_DIALOG_AND_HIGH_DPI_LAYOUT_PASSED')
call('Emulation.clearDeviceMetricsOverride')
ws.close()
