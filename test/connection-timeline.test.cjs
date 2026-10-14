'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {ConnectionTimeline}=require('../src/main/lib/connection-timeline.cjs');
test('connection timeline detects fragmented failures without disclosing output or inventing successful phases',()=>{
 const trace=new ConnectionTimeline('ssh');trace.feed('secret-token-abc Permission den');trace.feed('ied (publickey,password)');trace.feed('again');trace.exit(255);
 assert.deepEqual(trace.events.map(e=>e.stage),['process','output','authentication','exit']);assert.doesNotMatch(JSON.stringify(trace.events),/secret-token-abc/);assert.ok(trace.events.every(e=>e.elapsedMs>=0));
 const shell=new ConnectionTimeline('ssh');shell.directory();assert.equal(shell.events.at(-1).stage,'shell');
});

test('RDP audio is opt-in and resolution values are bounded',()=>{
 const {buildExternalCommand}=require('../src/main/lib/command-builder.cjs');const {normalizeProfile}=require('../src/main/lib/validation.cjs');
 const profile={name:'RDP fixture',host:'127.0.0.1',protocol:'rdp'};
 assert.ok(!buildExternalCommand(profile).args.includes('/sound'));assert.ok(buildExternalCommand({...profile,rdpAudio:true}).args.includes('/sound'));
 const normalized=normalizeProfile({...profile,rdpWidth:999999,rdpHeight:-1});assert.equal(normalized.rdpWidth,3840);assert.equal(normalized.rdpHeight,600);
});
