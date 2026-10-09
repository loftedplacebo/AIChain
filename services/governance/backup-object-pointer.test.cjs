'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {savePointer,readPointer}=require('./backup-object-pointer.cjs');

test('latest remote backup pointer advances atomically outside the encrypted source archive',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'backup-pointer-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'pg-backup-source'),privateDirectory=path.join(root,'private');fs.mkdirSync(source);fs.mkdirSync(privateDirectory);
 const file=path.join(privateDirectory,'latest.json'),base={file,environment:'test',bucket:'pilot-backups',sourceDirectory:source};
 savePointer({...base,keyPrefix:'pilot/test/first'});
 assert.equal(readPointer(base),'pilot/test/first');
 savePointer({...base,keyPrefix:'pilot/test/second',journalRoles:['worker','worker_dbd944b9cbffcf78489e6713']});
 assert.equal(readPointer(base),'pilot/test/second');
 assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')).journalRoles,['worker','worker_dbd944b9cbffcf78489e6713']);
 assert.deepEqual(fs.readdirSync(privateDirectory),['latest.json']);
 assert.throws(()=>readPointer({...base,bucket:'different-bucket'}),/does not match/);
 assert.throws(()=>savePointer({...base,file:path.join(source,'latest.json'),keyPrefix:'pilot/test/third'}),/outside/);
 assert.equal(readPointer(base),'pilot/test/second');
 fs.writeFileSync(file,JSON.stringify({version:1,environment:'test',bucket:'pilot-backups',keyPrefix:'pilot/test/legacy'}),{mode:0o600});
 assert.equal(readPointer(base),'pilot/test/legacy');
 fs.writeFileSync(file,'{"version":1,"environment":"test","bucket":"pilot-backups","keyPrefix":"pilot/test/third","keyPrefix":"forged"}',{mode:0o600});
 assert.throws(()=>readPointer(base),/Duplicate JSON key/);
});

test('completion marker retains every journal in a fourteen-project cohort',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pilot-cohort-pointer-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'archive'),privateDirectory=path.join(root,'private');
 fs.mkdirSync(source);fs.mkdirSync(privateDirectory);
 const file=path.join(privateDirectory,'latest.json');
 const base={file,environment:'test',bucket:'pilot-backups',sourceDirectory:source,
  keyPrefix:'pilot/test/cohort'};
 const journalRoles=Array.from({length:14},(_,index)=>'worker_'+index.toString(16).padStart(24,'0'));
 savePointer({...base,journalRoles});
 assert.equal(readPointer(base),'pilot/test/cohort');
 assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')).journalRoles,journalRoles);
});
