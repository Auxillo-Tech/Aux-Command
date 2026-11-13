#!/usr/bin/env python3
"""Real shell task execution, detached windows, split modes and bulk organization."""
import importlib.util,json,time,urllib.request
from pathlib import Path
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('e2e-cdp-smoke.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
c=m.CDP(m.get_ws_url())
def wait(expr,client=None):
 client=client or c
 for _ in range(150):
  if client.eval(expr):return
  time.sleep(.1)
 raise AssertionError(expr+'; '+str(client.eval('document.body.innerText.slice(-1500)')))
def click(selector):c.eval('document.querySelector('+json.dumps(selector)+').click()')
def button(text):c.eval('([...document.querySelectorAll(".modal-backdrop:last-child button")].find(b=>b.textContent==='+json.dumps(text)+')).click()')
def key(k,code,mods=0):
 for kind in ['keyDown','keyUp']:c.call('Input.dispatchKeyEvent',dict(type=kind,key=k,code=code,modifiers=mods))
try:
 wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"');c.dismiss_tour()
 c.clear_sessions();c.reload();wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 for n in (1,2):click('#local-button');wait('document.querySelectorAll(".session-tab").length==='+str(n));time.sleep(.5)
 ids=c.eval('[...document.querySelectorAll(".session-tab")].map(e=>e.dataset.sessionId)')
 c.eval('(()=>{const s=document.querySelector("#pane-flow");s.value="rows";s.dispatchEvent(new Event("change"));})()')
 wait('(async()=>(await auxCommand.app.getState()).settings.workspace.paneFlow==="rows")()')
 assert c.eval('document.querySelector("#terminal-stack").dataset.flow')=='rows'
 # Reorder by dragging the second tab onto the first pane.
 c.eval('(()=>{const tabs=[...document.querySelectorAll(".tab-select")],d=new DataTransfer();tabs[1].dispatchEvent(new DragEvent("dragstart",{dataTransfer:d,bubbles:true}));document.querySelector(".terminal-view").dispatchEvent(new DragEvent("drop",{dataTransfer:d,bubbles:true,cancelable:true}));})()')
 assert c.eval('document.querySelector(".session-tab").dataset.sessionId')==ids[1]
 key('M','KeyM',10);wait('!!document.querySelector("textarea[name=taskCommand]")')
 c.eval('document.querySelector("textarea[name=taskCommand]").value='+json.dumps('printf "TASK_OK_%s\\n" "quoted value"'))
 button('Review and run');wait('document.querySelectorAll(".modal").length===2');button('Run on selected sessions')
 wait('[...document.querySelectorAll(".multi-run-block > span")].filter(e=>e.textContent==="Completed · exit 0").length===2')
 assert c.eval('[...document.querySelectorAll(".multi-run-output")].every(e=>e.textContent.includes("TASK_OK_quoted value"))')
 # Nonzero exits and cancellation must be distinct outcomes.
 c.eval('document.querySelector("textarea[name=taskCommand]").value="exit 7"');button('Review and run');wait('document.querySelectorAll(".modal").length===2');button('Run on selected sessions');wait('[...document.querySelectorAll(".multi-run-block > span")].filter(e=>e.textContent==="Failed · exit 7").length===2')
 # Cancel only once the command is running, and make the last command an exec
 # of sleep: dash does not exit when a child dies of SIGINT, so a Ctrl+C that
 # lands while an earlier child is still running is swallowed and the sleep
 # then starts anyway. With exec the shell is the sleep, and a Ctrl+C before
 # the exec kills the shell itself.
 hold='until [ "$(cut -d" " -f5 /proc/$$/stat)" = "$(cut -d" " -f8 /proc/$$/stat)" ]; do sleep .05; done; printf "SLEEP_%s\\n" STARTED; exec sleep 30'
 c.eval('document.querySelector("textarea[name=taskCommand]").value='+json.dumps(hold));button('Review and run');wait('document.querySelectorAll(".modal").length===2');button('Run on selected sessions');wait('[...document.querySelectorAll(".multi-run-output")].length===2&&[...document.querySelectorAll(".multi-run-output")].every(e=>e.textContent.includes("SLEEP_STARTED"))');wait('!([...document.querySelectorAll(".modal button")].find(b=>b.textContent==="Cancel run")).disabled');button('Cancel run');wait('[...document.querySelectorAll(".multi-run-block > span")].every(e=>e.textContent.includes("interrupt requested"))');button('Close');time.sleep(.7)
 active=c.eval('document.querySelector(".session-tab.active").dataset.sessionId')
 # The separate window opens in the workspace language (German here), then the workspace returns to English.
 def language(code):
  c.eval('(()=>{const s=document.querySelector("#language-select");s.value='+json.dumps(code)+';s.dispatchEvent(new Event("change",{bubbles:true}));})()');wait('document.documentElement.lang==='+json.dumps(code))
 language('de')
 c.eval('auxCommand.terminal.detach('+json.dumps(active)+')');wait('document.querySelector(".session-tab.active").classList.contains("detached")')
 for _ in range(100):
  pages=json.load(urllib.request.urlopen(m.TARGET));windows=[p for p in pages if p.get('url','').endswith('/detached.html')]
  if windows:break
  time.sleep(.1)
 else:raise AssertionError('Detached window not found')
 d=m.CDP(windows[0]['webSocketDebuggerUrl'])
 try:
  wait('document.documentElement?.lang==="de" && !!document.querySelector("#status") && document.querySelector("#status").textContent!==AuxDialogMessages["Opening terminal…"].de',d)
  assert d.eval('document.querySelector("#attach").textContent===AuxDialogMessages["Return to workspace"].de && document.querySelector("#fullscreen").textContent===AuxDialogMessages["Full screen (F11)"].de')
  assert d.eval('document.querySelector("#attach").textContent')!='Return to workspace'
  language('en')
  d.call('Emulation.setDeviceMetricsOverride',dict(width=400,height=300,deviceScaleFactor=1,mobile=False));
  # The terminal refits after a debounce, so wait for the narrow layout to settle.
  wait('document.documentElement.scrollWidth<=innerWidth',d)
  snapshot=d.eval('detachedTerminal.init("cannot-select-other-session")');assert snapshot['id']==active
  d.eval('detachedTerminal.write('+json.dumps('shutdown --help\r')+')');wait('!!document.querySelector(".danger-confirm")');button('Cancel');wait('!document.querySelector(".modal")')
  assert d.eval('detachedTerminal.write('+json.dumps("printf 'DETACHED_OUTPUT_17\\n'\r")+')') is True
  time.sleep(.5)
  wait('(async()=>(await auxCommand.terminal.exportTranscript('+json.dumps(active)+')).text.includes("DETACHED_OUTPUT_17\\r\\n"))()')
  # Closing the detached window drops this CDP connection, so click after the reply is sent.
  d.eval('setTimeout(()=>document.querySelector("#attach").click(),50)');time.sleep(.3)
 finally:d.close()
 wait('!document.querySelector(".session-tab.active").classList.contains("detached")')
 trace=c.eval('auxCommand.terminal.timeline('+json.dumps(active)+')');assert any(e['stage']=='output' for e in trace)
 c.eval("(async()=>{for(const id of ['bulk-one','bulk-two'])await auxCommand.profiles.save({id,name:id,protocol:'ssh',host:'127.0.0.1',port:22345,group:'Lab',credentialId:'keep-secret-reference'});})()")
 c.reload();wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"');click('#manage-connections')
 c.eval('(()=>{const f=document.querySelector("input[name=connectionFilter]");f.value="bulk-";f.dispatchEvent(new Event("input"));})()');button('Select matching connections')
 c.eval('document.querySelector("input[name=bulkGroup]").value="Production / Europe / DB"');c.eval('document.querySelector("input[name=bulkTags]").value="database, production"');button('Review changes');wait('document.querySelectorAll(".modal").length===2');button('Apply changes');wait('!document.querySelector(".modal")')
 profiles=c.eval('(async()=>(await auxCommand.profiles.list()).filter(p=>p.id.startsWith("bulk-")))()');assert len(profiles)==2
 assert all(p['group']=='Production / Europe / DB' and p['credentialId']=='keep-secret-reference' and p['tags']==['database','production'] for p in profiles)
 assert c.eval('[...document.querySelectorAll(".group-name")].some(e=>e.textContent==="Production / Europe")')
 # RDP settings are saved through the actual profile form.
 c.eval("auxCommand.profiles.save({id:'rdp-options',name:'RDP options fixture',protocol:'rdp',host:'127.0.0.1'})")
 c.reload();wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 c.eval("document.querySelector('[aria-label=\"Actions for RDP options fixture\"]').click()")
 c.eval("[...document.querySelectorAll('.context-menu-item')].find(b=>b.textContent.includes('Edit')).click()")
 wait('!!document.querySelector("input[name=rdpWidth]")')
 c.eval('document.querySelector("input[name=rdpWidth]").value="1280";document.querySelector("input[name=rdpHeight]").value="720";document.querySelector("input[name=rdpAudio]").checked=true')
 click('.modal-footer .primary');wait('!document.querySelector(".modal")')
 rdp=c.eval('(async()=>(await auxCommand.profiles.list()).find(p=>p.id==="rdp-options"))()');assert rdp['rdpWidth']==1280 and rdp['rdpHeight']==720 and rdp['rdpAudio'] is True
 # An RDP profile has its own password field; the file-transfer credential row is hidden for it.
 def edit(name):
  c.eval("document.querySelector('[aria-label=\"Actions for "+name+"\"]').click()")
  c.eval("[...document.querySelectorAll('.context-menu-item')].find(b=>b.textContent.includes('Edit')).click()")
  wait('!!document.querySelector(".modal input[name=secret]")')
 rdp_row='.modal .credential-grid[data-when="rdp"]';ssh_row='.modal .credential-grid[data-when="ssh,ftp,ftps"]'
 edit('RDP options fixture')
 assert c.eval('!document.querySelector('+json.dumps(rdp_row)+').hidden && !document.querySelector('+json.dumps(rdp_row+' input[name=secret]')+').disabled')
 assert c.eval('document.querySelector('+json.dumps(ssh_row)+').hidden && document.querySelector('+json.dumps(ssh_row+' input[name=secret]')+').disabled')
 assert c.eval('!document.querySelector('+json.dumps(rdp_row+' select[name=credentialKind]')+')')
 c.eval('document.querySelector('+json.dumps(rdp_row+' input[name=secret]')+').value="rdp-fixture-password"')
 click('.modal-footer .primary');wait('!document.querySelector(".modal")')
 rdp=c.eval('(async()=>(await auxCommand.profiles.list()).find(p=>p.id==="rdp-options"))()')
 assert rdp['credentialId'] and rdp['credentialKind']=='password' and rdp['rdpWidth']==1280
 assert c.eval('auxCommand.vault.has('+json.dumps(rdp['credentialId'])+')') is True
 # Reopening shows that a password is stored and lets it be removed.
 edit('RDP options fixture')
 assert c.eval('!!document.querySelector('+json.dumps(rdp_row+' input[name=clearSecret]')+')')
 c.eval('document.querySelector('+json.dumps(rdp_row+' input[name=clearSecret]')+').checked=true')
 click('.modal-footer .primary');wait('!document.querySelector(".modal")')
 cleared=c.eval('(async()=>(await auxCommand.profiles.list()).find(p=>p.id==="rdp-options"))()');assert cleared['credentialId']==''
 assert c.eval('auxCommand.vault.has('+json.dumps(rdp['credentialId'])+')') is False
 # An SSH profile keeps its file-transfer credential row, and saving still stores exactly one secret.
 edit('bulk-one')
 assert c.eval('document.querySelector('+json.dumps(rdp_row)+').hidden && !document.querySelector('+json.dumps(ssh_row)+').hidden')
 c.eval('document.querySelector('+json.dumps(ssh_row+' input[name=secret]')+').value="ssh-fixture-password"')
 click('.modal-footer .primary');wait('!document.querySelector(".modal")')
 ssh=c.eval('(async()=>(await auxCommand.profiles.list()).find(p=>p.id==="bulk-one"))()')
 assert ssh['credentialId'] and c.eval('auxCommand.vault.has('+json.dumps(ssh['credentialId'])+')') is True
 # The FTPS mode select is offered only for FTPS profiles, and its value is saved through the form.
 c.eval("auxCommand.profiles.save({id:'ftps-mode',name:'FTPS mode fixture',protocol:'ftps',host:'127.0.0.1',port:2121})")
 c.reload();wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 mode='.modal select[name=ftpsMode]'
 def choose_protocol(value):c.eval('(()=>{const s=document.querySelector(".modal select[name=protocol]");s.value='+json.dumps(value)+';s.dispatchEvent(new Event("change",{bubbles:true}));})()')
 def mode_shown():return c.eval('(()=>{const s=document.querySelector('+json.dumps(mode)+'),f=s.closest(".field");return !f.hidden&&!s.disabled&&f.getClientRects().length>0;})()')
 edit('FTPS mode fixture')
 assert mode_shown() and c.eval('document.querySelector('+json.dumps(mode)+').value')=='auto'
 assert c.eval('[...document.querySelector('+json.dumps(mode)+').options].map(o=>o.value).join()')=='auto,explicit,implicit'
 assert c.eval('!!document.querySelector('+json.dumps(mode)+').closest(".field").querySelector("small").textContent.trim()')
 for other in ['ssh','mosh','ftp','rdp','vnc','telnet','serial','local']:
  choose_protocol(other);assert not mode_shown(),other
 choose_protocol('ftps');assert mode_shown()
 c.eval('document.querySelector(".modal input[name=port]").value="2121";document.querySelector('+json.dumps(mode)+').value="explicit"')
 click('.modal-footer .primary');wait('!document.querySelector(".modal")')
 ftps=c.eval('(async()=>(await auxCommand.profiles.list()).find(p=>p.id==="ftps-mode"))()');assert ftps['ftpsMode']=='explicit' and ftps['protocol']=='ftps' and ftps['port']==2121,ftps
 # Reopening shows the saved choice; a profile changed to plain FTP no longer carries a forced mode.
 edit('FTPS mode fixture')
 assert c.eval('document.querySelector('+json.dumps(mode)+').value')=='explicit'
 c.eval('document.querySelector('+json.dumps(mode)+').value="implicit"');click('.modal-footer .primary');wait('!document.querySelector(".modal")')
 assert c.eval('(async()=>(await auxCommand.profiles.list()).find(p=>p.id==="ftps-mode").ftpsMode)()')=='implicit'
 edit('FTPS mode fixture');choose_protocol('ftp');click('.modal-footer .primary');wait('!document.querySelector(".modal")')
 ftp=c.eval('(async()=>(await auxCommand.profiles.list()).find(p=>p.id==="ftps-mode"))()');assert ftp['protocol']=='ftp' and ftp['ftpsMode']=='auto',ftp
 # Profiles that are not FTPS do not show the select at all.
 edit('bulk-one');assert not mode_shown();click('.modal-close');wait('!document.querySelector(".modal")')
 print('TASK_RESULTS_CANCEL_DETACHED_REATTACH_DRAG_SPLIT_BULK_NESTED_FOLDERS_RDP_OPTIONS_PASSWORD_AND_FTPS_MODE_PASSED')
finally:c.close()
