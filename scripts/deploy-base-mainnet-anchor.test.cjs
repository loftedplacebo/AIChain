'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Wallet,getCreateAddress}=require('ethers');
const {quote,prepareIntent,validateIntent,broadcastIntent}=require('./deploy-base-mainnet-anchor.cjs');

const manifest={creation:{data:'0x60016000'}};
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
 const intent=await prepareIntent({provider:setup.provider,signer,manifest,
  maxFeeWei:'100000000',maxTotalWei:'12500000000000'});
 assert.equal(intent.maximumCostWei,'12500000000000');
 assert.equal(intent.contractAddress,getCreateAddress({from:signer.address,nonce:3}));
 assert.equal(validateIntent(intent,manifest).hash,intent.transactionHash);
 assert.equal(setup.broadcasts(),0);
 await assert.rejects(prepareIntent({provider:setup.provider,signer,manifest,
  maxFeeWei:'99999999',maxTotalWei:'12500000000000'}),/limit exceeded/);
 await assert.rejects(prepareIntent({provider:fixture({getNetwork:async()=>({chainId:84532n})}).provider,
  signer,manifest,maxFeeWei:'100000000',maxTotalWei:'12500000000000'}),/Base mainnet/);
 await assert.rejects(prepareIntent({provider:fixture({getBalance:async()=>1n}).provider,
  signer,manifest,maxFeeWei:'100000000',maxTotalWei:'12500000000000'}),/limit exceeded/);
 assert.throws(()=>validateIntent({...intent,maximumCostWei:'1'},manifest),/mismatch/);
});
test('broadcast resends only saved bytes and refuses a changed nonce',async()=>{
 const signer=Wallet.createRandom();
 const setup=fixture();
 const intent=await prepareIntent({provider:setup.provider,signer,manifest,
  maxFeeWei:'100000000',maxTotalWei:'12500000000000'});
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
