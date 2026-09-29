'use strict';
// Private dev/test operator workflow. No HTTP route, signer or broadcast API.
const fs=require('node:fs'),{DatabaseSync}=require('node:sqlite'),{createHash,randomUUID}=require('node:crypto');
const {reviewPublisherReadiness}=require('./recovery-publisher-readiness.cjs');
const {validateBinding,policyDigest}=require('./publisher-release-binding.cjs');
const {verifyProfile}=require('./postgres-runtime-profile.cjs');
const {verify}=require('./postgres-migrate.cjs');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const references=['providerReviewReference','ownershipReviewReference','accountActivityReviewReference','actualFeesReviewReference','custodyReviewReference','otherPublishersReviewReference','releaseReviewReference'];
function reviewInput(input){
 if(!input||Object.keys(input).sort().join(',')!==['plan','quiesced',...references].sort().join(',')||input.quiesced!==true||references.some(k=>typeof input[k]!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(input[k])))throw Error('Exact release plan, quiescence and independent review references required');
 const p=input.plan;
 if(!p||Object.keys(p).sort().join(',')!==['binding','environment','restoreId','workerRole','reviewedAt','snapshotDigest','reviewDigest','nonceBlock'].sort().join(',')||!Number.isSafeInteger(p.reviewedAt)||p.reviewedAt>Date.now()||Date.now()-p.reviewedAt>300000||!/^[a-f0-9]{64}$/.test(p.snapshotDigest)||!/^[a-f0-9]{64}$/.test(p.reviewDigest))throw Error('Recent bounded publisher release plan required');
 validateBinding(p.binding);return p;
}
async function context(pool,options){
 if(!['dev','test'].includes(options.environment)||!options.runtimePool)throw Error('Explicit dev/test worker runtime connection required');
 await verifyProfile(options.runtimePool,'evidence-worker');
 const worker=(await options.runtimePool.query('SELECT current_user name,current_database() database, (SELECT oid FROM pg_database WHERE datname=current_database()) oid')).rows[0];
 const c=await pool.connect();try{
  await require('./postgres-offline-administrator.cjs').assertOfflineAdministrator(c);await verify(c);
  const database=(await c.query('SELECT current_database() name,oid FROM pg_database WHERE datname=current_database()')).rows[0],gate=(await c.query('SELECT * FROM governance_recovery_gate')).rows,stage=(await c.query('SELECT name FROM governance_environment')).rows;
  if(!database.name.startsWith('gov_restore_')||database.name!==worker.database||database.oid!==worker.oid||stage.length!==1||stage[0].name!==options.environment||gate.length!==1||gate[0].state!=='customer-active'||gate[0].restore_id!==options.restoreId)throw Error('Publisher release requires matching customer-active restore and runtime database');
  return {workerRole:worker.name,database,gate};
 }finally{c.release();}
}
async function observation(pool,options,releaseId){
 const before=await context(pool,options),readiness=await reviewPublisherReadiness(pool,options),after=await context(pool,options);
 if(readiness.localReadiness!=='ready-for-independent-release-review'||readiness.blockers.length)throw Error('Publisher release still requires reconciliation');
 if(digest(before)!==digest(after))throw Error('Publisher release database context changed');
 const binding=validateBinding({...options.expected,releaseId,policyDigest:policyDigest(options.policy),codeHash:options.codeHash});
 const snapshotDigest=digest({context:after,readinessDigest:readiness.snapshotDigest,binding});
 return {binding,environment:options.environment,restoreId:options.restoreId,workerRole:after.workerRole,snapshotDigest,nonceBlock:{number:readiness.nonceObservation.blockNumber,hash:readiness.nonceObservation.blockHash}};
}
function planDigest(p){return digest({binding:p.binding,environment:p.environment,restoreId:p.restoreId,workerRole:p.workerRole,snapshotDigest:p.snapshotDigest,reviewedAt:p.reviewedAt,nonceBlock:p.nonceBlock});}
async function preparePublisherRelease(pool,options){
 const reviewedAt=Date.now(),result={...await observation(pool,{...options,now:reviewedAt,nonceBlock:null},randomUUID()),reviewedAt};return {...result,reviewDigest:planDigest(result)};
}
async function activatePublisherRelease(pool,options,input){
 const plan=reviewInput(input);if(plan.reviewDigest!==planDigest(plan)||plan.environment!==options.environment||plan.restoreId!==options.restoreId)throw Error('Publisher release plan differs from reviewed context');
 // Verify the bounded regular journal before creating its never-age-reclaimed lock.
 require('./recovery-worker-review.cjs').readWorkerSnapshot(options);
 const lock=options.file+'.lock';fs.writeFileSync(lock,JSON.stringify({pid:process.pid,purpose:'publisher-recovery-release'}),{flag:'wx',mode:0o600});
 let db,c,journalCommitted=false,keepLock=false;
 try{
  db=new DatabaseSync(options.file);db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
  c=await pool.connect();await c.query('BEGIN');await c.query("SELECT set_config('statement_timeout','30000',true),set_config('lock_timeout','5000',true)");
  await require('./postgres-offline-administrator.cjs').assertOfflineAdministrator(c);
  // These modes prevent mutations while allowing the separate read-only review connections.
  await c.query('LOCK TABLE governance_recovery_gate,governance_recovery_publisher_releases,governance_recovery_publisher_reviews IN SHARE ROW EXCLUSIVE MODE');
  await c.query('LOCK TABLE governance_environment,governance_migrations,governance_events,governance_evidence IN SHARE MODE');
  // Reproduce the reviewed spend snapshot clock, then independently check
  // present-time compatibility. Wall-clock passage alone is not data drift.
  const current=await observation(pool,{...options,now:plan.reviewedAt,nonceBlock:plan.nonceBlock},plan.binding.releaseId);
  if(current.snapshotDigest!==plan.snapshotDigest||current.workerRole!==plan.workerRole||Date.now()-plan.reviewedAt>300000)throw Error('Publisher release plan is stale');
  if(require('./recovery-worker-spend.cjs').reviewWorkerSpend({...options,now:Date.now()}).spendReview!=='compatible-with-recorded-state')throw Error('Current publisher spend state requires reconciliation');
  const now=Date.now(),audit={input,scope:'single-project-publisher',interpretation:'Independent review references and quiescence are operator assertions, not cryptographic proof of custody, fees or account completeness'};
  await c.query('INSERT INTO governance_recovery_publisher_reviews VALUES($1,$2,$3,current_user,$4)',[plan.binding.releaseId,plan.restoreId,JSON.stringify(audit),now]);
  const b=plan.binding;
  await c.query("INSERT INTO governance_recovery_publisher_releases VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'prepared',$10,$10)",[b.tenant,b.project,b.releaseId,plan.restoreId,b.publisher,b.recorder,plan.workerRole,b.policyDigest,b.codeHash,now]);
  // Constraint failures must occur before the journal approval commits.
  await c.query("UPDATE governance_recovery_publisher_releases SET state='active' WHERE release_id=$1",[b.releaseId]);
  db.exec('CREATE TABLE IF NOT EXISTS governance_publisher_release(singleton INTEGER PRIMARY KEY CHECK(singleton=1),body TEXT NOT NULL); DELETE FROM governance_publisher_release');
  db.prepare('INSERT INTO governance_publisher_release(singleton,body) VALUES(1,?)').run(JSON.stringify(b));
  const changed=db.prepare("UPDATE governance_recovery_gate SET state='approved' WHERE state='review-required'").run();if(changed.changes!==1)throw Error('Publisher journal gate changed');
  db.exec('COMMIT');journalCommitted=true;
  await c.query('COMMIT');
  return {environment:plan.environment,restoreId:plan.restoreId,releaseId:b.releaseId,publisherAccess:'active',scope:'single-project',customerGate:'customer-active'};
 }catch(error){
  try{if(c)await c.query('ROLLBACK');}catch{keepLock=true;}
  if(journalCommitted){
   // PG commit can have an uncertain outcome. Close the local gate first;
   // retain the lock if compensation cannot be verified. Never touch signed jobs.
   try{db.exec("BEGIN IMMEDIATE; UPDATE governance_recovery_gate SET state='review-required'; DELETE FROM governance_publisher_release; COMMIT");}catch{keepLock=true;}
   try{if(c){const now=Date.now();await c.query('BEGIN');await c.query("UPDATE governance_recovery_publisher_releases SET state='revoked',changed_at=$2 WHERE release_id=$1",[plan.binding.releaseId,now]);await c.query("UPDATE governance_recovery_publisher_reviews SET review=review || jsonb_build_object('compensation',jsonb_build_object('reason','release-commit-outcome-uncertain','at',$2::bigint,'operator',current_user)) WHERE release_id=$1",[plan.binding.releaseId,now]);await c.query('COMMIT');}}catch{keepLock=true;try{if(c)await c.query('ROLLBACK');}catch{}}
  }else{try{db?.exec('ROLLBACK');}catch{}}
  if(keepLock)throw Error('Publisher release failed; owner lock retained for manual reconciliation');
  throw error;
 }finally{try{db?.close();}finally{c?.release();if(!keepLock)fs.unlinkSync(lock);}}
}
async function revokePublisherRelease(pool,{environment,restoreId,releaseId,tenant,project,reviewReference}){
 if(!['dev','test'].includes(environment)||![restoreId,releaseId].every(v=>typeof v==='string'&&/^[-a-f0-9]{36}$/.test(v))||![tenant,project].every(v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,200}$/.test(v))||typeof reviewReference!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(reviewReference))throw Error('Exact scoped publisher revocation review required');
 const c=await pool.connect();try{
  await c.query('BEGIN');await c.query("SELECT set_config('statement_timeout','30000',true),set_config('lock_timeout','5000',true)");
  await require('./postgres-offline-administrator.cjs').assertOfflineAdministrator(c);await verify(c);
  await c.query('LOCK TABLE governance_recovery_gate,governance_recovery_publisher_releases,governance_recovery_publisher_reviews IN SHARE ROW EXCLUSIVE MODE');
  const stage=(await c.query('SELECT name FROM governance_environment')).rows,gate=(await c.query('SELECT * FROM governance_recovery_gate')).rows,database=(await c.query('SELECT current_database() name')).rows[0];
  if(stage.length!==1||stage[0].name!==environment||!database.name.startsWith('gov_restore_')||gate.length!==1||gate[0].state!=='customer-active'||gate[0].restore_id!==restoreId)throw Error('Publisher revocation restore mismatch');
  const row=(await c.query('SELECT state FROM governance_recovery_publisher_releases WHERE release_id=$1 AND restore_id=$2 AND tenant=$3 AND project=$4',[releaseId,restoreId,tenant,project])).rows[0];if(!row)throw Error('Exact publisher release not found');
  if(row.state!=='revoked'){
   const now=Date.now();await c.query("UPDATE governance_recovery_publisher_releases SET state='revoked',changed_at=$2 WHERE release_id=$1",[releaseId,now]);
   await c.query("UPDATE governance_recovery_publisher_reviews SET review=review || jsonb_build_object('revocation',jsonb_build_object('reference',$2::text,'at',$3::bigint,'operator',current_user)) WHERE release_id=$1",[releaseId,reviewReference,now]);
  }
  await c.query('COMMIT');return {environment,restoreId,releaseId,publisherAccess:'revoked',signedJournal:'unchanged'};
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
module.exports={preparePublisherRelease,activatePublisherRelease,revokePublisherRelease};
