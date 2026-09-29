'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{Wallet}=require('ethers');
const {inspectRow}=require('./recovery-evidence-review.cjs'),{canonicalize}=require('../../sdk/typescript/receipt'),{GovernanceStore}=require('./store'),{prepareBatch}=require('./evidence.cjs');
test('recovery verifies real signatures/proofs and detects data, trust and queue mismatches',async()=>{
 const store=new GovernanceStore(':memory:'),p={tenant:'org-demo',project:'claims-governance-demo'},input=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json').events[0],signer=Wallet.createRandom();
 try{
  store.ingest(input,p);const body=store.get(p,input.eventId),submitted={...body};delete submitted.receivedAt;
  const row={...p,tenant:p.tenant,project:p.project,id:body.eventId,digest:createHash('sha256').update(canonicalize(submitted)).digest('hex'),received:body.receivedAt,body,status:'pending',bundle:null,revision:null,batch_id:null};
  assert.equal(await inspectRow(row,[signer.address]),'unsigned-pending');assert.equal(await inspectRow({...row,status:'submitted'},[signer.address]),'queue-mismatch');
  await prepareBatch(store,p,signer,{publisher:signer.address});const evidence=store.evidence(p,body.eventId);Object.assign(row,{status:'batched',bundle:evidence.bundle,revision:1,batch_id:evidence.bundle.batch.id});
  assert.equal(await inspectRow(row,[signer.address]),'signed-batched');assert.equal(await inspectRow(row,[Wallet.createRandom().address]),'untrusted-signer');assert.equal(await inspectRow({...row,digest:'bad'},[signer.address]),'record-mismatch');assert.equal(await inspectRow({...row,batch_id:'bad'},[signer.address]),'queue-mismatch');assert.equal(await inspectRow({...row,status:'submitted'},[signer.address]),'queue-mismatch');
  const changed=structuredClone(row);changed.bundle.signature='0x'+'00'.repeat(65);assert.equal(await inspectRow(changed,[signer.address]),'invalid-evidence');
  const transaction=structuredClone(row);transaction.bundle.transactions=['0x'+'ab'.repeat(32)];transaction.status='submitted';assert.equal(await inspectRow(transaction,[signer.address]),'submitted-offline');
 }finally{store.close();}
});
