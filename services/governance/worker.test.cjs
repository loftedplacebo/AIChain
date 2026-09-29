const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Wallet,keccak256,Transaction}=require('ethers');
const {GovernanceStore}=require('./store');const {GovernanceWorker}=require('./worker.cjs');const {CONTRACT}=require('./evidence.cjs');
const {AVR_EVENTS}=require('../../sdk/typescript/avr-anchor-verifier');
const fixture=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
function setup(policy={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'governance-worker-')),store=new GovernanceStore(path.join(dir,'events.sqlite')),p={tenant:fixture.events[0].tenantRef,project:fixture.events[0].projectRef};
 for(const event of fixture.events.slice(0,3))store.ingest(event,p);
 const recorder=Wallet.createRandom(),signer=Wallet.createRandom();let now=Date.now(),receipt=null,failBroadcast=false;const sent=[];
 const provider={getNetwork:async()=>({chainId:84532n}),getCode:async()=> '0x6001',estimateGas:async()=>100000n,getFeeData:async()=>({maxFeePerGas:100n,maxPriorityFeePerGas:1n}),getBalance:async()=>10n**18n,getTransactionCount:async()=>0,getBlockNumber:async()=>120,getBlock:async()=>({number:100,hash:'0x'+'ab'.repeat(32)}),getTransactionReceipt:async()=>receipt,broadcastTransaction:async raw=>{sent.push(raw);if(failBroadcast)throw Error('Timeout after send');return {hash:keccak256(raw)};}};
 const options={store,principal:p,recorder,signer,provider,journal:path.join(dir,'journal.sqlite'),policy:{paused:false,...policy},clock:()=>now,codeHash:keccak256('0x6001')};let worker=new GovernanceWorker(options);
 return {store,p,recorder,signer,provider,options,sent,get worker(){return worker;},fail(){failBroadcast=true;},advance(){now+=400000;},async restart(){await worker.close();worker=new GovernanceWorker(options);},confirm(){const job=worker.jobs()[0],b=store.batchEvidence(p,job.id)[0].bundle.batch;receipt={hash:job.hash,status:1,blockNumber:100,blockHash:'0x'+'ab'.repeat(32),logs:[{address:CONTRACT,...AVR_EVENTS.encodeEventLog(AVR_EVENTS.getEvent('ReceiptBatchAnchoredV2'),[b.id,b.root,b.publisher,b.leafCount,b.schemaVersion,1])}]};},async close(){await worker.close();store.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('uncertain broadcast survives restart and retries exactly the same signed transaction',async()=>{const x=setup();try{assert.equal((await x.worker.tick()).state,'prepared');x.fail();assert.equal((await x.worker.tick()).state,'broadcast-uncertain');const first=x.sent[0];assert.equal(Transaction.from(first).nonce,0);assert.equal(x.worker.jobs().length,1);await x.restart();assert.equal((await x.worker.tick()).state,'backoff');x.advance();await x.worker.tick();assert.equal(x.sent[1],first);x.confirm();assert.equal((await x.worker.tick()).state,'idle');assert.equal(x.worker.jobs()[0].state,'confirmed');assert.ok(x.store.batchEvidence(x.p,x.worker.jobs()[0].id).every(e=>e.bundle.transactions.length===1));await x.restart();await x.worker.tick();assert.equal(x.sent.length,2);}finally{await x.close();}});
test('crash after evidence commit rediscovers prepared batch and concurrent ticks never allocate twice',async()=>{const x=setup();try{await x.worker.tick();assert.equal(x.worker.jobs().length,0);await x.restart();await Promise.all([x.worker.tick(),x.worker.tick()]);assert.equal(x.sent.length,1);assert.equal(x.worker.jobs().length,1);assert.throws(()=>new GovernanceWorker(x.options),/EEXIST/);}finally{await x.close();}});
test('paused, wrong chain, fee cap, budget and funding gates prevent broadcast',async()=>{const x=setup({paused:true});try{assert.equal((await x.worker.tick()).state,'paused');x.worker.policy.paused=false;await x.worker.tick();x.provider.getNetwork=async()=>({chainId:1n});await assert.rejects(x.worker.tick(),/Unexpected chain/);x.provider.getNetwork=async()=>({chainId:84532n});x.worker.policy.maxGasPriceWei='1';assert.equal((await x.worker.tick()).state,'fee-cap');x.worker.policy.maxGasPriceWei='1000';x.worker.policy.dailyReservationWei='1';assert.equal((await x.worker.tick()).state,'budget-cap');x.worker.policy.dailyReservationWei='1000000000000000';x.provider.getBalance=async()=>0n;assert.equal((await x.worker.tick()).state,'needs-funding');assert.equal(x.sent.length,0);}finally{await x.close();}});

test('publisher access revoked during signing prevents send and preserves the signed retry journal',async()=>{
 const x=setup();try{
  let allowed=true,checks=0;x.store.assertPublisherActive=async()=>{checks++;if(!allowed)throw Error('Publisher recovery review required');};
  await x.worker.tick();const sign=x.signer.signTransaction.bind(x.signer);x.signer.signTransaction=async tx=>{const raw=await sign(tx);allowed=false;return raw;};
  await assert.rejects(x.worker.tick(),/Publisher recovery review/);const job={...x.worker.jobs()[0]};assert.equal(job.state,'signed');assert.ok(job.raw);assert.equal(x.sent.length,0);assert.equal(checks,3);
  await assert.rejects(x.worker.tick(),/Publisher recovery review/);assert.equal(x.sent.length,0);assert.deepEqual(x.worker.jobs()[0],job);
  allowed=true;assert.equal((await x.worker.tick()).state,'submitted');assert.equal(x.sent.length,1);assert.equal(x.sent[0],job.raw);assert.equal(x.worker.jobs()[0].nonce,job.nonce);
 }finally{await x.close();}
});
test('RPC outage does not resend or release nonce; reorg reuses original signed bytes',async()=>{const x=setup();try{await x.worker.tick();await x.worker.tick();x.confirm();await x.worker.tick();x.provider.getBlock=async()=>{throw Error('offline');};assert.equal((await x.worker.tick()).state,'unavailable');assert.equal(x.sent.length,1);x.provider.getBlock=async()=>({hash:'0x'+'cd'.repeat(32)});x.advance();await x.worker.tick();assert.equal(x.sent.length,2);assert.equal(x.sent[0],x.sent[1]);}finally{await x.close();}});

test('worker binds journal release to actual signer, recorder, scope, runtime code and current policy before preparing or sending',async()=>{
 const x=setup();try{
  const bindingModule=require('./publisher-release-binding.cjs'),releaseId=require('node:crypto').randomUUID(),expected={...x.p,releaseId,publisher:x.signer.address,recorder:x.recorder.address,codeHash:x.options.codeHash,policyDigest:bindingModule.policyDigest(x.worker.policy)};x.store.assertPublisherActive=async observed=>{if(!bindingModule.sameBinding(expected,observed))throw Error('Publisher release binding mismatch');};
  await assert.rejects(x.worker.tick(),/binding mismatch/);assert.equal(x.worker.jobs().length,0);assert.equal(x.sent.length,0);x.worker.db.exec('CREATE TABLE governance_publisher_release(singleton INTEGER PRIMARY KEY,body TEXT)');x.worker.db.prepare('INSERT INTO governance_publisher_release VALUES(1,?)').run(JSON.stringify({releaseId}));assert.equal((await x.worker.tick()).state,'prepared');
  const originalFee=x.worker.policy.maxGasPriceWei;x.worker.policy.maxGasPriceWei='999';await assert.rejects(x.worker.tick(),/binding mismatch/);assert.equal(x.sent.length,0);x.worker.policy.maxGasPriceWei=originalFee;x.worker.db.prepare('UPDATE governance_publisher_release SET body=?').run(JSON.stringify({releaseId:require('node:crypto').randomUUID()}));await assert.rejects(x.worker.tick(),/binding mismatch/);assert.equal(x.sent.length,0);x.worker.db.prepare('UPDATE governance_publisher_release SET body=?').run(JSON.stringify({releaseId}));assert.equal((await x.worker.tick()).state,'submitted');assert.equal(x.sent.length,1);
 }finally{await x.close();}
});

test('actual worker reservation survives snapshot and passes offline current-policy review without another send',async()=>{
 const x=setup();try{
  await x.worker.tick();x.fail();await x.worker.tick();const {backup,DatabaseSync}=require('node:sqlite'),file=path.join(path.dirname(x.options.journal),'review-snapshot.sqlite');await backup(x.worker.db,file);const db=new DatabaseSync(file);try{db.exec("PRAGMA journal_mode=DELETE; CREATE TABLE governance_environment(name TEXT); INSERT INTO governance_environment VALUES('test'); CREATE TABLE governance_recovery_gate(singleton INTEGER PRIMARY KEY,state TEXT); INSERT INTO governance_recovery_gate VALUES(1,'review-required')");}finally{db.close();}
  const fields=['batchSize','maxTransactionsPerHour','maxGasPriceWei','dailyReservationWei','l1AllowanceWei'],policy=Object.fromEntries(fields.map(k=>[k,x.worker.policy[k]])),before=fs.readFileSync(file),result=require('./recovery-worker-spend.cjs').reviewWorkerSpend({environment:'test',file,expected:{tenant:x.p.tenant,project:x.p.project,publisher:x.signer.address.toLowerCase(),recorder:x.recorder.address.toLowerCase()},policy,now:x.options.clock()});
  assert.equal(result.spendReview,'compatible-with-recorded-state');assert.equal(result.counts.signed,1);assert.equal(result.recentReservedWei,x.worker.jobs()[0].reserve);assert.equal(result.activation,'review-required');assert.deepEqual(fs.readFileSync(file),before);assert.equal(x.sent.length,1);
 }finally{await x.close();}
});

test('uncertain retry rechecks signed bytes and current policy without replacing or reallocating a nonce',async()=>{
 const x=setup();try{
  await x.worker.tick();x.fail();await x.worker.tick();x.advance();const original={...x.worker.jobs()[0]},policy={...x.worker.policy};assert.equal(x.sent.length,1);
  x.worker.policy.maxGasPriceWei='99';assert.equal((await x.worker.tick()).state,'fee-cap');x.worker.policy.maxGasPriceWei=policy.maxGasPriceWei;
  x.worker.policy.batchSize=1;assert.equal((await x.worker.tick()).state,'batch-policy-review-required');x.worker.policy.batchSize=policy.batchSize;
  x.worker.policy.l1AllowanceWei=(BigInt(policy.l1AllowanceWei)+1n).toString();assert.equal((await x.worker.tick()).state,'reservation-review-required');x.worker.policy.l1AllowanceWei=policy.l1AllowanceWei;
  x.worker.save({...original,reserve:'1'});assert.equal((await x.worker.tick()).state,'reservation-review-required');x.worker.save({...original,signedAt:x.options.clock()+1});assert.equal((await x.worker.tick()).state,'reservation-review-required');
  x.worker.save({...original,signedAt:x.options.clock()-86400001});x.worker.policy.dailyReservationWei=(BigInt(original.reserve)-1n).toString();assert.equal((await x.worker.tick()).state,'budget-cap');x.worker.policy.dailyReservationWei=policy.dailyReservationWei;
  x.worker.save({...original,nonce:original.nonce+1});await assert.rejects(x.worker.tick(),/journal review/);assert.equal(x.sent.length,1);
  x.worker.save(original);const restored=x.worker.jobs()[0];assert.equal(restored.raw,original.raw);assert.equal(restored.hash,original.hash);assert.equal(restored.nonce,original.nonce);assert.equal(restored.reserve,original.reserve);assert.equal((await x.worker.tick()).state,'broadcast-uncertain');assert.equal(x.sent.length,2);assert.equal(x.sent[1],x.sent[0]);
 }finally{await x.close();}
});
