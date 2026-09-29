'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {Wallet}=require('ethers');
const {GovernanceStore}=require('./store');
const {prepareBatch,attachTransaction}=require('./evidence.cjs');
const {outcome,verifyExport}=require('./evidence-export-verifier.cjs');
const fixture=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');

test('independent export verification does not pass on API summary, signed-only evidence or a submitted hash',async t=>{
 const store=new GovernanceStore(':memory:');t.after(()=>store.close());
 const p={tenant:'org-demo',project:'claims-governance-demo'},signer=Wallet.createRandom();
 store.ingest(fixture.events[0],p);
 const batch=await prepareBatch(store,p,signer,{publisher:'0x'+'aa'.repeat(20)});
 const event=store.get(p,fixture.events[0].eventId);
 const exported=()=>({event,evidence:store.evidence(p,event.eventId).bundle,verification:{state:'confirmed'}});
 const options={trustedSigners:[signer.address]};
 let result=await verifyExport(exported(),options);
 assert.equal(result.state,'batched');assert.equal(result.exportVerification,'incomplete');assert.equal(result.exitCode,2);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'governance-export-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const file=path.join(directory,'evidence.json');fs.writeFileSync(file,JSON.stringify(exported()));
 const cli=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/governance-evidence.cjs'),'verify',file],{encoding:'utf8',env:{...process.env,GOVERNANCE_RECEIPT_SIGNERS:JSON.stringify([signer.address]),GOVERNANCE_EVIDENCE_RPC_URL:''}});
 assert.equal(cli.status,2);assert.equal(JSON.parse(cli.stdout).exportVerification,'incomplete');
 fs.writeFileSync(file,'{"private":"private-source-content","private":"duplicate"}');
 const malformed=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/governance-evidence.cjs'),'verify',file],{encoding:'utf8',env:{...process.env,GOVERNANCE_RECEIPT_SIGNERS:JSON.stringify([signer.address]),GOVERNANCE_EVIDENCE_RPC_URL:''}});
 assert.equal(malformed.status,1);assert.doesNotMatch(malformed.stderr,/private-source-content/);
 await attachTransaction(store,p,batch.batchId,'0x'+'bb'.repeat(32));
 result=await verifyExport(exported(),options);assert.equal(result.state,'submitted');assert.equal(result.exitCode,2);
 result=await verifyExport({...exported(),event:{...event,agentRef:'altered'}},options);assert.equal(result.state,'invalid-evidence');assert.equal(result.exitCode,1);
 result=await verifyExport(exported(),{trustedSigners:['0x'+'cc'.repeat(20)]});assert.equal(result.state,'untrusted-signer');assert.equal(result.exitCode,1);
});

test('only a trusted fully confirmed result can report a passing export',()=>{
 const confirmed={state:'confirmed',signature:'valid',trustedSigner:true,recordCommitment:true,batchMembership:true,confirmations:12,minimumConfirmations:12};
 assert.deepEqual(outcome(confirmed),{exportVerification:'verified',exitCode:0});
 assert.equal(outcome({...confirmed,confirmations:11}).exitCode,1);
 assert.equal(outcome({...confirmed,recordCommitment:false}).exitCode,1);
 assert.equal(outcome({state:'unavailable'}).exitCode,2);
 assert.equal(outcome({state:'reorg-detected'}).exitCode,1);
});
