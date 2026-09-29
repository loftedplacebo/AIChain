'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {checkBackupSet}=require('./backup-monitor.cjs');
test('bounded backup inventory reports missing, incomplete, invalid, stale and missing-journal captures',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gov-backup-monitor-'));
 const options={environment:'test',root,key:Buffer.alloc(32),requiredJournalRoles:['worker']};
 const capture=name=>{const dir=path.join(root,name);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'complete.json'),'{}');};
 const valid={environment:'test',createdAt:new Date().toISOString(),integrity:'verified',freshness:'fresh',ageSeconds:0,journalRoles:['worker']};
 let calls=0;const inspect=async()=>{calls++;return valid;};
 try{
  assert.equal((await checkBackupSet(options,inspect)).reason,'missing-backup');capture('pg-backup-a');assert.equal((await checkBackupSet(options,inspect)).status,'ready');
  assert.equal((await checkBackupSet(options,async()=>({...valid,freshness:'stale'}))).reason,'stale-backup');
  assert.equal((await checkBackupSet(options,async()=>({...valid,journalRoles:[]}))).reason,'missing-journals');
  assert.equal((await checkBackupSet(options,async()=>{throw Error('secret');})).reason,'invalid-archive');
  fs.mkdirSync(path.join(root,'pg-backup-incomplete'));assert.equal((await checkBackupSet(options,inspect)).reason,'incomplete-archive');
  const before=calls;assert.equal((await checkBackupSet({...options,maxArchives:1},inspect)).reason,'inventory-limit');assert.equal(calls,before);
  fs.writeFileSync(path.join(root,'unrelated-private-file'),'secret');const result=await checkBackupSet(options,inspect);assert.equal(result.reason,'invalid-archive');assert.ok(!JSON.stringify(result).includes('secret'));assert.equal(fs.readFileSync(path.join(root,'unrelated-private-file'),'utf8'),'secret');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('newest authenticated timestamp determines journal coverage without fallback',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gov-backup-order-'));
 try{
  for(const name of ['pg-backup-old','pg-backup-new']){fs.mkdirSync(path.join(root,name));fs.writeFileSync(path.join(root,name,'complete.json'),'{}');}
  const result=await checkBackupSet({environment:'test',root,key:Buffer.alloc(32),requiredJournalRoles:['worker']},async({directory})=>({environment:'test',createdAt:path.basename(directory)==='pg-backup-old'?'2026-01-01T00:00:00.000Z':'2026-01-02T00:00:00.000Z',integrity:'verified',freshness:'fresh',ageSeconds:0,journalRoles:path.basename(directory)==='pg-backup-old'?['worker']:[]}));
  assert.equal(result.reason,'missing-journals');assert.equal(result.latest.createdAt,'2026-01-02T00:00:00.000Z');
  await assert.rejects(checkBackupSet({environment:'prod',root,key:Buffer.alloc(32)}));
  await assert.rejects(checkBackupSet({environment:'test',root,key:Buffer.alloc(32),requiredJournalRoles:['worker','worker']}));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
