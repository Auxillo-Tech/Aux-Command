'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FileBrowserService } = require('../src/main/services/file-browser-service.cjs');
const profile = { id: 'fixture', name: 'Fixture', protocol: 'ssh', host: '127.0.0.1' };
test('batch review skips, replaces, renames and rejects changed destinations', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aux-batch-'));
  const queued = [];
  let remote = [{ name: 'a.txt', size: 2, modifiedAt: '2026-01-01' }];
  const service = new FileBrowserService(() => ({ list: async () => remote }), { enqueue: spec => { queued.push(spec); return spec; } });
  try {
    await fs.writeFile(path.join(directory, 'a.txt'), 'abc');await fs.writeFile(path.join(directory, 'b.txt'), 'def');
    const request = { profile, direction: 'upload', paths: ['a.txt','b.txt'].map(name => path.join(directory, name)), directory: '/destination' };
    const first = await service.plan(request);assert.equal(first.items[0].conflict, true);
    assert.equal((await service.apply(first.token, 'skip')).queued, 1);
    await assert.rejects(() => service.apply(first.token), /expired/);
    const second = await service.plan(request);await service.apply(second.token, 'rename');
    assert.match(queued[1].remotePath, /^\/destination\/a-[a-f0-9]+\.txt$/);
    const third = await service.plan(request);remote[0].size = 99;
    const count = queued.length;
    await assert.rejects(() => service.apply(third.token, 'replace'), /changed since review/);
    assert.equal(queued.length, count, 'changed batches must not partially enqueue');
    const fourth = await service.plan(request);await service.apply(fourth.token, 'replace');
    assert.equal(queued.at(-2).remotePath, '/destination/a.txt');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('local browser and download planner reject symbolic-link replacement and bad inputs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aux-browser-'));
  const service = new FileBrowserService(() => ({ list: async () => [{ name: 'a', size: 1 }] }), { enqueue: () => {} });
  try {
    await fs.writeFile(path.join(directory, 'target'), 'safe');await fs.symlink('target', path.join(directory, 'a'));
    const list = await service.localList(directory);assert.equal(list.entries.length, 2);
    assert.equal(list.entries.find(e => e.name === 'a').symlink, true);
    await assert.rejects(() => service.plan({ profile, direction: 'download', paths: ['/a'], directory }), /[Ss]ymbolic link/);
    await assert.rejects(() => service.plan({ profile, direction: 'download', paths: ['relative'], directory }), /absolute/);
    await assert.rejects(() => service.plan({ profile, direction: 'upload', paths: [directory], directory: '/' }), /[Ss]ymbolic link/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('recursive uploads and downloads preserve paths and empty folders with full preflight', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aux-tree-'));
  const source = path.join(root,'source'), destination = path.join(root,'destination'), remote = path.join(root,'remote');
  await fs.mkdir(path.join(source,'nested','empty'),{recursive:true}); await fs.mkdir(destination); await fs.mkdir(remote);
  await fs.writeFile(path.join(source,'nested','hello.txt'),'original');
  const remotePath = (p) => path.join(remote,p);
  const server = {
    async list(_profile,p) { return Promise.all((await fs.readdir(remotePath(p))).map(async name => {const st=await fs.lstat(path.join(remotePath(p),name));return {name,directory:st.isDirectory(),symlink:st.isSymbolicLink(),size:st.size,modifiedAt:st.mtime.toISOString()};})); },
    async mkdir(_profile,p) { await fs.mkdir(remotePath(p)); }
  };
  const queue = [];
  const service = new FileBrowserService(() => server,{enqueue: spec => {queue.push(spec);return spec;}});
  try {
    const plan = await service.plan({profile,direction:'upload',paths:[source],directory:'/'});
    assert.equal(plan.items.filter(i=>i.directory).length,3);
    assert.equal(queue.length,0); assert.deepEqual(await fs.readdir(remote),[],'review must not mutate');
    const result = await service.apply(plan.token);assert.equal(result.directories,3);assert.equal(result.queued,1);
    await fs.copyFile(queue[0].localPath,remotePath(queue[0].remotePath));
    assert.equal((await fs.stat(path.join(remote,'source','nested','empty'))).isDirectory(),true);
    const download = await service.plan({profile,direction:'download',paths:['/source'],directory:destination});
    await service.apply(download.token);await fs.copyFile(remotePath(queue[1].remotePath),queue[1].localPath);
    assert.equal(await fs.readFile(path.join(destination,'source','nested','hello.txt'),'utf8'),'original');
    assert.equal((await fs.stat(path.join(destination,'source','nested','empty'))).isDirectory(),true);
    const stale = await service.plan({profile,direction:'download',paths:['/source'],directory:destination});
    await fs.rename(path.join(destination,'source'),path.join(destination,'moved'));
    await fs.symlink('moved',path.join(destination,'source'));
    const before=queue.length;await assert.rejects(()=>service.apply(stale.token,'replace'),/[Ss]ymbolic link/);assert.equal(queue.length,before);
    await fs.symlink('../nested',path.join(source,'nested','loop'));
    await assert.rejects(()=>service.plan({profile,direction:'upload',paths:[source],directory:'/'}),/[Ss]ymbolic link/);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('SHA-256 comparison detects same-size changes, skips equal content and never deletes destination-only files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'aux-sync-')),local=path.join(root,'local'),remote=path.join(root,'remote');await fs.mkdir(local);await fs.mkdir(remote);
 const hash=text=>require('node:crypto').createHash('sha256').update(text).digest('hex');
 const server={async list(_p,d){return Promise.all((await fs.readdir(path.join(remote,d))).map(async name=>{const st=await fs.lstat(path.join(remote,d,name));return {name,path:path.posix.join(d,name),directory:st.isDirectory(),symlink:st.isSymbolicLink(),size:st.size,modifiedAt:st.mtime.toISOString()};}));},async checksum(_p,name){return hash(await fs.readFile(path.join(remote,name)));}};
 const queued=[],browser=new FileBrowserService(()=>server,{enqueue:spec=>{queued.push(spec);return spec;}});
 try{
 for(const [name,a,b] of [['equal','same','same'],['changed','LEFT','RGHT']]){await fs.writeFile(path.join(local,name),a);await fs.writeFile(path.join(remote,name),b);}
 await fs.writeFile(path.join(remote,'remote-only'),'keep');await fs.mkdir(path.join(remote,'nested'));await fs.writeFile(path.join(remote,'nested','find-me'),'find');await fs.symlink('../',path.join(remote,'nested','loop'));
 const plan=await browser.compare({profile,localDirectory:local,remoteDirectory:'/',verify:true});assert.equal(plan.unchanged,1);assert.equal(plan.items.length,1);assert.equal(plan.items[0].name,'changed');assert.equal(queued.length,0);
 await browser.apply(plan.token,'replace');assert.equal(queued.length,1);assert.equal(await fs.readFile(path.join(remote,'remote-only'),'utf8'),'keep');
 const found=await browser.search({profile,directory:'/',query:'find'});assert.equal(found.results.length,1);assert.equal(found.results[0].path,'/nested/find-me');assert.equal(found.limited,false);
 assert.equal((await browser.checksum({profile,localPath:path.join(local,'changed'),remotePath:'/changed'})).equal,false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('directory comparison supports more than 256 top-level files while manual selection stays bounded',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'aux-large-compare-'));
 try{await Promise.all(Array.from({length:260},(_,i)=>fs.writeFile(path.join(root,'file-'+i),'x')));const browser=new FileBrowserService(()=>({list:async()=>[]}),{enqueue(){}});
 const plan=await browser.compare({profile,localDirectory:root,remoteDirectory:'/'});assert.equal(plan.items.length,260);
 await assert.rejects(()=>browser.plan({profile,direction:'upload',paths:plan.items.map(i=>i.localPath),directory:'/'}),/256/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
