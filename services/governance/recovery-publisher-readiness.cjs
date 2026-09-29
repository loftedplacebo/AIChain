'use strict';
// Offline dev/test observations only. Never acquire a wallet or change a gate.
const {createHash}=require('node:crypto'),{keccak256}=require('ethers');
const {CONTRACT}=require('./evidence.cjs'),{readWorkerSnapshot}=require('./recovery-worker-review.cjs');
const {reviewWorkerEvidence}=require('./recovery-worker-evidence.cjs'),{reviewWorkerNonces}=require('./recovery-worker-nonces.cjs'),{reviewWorkerSpend}=require('./recovery-worker-spend.cjs');
const methods=['getNetwork','getCode','getTransactionReceipt','getBlockNumber','getBlock','getTransactionCount'];
async function reviewPublisherReadiness(pool,options){
 const {provider,codeHash}=options;if(typeof codeHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(codeHash)||!provider||methods.some(m=>typeof provider[m]!=='function'))throw Error('Explicit read-only publisher provider and reviewed runtime fingerprint required');
 const initial=readWorkerSnapshot(options);if(initial.report.journalIntegrity!=='passed')throw Error('Publisher journal integrity must pass');
 const deadline=Date.now()+90000;
 const readonly=Object.fromEntries(methods.map(method=>[method,async(...args)=>{if(Date.now()>=deadline)throw Error('Publisher readiness review exceeded bounded duration');let timer;try{return await Promise.race([Promise.resolve().then(()=>provider[method](...args)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Publisher readiness RPC observation timeout')),Math.min(5000,deadline-Date.now()));})]);}finally{clearTimeout(timer);}}]));
 const network=await readonly.getNetwork(),code=await readonly.getCode(CONTRACT);if(Number(network?.chainId)!==84532||keccak256(code)!==codeHash.toLowerCase())throw Error('Publisher network or runtime fingerprint mismatch');
 const spend=reviewWorkerSpend(options),evidence=await reviewWorkerEvidence(pool,{...options,provider:readonly}),nonces=await reviewWorkerNonces({...options,provider:readonly});
 if(spend.snapshotDigest!==initial.report.snapshotDigest||nonces.snapshotDigest!==initial.report.snapshotDigest)throw Error('Publisher journal changed between readiness observations');
 // Re-read PG and journal after RPC observations. This is drift detection,
 // not an atomic snapshot across the external chain and two local stores.
 const finalEvidence=await reviewWorkerEvidence(pool,{...options,provider:null});if(finalEvidence.snapshotDigest!==evidence.snapshotDigest||readWorkerSnapshot(options).report.snapshotDigest!==initial.report.snapshotDigest)throw Error('Publisher evidence or journal changed during readiness review');
 const pinned=await readonly.getBlock(nonces.observation.blockNumber);if(pinned?.number!==nonces.observation.blockNumber||pinned?.hash?.toLowerCase()!==nonces.observation.blockHash)throw Error('Publisher nonce observation block changed before readiness report');
 if(Date.now()>deadline)throw Error('Publisher readiness review exceeded bounded duration');
 const blockers=[];
 if(initial.report.counts.externalReference)blockers.push('external-transactions-unresolved');
 if(evidence.missingJournalBatches)blockers.push('publisher-batches-missing-journal');
 if(evidence.transactionLinkRepairs)blockers.push('transaction-links-require-repair');
 if(Object.entries(evidence.counts).some(([state,count])=>count&&!['confirmed','prepared'].includes(state))||(evidence.counts.confirmed||0)!==initial.report.counts.signed)blockers.push('canonical-signed-evidence-unresolved');
 if(spend.spendReview!=='compatible-with-recorded-state')blockers.push('current-spend-policy-incompatible');
 if(nonces.counts.consumed!==initial.report.counts.signed||nonces.observation.pendingNonce!==nonces.observation.confirmedNonce)blockers.push('publisher-nonce-activity-unresolved');
 const observations={journalDigest:initial.report.snapshotDigest,evidenceDigest:evidence.snapshotDigest,spendDigest:spend.observationDigest,nonceDigest:nonces.observationDigest,codeHash:codeHash.toLowerCase(),minimumConfirmations:options.minimumConfirmations??12};
 return {environment:options.environment,restoreId:options.restoreId,reviewedJobs:initial.report.reviewed,reviewedEvidence:evidence.reviewedEvidence,counts:initial.report.counts,blockers,localReadiness:blockers.length?'requires-reconciliation':'ready-for-independent-release-review',snapshotDigest:createHash('sha256').update(JSON.stringify(observations)).digest('hex'),observations,nonceObservation:nonces.observation,activation:'review-required',actualFees:'not-reconciled',postBackupActivity:'not-enumerated',custodyAndOwnership:'not-checked',otherPublishers:'not-reviewed',otherPublisherBatches:evidence.otherPublisherBatches,interpretation:'Bounded scoped observations only. Independent actual-fee/account-activity/custody/ownership and operational approvals remain mandatory. No gate, journal, credential, nonce, transaction or reservation is changed'};
}
module.exports={reviewPublisherReadiness};
