'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProfileStore } = require('../src/main/lib/profile-store.cjs');
const { SettingsStore } = require('../src/main/lib/settings-store.cjs');
const { RecoveryService } = require('../src/main/services/recovery-service.cjs');
function fixture(t) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aux-recovery-test-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const profiles=new ProfileStore(directory),settings=new SettingsStore(directory);
 return {directory,profiles,settings,recovery:new RecoveryService(directory,profiles,settings)};
}
test('repeated JSON imports are idempotent; explicit updates preserve credentials only for the same connection',t=>{
 const {profiles}=fixture(t);
 const p=profiles.save({id:'p',name:'Test',host:'server.example',credentialId:'local-secret'});
 const payload=profiles.exportSafe();
 assert.equal(profiles.importSafe(payload).added,0);
 assert.equal(profiles.importSafe(payload).added,0);
 const imported=payload.profiles.find(x=>x.id===p.id); imported.name='Renamed';
 assert.equal(profiles.previewImport(payload).conflicts,1);
 assert.equal(profiles.importSafe(payload).updated,0);
 assert.equal(profiles.importSafe(payload,'update').updated,1);
 assert.equal(profiles.get(p.id).credentialId,'local-secret');
 imported.useSshConfig=!imported.useSshConfig;profiles.importSafe(payload,'update');
 assert.equal(profiles.get(p.id).credentialId,'');
 imported.host='other.example';profiles.importSafe(payload,'update');
 assert.equal(profiles.get(p.id).credentialId,'');
});
test('invalid rows and future export versions cannot partially import',t=>{
 const {profiles}=fixture(t);const before=profiles.store.get();
 assert.throws(()=>profiles.importSafe({format:'aux-command-profiles',version:2,profiles:[]}),/version/);
 assert.throws(()=>profiles.importSafe({format:'aux-command-profiles',profiles:[{name:'Good',host:'good'},{name:'Bad',host:'-option'}]}),/Profile 2/);
 assert.throws(()=>profiles.importSafe({format:'aux-command-profiles',profiles:[{id:'local-shell',protocol:'ssh',name:'Bad',host:'bad.example'}]}),/reserved/);
 assert.deepEqual(profiles.store.get(),before);
});
test('workspace backup restores layout and profiles without exporting secrets or reconnecting sessions',t=>{
 const {profiles,settings,recovery}=fixture(t);
 const p=profiles.save({name:'Test',host:'server.example',credentialId:'local-secret'});
 settings.saveWorkspace({layout:'grid',paneMinWidth:480});settings.saveAi({enabled:true,endpoint:'https://token@example.test',model:'test'});
 settings.saveSessions([{profileId:p.id,protocol:'ssh'}]);
 const backup=recovery.exportWorkspace();
 assert.ok(!JSON.stringify(backup).includes('local-secret'));assert.ok(!JSON.stringify(backup).includes('token@example'));
 settings.saveWorkspace({layout:'single'});
 const result=recovery.restoreWorkspace(backup);
 assert.equal(result.settings.workspace.layout,'grid');assert.equal(result.profiles.find(x=>x.id===p.id).credentialId,'local-secret');
 assert.deepEqual(result.settings.sessions,[]);assert.equal(recovery.list().length,1);
 recovery.restoreLocal(result.recoveryId);assert.equal(settings.get().workspace.layout,'single');
});
test('failed workspace persistence rolls back profiles and leaves a recovery point',t=>{
 const {profiles,settings,recovery}=fixture(t);const backup=recovery.exportWorkspace();
 backup.profiles.profiles.push({name:'New',host:'new.example'});
 const before=profiles.store.get();const original=settings.store.replace.bind(settings.store);let fail=true;
 settings.store.replace=value=>{if(fail){fail=false;throw new Error('disk full');}return original(value);};
 assert.throws(()=>recovery.restoreWorkspace(backup),/disk full/);assert.deepEqual(profiles.store.get(),before);assert.equal(recovery.list().length,1);
});
test('interrupted restore journal is recovered on next startup',t=>{
 const {directory,profiles,settings,recovery}=fixture(t);const previous={profiles:profiles.store.get(),settings:settings.store.get()};
 recovery.journal.replace(previous);profiles.save({name:'Interrupted',host:'interrupted.example'});
 new RecoveryService(directory,profiles,settings);assert.deepEqual(profiles.store.get(),previous.profiles);assert.deepEqual(recovery.journal.get(),previous);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'recovery/pending.json'))),{});
});
