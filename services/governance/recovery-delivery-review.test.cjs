'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{randomBytes}=require('node:crypto');
const {DeliveryJournal}=require('./webhook-delivery.cjs'),{bindSqlite}=require('./environment.cjs'),{reviewDeliveryJournal}=require('./recovery-delivery-review.cjs');
const scope={tenant:'synthetic',project:'test'},binding={destinationRef:'receiver',keyRef:'key-ref-only'},bindings=[{...scope,...binding}],body=id=>({schemaVersion:1,deliveryId:id,tenantRef:scope.tenant,projectRef:scope.project,incidentRef:'incident',eventRef:'event',severity:'high'});
function fixture(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-delivery-review-')),file=path.join(directory,'rules.sqlite');bindSqlite(file,'test');const journal=new DeliveryJournal(file);return {directory,file,journal,close(){try{journal.close();}catch{}const resolved=fs.realpathSync(directory);if(path.dirname(resolved)!==fs.realpathSync(os.tmpdir())||!path.basename(resolved).startsWith('synthetic-delivery-review-'))throw Error('Unsafe synthetic cleanup target');fs.rmSync(resolved,{recursive:true,force:true});}};}
function gate(db){db.exec("CREATE TABLE governance_recovery_gate(singleton INTEGER PRIMARY KEY CHECK(singleton=1),state TEXT); INSERT INTO governance_recovery_gate VALUES(1,'review-required')");}
test('actual delivery states remain uncertain and read-only under restored gate',()=>{
 const f=fixture();try{
  for(const id of ['pending','sending','delivered','dead'])f.journal.enqueue(scope,body(id),binding,1000);
  // Claim order is next_at/id; complete two actual attempts, then retain one in flight.
  let job=f.journal.claim(scope,1000);assert.equal(job.id,'dead');f.journal.finish(scope,job,400,1000);
  job=f.journal.claim(scope,1000);assert.equal(job.id,'delivered');f.journal.finish(scope,job,204,1000);
  job=f.journal.claim(scope,1000);assert.equal(job.id,'pending');f.journal.finish(scope,job,503,1000);
  job=f.journal.claim(scope,1000);assert.equal(job.id,'sending');gate(f.journal.db);f.journal.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const before=fs.readFileSync(f.file),result=reviewDeliveryJournal({environment:'test',file:f.file,bindings});
  assert.deepEqual(result.counts,{pending:1,sending:1,delivered:1,dead:1,invalid:0,unmatchedBindings:0});assert.equal(result.journalIntegrity,'passed');assert.equal(result.activation,'review-required');assert.equal(result.receiverAcknowledgements,'not-checked');assert.deepEqual(fs.readFileSync(f.file),before);
  for(const secret of ['key-ref-only','receiver',job.lease_token,'incident'])assert.ok(!JSON.stringify(result).includes(JSON.stringify(secret)));
  assert.throws(()=>new DeliveryJournal(f.file),/reviewed recovery/);assert.equal(f.journal.db.prepare('SELECT state FROM governance_recovery_gate').get().state,'review-required');
 }finally{f.close();}
});
test('full-snapshot limits, scope/binding mismatch and malformed state fail without truncation',()=>{
 const f=fixture();try{
  f.journal.enqueue(scope,body('one'),binding,1000);const other={tenant:'other',project:'test'};f.journal.enqueue(other,{...body('two'),tenantRef:'other'},binding,1000);gate(f.journal.db);
  const options={environment:'test',file:f.file,bindings};let result=reviewDeliveryJournal(options);assert.equal(result.reviewed,2);assert.equal(result.scopes,2);assert.equal(result.routingBindings,'unmatched');assert.equal(result.counts.unmatchedBindings,1);
  assert.throws(()=>reviewDeliveryJournal({...options,maxJobs:1}),/full-review/);assert.throws(()=>reviewDeliveryJournal({...options,bindings:[...bindings,...bindings]}),/duplicate/);assert.throws(()=>reviewDeliveryJournal({...options,environment:'dev'}),/mismatch/);assert.throws(()=>reviewDeliveryJournal({...options,environment:'prod'}),/environment/);
  for(const [sql,args] of [["UPDATE webhook_jobs SET body=? WHERE id='one'",[JSON.stringify({...body('one'),tenantRef:'foreign'})]],["UPDATE webhook_jobs SET body=?,state='sending',attempts=1,lease_until=0 WHERE id='one'",[JSON.stringify(body('one'))]],["UPDATE webhook_jobs SET state='delivered',lease_until=0,lease_token=NULL,attempts=1,last_status=NULL WHERE id='one'",[]],["UPDATE webhook_jobs SET body=? WHERE id='one'",['x'.repeat(4097)]]]){f.journal.db.prepare(sql).run(...args);result=reviewDeliveryJournal(options);assert.equal(result.journalIntegrity,'failed');assert.equal(result.counts.invalid,1);assert.equal(result.activation,'review-required');}
  f.journal.db.exec("UPDATE governance_recovery_gate SET state='approved'");assert.throws(()=>reviewDeliveryJournal(options),/gate mismatch/);
 }finally{f.close();}
});
test('encrypted actual journal restore preserves uncertain delivery and denies worker startup',async()=>{
 const f=fixture(),key=randomBytes(32);try{
  f.journal.enqueue(scope,body('uncertain'),binding,1000);f.journal.claim(scope,1000);f.journal.close();
  const recovery=require('./recovery.cjs'),archive=await recovery.createBackup({environment:'test',files:[{role:'rules',path:f.file}],outputRoot:path.join(f.directory,'archives'),key,consistency:'quiesced'}),restored=await recovery.restoreBackup({environment:'test',directory:archive.directory,outputRoot:path.join(f.directory,'restores'),key});
  const file=path.join(restored.directory,'rules.sqlite'),before=fs.readFileSync(file),result=reviewDeliveryJournal({environment:'test',file,bindings});
  assert.equal(result.counts.sending,1);assert.equal(result.journalIntegrity,'passed');assert.equal(result.postBackupActivity,'not-reconciled');assert.deepEqual(fs.readFileSync(file),before);assert.throws(()=>new DeliveryJournal(file),/reviewed recovery/);
 }finally{key.fill(0);f.close();}
});
