'use strict';
const {Transaction}=require('ethers'),{createHash}=require('node:crypto');
const {inspectJob,readWorkerSnapshot}=require('./recovery-worker-review.cjs'),{inspectEvidence}=require('./evidence.cjs'),{BATCH_ABI}=require('../../sdk/typescript/base-sepolia-batch-adapter'),{verify}=require('./postgres-migrate.cjs');
async function compareBatch(entries,row,expected,{provider=null,minimumConfirmations=12,codeHash,deadline=Date.now()+30000}={}){
 const journal=inspectJob(row,expected);if(journal.kind==='invalid')return {state:'journal-mismatch'};
 if(!entries.length)return {state:'batch-incomplete'};const job=JSON.parse(row.body),first=entries[0].bundle.batch;
 if(!first||first.id!==job.id||first.publisher!==expected.publisher.toLowerCase()||entries.length!==first.leafCount||new Set(entries.map(e=>e.event.eventId)).size!==entries.length)return {state:'batch-incomplete'};
 if(job.raw){const parsed=BATCH_ABI.parseTransaction({data:Transaction.from(job.raw).data});if(parsed.args[0]!==first.root||Number(parsed.args[1])!==first.leafCount||parsed.args[2]!==first.schemaVersion)return {state:'journal-mismatch'};}
 for(const e of entries){
  if(Date.now()>deadline)throw Error('Worker evidence review exceeded bounded duration');
  const b=e.bundle.batch;if(e.event.tenantRef!==expected.tenant||e.event.projectRef!==expected.project||b?.id!==first.id||b.root!==first.root||b.publisher!==first.publisher||b.leafCount!==first.leafCount||b.schemaVersion!==first.schemaVersion)return {state:'journal-mismatch'};
  const verification=await inspectEvidence(e.event,{bundle:e.bundle},{trustedSigners:[expected.recorder]});if(verification.signature!=='valid'||!verification.recordCommitment||!verification.batchMembership||!verification.trustedSigner)return {state:'invalid-evidence'};
  if(job.hash&&e.bundle.transactions.length&&!e.bundle.transactions.includes(job.hash))return {state:'transaction-divergence'};
 }
 if(!job.hash)return {state:'prepared'};
 const verification=await inspectEvidence(entries[0].event,{bundle:{...entries[0].bundle,transactions:[job.hash]}},{provider,trustedSigners:[expected.recorder],minimumConfirmations,codeHash});
 return {state:verification.state==='submitted'?'submitted-offline':verification.state,transactionLinkRepairRequired:entries.some(e=>!e.bundle.transactions.includes(job.hash))};
}
async function reviewWorkerEvidence(pool,{environment,restoreId,file,expected,maxJobs=1000,maxRecords=1000,provider=null,minimumConfirmations=12,codeHash}){
 if(typeof restoreId!=='string'||!/^[-a-f0-9]{36}$/.test(restoreId)||!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>10000||!Number.isInteger(minimumConfirmations)||minimumConfirmations<1||minimumConfirmations>1000)throw Error('Explicit bounded restored evidence policy required');
 const deadline=Date.now()+30000,snapshot=readWorkerSnapshot({environment,file,expected,maxJobs});if(snapshot.report.journalIntegrity!=='passed')throw Error('Worker journal integrity must pass before evidence reconciliation');
 const boundedProvider=provider?Object.fromEntries(['getNetwork','getCode','getTransactionReceipt','getBlockNumber','getBlock'].map(method=>[method,async(...args)=>{let timer;try{return await Promise.race([Promise.resolve().then(()=>provider[method](...args)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Recovery RPC observation timeout')),Math.max(1,Math.min(5000,deadline-Date.now())));})]);}finally{clearTimeout(timer);}}])):null;
 const c=await pool.connect();try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SELECT set_config('statement_timeout','30000',true),set_config('lock_timeout','5000',true)");
  if(!(await c.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0]?.rolsuper)throw Error('Offline recovery administrator required');await verify(c);
  const stage=(await c.query('SELECT name FROM governance_environment')).rows,gate=(await c.query('SELECT * FROM governance_recovery_gate')).rows,database=(await c.query('SELECT current_database() name,oid FROM pg_database WHERE datname=current_database()')).rows[0];
  if(stage.length!==1||stage[0].name!==environment||gate.length!==1||!['review-required','access-reviewed','customer-active'].includes(gate[0].state)||gate[0].restore_id!==restoreId||!database.name.startsWith('gov_restore_'))throw Error('Recovery gate or environment mismatch');
  const n=Number((await c.query('SELECT count(*) n FROM governance_evidence WHERE tenant=$1 AND project=$2',[expected.tenant,expected.project])).rows[0].n);if(!Number.isSafeInteger(n)||n>maxRecords)throw Error('Worker evidence exceeds bounded full-review limit');
  const bytes=Number((await c.query("SELECT coalesce(sum(octet_length(e.body::text)+octet_length(v.bundle::text)),0) bytes FROM governance_evidence v JOIN governance_events e USING(tenant,project,id) WHERE v.tenant=$1 AND v.project=$2",[expected.tenant,expected.project])).rows[0].bytes);if(!Number.isSafeInteger(bytes)||bytes>32*1024*1024)throw Error('Worker evidence exceeds bounded body limit');
  const entries=(await c.query('SELECT e.id,e.body event,v.bundle FROM governance_evidence v JOIN governance_events e USING(tenant,project,id) WHERE v.tenant=$1 AND v.project=$2 ORDER BY v.batch_id,e.id',[expected.tenant,expected.project])).rows,groups=new Map(),hash=createHash('sha256');hash.update(JSON.stringify({environment,restoreId,database,gate,workerDigest:snapshot.report.snapshotDigest}));
  for(const entry of entries){hash.update(JSON.stringify(entry)+'\n');const id=entry.bundle.batch?.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(entry);}
  const counts={},seen=new Set();let repairs=0;for(const row of snapshot.rows){if(Date.now()>deadline)throw Error('Worker evidence review exceeded bounded duration');seen.add(row.id);const result=await compareBatch(groups.get(row.id)||[],row,expected,{provider:boundedProvider,minimumConfirmations,codeHash,deadline});counts[result.state]=(counts[result.state]||0)+1;if(result.transactionLinkRepairRequired)repairs++;}
  const missingJournalBatches=[...groups.keys()].filter(id=>groups.get(id)[0].bundle.batch?.publisher===expected.publisher.toLowerCase()&&!seen.has(id)).length;
  const otherPublisherBatches=[...groups.keys()].filter(id=>groups.get(id)[0].bundle.batch?.publisher!==expected.publisher.toLowerCase()).length;
  if(readWorkerSnapshot({environment,file,expected,maxJobs}).report.snapshotDigest!==snapshot.report.snapshotDigest)throw Error('Worker journal changed during evidence review');
  await c.query('COMMIT');return {environment,restoreId,reviewedJobs:snapshot.rows.length,reviewedEvidence:entries.length,counts,missingJournalBatches,otherPublisherBatches,transactionLinkRepairs:repairs,snapshotDigest:hash.digest('hex'),networkReconciliation:provider?'rpc-checks-enabled':'not-checked',activation:'review-required',interpretation:'Snapshot observations only; inspect individual state counts. Repair, publisher nonce/post-backup activity, other journals and final release need separate review'};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
module.exports={compareBatch,reviewWorkerEvidence};
