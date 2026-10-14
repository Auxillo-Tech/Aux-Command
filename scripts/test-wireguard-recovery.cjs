'use strict';
// Two disposable network namespaces: no host route, DNS, firewall or VPN changes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { createSshdFixture } = require('./ssh-test-fixture.cjs');
const { TerminalService } = require('../src/main/services/terminal-service.cjs');
const delay = ms => new Promise(r=>setTimeout(r,ms));
async function client() {
 const profile=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 const output=new Map(),exits=new Set();
 const terminal=new TerminalService(()=>({isDestroyed:()=>false,webContents:{send(channel,data){if(channel==='terminal:data')output.set(data.id,(output.get(data.id)||'')+data.data);if(channel==='terminal:exit')exits.add(data.id);}}}));
 const wait=async(fn)=>{for(let i=0;i<600;i++){if(fn())return;await delay(50);}throw Error('VPN recovery timed out');};
 try {
  let session=terminal.create({profile});terminal.write(session.id,"printf '\\nVPN_CONNECTED_91\\n'\r");
  await wait(()=>output.get(session.id)?.includes('\r\nVPN_CONNECTED_91\r\n'));
  console.log('VPN_READY');
  await wait(()=>exits.has(session.id));assert.equal(terminal.list().length,0);console.log('VPN_DISCONNECTED');
  await new Promise(resolve=>{process.stdin.once('data',resolve);process.stdin.resume();});process.stdin.pause();
  session=terminal.create({profile});terminal.write(session.id,"printf '\\nVPN_RECONNECTED_91\\n'\r");
  await wait(()=>output.get(session.id)?.includes('\r\nVPN_RECONNECTED_91\r\n'));
  console.log('WIREGUARD_SSH_DROP_RECONNECT_PASSED');
 } finally {terminal.closeAll();}
}
async function main() {
 const fixture=await createSshdFixture();
 const suffix=String(process.pid),left=`aux-wgc-${suffix}`,right=`aux-wgs-${suffix}`,vleft=`axc${suffix}`,vright=`axs${suffix}`;
 const sudo=(...args)=>execFileSync('sudo',['-n',...args],{stdio:['ignore','pipe','pipe']});
 const ns=(name,...args)=>sudo('ip','netns','exec',name,...args);
 const namespaces=[];let server,worker;let output='',errors='';
 try {
  for(const name of [left,right]) {sudo('ip','netns','add',name);namespaces.push(name);ns(name,'ip','link','set','lo','up');}
  sudo('ip','link','add',vleft,'netns',left,'type','veth','peer','name',vright,'netns',right);
  const keys=[];
  for(let i=0;i<2;i++){
   const name=[left,right][i],veth=[vleft,vright][i];
   ns(name,'ip','addr','add',`198.18.0.${i+1}/30`,'dev',veth);ns(name,'ip','link','set',veth,'up');
   ns(name,'ip','link','add','wg-aux','type','wireguard');ns(name,'ip','addr','add',`10.254.0.${i+1}/30`,'dev','wg-aux');
   const key=execFileSync('wg',['genkey']);const publicKey=execFileSync('wg',['pubkey'],{input:key}).toString().trim();
   const keyPath=path.join(fixture.directory,`wg-${i}.key`);fs.writeFileSync(keyPath,key,{mode:0o600});keys.push({publicKey,keyPath});
  }
  for(let i=0;i<2;i++){
   const name=[left,right][i];ns(name,'wg','set','wg-aux','listen-port','51820','private-key',keys[i].keyPath,'peer',keys[1-i].publicKey,'allowed-ips',`10.254.0.${2-i}/32`,'endpoint',`198.18.0.${2-i}:51820`,'persistent-keepalive','1');ns(name,'ip','link','set','wg-aux','up');
  }
  const config=path.join(fixture.directory,'sshd-vpn-config');fs.writeFileSync(config,fs.readFileSync(path.join(fixture.directory,'sshd_config'),'utf8').replace('ListenAddress 127.0.0.1','ListenAddress 10.254.0.2').replace('sshd.pid','vpn-sshd.pid'));
  server=spawn('sudo',['-n','ip','netns','exec',right,'runuser','-u',fixture.user,'--','/usr/sbin/sshd','-D','-e','-f',config]);server.stderr.on('data',d=>{errors+=d;});
  const knownHostsFile=path.join(fixture.directory,'vpn-known-hosts');fs.writeFileSync(knownHostsFile,`[10.254.0.2]:${fixture.port} ${fs.readFileSync(path.join(fixture.directory,'host_key.pub'),'utf8')}`);
  const request=path.join(fixture.directory,'vpn-profile.json');fs.writeFileSync(request,JSON.stringify({id:'vpn-fixture',name:'VPN fixture',protocol:'ssh',host:'10.254.0.2',port:fixture.port,username:fixture.user,identityFile:fixture.clientKey,knownHostsFile,useSshConfig:false,keepAliveSeconds:1}));
  await delay(300);
  worker=spawn('sudo',['-n','ip','netns','exec',left,'runuser','-u',fixture.user,'--',process.execPath,__filename,'client',request],{stdio:['pipe','pipe','pipe']});
  worker.stdout.on('data',d=>{output+=d;});worker.stderr.on('data',d=>{errors+=d;});
  const wait=async(marker)=>{for(let i=0;i<700;i++){if(output.includes(marker))return;if(worker.exitCode!==null)throw Error(errors||output);await delay(50);}throw Error(`${marker} timed out: ${errors}`);};
  await wait('VPN_READY');ns(left,'ip','link','set','wg-aux','down');await wait('VPN_DISCONNECTED');
  ns(left,'ip','link','set','wg-aux','up');await delay(500);worker.stdin.write('reconnect\n');await wait('WIREGUARD_SSH_DROP_RECONNECT_PASSED');
  console.log(output.trim());
 } finally {
  worker?.kill('SIGTERM');server?.kill('SIGTERM');
  for(const name of namespaces.reverse()) {
   try {const pids=sudo('ip','netns','pids',name).toString().trim().split(/\s+/).filter(Boolean);if(pids.length)sudo('kill','-TERM',...pids);} catch {}
   try {sudo('ip','netns','del',name);} catch {}
  }
  fixture.close();
 }
}
(process.argv[2]==='client'?client():main()).catch(e=>{console.error(e);process.exitCode=1;});
