#!/usr/bin/env python3
"""Exercise actual noVNC controls against a disposable loopback-only VNC server."""
import importlib.util,json,os,signal,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('e2e-cdp-smoke.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
c=m.CDP(m.get_ws_url())
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
log=tempfile.TemporaryFile();server=subprocess.Popen(['xvfb-run','-a','x11vnc','-localhost','-rfbport',str(port),'-nopw','-forever','-shared'],stdout=log,stderr=log,start_new_session=True)
def wait(expr,context=None):
 for _ in range(150):
  if evaluate(expr,context):return
  time.sleep(.1)
 raise AssertionError(expr)
def evaluate(expr,context=None):
 if context is None:return c.eval(expr)
 if isinstance(context,m.CDP):return context.eval(expr)
 result=c.call('Runtime.evaluate',dict(expression=expr,contextId=context,returnByValue=True,userGesture=True))
 if result.get('exceptionDetails'):raise AssertionError(result['exceptionDetails'])
 return result.get('result',{}).get('value')
try:
 for _ in range(100):
  try:
   with socket.create_connection(('127.0.0.1',port),timeout=.2):break
  except OSError:time.sleep(.1)
 wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"');c.eval('document.querySelector("#tour-skip").click()')
 c.eval('auxCommand.profiles.save('+json.dumps(dict(id='desktop-control-fixture',name='Desktop controls fixture',protocol='vnc',host='127.0.0.1',port=port))+')');c.call('Page.reload');time.sleep(.5);wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 c.eval('document.querySelector("[aria-label^=\\"Connect to Desktop controls fixture\\"]").click()');wait('!!document.querySelector("iframe")')
 # The viewer is served from its own aux-vnc:// origin, so it runs as a
 # separate out-of-process frame target rather than a child of the page.
 for _ in range(100):
  found=[t for t in json.load(urllib.request.urlopen(m.TARGET,timeout=2)) if t.get('type')=='iframe' and t.get('url','').startswith('aux-vnc://viewer/vnc.html')]
  if found:break
  time.sleep(.1)
 else:raise AssertionError('VNC viewer frame not found')
 context=m.CDP(found[0]['webSocketDebuggerUrl'])
 # The remote-desktop viewer must not reach the workspace's privileged API.
 assert evaluate('(()=>{try{return typeof window.parent.auxCommand}catch(e){return "blocked"}})()',context)=='blocked'
 wait('document.querySelector("#vnc-status")?.textContent.includes("Connected")',context)
 for selector in ['#desktop-fit','#desktop-viewonly','#desktop-cad','#desktop-clipboard']:
  evaluate('document.querySelector('+json.dumps(selector)+').click()',context)
 assert evaluate('document.querySelector("#vnc-screen").classList.contains("actual-size")',context)
 assert evaluate('document.querySelector("#desktop-viewonly").textContent',context)=='Enable control'
 evaluate('document.querySelector("#clipboard-text").value="Desktop clipboard fixture";document.querySelector("#clipboard-send").click();document.querySelector("#clipboard-close").click()',context)
 assert evaluate('document.querySelector("#clipboard-panel").hidden',context)
 assert evaluate('document.querySelector("#error-overlay").hidden',context)
 c.eval('document.querySelector("iframe").style.width="320px"');time.sleep(.3)
 assert evaluate('document.documentElement.scrollWidth<=innerWidth',context)
 evaluate('document.querySelector("#desktop-clipboard").click()',context)
 assert evaluate('document.querySelector("#clipboard-panel").getBoundingClientRect().left>=0',context)
 print('REAL_VNC_FIT_VIEW_ONLY_CLIPBOARD_AND_KEY_CONTROLS_PASSED')
finally:
 c.close()
 try:os.killpg(server.pid,signal.SIGTERM)
 except ProcessLookupError:pass
 server.wait(timeout=5);log.close()
