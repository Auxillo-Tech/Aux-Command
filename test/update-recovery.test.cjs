'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {UpdateRecovery}=require('../src/main/services/update-recovery.cjs');
test('previous AppImage is preserved and can be restored after replacement or failed install',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aux-update-recovery-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const image=path.join(dir,'app.AppImage');fs.writeFileSync(image,'old working binary');
 const recovery=new UpdateRecovery(path.join(dir,'backup'));await recovery.prepare(image,'1.0.0');
 fs.writeFileSync(image,'new binary');await recovery.restore(image);assert.equal(fs.readFileSync(image,'utf8'),'old working binary');
 fs.rmSync(image);await recovery.restore(image);assert.equal(fs.readFileSync(image,'utf8'),'old working binary');
 assert.equal(fs.statSync(image).mode&0o777,0o755);
 const data=recovery.store.get();fs.writeFileSync(path.join(dir,'backup',data.file),'tampered');
 await assert.rejects(()=>recovery.restore(image),/checksum/);assert.equal(fs.readFileSync(image,'utf8'),'old working binary');
});

test('installer failure restores the original AppImage before reporting failure',async t=>{
 const {EventEmitter}=require('node:events');const {createHash}=require('node:crypto');
 const {UpdateService}=require('../src/main/services/update-service.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aux-install-failure-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const old=path.join(dir,'old.AppImage'),download=path.join(dir,'new.AppImage');
 fs.writeFileSync(old,'working old application');fs.writeFileSync(download,'authenticated new application');
 const prior=process.env.APPIMAGE;process.env.APPIMAGE=old;t.after(()=>{if(prior===undefined)delete process.env.APPIMAGE;else process.env.APPIMAGE=prior;});
 const updater=new EventEmitter();updater.quitAndInstall=()=>{fs.rmSync(old);updater.emit('error',new Error('Installation failed'));};
 const service=new UpdateService({isPackaged:true,getVersion:()=> '1.0.0',getAppPath:()=>dir,getPath:()=>dir},()=>null,{updater});
 service.downloadedFile=download;service.verifiedRelease={version:'2.0.0',manifest:{artifacts:[{kind:'appimage',size:fs.statSync(download).size,sha256:createHash('sha256').update(fs.readFileSync(download)).digest('hex')}]}};
 Object.assign(service.status,{downloaded:true,authenticated:true});
 await assert.rejects(()=>service.quitAndInstall(),/Installation failed/);
 assert.equal(fs.readFileSync(old,'utf8'),'working old application');assert.equal(service.getStatus().recoveryAvailable,true);
});
