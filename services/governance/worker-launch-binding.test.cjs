const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('node:crypto');
const {loadWorkerBinding}=require('./worker-launch-binding.cjs'),{workerPolicy}=require('./worker-policy.cjs'),{policyDigest}=require('./publisher-release-binding.cjs');
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'worker-launch-binding-')),journal=path.join(dir,'journal.sqlite');
 const options={journal,environment:'test',storage:'postgres',principal:{tenant:'tenant',project:'project'},publisher:'0x'+'12'.repeat(20),recorder:'0x'+'34'.repeat(20),policy:workerPolicy(),codeHash:'0x'+'56'.repeat(32)};
 const binding={...options.principal,publisher:options.publisher,recorder:options.recorder,codeHash:options.codeHash,policyDigest:policyDigest(options.policy),releaseId:randomUUID()};
 const db=new DatabaseSync(journal);db.exec("CREATE TABLE governance_environment(name TEXT); INSERT INTO governance_environment VALUES('test'); CREATE TABLE governance_recovery_gate(state TEXT); INSERT INTO governance_recovery_gate VALUES('approved'); CREATE TABLE governance_publisher_release(body TEXT)");db.prepare('INSERT INTO governance_publisher_release VALUES(?)').run(JSON.stringify(binding));
 return {options,binding,db,close(){db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('matching restored metadata loads an immutable binding without modifying journal',()=>{const x=setup();try{const before=fs.readFileSync(x.options.journal);const result=loadWorkerBinding(x.options);assert.deepEqual(result,x.binding);assert.ok(Object.isFrozen(result));assert.deepEqual(fs.readFileSync(x.options.journal),before);assert.deepEqual(loadWorkerBinding({...x.options,policy:{...x.options.policy,paused:false}}),result);}finally{x.close();}});
test('actual wallet, scope, code and spending policy changes refuse startup',()=>{const x=setup();try{for(const change of [{publisher:x.options.recorder},{recorder:x.options.publisher},{principal:{tenant:'other',project:'project'}},{codeHash:'0x'+'78'.repeat(32)},{policy:{...x.options.policy,batchSize:999}}])assert.throws(()=>loadWorkerBinding({...x.options,...change}),/differs/);}finally{x.close();}});
test('closed, missing, oversized or duplicate recovery metadata stays closed',()=>{const x=setup();try{
 x.db.exec("UPDATE governance_recovery_gate SET state='review-required'");assert.throws(()=>loadWorkerBinding(x.options),/reviewed recovery/);x.db.exec("UPDATE governance_recovery_gate SET state='approved'");
 x.db.prepare('UPDATE governance_publisher_release SET body=?').run('x'.repeat(4097));assert.throws(()=>loadWorkerBinding(x.options),/Bounded/);
 x.db.prepare('UPDATE governance_publisher_release SET body=?').run(JSON.stringify(x.binding));x.db.prepare('INSERT INTO governance_publisher_release VALUES(?)').run(JSON.stringify(x.binding));assert.throws(()=>loadWorkerBinding(x.options),/Bounded/);
 x.db.exec('DROP TABLE governance_publisher_release');assert.throws(()=>loadWorkerBinding(x.options),/reviewed journal binding/);
 }finally{x.close();}});
test('environment mismatch, orphan approval and SQLite restored publisher are refused',()=>{const x=setup();try{
 assert.throws(()=>loadWorkerBinding({...x.options,environment:'dev'}),/environment mismatch/);assert.throws(()=>loadWorkerBinding({...x.options,storage:'sqlite'}),/requires PostgreSQL/);
 x.db.exec('DROP TABLE governance_recovery_gate');assert.throws(()=>loadWorkerBinding(x.options),/requires PostgreSQL/);assert.throws(()=>loadWorkerBinding({...x.options,environment:'prod'}),/not enabled/);
 }finally{x.close();}});
test('original journals and a new absent journal retain the unbound startup path',()=>{const x=setup();try{x.db.exec('DROP TABLE governance_recovery_gate; DROP TABLE governance_publisher_release');assert.equal(loadWorkerBinding(x.options),null);assert.equal(loadWorkerBinding({...x.options,journal:path.join(path.dirname(x.options.journal),'absent.sqlite')}),null);assert.throws(()=>workerPolicy({batchSize:1001}),/Maximum/);}finally{x.close();}});
