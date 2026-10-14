'use strict';
const api=window.detachedTerminal,terminal=new window.Terminal({fontSize:13,lineHeight:1.12,scrollback:20000,fontFamily:'JetBrains Mono, monospace',theme:{background:'#060b13',foreground:'#dcecf4'}}),fit=new window.FitAddon.FitAddon();
terminal.loadAddon(fit);terminal.open(document.querySelector('#terminal'));
let ready=false,pending=[],timer,ended=false;
api.onData(event=>{if(ready)terminal.write(event.data);else pending.push(event);});
api.onExit(({exitCode})=>{ended=true;document.querySelector('#status').textContent='Session ended ('+exitCode+')';terminal.options.disableStdin=true;});
terminal.onData(data=>api.write(data).catch(error=>{document.querySelector('#status').textContent=error.message;}));
terminal.onResize(({cols,rows})=>api.resize(cols,rows).catch(()=>{}));
new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>fit.fit(),80);}).observe(document.querySelector('#terminal'));
terminal.attachCustomKeyEventHandler(event=>{
 if(event.type!=='keydown')return true;
 if(event.code==='F11'){api.fullscreen();return false;}
 // Ctrl+= / Ctrl+- / Ctrl+0 zoom, as in the main window.
 if(event.ctrlKey&&!event.shiftKey&&!event.altKey&&['Equal','NumpadAdd','Minus','NumpadSubtract','Digit0','Numpad0'].includes(event.code)){event.preventDefault();const size=terminal.options.fontSize;terminal.options.fontSize=['Digit0','Numpad0'].includes(event.code)?(baseFontSize||13):Math.min(32,Math.max(8,size+(['Minus','NumpadSubtract'].includes(event.code)?-1:1)));fit.fit();return false;}
 if((event.ctrlKey&&event.shiftKey&&event.code==='KeyC')||(event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.code==='Insert')){event.preventDefault();copy();return false;}
 if((event.ctrlKey&&event.shiftKey&&event.code==='KeyV')||(event.shiftKey&&!event.ctrlKey&&!event.altKey&&event.code==='Insert')){event.preventDefault();paste();return false;}
 return true;
});
// Same copy and paste behaviour as workspace terminals: a mouse highlight is
// the primary selection (and the clipboard when copy on select is on),
// middle-click pastes it, right-click copies a selection or pastes.
let copyOnSelect=true,pasteWarning=true,baseFontSize=13;
// Clipboard text is untrusted: strip escapes and control characters so an
// embedded ESC[201~ cannot end bracketed paste early and run commands.
const sanitize=text=>String(text||'').replace(/\r\n?/gu,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/gu,'');
const copy=()=>{const text=terminal.getSelection();if(text)api.copy(text).catch(()=>{});return Boolean(text);};
const paste=type=>{if(!ended)api.paste(type).then(raw=>{const text=sanitize(raw);if(!text)return;const lines=text.replace(/\n$/u,'').split('\n');if(pasteWarning&&lines.length>1&&!window.confirm('Paste '+lines.length+' lines?\n\n'+lines.slice(0,20).join('\n')))return;terminal.paste(text);terminal.focus();}).catch(()=>{});};
const element=document.querySelector('#terminal');
const appOwnsMouse=event=>terminal.modes?.mouseTrackingMode&&terminal.modes.mouseTrackingMode!=='none'&&!event.shiftKey;
element.addEventListener('mouseup',event=>{
 if(event.button===1&&!appOwnsMouse(event)){event.preventDefault();event.stopPropagation();paste('selection');return;}
 if(event.button!==0)return;
 setTimeout(()=>{const text=terminal.getSelection();if(!text)return;api.copy(text,'selection').catch(()=>{});if(copyOnSelect)api.copy(text).catch(()=>{});},0);
},true);
element.addEventListener('contextmenu',event=>{event.preventDefault();if(appOwnsMouse(event))return;if(!copy())paste();});
document.querySelector('#attach').onclick=()=>api.attach();document.querySelector('#fullscreen').onclick=()=>api.fullscreen();
api.init().then(snapshot=>{copyOnSelect=snapshot.copyOnSelect!==false;
 // Look like the workspace tab this terminal came from.
 const look=snapshot.appearance||{};if(look.fontFamily)terminal.options.fontFamily=look.fontFamily;if(look.fontSize){terminal.options.fontSize=look.fontSize;baseFontSize=look.fontSize;}if(look.lineHeight)terminal.options.lineHeight=look.lineHeight;if(look.scrollback)terminal.options.scrollback=look.scrollback;if(look.theme&&Object.keys(look.theme).length){terminal.options.theme=look.theme;document.body.style.background=look.theme.background||'';}if(look.title)document.title=look.title+' — Aux Command';
 // Measure cells with the real font once it has loaded.
 document.fonts?.load(`${terminal.options.fontSize}px "JetBrains Mono"`).then(()=>{const family=terminal.options.fontFamily;terminal.options.fontFamily="monospace";terminal.options.fontFamily=family;fit.fit();}).catch(()=>{});pasteWarning=snapshot.pasteWarning!==false;terminal.write(snapshot.text);for(const event of pending)if(event.sequence>snapshot.sequence)terminal.write(event.data);pending=[];ready=true;ended=ended||snapshot.closed;terminal.options.disableStdin=ended;document.querySelector('#status').textContent=ended?'Session ended':(look.title||snapshot.title);fit.fit();if(!ended)terminal.focus();}).catch(error=>{document.querySelector('#status').textContent=error.message;});
