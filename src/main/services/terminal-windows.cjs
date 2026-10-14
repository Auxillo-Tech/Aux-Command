'use strict';
const path = require('node:path');
const { appUrl } = require('../lib/app-protocol.cjs');
class TerminalWindows {
  constructor({ BrowserWindow, ipcMain, terminalService, getWindow, clipboard, settingsStore, devTools = false }) {
    this.devTools = Boolean(devTools);
    this.windows = new Map(); this.terminal = terminalService; this.getWindow = getWindow; this.BrowserWindow = BrowserWindow;
    const sessionFor = event => {
      const pair = [...this.windows.entries()].find(([, window]) => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame);
      if (!pair) throw new Error('Untrusted detached terminal sender');
      return pair;
    };
    for (const [channel, handler] of Object.entries({
      init: id => ({...terminalService.exportTranscript(id),closed:!terminalService.sessions.has(id),copyOnSelect:settingsStore?.get().ui?.terminalCopyOnSelect!==false,pasteWarning:settingsStore?.get().ui?.terminalPasteWarning!==false}),
      write: (id, data) => {
        if(typeof data!=='string'||data.length>1048576)throw new Error('Invalid terminal input');
        const main=getWindow();if(!main||main.isDestroyed())throw new Error('Main workspace is unavailable');
        // Use the existing command guard and command-line mirror in the workspace.
        main.webContents.send('terminal:detached-input',{id,data});return true;
      },
      resize: (id, cols, rows) => terminalService.resize(id, cols, rows),
      attach: id => {this.windows.get(id)?.close();const main=getWindow();if(main&&!main.isDestroyed()){if(main.isMinimized())main.restore();main.show();main.focus();}},
      copy: (_id, data, type) => { if (typeof data !== 'string' || data.length > 1048576) throw new Error('Invalid clipboard text'); clipboard.writeText(data, type === 'selection' && process.platform === 'linux' ? 'selection' : 'clipboard'); },
      paste: (_id, type) => clipboard.readText(type === 'selection' && process.platform === 'linux' ? 'selection' : 'clipboard'),
      fullscreen: (id) => { const window=this.windows.get(id); window.setFullScreen(!window.isFullScreen()); }
    })) ipcMain.handle('detached:'+channel, (event,...args) => { const [id] = sessionFor(event); return handler(id,...args); });
    terminalService.onEvent = (channel, payload) => {
      const window = this.windows.get(payload.id);
      if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
    };
  }
  open(id) {
    const session = this.terminal.sessions.get(id);
    if (!session) throw new Error('Open a live terminal first');
    const existing=this.windows.get(id);if(existing){existing.focus();return true;}
    const window=new this.BrowserWindow({title:session.title+' — Aux Command',width:1000,height:700,minWidth:400,minHeight:280,backgroundColor:'#060b13',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'../../preload/detached.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false,navigateOnDragDrop:false,devTools:this.devTools}});
    this.windows.set(id,window);session.detached=true;
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
    window.on('closed',()=>{this.windows.delete(id);session.detached=false;const main=this.getWindow();if(main&&!main.isDestroyed())main.webContents.send('terminal:detached',{id,detached:false});});
    window.loadURL(appUrl('src/renderer/detached.html'));
    this.getWindow()?.webContents.send('terminal:detached',{id,detached:true});return true;
  }
  closeAll(){for(const window of this.windows.values())window.close();}
}
module.exports={TerminalWindows};
