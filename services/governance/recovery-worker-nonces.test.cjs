'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{Wallet,keccak256}=require('ethers');
const {reviewWorkerNonces}=require('./recovery-worker-nonces.cjs'),{CONTRACT}=require('./evidence.cjs');
const {BATCH_ABI,baseBatchId}=require('../../sdk/typescript/base-sepolia-batch-adapter'),{VERSION}=require('../../sdk/typescript/verification-receipt');
async function fixture(run){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-nonce-review-')),file=path.join(directory,'worker.sqlite'),db=new DatabaseSync(file),signer=Wallet.createRandom();
 const expected={tenant:'synthetic',project:'test',publisher:signer.address.toLowerCase(),recorder:Wallet.createRandom().address.toLowerCase()};
 try{
  db.exec("CREATE TABLE governance_environment(name TEXT); INSERT INTO governance_environment VALUES('test'); CREATE TABLE governance_recovery_gate(state TEXT); INSERT INTO governance_recovery_gate VALUES('review-required'); CREATE TABLE config(id INTEGER PRIMARY KEY,body TEXT); CREATE TABLE jobs(id TEXT PRIMARY KEY,body TEXT)");
  db.prepare('INSERT INTO config VALUES(1,?)').run(JSON.stringify({scope:{tenant:expected.tenant,project:expected.project},publisher:expected.publisher,recorder:expected.recorder,contract:CONTRACT,chain:84532}));
  for(const nonce of [6,7,8,10]){
   const root='0x'+nonce.toString(16).padStart(64,'0'),id=baseBatchId(CONTRACT,expected.publisher,root),raw=await signer.signTransaction({type:2,chainId:84532,nonce,to:CONTRACT,data:BATCH_ABI.encodeFunctionData('anchorBatch',[root,1,VERSION]),value:0,gasLimit:100000,maxFeePerGas:100,maxPriorityFeePerGas:1});
   db.prepare('INSERT INTO jobs VALUES(?,?)').run(id,JSON.stringify({id,raw,hash:keccak256(raw),nonce,state:'confirmed'}));
  }
  const hash='0x'+'ab'.repeat(32),calls=[];
  const provider={getNetwork:async()=>({chainId:84532n}),getBlock:async tag=>{calls.push(['block',tag]);return {number:100,hash};},getTransactionCount:async(address,tag)=>{calls.push(['nonce',address,tag]);return tag==='pending'?8:7;}};
  await run({environment:'test',file,expected,provider},db,calls);
 }finally{db.close();const resolved=fs.realpathSync(directory);if(path.dirname(resolved)!==fs.realpathSync(os.tmpdir())||!path.basename(resolved).startsWith('synthetic-nonce-review-'))throw Error('Unsafe synthetic cleanup target');fs.rmSync(resolved,{recursive:true,force:true});}
}
test('actual signed restored jobs classify nonce observations without writes or activation',async()=>fixture(async(options,db,calls)=>{
 const prepared='0x'+'dd'.repeat(32),external='0x'+'ee'.repeat(32);
 db.prepare('INSERT INTO jobs VALUES(?,?)').run(prepared,JSON.stringify({id:prepared,state:'prepared'}));
 db.prepare('INSERT INTO jobs VALUES(?,?)').run(external,JSON.stringify({id:external,state:'external',hash:'0x'+'ff'.repeat(32)}));
 const before=fs.readFileSync(options.file),result=await reviewWorkerNonces(options);
 assert.deepEqual(result.counts,{consumed:1,pendingOrAdvanced:1,atObservedPendingNonce:1,future:1,unsigned:1,externalReference:1});
 assert.equal(result.activation,'review-required');assert.equal(result.postBackupActivity,'not-enumerated');
 assert.deepEqual(calls.map(c=>[c[0],c.at(-1)]),[['block','latest'],['nonce',100],['nonce','pending'],['block',100]]);
 assert.ok(!JSON.stringify(result).includes(options.expected.publisher));assert.ok(!JSON.stringify(result).includes('raw'));assert.deepEqual(fs.readFileSync(options.file),before);
 assert.equal(db.prepare('SELECT state FROM governance_recovery_gate').get().state,'review-required');
}));
test('wrong network, malformed/nonmonotonic counts, reorg and RPC failure refuse nonce reports',async()=>fixture(async(options)=>{
 await assert.rejects(reviewWorkerNonces({...options,provider:{...options.provider,getNetwork:async()=>({chainId:1n})}}),/network mismatch/);
 for(const value of [-1,7.5,Number.MAX_SAFE_INTEGER+1,'7',null])await assert.rejects(reviewWorkerNonces({...options,provider:{...options.provider,getTransactionCount:async()=>value}}),/Inconsistent/);
 await assert.rejects(reviewWorkerNonces({...options,provider:{...options.provider,getTransactionCount:async(a,t)=>t==='pending'?6:7}}),/Inconsistent/);
 await assert.rejects(reviewWorkerNonces({...options,provider:{...options.provider,getBlock:async t=>({number:100,hash:'0x'+(t==='latest'?'ab':'cd').repeat(32)})}}),/block changed/);
 await assert.rejects(reviewWorkerNonces({...options,provider:{...options.provider,getBlock:async()=>{throw Error('synthetic outage');}}}),/synthetic outage/);
 await assert.rejects(reviewWorkerNonces({...options,timeoutMs:10,provider:{...options.provider,getTransactionCount:async()=>new Promise(()=>{})}}),/observation timeout/);
}));
test('journal drift, over-limit review and wrong environment fail closed',async()=>fixture(async(options,db)=>{
 await assert.rejects(reviewWorkerNonces({...options,maxJobs:3}),/full-review limit/);
 await assert.rejects(reviewWorkerNonces({...options,environment:'dev'}),/mismatch/);
 const provider={...options.provider,getTransactionCount:async(a,t)=>{if(t==='pending')db.prepare('UPDATE jobs SET body=json_set(body,\'$.state\',\'submitted\')').run();return t==='pending'?8:7;}};
 await assert.rejects(reviewWorkerNonces({...options,provider}),/changed during nonce review/);
 assert.equal(db.prepare('SELECT state FROM governance_recovery_gate').get().state,'review-required');
}));
test('invalid signed journal is rejected before any provider observation',async()=>fixture(async(options,db,calls)=>{
 db.prepare('UPDATE jobs SET body=json_set(body,\'$.nonce\',99)').run();
 await assert.rejects(reviewWorkerNonces(options),/integrity must pass/);assert.equal(calls.length,0);
}));

test('reviewed nonce checkpoint permits head advancement but refuses a replaced checkpoint or regressed head',async()=>fixture(async(options)=>{
 const hash='0x'+'ab'.repeat(32),nonceBlock={number:100,hash},provider={...options.provider,getBlock:async tag=>({number:tag==='latest'?102:100,hash:tag==='latest'?'0x'+'cd'.repeat(32):hash})};
 const result=await reviewWorkerNonces({...options,provider,nonceBlock});assert.equal(result.observation.blockNumber,100);assert.equal(result.observation.blockHash,hash);
 await assert.rejects(reviewWorkerNonces({...options,nonceBlock,provider:{...provider,getBlock:async tag=>({number:tag==='latest'?102:100,hash:'0x'+'cd'.repeat(32)})}}),/checkpoint changed/);
 await assert.rejects(reviewWorkerNonces({...options,nonceBlock,provider:{...provider,getBlock:async tag=>({number:tag==='latest'?99:100,hash})}}),/head regressed/);
}));
