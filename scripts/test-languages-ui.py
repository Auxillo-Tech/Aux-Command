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
 # Deeper dialogs, toasts and sign-in prompts are translated too, not only the persistent chrome.
 def msg(source,params=None):return c.eval('AuxI18n.message('+json.dumps(source)+','+json.dumps(params or {})+')')
 def texts(selector):return c.eval('[...document.querySelectorAll('+json.dumps(selector)+')].map(e=>e.textContent)')
 def translated(source,shown,lang,params=None):
  expected=msg(source,params)
  assert expected!=source,(lang,'still English in the catalog',source)
  assert expected in shown,(lang,source,expected,shown)
 def close_modal():
  c.eval('document.querySelector(".modal-backdrop:last-child .modal-close").click()');wait('!document.querySelector(".modal")')
 for lang in ['de','ja','pt']:
  c.eval('(()=>{const s=document.querySelector("#language-select");s.value='+json.dumps(lang)+';s.dispatchEvent(new Event("change",{bubbles:true}));})()')
  wait('document.documentElement.lang==='+json.dumps(lang))
  assert c.eval('localStorage.getItem("aux-command-language")')==lang
  # Import / export menu.
  c.eval('document.querySelector("#profile-menu-button").click()');wait('!!document.querySelector(".modal .menu-action")')
  shown=texts('.modal .menu-action strong')+texts('.modal .menu-action span')+texts('.modal h2')+texts('.modal-header p')
  for source in ['Import / Export and recovery','Import Aux Command profiles','Preview a JSON export and choose how to handle existing profiles.','Back up workspace','Undo an import or restore using one of the last ten local snapshots.']:translated(source,shown,lang)
  close_modal()
  # Connection editor: field hints, including the FTPS mode and the saved-credential hint.
  c.eval('document.querySelector("#new-profile-button").click()');wait('!!document.querySelector(".modal select[name=ftpsMode]")')
  shown=texts('.modal .field > span')+texts('.modal .field > small')+texts('.modal select[name=ftpsMode] option')
  for source in ['FTPS mode','Automatic (recommended)','Implicit (TLS from the start)','Most hosting providers use explicit FTPS (port 21); implicit FTPS (port 990) is older and less common. Automatic picks the right one.','Saved credential','Used for SFTP/FTP/FTPS. With OpenSSH 8.7 or later it also answers the SSH password or key passphrase prompt in terminals, tunnels, the live monitor and the gateway. Other prompts are still shown to you.']:translated(source,shown,lang)
  translated('Optional password or passphrase',[c.eval('document.querySelector(\'.modal .credential-grid[data-when="ssh,ftp,ftps"] input[name=secret]\').placeholder')],lang)
  close_modal()
  # Tunnel dialog: the note about saved credentials and the default tunnel name.
  c.eval('document.querySelector("#tunnels-button").click()');wait('!!document.querySelector(".modal .warning-box")')
  translated('Managed tunnels run in the background. With OpenSSH 8.7 or later, a password or key passphrase saved in the connection profile is used automatically; any other prompt, such as a verification code or an unknown server key, appears as a dialog. OpenSSH older than 8.4 cannot ask at all: use key or SSH-agent authentication.',texts('.modal .warning-box'),lang)
  translated('Local tunnel',[c.eval('document.querySelector(".modal input[name=name]").value')],lang)
  close_modal()
  # An error raised in the window reaches the toast in the same language.
  c.eval('document.querySelector("#quick-input").value="";document.querySelector("#quick-button").click()');wait('!!document.querySelector(".toast.error")')
  shown=texts('.toast.error strong')+texts('.toast.error span')
  translated('Invalid connection target',shown,lang);translated('Enter a hostname or connection URI',shown,lang)
  c.eval('document.querySelectorAll(".toast").forEach(e=>e.remove())')
  # The application's own sign-in prompt is translated, values included.
  c.eval('console.log("aux-ui-fixture:rdp-sign-in")');wait('!!document.querySelector(".modal .prompt-stack")')
  translated('RDP sign-in',texts('.modal h2'),lang)
  translated('Password for {p0}',texts('.modal .field > span'),lang,{'p0':'ops'})
  translated('Leave the password empty if this server shows its own sign-in screen. To skip this prompt, save a password in the connection profile.',texts('.modal .warning-box'),lang)
  assert c.eval('document.querySelector(".modal .prompt-stack input").type')=='password'
  assert c.eval('!document.querySelector(".modal").textContent.match(/\\{p[0-9]+\\}/)'),lang
  c.eval('document.querySelector(".modal-footer button").click()');wait('!document.querySelector(".modal")')
  # A prompt from a server is shown exactly as sent, even where the same words exist in the catalog.
  assert msg('Password')!='Password',lang
  c.eval('console.log("aux-ui-fixture:server-prompt")');wait('!!document.querySelector(".modal .prompt-stack")')
  assert texts('.modal .field > span')==['Password','Verification code: '],(lang,texts('.modal .field > span'))
  assert texts('.modal .warning-box')==['Password'],lang
  translated('SSH authentication',texts('.modal h2'),lang)
  c.eval('document.querySelector(".modal-footer button").click()');wait('!document.querySelector(".modal")')
  # OpenSSH sign-in through the askpass rules: the saved password was refused, so the user is asked.
  c.eval('console.log("aux-ui-fixture:askpass-saved-rejected")');wait('!!document.querySelector(".modal .prompt-stack")')
  translated('SSH sign-in',texts('.modal h2'),lang)
  assert texts('.modal .warning-box')==[msg('The saved password was not accepted.')] and msg('The saved password was not accepted.')!='The saved password was not accepted.',lang
  translated('Password for {p0}',texts('.modal .field > span'),lang,{'p0':'ops@ssh.fixture.test'})
  assert c.eval('document.querySelector(".modal .prompt-stack input").type')=='password' and not texts('.modal .prompt-received')
  c.eval('document.querySelector(".modal-footer button").click()');wait('!document.querySelector(".modal")')
  # Unknown server key: OpenSSH's report is shown line by line as received; the note and the question are translated.
  c.eval('console.log("aux-ui-fixture:askpass-host-key")');wait('!!document.querySelector(".modal .prompt-received")')
  translated('Unknown SSH server',texts('.modal h2'),lang)
  assert texts('.modal .prompt-received')==["The authenticity of host 'ssh.fixture.test (192.0.2.10)' can't be established.\nED25519 key fingerprint is SHA256:d2R4qWcIhTB2N7+FKN+mnLD5aCip+t+nxP1Oq7sXZ7s.\nThis key is not known by any other names."],(lang,texts('.modal .prompt-received'))
  assert c.eval('getComputedStyle(document.querySelector(".modal .prompt-received")).whiteSpace')=='pre-wrap'
  assert c.eval('(()=>{const b=document.querySelector(".modal .prompt-received").getBoundingClientRect(),m=document.querySelector(".modal").getBoundingClientRect();return b.height>40&&b.right<=m.right+1&&b.left>=m.left-1;})()'),lang
  assert texts('.modal .warning-box')==[msg('Check the fingerprint. Type yes to trust this server and continue; anything else stops the connection.')],lang
  translated('Trust this server? Type yes to continue',texts('.modal .field > span'),lang)
  assert ' yes ' in (' '+msg('Trust this server? Type yes to continue')+' ').replace('yes',' yes ') and 'yes' in texts('.modal .warning-box')[0],lang
  assert c.eval('(()=>{const i=document.querySelector(".modal .prompt-stack input");return i.type+"|"+i.placeholder;})()')=='text|yes'
  c.eval('document.querySelector(".modal-footer button").click()');wait('!document.querySelector(".modal")')
  print(lang+': translated dialogs, toast and sign-in prompts passed',flush=True)
 c.eval('(()=>{const s=document.querySelector("#language-select");s.value="en";s.dispatchEvent(new Event("change",{bubbles:true}));})()')
 wait('document.documentElement.lang==="en"')
 print('NINE_LANGUAGE_DIALOG_ACCESSIBILITY_AND_TRANSLATED_DIALOGS_PASSED')
finally:c.close()
