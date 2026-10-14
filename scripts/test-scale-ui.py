#!/usr/bin/env python3
"""Measure 20/50 real shells and sustained output in a disposable Electron app."""
import importlib.util, json, time
from pathlib import Path
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('e2e-cdp-smoke.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
c=m.CDP(m.get_ws_url())
def wait(expr,seconds=30):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  if c.eval(expr):return
  time.sleep(.1)
 raise AssertionError(expr)
try:
 wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 c.eval("document.querySelector('#tour-skip').click()")
 c.eval("(async()=>{for(const s of await auxCommand.terminal.list())await auxCommand.terminal.close(s.id);await auxCommand.app.saveSessions([]);})()")
 c.call('Page.reload');time.sleep(.5);wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 c.call('Performance.enable')
 results=[]
 for count in [20,50]:
  start=time.monotonic()
  old=c.eval('document.querySelectorAll(".session-tab").length')
  for i in range(old,count):
   c.eval("document.querySelector('#local-button').click()")
   wait(f'document.querySelectorAll(".session-tab").length==={i+1}')
  wait(f'(async()=>(await auxCommand.terminal.list()).length==={count})()')
  created=time.monotonic()-start
  # 2 MiB from every real shell, with a unique completion marker.
  command="python3 -c \"import sys;sys.stdout.write(('0123456789abcdef'*8+'\\\\n')*16384);print('SCALE_DONE_91f6')\"\r"
  start=time.monotonic()
  c.eval('(async()=>{for(const s of await auxCommand.terminal.list())await auxCommand.terminal.write(s.id,'+json.dumps(command)+');})()',timeout=30)
  worst=0
  end=time.monotonic()+90
  while time.monotonic()<end:
   tick=time.monotonic()
   done=c.eval("(async()=>{const sessions=await auxCommand.terminal.list();return (await Promise.all(sessions.map(async(s)=>(await auxCommand.terminal.exportTranscript(s.id)).text.endsWith('SCALE_DONE_91f6\\r\\n') || (await auxCommand.terminal.exportTranscript(s.id)).text.includes('\\r\\nSCALE_DONE_91f6\\r\\n')))).every(Boolean);})()",timeout=45)
   worst=max(worst,time.monotonic()-tick)
   if done:break
   time.sleep(.5)
  else:raise AssertionError('Heavy output did not complete')
  bounded=c.eval("(async()=>{for(const s of await auxCommand.terminal.list()){const t=await auxCommand.terminal.exportTranscript(s.id);if(new TextEncoder().encode(t.text).length>1048576 || !t.truncated)return false;}return true;})()")
  assert bounded,'Transcript cap not enforced'
  metrics={v['name']:v['value'] for v in c.call('Performance.getMetrics')['metrics']}
  results.append(dict(sessions=count,additional_open_seconds=round(created,2),output_seconds=round(time.monotonic()-start,2),worst_transcript_poll_seconds=round(worst,2),js_heap_mb=round(metrics['JSHeapUsedSize']/1048576,1),dom_nodes=metrics['Nodes']))
  print(json.dumps(results[-1]),flush=True)
  # Switching tabs remains interactive with all sessions open.
  start=time.monotonic();c.eval("document.querySelector('.tab-select').click()");assert time.monotonic()-start<5
 c.eval("(async()=>{for(const s of await auxCommand.terminal.list())await auxCommand.terminal.close(s.id);await auxCommand.app.saveSessions([]);})()",timeout=30)
 wait('(async()=>(await auxCommand.terminal.list()).length===0)()')
 print('SCALE_20_50_HEAVY_OUTPUT_BOUNDED_TRANSCRIPTS_CLEANUP_PASSED')
finally:c.close()
