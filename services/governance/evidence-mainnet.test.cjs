'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Wallet,keccak256}=require('ethers');
const {GovernanceStore}=require('./store');
const {prepareBatch,inspectEvidence}=require('./evidence.cjs');
const {verifyExport}=require('./evidence-export-verifier.cjs');
const {AVR_EVENTS}=require('../../sdk/typescript/avr-anchor-verifier');
const {BATCH_ABI,batchIdForChain}=require('../../sdk/typescript/base-sepolia-batch-adapter');
const {inspectJob}=require('./recovery-worker-review.cjs');
const {VERSION}=require('../../sdk/typescript/verification-receipt');
const fixture=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
const p={tenant:'org-demo',project:'claims-governance-demo'};
const anchor={chainId:8453,contract:'0x'+'11'.repeat(20),codeHash:keccak256('0x6001')};
const publisher='0x'+'aa'.repeat(20),tx='0x'+'bb'.repeat(32),blockHash='0x'+'cc'.repeat(32);

function productionEvent(){
 const store=new GovernanceStore(':memory:');
 try{store.ingest(fixture.events[0],p);return {...store.get(p,fixture.events[0].eventId),environment:'prod'};}
 finally{store.close();}
}

test('Base mainnet receipt binds chain, contract, event environment and independent proof',async()=>{
 const event=productionEvent(),signer=Wallet.createRandom();let committed;
 const store={pendingEvidence:async()=>[event],commitEvidence:async(_principal,entries)=>{committed=entries;}};
 const batch=await prepareBatch(store,p,signer,{publisher,anchor});
 const bundle=committed[0].bundle;
 assert.equal(bundle.receipt.context.chainId,'8453');
 assert.equal(bundle.receipt.context.anchorContract,anchor.contract);
 assert.equal(batch.transaction.chainId,8453);
 assert.equal(batch.transaction.to,anchor.contract);
 assert.equal((await inspectEvidence(event,bundle,{trustedSigners:[signer.address],anchor})).state,'batched');
 assert.equal((await inspectEvidence(event,bundle,{trustedSigners:[signer.address]})).state,'invalid-evidence');
 const log=AVR_EVENTS.encodeEventLog(AVR_EVENTS.getEvent('ReceiptBatchAnchoredV2'),
  [bundle.batch.id,bundle.batch.root,bundle.batch.publisher,bundle.batch.leafCount,bundle.batch.schemaVersion,100]);
 const provider={getNetwork:async()=>({chainId:8453n}),getCode:async()=> '0x6001',
  getBlockNumber:async()=>111,getBlock:async()=>({number:100,hash:blockHash}),
  getTransactionReceipt:async()=>({status:1,hash:tx,blockNumber:100,blockHash,
   logs:[{address:anchor.contract,...log}]})};
 bundle.transactions.push(tx);
 const verified=await inspectEvidence(event,bundle,{trustedSigners:[signer.address],anchor,provider});
 assert.equal(verified.state,'confirmed');
 assert.equal(verified.chainId,8453);
 assert.equal(verified.explorerUrl,'https://basescan.org/tx/'+tx);
 assert.equal((await verifyExport({event,evidence:bundle},{trustedSigners:[signer.address],anchor,provider})).exportVerification,'verified');
 assert.equal((await verifyExport({event,evidence:bundle},{trustedSigners:[signer.address],provider})).exportVerification,'invalid');
 provider.getNetwork=async()=>({chainId:84532n});
 assert.equal((await inspectEvidence(event,bundle,{trustedSigners:[signer.address],anchor,provider})).state,'verification-failed');
 await assert.rejects(prepareBatch({...store,pendingEvidence:async()=>[{...event,environment:'test'}]},p,signer,{publisher,anchor}),/environment/);
 await assert.rejects(prepareBatch(store,p,signer,{publisher}),/environment/);
});

test('saved mainnet signed bytes require the selected chain and contract',async()=>{
 const signer=Wallet.createRandom(),root='0x'+'33'.repeat(32);
 const id=batchIdForChain(anchor.chainId,anchor.contract,signer.address,root);
 const raw=await signer.signTransaction({type:2,chainId:8453,nonce:0,to:anchor.contract,value:0n,gasLimit:100000n,maxFeePerGas:1000000n,maxPriorityFeePerGas:1000n,data:BATCH_ABI.encodeFunctionData('anchorBatch',[root,1,VERSION])});
 const job={id,state:'signed',raw,hash:keccak256(raw),nonce:0};
 assert.equal(inspectJob({id,body:JSON.stringify(job)},{publisher:signer.address,anchor}).kind,'signed');
 assert.equal(inspectJob({id,body:JSON.stringify(job)},{publisher:signer.address}).kind,'invalid');
 assert.equal(inspectJob({id,body:JSON.stringify(job)},{publisher:signer.address,anchor:{...anchor,contract:'0x'+'22'.repeat(20)}}).kind,'invalid');
});
