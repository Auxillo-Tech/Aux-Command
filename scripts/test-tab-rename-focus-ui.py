#!/usr/bin/env python3
"""Regression: a late focus restore from a closed dialog must not close the tab rename field.

showModal() gives focus back to its opener from a deferred task. On a loaded runner
that task can run after the next control has taken focus; the old code then blurred
the tab rename field, which commits and removes itself on blur. This script holds
the dialog's deferred restore, opens the rename field through the real keyboard route,
then lets the restore run and checks the field is still open and focused. No sleeps:
the held task is released explicitly, so the check does not depend on timing.
"""
import importlib.util, json, time
from pathlib import Path

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).with_name('e2e-cdp-smoke.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
c = m.CDP(m.get_ws_url())


def wait(expr, seconds=30):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if c.eval(expr):
            return
        time.sleep(.1)
    raise AssertionError('not reached within %ss: %s' % (seconds, expr))


def click(selector):
    pos = c.eval('''(()=>{const e=document.querySelector(%s);if(!e)throw Error('Missing control');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()''' % json.dumps(selector))
    c.call('Input.dispatchMouseEvent', dict(type='mousePressed', button='left', clickCount=1, **pos))
    c.call('Input.dispatchMouseEvent', dict(type='mouseReleased', button='left', clickCount=1, **pos))


def key(name, code, modifiers=0):
    for kind in ['keyDown', 'keyUp']:
        c.call('Input.dispatchKeyEvent', {'type': kind, 'key': name, 'code': code, 'modifiers': modifiers})


try:
    wait('document.querySelector("#app-shell").getAttribute("aria-busy")==="false"')
    c.dismiss_tour()
    click('#local-button')
    wait('document.querySelectorAll(".session-tab").length>=1')

    # Open the palette from its button, so the button is the dialog's opener.
    click('#palette-button')
    wait('!!document.querySelector(".palette-shell input")')
    # Close it while holding every zero-delay timer it schedules (the focus restore).
    held = c.eval('''(()=>{const hold=[];const real=window.setTimeout;
      window.setTimeout=(fn,ms,...args)=>{if(!ms){hold.push(()=>fn(...args));return 0;}return real(fn,ms,...args);};
      try{document.querySelector('.modal-close').click();}finally{window.setTimeout=real;}
      window.__heldTimers=hold;return hold.length;})()''')
    assert held >= 1, 'closing the dialog scheduled no deferred focus restore'
    wait('!document.querySelector(".modal-backdrop")')

    # Keyboard route to the rename field: F10 opens the tab menu, its first item renames.
    c.eval('document.querySelector(".session-tab.active .tab-select").focus()')
    key('F10', 'F10', 8)
    wait('!!document.querySelector(".context-menu")')
    click('.context-menu-item')
    wait('!!document.querySelector(".tab-rename-input")')
    assert c.eval('document.activeElement===document.querySelector(".tab-rename-input")'), 'rename field is not focused'

    # Now the late restore runs. The rename field must keep focus and stay open.
    state = c.eval('''(()=>{for(const run of window.__heldTimers)run();
      const input=document.querySelector('.tab-rename-input');
      return {open:!!input,focused:!!input&&document.activeElement===input,active:document.activeElement&&(document.activeElement.id||document.activeElement.className||document.activeElement.tagName)};})()''')
    assert state['open'] and state['focused'], 'late dialog focus restore closed the rename field: %r' % (state,)

    # The field still commits on Enter.
    c.eval('''(()=>{const i=document.querySelector(".tab-rename-input");i.value="Focus kept";i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));})()''')
    wait('document.querySelector(".session-tab.active .tab-title").textContent==="Focus kept"')

    # Control: with nothing else focused, closing a dialog still returns focus to its opener.
    c.eval('document.activeElement.blur()')
    click('#palette-button')
    wait('!!document.querySelector(".palette-shell input")')
    click('.modal-close')
    wait('document.activeElement&&document.activeElement.id==="palette-button"')
    print('TAB_RENAME_FOCUS_KEPT_PASSED')
finally:
    c.close()
