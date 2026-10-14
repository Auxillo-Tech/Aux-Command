#!/usr/bin/env python3
"""Exercise translated dialogs, accessibility labels and substitution in all locales."""
import importlib.util,json,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('e2e-cdp-smoke.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
c=m.CDP(m.get_ws_url())
def wait(expr):
 for _ in range(100):
  if c.eval(expr):return
  time.sleep(.1)
 raise AssertionError(expr)
try:
 wait('document.querySelector("#app-shell")?.getAttribute("aria-busy")==="false"')
 c.eval('document.querySelector("#tour-skip")?.click()')
 for lang in ['en','de','es','fr','it','ja','pt','ru','zh']:
  c.eval('(()=>{const s=document.querySelector("#language-select");s.value='+json.dumps(lang)+';s.dispatchEvent(new Event("change",{bubbles:true}));})()')
  wait('document.documentElement.lang==='+json.dumps(lang))
  c.eval('document.querySelector("#preferences-button").click()')
  wait('!!document.querySelector(".modal")')
  assert c.eval('document.querySelector(".modal").getAttribute("aria-label")===AuxI18n.message("Workspace preferences")'),lang
  assert c.eval('document.querySelector(".modal-close").getAttribute("aria-label")===AuxI18n.message("Close dialog")'),lang
  assert c.eval('!document.querySelector(".modal").textContent.match(/\\{p[0-9]+\\}|▁|ZQX[0-9]+ZQX/)'),lang
  assert c.eval('(()=>{const r=document.querySelector(".modal").getBoundingClientRect();return r.width<=innerWidth&&r.height<=innerHeight+1})()'),lang
  c.eval('document.querySelector(".modal-close").click()')
  print(lang+': translated preferences and accessibility passed',flush=True)
 c.eval('(()=>{const s=document.querySelector("#language-select");s.value="en";s.dispatchEvent(new Event("change",{bubbles:true}));})()')
 wait('document.documentElement.lang==="en"')
 print('NINE_LANGUAGE_DIALOG_ACCESSIBILITY_PASSED')
finally:c.close()
