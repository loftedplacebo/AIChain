'use strict';
const {createHash}=require('node:crypto');
const {inspectEvidence}=require('./evidence.cjs');
const {verify}=require('./postgres-migrate.cjs');
const {validateGovernanceEvent}=require('../../sdk/typescript/governance-event');
const canonical=v=>v instanceof Date?v.toISOString():Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
async function inspectRow(row,trustedSigners){
 try{
  const event=row.body;validateGovernanceEvent(event);
  const submitted={...event};delete submitted.receivedAt;
  if(event.tenantRef!==row.tenant||event.projectRef!==row.project||event.eventId!==row.id||sha(submitted)!==row.digest||new Date(event.receivedAt).toISOString()!==new Date(row.received).toISOString())return 'record-mismatch';
  if(!row.bundle)return row.status==='pending'&&row.revision===null&&row.batch_id===null?'unsigned-pending':'queue-mismatch';
  if(!Number.isInteger(row.revision)||row.revision<1||row.batch_id!==row.bundle.batch?.id)return 'queue-mismatch';
  const result=await inspectEvidence(event,{bundle:row.bundle},{trustedSigners});
  if(result.state==='untrusted-signer')return 'untrusted-signer';
  if(result.signature!=='valid'||!result.recordCommitment||!result.batchMembership)return 'invalid-evidence';
  if(result.state==='batched')return row.status==='batched'?'signed-batched':'queue-mismatch';
  if(result.state==='submitted')return row.status==='submitted'?'submitted-offline':'queue-mismatch';
  return 'invalid-evidence';
 }catch{return 'invalid-evidence';}
}
async function reviewEvidence(pool,{environment,restoreId,trustedSigners,maxRecords=1000}){
 if(!['dev','test'].includes(environment)||typeof restoreId!=='string'||!/^[-a-f0-9]{36}$/.test(restoreId)||!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>10000||!Array.isArray(trustedSigners)||trustedSigners.length<1||trustedSigners.length>64||trustedSigners.some(s=>typeof s!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(s)))throw Error('Explicit bounded restore and trusted-signer policy required');
 const signers=[...new Set(trustedSigners.map(s=>s.toLowerCase()))].sort(),c=await pool.connect();
 try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await c.query("SELECT set_config('statement_timeout','30000',true),set_config('lock_timeout','5000',true)");
  if(!(await c.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0]?.rolsuper)throw Error('Offline recovery administrator required');await verify(c);
  const stage=(await c.query('SELECT name FROM governance_environment')).rows,gate=(await c.query('SELECT * FROM governance_recovery_gate')).rows;
  const database=(await c.query('SELECT current_database() name,oid FROM pg_database WHERE datname=current_database()')).rows[0];
  if(stage.length!==1||stage[0].name!==environment||gate.length!==1||!['review-required','access-reviewed'].includes(gate[0].state)||gate[0].restore_id!==restoreId||!database.name.startsWith('gov_restore_'))throw Error('Recovery gate or environment mismatch');
  const total=Number((await c.query('SELECT count(*) n FROM governance_events')).rows[0].n);if(!Number.isSafeInteger(total)||total>maxRecords)throw Error('Recovery evidence exceeds bounded full-review limit; no partial pass');
  const counts={'unsigned-pending':0,'signed-batched':0,'submitted-offline':0,'record-mismatch':0,'queue-mismatch':0,'untrusted-signer':0,'invalid-evidence':0};
  const hash=createHash('sha256');hash.update(JSON.stringify({environment,database,restoreId,invalidatedAt:gate[0].invalidated_at}));let cursor=null,reviewed=0;const deadline=Date.now()+30000;
  while(reviewed<total){
   const rows=(await c.query(`SELECT e.tenant,e.project,e.id,e.digest,e.received,e.body,o.status,v.revision,v.batch_id,v.bundle FROM governance_events e LEFT JOIN governance_outbox o USING(tenant,project,id) LEFT JOIN governance_evidence v USING(tenant,project,id) ${cursor?'WHERE (e.tenant,e.project,e.id)>($1,$2,$3)':''} ORDER BY e.tenant,e.project,e.id LIMIT 100`,cursor||[])).rows;
   if(!rows.length)throw Error('Recovery evidence snapshot is incomplete');
   for(const row of rows){if(Date.now()>deadline)throw Error('Recovery evidence review exceeded bounded duration');hash.update(JSON.stringify(canonical(row))+'\n');counts[await inspectRow(row,signers)]++;reviewed++;}
   const last=rows.at(-1);cursor=[last.tenant,last.project,last.id];
  }
  const failures=counts['record-mismatch']+counts['queue-mismatch']+counts['untrusted-signer']+counts['invalid-evidence'];
  await c.query('COMMIT');return {environment,restoreId,reviewed,counts,snapshotDigest:hash.digest('hex'),signerPolicyDigest:sha(signers),offlineIntegrity:failures?'failed':counts['unsigned-pending']?'incomplete':'passed',baseVerification:'not-checked',activation:'review-required',checkedAt:new Date().toISOString(),interpretation:'Full bounded restored snapshot only; trusted recording signatures and Merkle membership do not prove source authenticity, AI correctness or current Base inclusion'};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
module.exports={reviewEvidence,inspectRow};
