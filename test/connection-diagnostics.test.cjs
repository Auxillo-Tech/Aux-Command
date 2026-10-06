'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {diagnoseConnection}=require('../src/main/lib/connection-diagnostics.cjs');
test('connection failures identify actionable stages without copying terminal secrets',()=>{
 for(const [output,category] of [['Could not resolve hostname host','dns'],['REMOTE HOST IDENTIFICATION HAS CHANGED','host-key'],['Permission denied (publickey).','authentication'],['channel 0: open failed: connect failed','proxy'],['Connection refused','refused'],['Connection timed out','timeout'],['Warning: Identity file key not accessible','missing-key']]){
  const result=diagnoseConnection('ssh',output+' secret-from-transcript');assert.equal(result.category,category);assert.ok(!JSON.stringify(result).includes('secret-from-transcript'));
 }
 assert.equal(diagnoseConnection('local','Permission denied'),null);assert.equal(diagnoseConnection('ssh','ordinary output'),null);
});
