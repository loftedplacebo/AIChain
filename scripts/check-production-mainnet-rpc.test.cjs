'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {check}=require('./check-production-mainnet-rpc.cjs');
const {keccak256}=require('ethers');

const CONTRACT='0xcF3A904b433c50E2d4F6E2a0d692E855d33910f2';
const CODE_HASH='0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f';
const SYNTHETIC_HASH=keccak256('0x6001');
function provider(changes={}){
 return {getNetwork:async()=>({chainId:8453n}),getCode:async()=> '0x6001',
  getBlockNumber:async()=>120,
  getTransactionReceipt:async()=>({status:1,contractAddress:CONTRACT,blockNumber:100,blockHash:'0x'+'aa'.repeat(32)}),
  getBlock:async()=>({hash:'0x'+'aa'.repeat(32)}),
  ...changes};
}

test('read-only RPC check requires exact mainnet contract and canonical receipt',async()=>{
 assert.equal((await check(provider(),SYNTHETIC_HASH)).healthy,true);
 const result=await check(provider());
 assert.equal(result.healthy,false);
 assert.equal(result.codeHash,keccak256('0x6001'));
 assert.equal(result.chainId,8453);
 assert.equal(result.confirmations,21);
 assert.notEqual(result.codeHash,CODE_HASH);
 assert.equal((await check(provider({getNetwork:async()=>({chainId:84532n})}),SYNTHETIC_HASH)).healthy,false);
 assert.equal((await check(provider({getTransactionReceipt:async()=>null}),SYNTHETIC_HASH)).healthy,false);
 assert.equal((await check(provider({getBlock:async()=>({hash:'0x'+'bb'.repeat(32)})}),SYNTHETIC_HASH)).healthy,false);
});
