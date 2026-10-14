#!/usr/bin/env python3
"""Qualify a source or packaged desktop on isolated X11/Wayland and high DPI."""
import importlib.util, json, os, signal, socket, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent.parent
backend=os.environ.get('AUX_DISPLAY_BACKEND','x11')
package=os.environ.get('AUX_PACKAGE_EXECUTABLE')
logdir=Path(tempfile.mkdtemp(prefix='aux-display-'+backend+'-'))
runtime=logdir/'runtime';runtime.mkdir(mode=0o700)
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
env=dict(os.environ,AUX_COMMAND_CDP_PORT=str(port),AUX_COMMAND_HEADLESS='0',XDG_RUNTIME_DIR=str(runtime),XDG_CONFIG_HOME=str(logdir/'config'),HOME=str(logdir/'home'),AUX_PANELS_SCREENSHOT=str(logdir/'maximized.png'))
Path(env['HOME']).mkdir()
compositor=None;process=None
try:
 if backend=='wayland':
  env['WAYLAND_DISPLAY']='aux-qualification';env.pop('DISPLAY',None)
  compositor=subprocess.Popen(['weston','--backend=headless-backend.so','--use-pixman','--width=1800','--height=1100','--socket='+env['WAYLAND_DISPLAY'],'--idle-time=0','--no-config','--log='+str(logdir/'weston.log')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  for _ in range(100):
   if (runtime/env['WAYLAND_DISPLAY']).exists():break
   if compositor.poll() is not None:raise RuntimeError('Weston failed: '+str(logdir))
   time.sleep(.1)
 command=([package] if package else [str(root/'node_modules/electron/dist/electron'),'scripts/ui-recovery-fixture.cjs'])+['--ozone-platform='+backend,'--remote-debugging-port='+str(port),'--remote-allow-origins=http://127.0.0.1:'+str(port)]
 if backend=='x11':command=['xvfb-run','-a','-s','-screen 0 1800x1100x24']+command
 with (logdir/'electron.log').open('w') as log:process=subprocess.Popen(command,cwd=root,env=env,stdout=log,stderr=log,start_new_session=True)
 for _ in range(100):
  if process.poll() is not None:raise RuntimeError('App exited: '+str(logdir))
  try:
   pages=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json',timeout=1))
   if any(p.get('title')=='Aux Command' for p in pages):break
  except Exception:pass
  time.sleep(.2)
 else:raise RuntimeError('App did not start: '+str(logdir))
 with (logdir/'panels.log').open('w') as log:
  r=subprocess.run([sys.executable,str(root/'scripts/test-panels-ui.py')],env=env,cwd=root,stdout=log,stderr=subprocess.STDOUT,timeout=90)
 if r.returncode:raise RuntimeError('Panel test failed: '+str(logdir))
 os.environ['AUX_COMMAND_CDP_PORT']=str(port)
 spec=importlib.util.spec_from_file_location('smoke',root/'scripts/e2e-cdp-smoke.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 c=m.CDP(m.get_ws_url())
 try:
  c.call('Emulation.setDeviceMetricsOverride',{'width':1280,'height':800,'deviceScaleFactor':2,'mobile':False})
  time.sleep(.8)
  result=c.eval("({dpi:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth,sidebar:document.querySelector('#sidebar-resizer').getAttribute('aria-valuenow')})")
  assert result['dpi']==2 and not result['overflow'],result
  m.SCREENSHOT_PATH=str(logdir/'high-dpi.png');m.capture_screenshot(c)
  print(json.dumps(dict(backend=backend,packaged=bool(package),**result)),flush=True)
 finally:c.close()
 print('DISPLAY_PANELS_FULLSCREEN_HIGH_DPI_CAPTURE_PASSED: '+str(logdir),flush=True)
finally:
 if process:
  try:os.killpg(process.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  try:process.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
 if compositor:
  compositor.terminate();compositor.wait(timeout=5)
