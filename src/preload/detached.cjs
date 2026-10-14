'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const api={};for(const action of ['init','write','resize','attach','copy','paste','fullscreen'])api[action]=(...args)=>ipcRenderer.invoke('detached:'+action,...args);
api.onData=callback=>ipcRenderer.on('terminal:data',(_e,data)=>callback(data));
api.onExit=callback=>ipcRenderer.on('terminal:exit',(_e,data)=>callback(data));
contextBridge.exposeInMainWorld('detachedTerminal',Object.freeze(api));
