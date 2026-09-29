'use strict';
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto'),{Transaction,keccak256}=require('ethers');
const {CONTRACT}=require('./evidence.cjs'),{BATCH_ABI,baseBatchId}=require('../../sdk/typescript/base-sepolia-batch-adapter'),{VERSION}=require('../../sdk/typescript/verification-receipt');
const address=v=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v),ref=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,200}$/.test(v),hash=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v);
function inspectJob(row,expected){
 try{
  if(typeof row.body!=='string'||Buffer.byteLength(row.body)>1048576)return {kind:'invalid'};
  const job=JSON.parse(row.body);if(job.id!==row.id||!hash(job.id)||!['prepared','external','signed','submitted','broadcast-uncertain','confirmed','confirming','blocked'].includes(job.state))return {kind:'invalid'};
  if(!job.raw){if(job.state==='prepared'&&!job.hash)return {kind:'unsigned'};return hash(job.hash)&&['external','submitted','confirmed','confirming','blocked'].includes(job.state)?{kind:'externalReference'}:{kind:'invalid'};}
  if(typeof job.raw!=='string'||job.raw.length>131074||!hash(job.hash)||keccak256(job.raw)!==job.hash)return {kind:'invalid'};
  const tx=Transaction.from(job.raw),decoded=BATCH_ABI.parseTransaction({data:tx.data});
  if(tx.type!==2||tx.chainId!==84532n||tx.from?.toLowerCase()!==expected.publisher.toLowerCase()||tx.to?.toLowerCase()!==CONTRACT||tx.value!==0n||tx.nonce!==job.nonce||!tx.isSigned()||tx.gasLimit<=0n||!tx.maxFeePerGas||tx.maxPriorityFeePerGas===null||tx.maxPriorityFeePerGas>tx.maxFeePerGas||decoded?.name!=='anchorBatch')return {kind:'invalid'};
  if(decoded.args[1]<1n||decoded.args[1]>1000n||decoded.args[2]!==VERSION||baseBatchId(CONTRACT,expected.publisher,decoded.args[0])!==job.id)return {kind:'invalid'};
  return {kind:'signed',nonce:tx.nonce};
 }catch{return {kind:'invalid'};}
}
function readWorkerSnapshot({environment,file,expected,maxJobs=1000}){
 if(!['dev','test'].includes(environment)||typeof file!=='string'||!path.isAbsolute(file)||!expected||Object.keys(expected).sort().join(',')!=='project,publisher,recorder,tenant'||!ref(expected.tenant)||!ref(expected.project)||!address(expected.publisher)||!address(expected.recorder)||!Number.isInteger(maxJobs)||maxJobs<1||maxJobs>10000)throw Error('Explicit restored worker identity and bounded review required');
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>512*1024*1024)throw Error('Bounded regular restored journal required');
 const db=new DatabaseSync(file,{readOnly:true});try{
  db.exec('BEGIN');const stages=db.prepare('SELECT name FROM governance_environment').all(),gate=db.prepare('SELECT state FROM governance_recovery_gate').all();if(stages.length!==1||stages[0].name!==environment||gate.length!==1||gate[0].state!=='review-required')throw Error('Restored worker environment/gate mismatch');
  const configSize=db.prepare('SELECT count(*) n,coalesce(sum(length(CAST(body AS BLOB))),0) bytes FROM config').get();if(configSize.n!==1||configSize.bytes>4096)throw Error('Reviewed worker configuration required');
  const configs=db.prepare('SELECT id,body FROM config LIMIT 2').all();if(configs.length!==1||configs[0].id!==1||typeof configs[0].body!=='string'||configs[0].body.length>4096)throw Error('Reviewed worker configuration required');const config=JSON.parse(configs[0].body);
  if(config.scope?.tenant!==expected.tenant||config.scope?.project!==expected.project||config.publisher!==expected.publisher.toLowerCase()||config.recorder!==expected.recorder.toLowerCase()||config.contract!==CONTRACT||config.chain!==84532)throw Error('Restored worker identity mismatch');
  const size=db.prepare('SELECT count(*) n,coalesce(sum(length(CAST(body AS BLOB))),0) bytes FROM jobs').get(),total=size.n;if(!Number.isSafeInteger(total)||total>maxJobs||size.bytes>16*1024*1024)throw Error('Worker journal exceeds bounded full-review limit');
  const rows=db.prepare('SELECT id,body FROM jobs ORDER BY id').all(),counts={signed:0,unsigned:0,externalReference:0,invalid:0,nonceConflicts:0},nonces=new Set(),digest=createHash('sha256');digest.update(JSON.stringify({environment,expected,config}));
  for(const row of rows){digest.update(JSON.stringify(row)+'\n');const result=inspectJob(row,expected);counts[result.kind]++;if(result.kind==='signed'){if(nonces.has(result.nonce))counts.nonceConflicts++;nonces.add(result.nonce);}}
  db.exec('COMMIT');return {rows,report:{environment,reviewed:total,counts,snapshotDigest:digest.digest('hex'),journalIntegrity:counts.invalid||counts.nonceConflicts?'failed':'passed',networkReconciliation:'not-checked',activation:'review-required',interpretation:'Restored signed-byte/identity checks only; never rebroadcast, replace a nonce or trust historical confirmed state without current chain and evidence reconciliation'}};
 }finally{db.close();}
}
function reviewWorkerJournal(options){return readWorkerSnapshot(options).report;}
// Private operator API: rows contain signed bytes; never log or serve them.
module.exports={reviewWorkerJournal,inspectJob,readWorkerSnapshot};
