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
 savePointer({...base,keyPrefix:'pilot/test/second'});
 assert.equal(readPointer(base),'pilot/test/second');
 assert.deepEqual(fs.readdirSync(privateDirectory),['latest.json']);
 assert.throws(()=>readPointer({...base,bucket:'different-bucket'}),/does not match/);
 assert.throws(()=>savePointer({...base,file:path.join(source,'latest.json'),keyPrefix:'pilot/test/third'}),/outside/);
 assert.equal(readPointer(base),'pilot/test/second');
 fs.writeFileSync(file,'{"version":1,"environment":"test","bucket":"pilot-backups","keyPrefix":"pilot/test/third","keyPrefix":"forged"}',{mode:0o600});
 assert.throws(()=>readPointer(base),/Duplicate JSON key/);
});
