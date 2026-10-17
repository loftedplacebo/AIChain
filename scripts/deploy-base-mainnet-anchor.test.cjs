'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Wallet,Interface,getCreateAddress}=require('ethers');
const {quote,prepareIntent,validateIntent,broadcastIntent,protectedFile}=require('./deploy-base-mainnet-anchor.cjs');

const manifest={creation:{data:'0x60016000'}};
const oracle=new Interface([
 'function getL1Fee(bytes) view returns (uint256)',
 'function getOperatorFee(uint256) view returns (uint256)',
]);
const ESTIMATED_TOTAL='12500000003000';
function fixture(overrides={}){
 let broadcasts=0;
 const provider={
  getNetwork:async()=>({chainId:8453n}),
  getTransactionCount:async()=>3,
  estimateGas:async()=>100000n,
  getFeeData:async()=>({maxFeePerGas:100000000n,maxPriorityFeePerGas:1000000n}),
  getBalance:async()=>10000000000000000n,
  getTransactionReceipt:async()=>null,
  getTransaction:async()=>null,
  getCode:async()=> '0x',
  call:async ({data})=>{
   const request=oracle.parseTransaction({data});
   if(request.name==='getL1Fee')return oracle.encodeFunctionResult('getL1Fee',[1000n]);
   if(request.name==='getOperatorFee')return oracle.encodeFunctionResult('getOperatorFee',[2000n]);
   throw Error('Unexpected oracle call');
  },
  broadcastTransaction:async raw=>{broadcasts++;return {hash:require('ethers').keccak256(raw)};},
  ...overrides,
 };
 return {provider,broadcasts:()=>broadcasts};
}
test('one reviewed signed creation intent enforces fee, balance and chain',async()=>{
 const signer=Wallet.createRandom();
 const setup=fixture();
 const review=await quote({provider:setup.provider,address:signer.address,manifest});
 assert.equal(review.gasLimit,125000n);
 assert.equal(review.l1DataFee,1000n);
 assert.equal(review.operatorFee,2000n);
 assert.equal(review.estimatedTotal,BigInt(ESTIMATED_TOTAL));
 const intent=await prepareIntent({provider:setup.provider,signer,manifest,
  maxFeeWei:'100000000',maxTotalWei:ESTIMATED_TOTAL});
 assert.equal(intent.estimatedTotalAtPrepareWei,ESTIMATED_TOTAL);
 assert.equal(intent.contractAddress,getCreateAddress({from:signer.address,nonce:3}));
 assert.equal(validateIntent(intent,manifest).hash,intent.transactionHash);
 assert.equal(setup.broadcasts(),0);
 await assert.rejects(prepareIntent({provider:setup.provider,signer,manifest,
  maxFeeWei:'99999999',maxTotalWei:'12500000000000'}),/limit exceeded/);
 await assert.rejects(prepareIntent({provider:setup.provider,signer,manifest,
  maxFeeWei:'100000000',maxTotalWei:'12500000000000'}),/limit exceeded/);
 await assert.rejects(prepareIntent({provider:fixture({getNetwork:async()=>({chainId:84532n})}).provider,
  signer,manifest,maxFeeWei:'100000000',maxTotalWei:ESTIMATED_TOTAL}),/Base mainnet/);
 await assert.rejects(prepareIntent({provider:fixture({getBalance:async()=>1n}).provider,
  signer,manifest,maxFeeWei:'100000000',maxTotalWei:ESTIMATED_TOTAL}),/limit exceeded/);
 assert.throws(()=>validateIntent({...intent,estimatedTotalAtPrepareWei:'1'},manifest),/mismatch/);
});
test('broadcast resends only saved bytes and refuses a changed nonce',async()=>{
 const signer=Wallet.createRandom();
 const setup=fixture();
 const intent=await prepareIntent({provider:setup.provider,signer,manifest,
  maxFeeWei:'100000000',maxTotalWei:ESTIMATED_TOTAL});
 const sent=await broadcastIntent({provider:setup.provider,intent,manifest});
 assert.equal(sent.transactionHash,intent.transactionHash);
 assert.equal(setup.broadcasts(),1);
 const pending=await broadcastIntent({provider:fixture({getTransaction:async()=>({hash:intent.transactionHash})}).provider,
  intent,manifest});
 assert.equal(pending.status,'pending');
 await assert.rejects(broadcastIntent({provider:fixture({getTransactionCount:async()=>4}).provider,
  intent,manifest}),/nonce changed/);
 await assert.rejects(broadcastIntent({provider:fixture({getCode:async()=> '0x6001'}).provider,
  intent,manifest}),/already contains code/);
 const mined=await broadcastIntent({provider:fixture({getTransactionReceipt:async()=>({status:1,
  contractAddress:intent.contractAddress})}).provider,intent,manifest});
 assert.equal(mined.status,'mined-awaiting-independent-verification');
 await assert.rejects(broadcastIntent({provider:fixture({getTransactionReceipt:async()=>({status:0,
  contractAddress:intent.contractAddress})}).provider,intent,manifest}),/receipt failed/);
});

test('broadcast refuses increased Base fee estimate or unavailable oracle',async()=>{
 const signer=Wallet.createRandom();
 const intent=await prepareIntent({provider:fixture().provider,signer,manifest,
  maxFeeWei:'100000000',maxTotalWei:ESTIMATED_TOTAL});
 const increased=fixture({call:async ({data})=>{
  const request=oracle.parseTransaction({data});
  return oracle.encodeFunctionResult(request.name,[request.name==='getL1Fee'?1001n:2000n]);
 }});
 await assert.rejects(broadcastIntent({provider:increased.provider,intent,manifest}),/exceeds reviewed cap/);
 assert.equal(increased.broadcasts(),0);
 await assert.rejects(broadcastIntent({provider:fixture({call:async()=>{throw Error('oracle unavailable');}}).provider,
  intent,manifest}),/oracle unavailable/);
});

test('protected signed intent can exceed the smaller wallet-key file limit',
 {skip:process.platform==='win32'||process.getuid?.()!==0},()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'anchor-intent-size-'));
 const file=path.join(directory,'intent.json');
 try{
  const content='x'.repeat(5501);
  fs.writeFileSync(file,content,{mode:0o600});
  assert.throws(()=>protectedFile(file),/Root-only file required/);
  assert.equal(protectedFile(file,65536),content);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
