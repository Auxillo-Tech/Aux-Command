#!/usr/bin/env python3
"""Run source desktop UI checks in a disposable X session and profile store."""
import json, os, signal, socket, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent.parent
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
logdir=Path(tempfile.mkdtemp(prefix='aux-ui-qualification-'))
env=dict(os.environ,AUX_COMMAND_CDP_PORT=str(port),AUX_COMMAND_HEADLESS='0',AUX_COMMAND_SOAK_ITERATIONS='20',AUX_COMMAND_SCREENSHOT=str(logdir/'smoke.png'),AUX_WORKSPACE_SCREENSHOT=str(logdir/'workspace.png'),AUX_FILE_SCREENSHOT=str(logdir/'files.png'),AUX_COMMAND_SOAK_SCREENSHOT=str(logdir/'soak.png'))
package=os.environ.get('AUX_PACKAGE_EXECUTABLE')
if package:
 env['HOME']=str(logdir/'home');Path(env['HOME']).mkdir()
 env['XDG_CONFIG_HOME']=str(logdir/'config')
command=([package] if package else [str(root/'node_modules/electron/dist/electron'),'scripts/ui-recovery-fixture.cjs'])
with (logdir/'electron.log').open('w') as log:
 process=subprocess.Popen(['xvfb-run','-a']+command+['--remote-debugging-port='+str(port),'--remote-allow-origins=http://127.0.0.1:'+str(port)],cwd=root,env=env,stdout=log,stderr=log,start_new_session=True)
 try:
  for attempt in range(100):
   if process.poll() is not None: raise RuntimeError('Electron exited; see '+str(logdir))
   try:
    pages=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json',timeout=1))
    if any(page.get('title')=='Aux Command' for page in pages):break
   except Exception:pass
   time.sleep(.2)
  else:raise RuntimeError('Electron did not become ready; see '+str(logdir))
  for script in os.environ.get('AUX_UI_SCRIPTS','e2e-cdp-smoke.py,test-recovery-ui.py,test-workspace-ui.py,test-file-browser-ui.py,test-panels-ui.py,test-named-workspaces-ui.py,test-product-upgrades-ui.py,test-desktop-controls-ui.py,test-languages-ui.py,soak-cdp.py').split(','):
   with (logdir/(script+'.log')).open('w') as output:
    result=subprocess.run([sys.executable,str(root/'scripts'/script)],cwd=root,env=env,stdout=output,stderr=subprocess.STDOUT,timeout=240)
   if result.returncode:raise RuntimeError(script+' failed; see '+str(logdir))
   print(script+': passed',flush=True)
 finally:
  try:os.killpg(process.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  try:process.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
print('Evidence: '+str(logdir))
