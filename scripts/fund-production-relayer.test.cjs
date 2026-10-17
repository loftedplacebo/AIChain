'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {Wallet}=require('ethers');
const fund=require('./fund-production-relayer.cjs');

function fixture(){
 const signer=Wallet.createRandom(),relayer=Wallet.createRandom().address;
 const scope={instance:'a'.repeat(24),relayer,target:200000000000000n,
  request:{reviewId:'first-project-review',tenant:'org-11111111-1111-4111-8111-111111111111',
   project:'prj-22222222-2222-4222-8222-222222222222'}};
 let sent=0,nonce=4,recipientBalance=0n;
 const provider={getNetwork:async()=>({chainId:8453n}),
  getBalance:async address=>address.toLowerCase()===relayer.toLowerCase()?recipientBalance:1000000000000000000n,
  getTransactionCount:async()=>nonce,getFeeData:async()=>({maxFeePerGas:1000000n,maxPriorityFeePerGas:100000n}),
  getCode:async()=> '0x',estimateGas:async()=>21000n,
  getTransactionReceipt:async()=>null,getTransaction:async()=>null,
  broadcastTransaction:async raw=>{sent++;return {hash:require('ethers').Transaction.from(raw).hash};}};
 return {signer,scope,provider,feeOracle:async()=>({l1:1000n,operator:100n}),
  sent:()=>sent,setNonce:value=>{nonce=value;},setBalance:value=>{recipientBalance=value;}};
}

test('reviewed quote and saved bytes fund only the registered relayer',async()=>{
 const x=fixture();
 const review=await fund.quote(x.provider,x.scope,x.feeOracle,x.signer.address);
 assert.equal(review.amount,x.scope.target);
 assert.ok(review.maximumFee<20000000000000n);
 const intent=await fund.prepareIntent(x.provider,x.scope,x.signer,'1000000',
  '220000000000000',x.feeOracle,x.signer.address);
 const tx=fund.validateIntent(intent,x.scope,x.signer.address);
 assert.equal(tx.to.toLowerCase(),x.scope.relayer.toLowerCase());
 assert.equal(tx.value,x.scope.target);
 assert.equal(x.sent(),0);
 const result=await fund.broadcast(x.provider,x.scope,intent,x.feeOracle,x.signer.address);
 assert.equal(result.status,'broadcast-awaiting-independent-verification');
 assert.equal(x.sent(),1);
});

test('fee cap, altered scope, nonce drift and external top-up block a transfer',async()=>{
 const x=fixture();
 await assert.rejects(fund.prepareIntent(x.provider,x.scope,x.signer,'1',
  '220000000000000',x.feeOracle,x.signer.address),/caps/);
 const intent=await fund.prepareIntent(x.provider,x.scope,x.signer,'1000000',
  '220000000000000',x.feeOracle,x.signer.address);
 assert.throws(()=>fund.validateIntent({...intent,to:Wallet.createRandom().address},
  x.scope,x.signer.address),/reviewed/);
 x.setNonce(5);
 await assert.rejects(fund.broadcast(x.provider,x.scope,intent,x.feeOracle,x.signer.address),/nonce/);
 assert.equal(x.sent(),0);
 x.setNonce(4);x.setBalance(1n);
 await assert.rejects(fund.broadcast(x.provider,x.scope,intent,x.feeOracle,x.signer.address),/balance changed/);
 assert.equal(x.sent(),0);
 x.setBalance(0n);
 await assert.rejects(fund.broadcast(x.provider,x.scope,intent,
  async()=>({l1:30000000000000n,operator:0n}),x.signer.address),/fee cap/);
 assert.equal(x.sent(),0);
});

test('protected request binds one paused registry relayer and enforces its cap',
 {skip:process.platform==='win32'},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'production-funding-test-'));
 try{
  const tenant='org-11111111-1111-4111-8111-111111111111';
  const project='prj-22222222-2222-4222-8222-222222222222';
  const instance=createHash('sha256').update(tenant+'\0'+project).digest('hex').slice(0,24);
  const relayer=Wallet.createRandom().address;
  const request={tenant,project,databaseUrlFile:'/etc/aichain/production/worker-database-url',
   rpcUrl:'https://mainnet.base.org',fundingTargetWei:'200000000000000',reviewId:'review-001',
   workerPolicy:{batchSize:10,maxTransactionsPerHour:2,maxGasPriceWei:'1000000000',
    dailyReservationWei:'100000000000000',l1AllowanceWei:'20000000000000'}};
  const registry={version:1,environment:'prod',chain:{chainId:8453,
   contract:'0xcF3A904b433c50E2d4F6E2a0d692E855d33910f2',
   codeHash:'0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f'},
   workers:[{tenant,project,role:'worker_'+instance,
    unit:`orvessian-production-project-worker@${instance}.service`,
    state:'paused',relayer}]};
  const requestFile=path.join(root,'request.json'),registryFile=path.join(root,'registry.json');
  const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});
  save(requestFile,request);save(registryFile,registry);
  assert.equal(fund.binding(requestFile,{registryFile}).relayer,relayer);
  save(requestFile,{...request,fundingTargetWei:'200000000000001'});
  assert.throws(()=>fund.binding(requestFile,{registryFile}),/reviewed policy/);
  save(requestFile,request);
  save(registryFile,{...registry,chain:{...registry.chain,chainId:84532}});
  assert.throws(()=>fund.binding(requestFile,{registryFile}),/registry/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
