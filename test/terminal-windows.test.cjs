'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');const {TerminalWindows}=require('../src/main/services/terminal-windows.cjs');
test('detached terminal IPC is restricted to its own main frame and returns the live session without killing it',()=>{
 const handlers=new Map(),writes=[],messages=[],session={title:'Fixture'};
 class Window extends EventEmitter{constructor(){super();this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(...args)=>messages.push(args);}loadFile(){}loadURL(url){this.url=url;}focus(){}isDestroyed(){return false;}close(){this.emit('closed');}}
 const terminal={sessions:new Map([['one',session],['two',{title:'Other'}]]),exportTranscript:id=>({id,text:'safe'}),write:(id,text)=>writes.push([id,text]),resize(){}};
 const main={isDestroyed:()=>false,isMinimized:()=>true,restore(){},show(){},focus(){},webContents:{send:(...args)=>messages.push(args)}};
 const manager=new TerminalWindows({BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},terminalService:terminal,getWindow:()=>main,clipboard:{writeText(){},readText(){return '';}}});
 manager.open('one');assert.equal(session.detached,true);const win=manager.windows.get('one'),event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
 assert.throws(()=>handlers.get('detached:init')({sender:{},senderFrame:{}}),/Untrusted/);
 assert.throws(()=>handlers.get('detached:init')({...event,senderFrame:{}}),/Untrusted/);
 assert.equal(handlers.get('detached:init')(event,'two').id,'one');assert.equal(handlers.get('detached:init')(event).closed,false);handlers.get('detached:write')(event,'test');assert.deepEqual(writes,[],'input must pass through the workspace command guard');assert.deepEqual(messages.at(-1),['terminal:detached-input',{id:'one',data:'test'}]);
 terminal.sessions.delete('one');assert.equal(handlers.get('detached:init')(event).closed,true);terminal.sessions.set('one',session);
 terminal.onEvent('terminal:data',{id:'one',data:'ok'});assert.equal(messages.at(-1)[0],'terminal:data');
 handlers.get('detached:attach')(event);assert.equal(session.detached,false);assert.equal(terminal.sessions.size,2);assert.equal(manager.windows.size,0);
});

test('detached terminal copy and paste can use the primary selection',()=>{
 const handlers=new Map(),writes=[];
 class Window extends EventEmitter{constructor(){super();this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{};}loadFile(){}loadURL(url){this.url=url;}isDestroyed(){return false;}}
 const terminal={sessions:new Map([['one',{title:'Fixture'}]]),exportTranscript:id=>({id,text:''})};
 const manager=new TerminalWindows({BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},terminalService:terminal,getWindow:()=>({webContents:{send(){}}}),clipboard:{writeText:(text,type)=>writes.push([text,type]),readText:type=>type},settingsStore:{get:()=>({ui:{terminalCopyOnSelect:false}})}});
 manager.open('one');const win=manager.windows.get('one'),event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
 handlers.get('detached:copy')(event,'a');handlers.get('detached:copy')(event,'b','selection');
 const primary=process.platform==='linux'?'selection':'clipboard';
 assert.deepEqual(writes,[['a','clipboard'],['b',primary]]);
 assert.equal(handlers.get('detached:paste')(event,'selection'),primary);assert.equal(handlers.get('detached:paste')(event),'clipboard');
 assert.equal(handlers.get('detached:init')(event).copyOnSelect,false);
});
