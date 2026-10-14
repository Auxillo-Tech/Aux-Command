#!/usr/bin/env python3
"""Measure a large saved-connection workspace and bounded long-running shell output."""
import importlib.util,json,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('e2e-cdp-smoke.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
c=m.CDP(m.get_ws_url())
def wait(expr):
 for _ in range(200):
  if c.eval(expr):return
  time.sleep(.1)
 raise AssertionError(expr)
try:
 wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"');c.eval('document.querySelector("#tour-skip").click()')
 c.eval("(async()=>{for(let i=0;i<600;i++)await auxCommand.profiles.save({id:'scale-'+i,name:'Scale target '+String(i).padStart(4,'0'),protocol:'local',group:'Scale / Saved',tags:['benchmark']});})()",timeout=120)
 start=time.monotonic();c.call('Page.reload');time.sleep(.3);wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 loaded=time.monotonic()-start;rows=c.eval('document.querySelectorAll(".profile-item").length');assert rows<=201
 timings=[]
 for term in ['scale target 0599','benchmark','scale target 0499','unmatched']:
  timings.append(c.eval('(()=>{const start=performance.now(),e=document.querySelector("#profile-search");e.value='+json.dumps(term)+';e.dispatchEvent(new Event("input"));return performance.now()-start;})()'))
 assert c.eval('document.querySelectorAll(".profile-item").length')==0
 c.eval('(()=>{const e=document.querySelector("#profile-search");e.value="";e.dispatchEvent(new Event("input"));})()')
 c.eval('document.querySelector("#local-button").click()');wait('document.querySelectorAll(".session-tab").length===1')
 sid=c.eval('document.querySelector(".session-tab").dataset.sessionId')
 command="python3 -u -c 'import time;[(print(\"LOG_%04d \"%i+\"x\"*16384),time.sleep(.01)) for i in range(1000)];print(\"LONG_OUTPUT_DONE_21\")'\r"
 c.eval('auxCommand.terminal.write('+json.dumps(sid)+','+json.dumps(command)+')')
 polls=[]
 for _ in range(60):
  tick=time.monotonic();done=c.eval('(async()=>(await auxCommand.terminal.exportTranscript('+json.dumps(sid)+')).text.includes("\\r\\nLONG_OUTPUT_DONE_21\\r\\n"))()');polls.append(time.monotonic()-tick)
  if done:break
  time.sleep(.25)
 else:raise AssertionError('Long output did not complete')
 transcript=c.eval('auxCommand.terminal.exportTranscript('+json.dumps(sid)+')');assert len(transcript['text'].encode())<=1048576
 print(json.dumps(dict(saved_profiles=600,initial_rendered_rows=rows,reload_seconds=round(loaded,3),filter_ms=[round(t,2) for t in timings],long_output_bytes=1000*16384,max_poll_seconds=round(max(polls),3),transcript_bytes=len(transcript['text'].encode()))))
 print('LARGE_WORKSPACE_FILTER_AND_SUSTAINED_OUTPUT_PASSED')
finally:c.close()
