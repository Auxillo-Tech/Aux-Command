#!/usr/bin/env python3
"""Drive the real file browser against an isolated loopback FTP fixture."""
import importlib.util, json, os, subprocess, sys, tempfile, time
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
 c.eval('document.querySelector(%s).click()'%json.dumps(selector))
def fill(selector,value,event='input'):
 c.eval('''(()=>{const e=document.querySelector(%s);e.value=%s;e.dispatchEvent(new Event(%s,{bubbles:true}));})()'''%(json.dumps(selector),json.dumps(value),json.dumps(event)))
with tempfile.TemporaryDirectory(prefix='aux-file-ui-') as directory:
 root=Path(directory);(root/'z-folder').mkdir();(root/'z-folder'/'nested').mkdir();(root/'z-folder'/'nested'/'empty').mkdir();(root/'z-folder'/'nested'/'tree.txt').write_text('recursive fixture');(root/'.env').write_text('fixture=true');(root/'file2.txt').write_text('editable fixture');(root/'file10.txt').write_text('larger fixture\n'*20)
 server=subprocess.Popen([sys.executable,str(Path(__file__).with_name('ftp-test-server.py')),directory,'unused','unused','ftp'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
 try:
  port=json.loads(server.stdout.readline())['port']
  c.eval('''(async()=>{await auxCommand.vault.set('ui-ftp-secret','test-only-password',false);await auxCommand.profiles.save({id:'ui-ftp',name:'UI FTP fixture',protocol:'ftp',host:'127.0.0.1',port:%d,username:'fixture',credentialId:'ui-ftp-secret'});})()'''%port)
  c.call('Page.reload');time.sleep(.5);wait('document.querySelector("#app-shell").getAttribute("aria-busy")==="false"')
  click('#tour-skip');click('#profiles-all')
  click('[aria-label^="Connect to UI FTP fixture"]');wait('!!document.querySelector(".modal-footer .primary")');click('.modal-footer .primary')
  wait('document.querySelectorAll(".file-row").length===4')
  names=lambda:c.eval('[...document.querySelectorAll(".file-row strong")].map(e=>e.textContent)')
  assert names()==['z-folder','.env','file2.txt','file10.txt']
  click('#file-hidden');assert '.env' not in names()
  fill('#file-sort','size','change');assert names()==['z-folder','file10.txt','file2.txt']
  fill('#file-search','file2');assert names()==['file2.txt']
  click('.file-row');assert c.eval('document.querySelector("#sftp-edit").disabled') is False
  fill('#file-search','absent');assert not names()
  assert c.eval('document.querySelector("#sftp-edit").disabled') is True
  assert c.eval('document.querySelector("#sftp-empty").textContent')=='No files match your filters.'
  fill('#file-search','file2');c.eval('document.querySelector(".file-row").focus()')
  c.call('Input.dispatchKeyEvent',{'type':'keyDown','key':'Enter','code':'Enter','windowsVirtualKeyCode':13})
  c.call('Input.dispatchKeyEvent',{'type':'keyUp','key':'Enter','code':'Enter','windowsVirtualKeyCode':13})
  wait('!!document.querySelector("textarea.remote-editor")')
  assert c.eval('document.querySelector("textarea.remote-editor").value')=='editable fixture'
  click('.modal-close')
  fill('#file-search','');click('#file-hidden')
  c.call('Emulation.setDeviceMetricsOverride',{'width':1280,'height':800,'deviceScaleFactor':1,'mobile':False});time.sleep(.3)
  assert c.eval('document.querySelector(".session-toolbar").scrollWidth<=document.querySelector(".session-toolbar").clientWidth')
  assert c.eval('document.querySelector("#file-list").getBoundingClientRect().height>150')
  assert c.eval('document.querySelector("#transfer-status").getBoundingClientRect().bottom<=innerHeight')
  m.SCREENSHOT_PATH=os.environ.get('AUX_FILE_SCREENSHOT','/tmp/aux-file-browser-after.png');m.capture_screenshot(c)
  # Dual-pane batch review: download two files, then upload with skip/rename/replace.
  with tempfile.TemporaryDirectory(prefix='aux-batch-local-') as local:
   click('#file-manager-button');wait('!!document.querySelector(".dual-file-browser")')
   fill('input[name=localPath]',local)
   c.eval("document.querySelector('input[name=localPath]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
   wait('document.querySelector(".dual-file-pane:first-child .dual-file-status").textContent.includes("0 entries")')
   fill('input[name=remoteFilter]','file')
   c.eval("[...document.querySelectorAll('.dual-file-pane:nth-of-type(2) button')].find(b=>b.textContent==='Select all files').click()")
   click('.dual-file-pane:nth-of-type(2) > .primary')
   wait('document.querySelectorAll(".transfer-review-item").length===2')
   click('.modal-backdrop:last-child .modal-footer .primary')
   wait('(async()=>(await auxCommand.transfer.list()).filter(t=>t.status==="completed").length>=2)()')
   assert (Path(local)/'file2.txt').read_text()=='editable fixture'
   assert (Path(local)/'file10.txt').exists()
   # Refresh local listing and select the downloaded files for upload.
   c.eval("document.querySelector('input[name=localPath]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
   wait('document.querySelectorAll(".dual-file-pane:first-child input[type=checkbox]").length===2')
   c.eval("[...document.querySelectorAll('.dual-file-pane:first-child button')].find(b=>b.textContent==='Select all files').click()")
   click('.dual-file-pane[aria-label="Local files"] > .primary')
   wait('!!document.querySelector("select[name=conflictPolicy]")')
   assert c.eval('document.querySelectorAll(".transfer-review-item").length')==2
   assert c.eval('document.querySelector("select[name=conflictPolicy]").value')=='skip'
   click('.modal-backdrop:last-child .modal-footer .primary')
   wait('!document.querySelector("select[name=conflictPolicy]")')
   assert len(list(root.glob('file*.txt')))==2
   # Completed transfers refresh both panes and clear the finished selection.
   wait('document.querySelectorAll(".dual-file-pane:first-child input[type=checkbox]:checked").length===0')
   c.eval("[...document.querySelectorAll('.dual-file-pane:first-child button')].find(b=>b.textContent==='Select all files').click()")
   click('.dual-file-pane[aria-label="Local files"] > .primary');wait('!!document.querySelector("select[name=conflictPolicy]")')
   fill('select[name=conflictPolicy]','rename','change');click('.modal-backdrop:last-child .modal-footer .primary')
   wait('(async()=>(await auxCommand.transfer.list()).filter(t=>t.status==="completed").length>=4)()')
   assert len(list(root.glob('file*.txt')))==4
   (Path(local)/'file2.txt').write_text('replacement approved in review')
   click('.dual-file-pane[aria-label="Local files"] > .primary');wait('!!document.querySelector("select[name=conflictPolicy]")')
   fill('select[name=conflictPolicy]','replace','change');click('.modal-backdrop:last-child .modal-footer .primary')
   wait('(async()=>(await auxCommand.transfer.list()).filter(t=>t.status==="completed").length>=6)()')
   assert (root/'file2.txt').read_text()=='replacement approved in review'
   # A selected folder includes nested files and empty folders.
   fill('input[name=remoteFilter]','z-folder')
   click('.dual-file-pane:nth-of-type(2) input[type=checkbox]')
   click('.dual-file-pane:nth-of-type(2) > .primary')
   wait('document.querySelectorAll(".transfer-review-item").length===4')
   click('.modal-backdrop:last-child .modal-footer .primary')
   wait('(async()=>(await auxCommand.transfer.list()).filter(t=>t.status==="completed").length>=7)()')
   assert (Path(local)/'z-folder'/'nested'/'tree.txt').read_text()=='recursive fixture'
   assert (Path(local)/'z-folder'/'nested'/'empty').is_dir()
   (Path(local)/'z-folder').rename(Path(local)/'upload-tree')
   c.eval("document.querySelector('input[name=localPath]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
   fill('input[name=localFilter]','upload-tree');wait('document.querySelectorAll(".dual-file-pane:first-child input[type=checkbox]").length===1')
   click('.dual-file-pane[aria-label="Local files"] input[type=checkbox]');click('.dual-file-pane[aria-label="Local files"] > .primary')
   wait('document.querySelectorAll(".transfer-review-item").length===4');click('.modal-backdrop:last-child .modal-footer .primary')
   wait('(async()=>(await auxCommand.transfer.list()).filter(t=>t.status==="completed").length>=8)()')
   assert (root/'upload-tree'/'nested'/'tree.txt').read_text()=='recursive fixture'
   assert (root/'upload-tree'/'nested'/'empty').is_dir()
   profile=c.eval('(async()=>(await auxCommand.profiles.list()).find(p=>p.id==="ui-ftp"))()')
   checksum=c.eval('auxCommand.sftp.checksum('+json.dumps(dict(profile=profile,localPath=str(Path(local)/'file2.txt'),remotePath='/file2.txt'))+')')
   assert checksum['equal'] is True
   comparison=c.eval('auxCommand.sftp.compare('+json.dumps(dict(profile=profile,localDirectory=local,remoteDirectory='/',verify=True))+')')
   assert comparison['unchanged']>=3
   found=c.eval('auxCommand.sftp.search('+json.dumps(dict(profile=profile,directory='/',query='tree.txt'))+')')
   assert len(found['results'])==2
   # Actual comparison controls open a review without enqueueing anything.
   click('#compare-folders');wait('document.querySelectorAll(".modal").length===2')
   assert 'one-way update' in c.eval('document.querySelector(".modal-backdrop:last-child").textContent')
   click('.modal-backdrop:last-child .modal-close')
   # Large directory rendering stays bounded while filtering covers all entries.
   for i in range(1000):(Path(local)/('scale-%04d'%i)).write_text('x')
   start=time.monotonic()
   fill('input[name=localFilter]','')
   c.eval("document.querySelector('input[name=localPath]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
   wait('document.querySelector(".dual-file-pane:first-child .dual-file-status").textContent.startsWith("1003 entries")')
   assert c.eval('document.querySelectorAll(".dual-file-pane:first-child .dual-file-row").length')==200
   fill('input[name=localFilter]','scale-0999');wait('document.querySelectorAll(".dual-file-pane:first-child .dual-file-row").length===1')
   print(json.dumps(dict(large_directory_entries=1003,rendered_rows=200,load_filter_seconds=round(time.monotonic()-start,3))))
   click('.modal-close')
  click('#sftp-close');c.call('Emulation.clearDeviceMetricsOverride')
  print('REAL_FTP_FILE_FILTER_SORT_EDITOR_DUAL_PANE_BATCH_CONFLICT_POLICIES_PASSED')
 finally:
  server.terminate();server.wait(timeout=5);c.close()
