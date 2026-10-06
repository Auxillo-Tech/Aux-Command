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
def wait(expression):
 for _ in range(100):
  if evaluate(expression):return
  time.sleep(.1)
 raise AssertionError(expression)
def click(selector,text=None):
 expression='''(()=>{const e=[...document.querySelectorAll(SELECTOR)].find(e=>e.getClientRects().length&&!e.closest('[inert]')&&(TEXT===null||e.textContent.trim()===TEXT||e.querySelector('strong')?.textContent===TEXT));if(!e)throw Error('button not found: '+TEXT);e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()'''.replace('SELECTOR',json.dumps(selector)).replace('TEXT',json.dumps(text))
 pos=evaluate(expression)
 call('Input.dispatchMouseEvent',{'type':'mousePressed','button':'left','clickCount':1,**pos})
 call('Input.dispatchMouseEvent',{'type':'mouseReleased','button':'left','clickCount':1,**pos})
def title(text):wait('[...document.querySelectorAll(".modal h2")].some(e=>e.textContent==='+json.dumps(text)+')')
wait('document.querySelector("#app-shell").getAttribute("aria-busy")==="false"')
time.sleep(1)
evaluate('document.querySelector("#tour-skip")?.click()')
for _ in range(2):
 click('#import-ssh-button');title('SSH import complete')
 assert '1 SSH host entries found' in evaluate('document.querySelector(".modal").textContent')
 click('.modal-footer button','Done')
assert evaluate('(await window.auxCommand.profiles.list()).filter(p=>p.sshAlias==="fixture-import").length')==1
print('SSH_IMPORT_BUTTON_VISIBLE_RESULT_AND_REIMPORT_PASSED')
for _ in range(2):
 click('#profile-menu-button');click('.menu-action','Import Aux Command profiles');title('Review profile import');click('.modal-footer button','Import')
 wait('document.querySelectorAll(".modal").length===0')
assert evaluate('(await window.auxCommand.profiles.list()).filter(p=>p.id==="json-fixture").length')==1
click('#profile-menu-button');click('.menu-action','Export profiles');click('.menu-action','Back up workspace');time.sleep(.3);click('.modal-footer button','Close')
evaluate('window.auxCommand.profiles.save({id:"after-backup",name:"After backup",host:"127.0.0.1"})')
click('#profile-menu-button');click('.menu-action','Restore workspace backup');title('Restore workspace backup?');click('.modal-footer button','Restore');wait('document.querySelectorAll(".modal").length===0')
assert evaluate('(await window.auxCommand.profiles.list()).some(p=>p.id==="after-backup")') is False
click('#profile-menu-button');click('.menu-action','Recovery points');title('Recovery points');click('.menu-action');title('Restore recovery point?');click('.modal-footer button','Restore');time.sleep(.3)
assert evaluate('(await window.auxCommand.profiles.list()).some(p=>p.id==="after-backup")') is True
click('.modal-footer button','Close')
print('JSON_IMPORT_EXPORT_WORKSPACE_RESTORE_AND_UNDO_PASSED')
# Keyboard operation at a compact desktop size and doubled display scale.
call('Emulation.setDeviceMetricsOverride',{'width':900,'height':650,'deviceScaleFactor':2,'mobile':False})
click('#profile-menu-button');title('Import / Export and recovery')
assert evaluate('document.querySelector(".modal").getBoundingClientRect().right<=innerWidth')
assert evaluate('[...document.querySelectorAll(".modal button")].filter(e=>!e.hidden).every(e=>e.textContent.trim()||e.getAttribute("aria-label"))')
evaluate('document.querySelector(".modal-footer button").focus()')
call('Input.dispatchKeyEvent',{'type':'keyDown','key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
call('Input.dispatchKeyEvent',{'type':'keyUp','key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
assert evaluate('document.activeElement===document.querySelector(".modal-close")')
call('Accessibility.enable');tree=call('Accessibility.getFullAXTree')
assert any(n.get('role',{}).get('value')=='dialog' and n.get('name',{}).get('value')=='Import / Export and recovery' for n in tree['nodes'])
click('.modal-footer button','Close')
print('KEYBOARD_FOCUS_ACCESSIBLE_DIALOG_AND_HIGH_DPI_LAYOUT_PASSED')
call('Emulation.clearDeviceMetricsOverride')
ws.close()
