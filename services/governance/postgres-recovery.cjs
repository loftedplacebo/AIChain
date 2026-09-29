'use strict';
const {randomUUID}=require('node:crypto');
const {verify}=require('./postgres-migrate.cjs');
const issued=new WeakSet(),name=v=>typeof v==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(v);
async function assertActive(pool,{publisher=false,binding=null,principal=null}={}){
 const rows=(await pool.query('SELECT state,restore_id FROM governance_recovery_gate')).rows;
 if(rows.length===1&&rows[0].state==='active')return;
 if(rows.length===1&&rows[0].state==='customer-active'){
  if(!publisher)return;
  if(binding&&principal?.tenant===binding.tenant&&principal?.project===binding.project){
   const b=require('./publisher-release-binding.cjs').validateBinding(binding),release=(await pool.query("SELECT publisher,recorder,policy_digest,code_hash FROM governance_recovery_publisher_releases WHERE tenant=$1 AND project=$2 AND release_id=$3 AND restore_id=$4 AND worker_role=current_user AND state='active'",[b.tenant,b.project,b.releaseId,rows[0].restore_id])).rows;
   if(release.length===1&&release[0].publisher===b.publisher&&release[0].recorder===b.recorder&&release[0].policy_digest===b.policyDigest&&release[0].code_hash===b.codeHash)return;
  }
 }
 throw Error('Restored PostgreSQL database requires reviewed recovery before use');
}
async function operator(c){
 const row=(await c.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0];
 if(!row?.rolsuper)throw Error('Isolated restore requires the offline database administrator');
}
// A fresh destination issued by this process is the only invalidation target.
// Arbitrary existing databases cannot be passed to invalidateRestore.
async function createRestoreTarget(admin,{sourceDatabase,targetDatabase,environment,sourceMayBeAbsent=false}){
 if(!['dev','test'].includes(environment)||!name(sourceDatabase)||!name(targetDatabase)||!targetDatabase.startsWith('gov_restore_')||sourceDatabase===targetDatabase||typeof sourceMayBeAbsent!=='boolean')throw Error('Explicit dev/test source and fresh restore database required');
 const c=await admin.connect();try{
  await operator(c);
  const source=(await c.query('SELECT oid FROM pg_database WHERE datname=$1',[sourceDatabase])).rows[0];if(!source&&!sourceMayBeAbsent)throw Error('Source database not found');
  // CREATE DATABASE fails on collisions: never drop/reuse an existing target.
  await c.query('CREATE DATABASE '+targetDatabase);
  await c.query('REVOKE CONNECT ON DATABASE '+targetDatabase+' FROM PUBLIC');
  const destination=(await c.query('SELECT oid FROM pg_database WHERE datname=$1',[targetDatabase])).rows[0];
  const handle=Object.freeze({sourceDatabase,targetDatabase,sourceOid:source?.oid??null,targetOid:destination.oid,environment,restoreId:randomUUID()});issued.add(handle);return handle;
 }finally{c.release();}
}
async function target(c,handle,{verifyMigrations=true}={}){
 if(!issued.has(handle))throw Error('Fresh restore target handle required');
 const row=(await c.query('SELECT current_database() name,oid FROM pg_database WHERE datname=current_database()')).rows[0];
 if(row.name!==handle.targetDatabase||row.oid!==handle.targetOid||row.oid===handle.sourceOid)throw Error('Restore destination mismatch');
 await operator(c);
 const env=(await c.query('SELECT name FROM governance_environment')).rows;
 if(env.length!==1||env[0].name!==handle.environment)throw Error('Restore environment mismatch');
 if(verifyMigrations)await verify(c);
}
async function invalidateRestore(pool,handle,{approvedMigrations=[]}={}){
 const c=await pool.connect();try{
  await c.query('BEGIN');await target(c,handle,{verifyMigrations:false});
  await c.query("SELECT set_config('statement_timeout','30000',true),set_config('lock_timeout','5000',true)");
  await c.query('LOCK TABLE governance_migrations,governance_recovery_gate,governance_customer_sessions,governance_customer_auth_flows,governance_project_keys,governance_customer_invitations,governance_customer_identities IN ACCESS EXCLUSIVE MODE');
  const pending=require('./restore-migration-plan.cjs').plan(require('./postgres-migrate.cjs').migrations(),(await c.query('SELECT name,checksum FROM governance_migrations')).rows,approvedMigrations);
  const gate=(await c.query('SELECT * FROM governance_recovery_gate')).rows;
  const prior=gate[0],original=gate.length===1&&prior.state==='active'&&prior.restore_id===null&&prior.invalidated_at===null;
  const repeated=gate.length===1&&prior.state==='customer-active'&&typeof prior.restore_id==='string'&&/^[-a-f0-9]{36}$/.test(prior.restore_id)&&prior.restore_id!==handle.restoreId&&Number.isSafeInteger(Number(prior.invalidated_at))&&Number(prior.invalidated_at)>0&&Number(prior.invalidated_at)<=Date.now();
  if(!original&&!repeated)throw Error('Recovery gate is not a fresh source snapshot');
  for(const migration of pending){await c.query(migration.sql);await c.query('INSERT INTO governance_migrations(name,checksum) VALUES($1,$2)',[migration.name,migration.checksum]);}
  await verify(c);
  await c.query('LOCK TABLE governance_recovery_publisher_releases IN ACCESS EXCLUSIVE MODE');
  await c.query('LOCK TABLE governance_recovery_generations,governance_recovery_access_reviews,governance_recovery_customer_activations IN ACCESS EXCLUSIVE MODE');
  if(repeated){
   const application=(await c.query('SELECT restore_id FROM governance_recovery_access_reviews WHERE restore_id=$1',[prior.restore_id])).rows;
   const activation=(await c.query('SELECT review FROM governance_recovery_customer_activations WHERE restore_id=$1',[prior.restore_id])).rows;
   if(application.length!==1||activation.length!==1||activation[0].review?.scope!=='customer-only'||activation[0].review?.observation?.restoreId!==prior.restore_id)throw Error('Previous customer recovery audit missing or inconsistent');
  }
  const now=Date.now();
  await c.query("UPDATE governance_recovery_publisher_releases SET state='revoked',changed_at=$1",[now]);
  await c.query('INSERT INTO governance_recovery_generations VALUES($1,$2,$3,$4,$5,current_user)',[handle.restoreId,prior.restore_id,prior.state,prior.invalidated_at,now]);
  await c.query('DELETE FROM governance_customer_sessions');await c.query('DELETE FROM governance_customer_auth_flows');
  await c.query('UPDATE governance_provider_replay_progress SET lease_owner=NULL,lease_until=0');
  await c.query('UPDATE governance_project_keys SET revoked_at=$1',[now]);
  await c.query('UPDATE governance_customer_invitations SET revoked=$1',[now]);
  await c.query('UPDATE governance_customer_identities SET disabled=true,version=version+1');
  await c.query("UPDATE governance_recovery_gate SET state='review-required',restore_id=$1,invalidated_at=$2",[handle.restoreId,now]);
  await c.query('COMMIT');return {environment:handle.environment,restoreId:handle.restoreId,access:'revoked-and-disabled',activation:'review-required',appliedMigrations:pending.map(({name,checksum})=>({name,checksum}))};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function reviewRestore(pool,{environment,restoreId}){
 if(!['dev','test'].includes(environment)||typeof restoreId!=='string'||!/^[-a-f0-9]{36}$/.test(restoreId))throw Error('Explicit recovery review identity required');
 const c=await pool.connect();try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await operator(c);await verify(c);
  await c.query("SELECT set_config('statement_timeout','30000',true),set_config('lock_timeout','5000',true)");
  const stage=(await c.query('SELECT name FROM governance_environment')).rows,gate=(await c.query('SELECT * FROM governance_recovery_gate')).rows;
  if(stage.length!==1||stage[0].name!==environment||gate.length!==1||gate[0].state!=='review-required'||gate[0].restore_id!==restoreId||!Number.isSafeInteger(Number(gate[0].invalidated_at))||Number(gate[0].invalidated_at)<=0)throw Error('Recovery gate or environment mismatch');
  const now=Date.now();
  if(Number(gate[0].invalidated_at)>now+300000)throw Error('Recovery invalidation time is in the future');
  for(const table of ['governance_customer_sessions','governance_customer_auth_flows'])if(Number((await c.query('SELECT count(*) n FROM '+table)).rows[0].n)!==0)throw Error('Restored authentication state is not empty');
  if(Number((await c.query('SELECT count(*) n FROM governance_project_keys WHERE revoked_at IS NULL OR revoked_at<=0 OR revoked_at>$1',[now])).rows[0].n)!==0)throw Error('Restored API keys remain usable');
  if(Number((await c.query('SELECT count(*) n FROM governance_customer_invitations WHERE revoked IS NULL OR revoked<=0 OR revoked>$1',[now])).rows[0].n)!==0)throw Error('Restored invitations remain usable');
  if(Number((await c.query('SELECT count(*) n FROM governance_customer_identities WHERE NOT disabled OR version<2')).rows[0].n)!==0)throw Error('Restored identities remain enabled');
  if(Number((await c.query('SELECT count(*) n FROM governance_events e LEFT JOIN governance_outbox o USING(tenant,project,id) WHERE o.id IS NULL')).rows[0].n)!==0)throw Error('Restored events are missing outbox entries');
  if(Number((await c.query(`WITH actual AS (SELECT tenant,project,count(*) n,sum(bytes) bytes FROM governance_events GROUP BY tenant,project)
   SELECT count(*) n FROM actual a FULL JOIN governance_usage u USING(tenant,project)
   WHERE (a.tenant IS NOT NULL AND u.tenant IS NULL) OR coalesce(a.n,0)<>coalesce(u.event_count,0) OR coalesce(a.bytes,0)<>coalesce(u.stored_bytes,0)`)).rows[0].n)!==0)throw Error('Restored usage counters do not reconcile');
  const inventory=await recoveryInventory(c);
  await c.query('COMMIT');return {environment,restoreId,review:'passed',activation:'review-required',inventory};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
// Offline aggregate review only. Never exposes identities, event bodies,
// membership identifiers, credentials, provider subjects or transaction bytes.
async function recoveryInventory(c){
 const inventory={customers:{},records:{},invalidatedAccess:{},outbox:{}};
 const groups={customers:{identities:'governance_customer_identities',workspaces:'governance_customer_workspaces',projects:'governance_customer_projects',memberships:'governance_customer_memberships'},records:{events:'governance_events',evidence:'governance_evidence',usageScopes:'governance_usage',outbox:'governance_outbox',agentRegistrations:'governance_agents'},invalidatedAccess:{apiKeys:'governance_project_keys',invitations:'governance_customer_invitations'}};
 const count=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Error('Recovery inventory exceeds exact reporting bounds');return n;};
 for(const [group,tables] of Object.entries(groups))for(const [label,table] of Object.entries(tables))inventory[group][label]=count((await c.query('SELECT count(*) n FROM '+table)).rows[0].n);
 inventory.customers.workspacesWithoutRecordedOwner=count((await c.query("SELECT count(*) n FROM governance_customer_workspaces w WHERE NOT EXISTS(SELECT 1 FROM governance_customer_memberships m WHERE m.workspace=w.id AND m.role='owner')")).rows[0].n);
 for(const state of ['pending','batched','submitted'])inventory.outbox[state]=count((await c.query('SELECT count(*) n FROM governance_outbox WHERE status=$1',[state])).rows[0].n);
 inventory.outbox.other=inventory.records.outbox-Object.values(inventory.outbox).reduce((sum,n)=>sum+n,0);
 return {...inventory,interpretation:'Snapshot counts only; signatures, Merkle proofs and current Base state require independent verification',requiredBeforeActivation:['Reconcile provider identities and memberships with changes after the backup','Confirm ownership for every recovered workspace before selectively restoring access','Reconcile pending publication and delivery journals against current network state','Complete independent evidence verification and reviewed runtime grants']};
}
// Private operator inventory for selective access review. The public aggregate
// review above deliberately does not return these identifiers/provider bindings.
async function prepareAccessReview(pool,{environment,restoreId}){
 if(!['dev','test'].includes(environment)||typeof restoreId!=='string'||!/^[-a-f0-9]{36}$/.test(restoreId))throw Error('Explicit recovery review identity required');
 const c=await pool.connect();try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await operator(c);await verify(c);
  await c.query("SELECT set_config('statement_timeout','30000',true),set_config('lock_timeout','5000',true)");
  const snapshot=await accessSnapshot(c,{environment,restoreId});
  await c.query('COMMIT');return {snapshot,snapshotDigest:require('./recovery-access-plan.cjs').digest(snapshot),activation:'review-required',sensitive:'Private offline provider and ownership review only; do not log or serve this inventory'};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function accessSnapshot(c,{environment,restoreId}){
  const stage=(await c.query('SELECT name FROM governance_environment')).rows,gate=(await c.query('SELECT * FROM governance_recovery_gate')).rows;
  const database=(await c.query('SELECT current_database() name,oid FROM pg_database WHERE datname=current_database()')).rows[0];
  if(stage.length!==1||stage[0].name!==environment||gate.length!==1||gate[0].state!=='review-required'||gate[0].restore_id!==restoreId||!database.name.startsWith('gov_restore_'))throw Error('Recovery gate or environment mismatch');
  if(!Number.isSafeInteger(Number(gate[0].invalidated_at))||Number(gate[0].invalidated_at)<=0||Number(gate[0].invalidated_at)>Date.now()+300000)throw Error('Recovery invalidation time is invalid');
  const snapshot={version:1,environment,database:{name:database.name,oid:database.oid},restoreId,invalidatedAt:gate[0].invalidated_at};
  for(const [label,sql] of Object.entries({identities:'SELECT id,provider,subject,email,disabled,version FROM governance_customer_identities ORDER BY id',workspaces:'SELECT id,name,created FROM governance_customer_workspaces ORDER BY id',memberships:'SELECT workspace,user_id,role FROM governance_customer_memberships ORDER BY workspace,user_id'})){
   const rows=(await c.query(sql+' LIMIT 10001')).rows;if(rows.length>10000)throw Error('Recovery review inventory exceeds bounded operator review');snapshot[label]=rows;
  }
  if(snapshot.identities.some(i=>!i.disabled||i.version<2))throw Error('Restored identities remain enabled');
  for(const table of ['governance_customer_sessions','governance_customer_auth_flows'])if(Number((await c.query('SELECT count(*) n FROM '+table)).rows[0].n)!==0)throw Error('Restored authentication state is not empty');
  const now=Date.now();
  for(const [table,column] of [['governance_project_keys','revoked_at'],['governance_customer_invitations','revoked']])if(Number((await c.query('SELECT count(*) n FROM '+table+' WHERE '+column+' IS NULL OR '+column+'<=0 OR '+column+'>$1',[now])).rows[0].n)!==0)throw Error('Restored credentials remain usable');
  return snapshot;
}
async function reviewAccessPlan(pool,options,input){
 const {snapshot}=await prepareAccessReview(pool,options);
 return require('./recovery-access-plan.cjs').compile(snapshot,input);
}
// Applies reviewed access state only: the API and all publishers remain gated.
// No claim that review references independently prove external reconciliation.
async function applyAccessReview(pool,{environment,restoreId},input){
 if(!['dev','test'].includes(environment)||typeof restoreId!=='string'||!/^[-a-f0-9]{36}$/.test(restoreId))throw Error('Explicit recovery review identity required');
 const c=await pool.connect();try{
  await c.query('BEGIN');await operator(c);await verify(c);
  await c.query("SELECT set_config('statement_timeout','30000',true),set_config('lock_timeout','5000',true)");
  await c.query('LOCK TABLE governance_recovery_gate,governance_recovery_access_reviews,governance_customer_identities,governance_customer_workspaces,governance_customer_memberships,governance_customer_sessions,governance_customer_auth_flows,governance_project_keys,governance_customer_invitations IN ACCESS EXCLUSIVE MODE');
  const snapshot=await accessSnapshot(c,{environment,restoreId});
  const plan=require('./recovery-access-plan.cjs').compile(snapshot,input);
  const now=Date.now();
  await c.query('INSERT INTO governance_recovery_access_reviews(restore_id,snapshot_digest,plan,original_memberships,applied_at,operator_name) VALUES($1,$2,$3,$4,$5,current_user)',[restoreId,plan.snapshotDigest,JSON.stringify(plan),JSON.stringify(snapshot.memberships),now]);
  await c.query('DELETE FROM governance_customer_memberships');
  for(const m of plan.memberships)await c.query('INSERT INTO governance_customer_memberships(workspace,user_id,role) VALUES($1,$2,$3)',[m.workspace,m.userId,m.role]);
  const users=[...new Set(plan.memberships.map(m=>m.userId))];
  await c.query('UPDATE governance_customer_identities SET disabled=false,version=version+1 WHERE id=ANY($1::text[])',[users]);
  await c.query("UPDATE governance_recovery_gate SET state='access-reviewed' WHERE singleton=true");
  await c.query('COMMIT');return {environment,restoreId,accessReview:'applied',activation:'review-required',serviceGate:'access-reviewed',credentials:'remain-revoked',summary:plan.summary};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
module.exports={assertActive,createRestoreTarget,invalidateRestore,reviewRestore,prepareAccessReview,reviewAccessPlan,applyAccessReview};
