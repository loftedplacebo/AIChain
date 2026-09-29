'use strict';
const {createHash}=require('node:crypto');
const {readWorkerSnapshot,inspectJob}=require('./recovery-worker-review.cjs');
const blockHash=v=>typeof v==='string'&&/^0x[0-9a-fA-F]{64}$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>=0;

// Operator-only, read-only observations. No wallet, signing or sending interface.
async function reviewWorkerNonces({environment,file,expected,maxJobs=1000,provider,timeoutMs=5000,nonceBlock=null}){
 if(!provider||!['getNetwork','getBlock','getTransactionCount'].every(m=>typeof provider[m]==='function')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)throw Error('Bounded read-only nonce provider required');
 if(nonceBlock&&(!integer(nonceBlock.number)||!blockHash(nonceBlock.hash)||Object.keys(nonceBlock).sort().join(',')!=='hash,number'))throw Error('Exact reviewed nonce checkpoint required');
 const snapshot=readWorkerSnapshot({environment,file,expected,maxJobs});
 if(snapshot.report.journalIntegrity!=='passed')throw Error('Worker journal integrity must pass before nonce review');
 const deadline=Date.now()+30000;
 async function observe(method,...args){
  if(Date.now()>=deadline)throw Error('Nonce review exceeded bounded duration');
  let timer;
  try{return await Promise.race([Promise.resolve().then(()=>provider[method](...args)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Recovery nonce observation timeout')),Math.min(timeoutMs,deadline-Date.now()));})]);}
  finally{clearTimeout(timer);}
 }
 const network=await observe('getNetwork');
 if(network?.chainId!==84532n&&network?.chainId!==84532)throw Error('Recovery nonce network mismatch');
 const head=await observe('getBlock','latest');
 if(!head||!integer(head.number)||!blockHash(head.hash))throw Error('Canonical nonce observation block required');
 let block=head;if(nonceBlock){block=await observe('getBlock',nonceBlock.number);if(head.number<nonceBlock.number||block?.number!==nonceBlock.number||block?.hash?.toLowerCase()!==nonceBlock.hash.toLowerCase())throw Error('Reviewed nonce checkpoint changed or head regressed');}
 const confirmedNonce=await observe('getTransactionCount',expected.publisher,block.number);
 const pendingNonce=await observe('getTransactionCount',expected.publisher,'pending');
 if(!integer(confirmedNonce)||!integer(pendingNonce)||pendingNonce<confirmedNonce)throw Error('Inconsistent publisher nonce observations');
 const canonical=await observe('getBlock',block.number);
 if(canonical?.number!==block.number||canonical?.hash?.toLowerCase()!==block.hash.toLowerCase())throw Error('Nonce observation block changed');
 const counts={consumed:0,pendingOrAdvanced:0,atObservedPendingNonce:0,future:0,unsigned:snapshot.report.counts.unsigned,externalReference:snapshot.report.counts.externalReference};
 for(const row of snapshot.rows){
  const job=inspectJob(row,expected);if(job.kind!=='signed')continue;
  if(job.nonce<confirmedNonce)counts.consumed++;
  else if(job.nonce<pendingNonce)counts.pendingOrAdvanced++;
  else if(job.nonce===pendingNonce)counts.atObservedPendingNonce++;
  else counts.future++;
 }
 if(readWorkerSnapshot({environment,file,expected,maxJobs}).report.snapshotDigest!==snapshot.report.snapshotDigest)throw Error('Worker journal changed during nonce review');
 const observation={chainId:84532,blockNumber:block.number,blockHash:block.hash.toLowerCase(),confirmedNonce,pendingNonce};
 return {environment,reviewedJobs:snapshot.rows.length,observedAt:new Date().toISOString(),observation,counts,
  snapshotDigest:snapshot.report.snapshotDigest,observationDigest:createHash('sha256').update(JSON.stringify({snapshotDigest:snapshot.report.snapshotDigest,observation,counts})).digest('hex'),
  activation:'review-required',postBackupActivity:'not-enumerated',
  interpretation:'Nonce observations do not identify which transaction consumed a nonce. Pending can include newly mined work or incomplete provider mempool visibility. Every signed job still needs canonical receipt/evidence reconciliation; no observation authorizes sending, replacement or activation'};
}
module.exports={reviewWorkerNonces};
