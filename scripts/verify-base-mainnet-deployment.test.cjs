'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verifyDeployment}=require('./verify-base-mainnet-deployment.cjs');
const {keccak256}=require('ethers');
const contract='0x'+'11'.repeat(20),transactionHash='0x'+'22'.repeat(32),blockHash='0x'+'33'.repeat(32);
const artifact={deployedBytecode:'0x6001'};
function fixture(overrides={}){
 return {getNetwork:async()=>({chainId:8453n}),getCode:async()=>artifact.deployedBytecode,getTransaction:async()=>({to:null}),getTransactionReceipt:async()=>({status:1,contractAddress:contract,blockNumber:100,blockHash}),getBlockNumber:async()=>111,getBlock:async()=>({hash:blockHash}),...overrides};
}
test('mainnet verifier requires reviewed code and canonical confirmed creation',async()=>{
 const result=await verifyDeployment({provider:fixture(),contract,artifact,transactionHash});
 assert.equal(result.status,'verified');assert.equal(result.chainId,8453);assert.equal(result.codeHash,keccak256(artifact.deployedBytecode));assert.equal(result.confirmations,12);
 assert.equal((await verifyDeployment({provider:fixture(),contract,artifact})).status,'runtime-code-matched');
 assert.equal((await verifyDeployment({provider:fixture({getBlockNumber:async()=>110}),contract,artifact,transactionHash})).status,'confirming');
 await assert.rejects(verifyDeployment({provider:fixture({getNetwork:async()=>({chainId:84532n})}),contract,artifact,transactionHash}),/Base mainnet/);
 await assert.rejects(verifyDeployment({provider:fixture({getCode:async()=> '0x6002'}),contract,artifact,transactionHash}),/runtime bytecode/);
 await assert.rejects(verifyDeployment({provider:fixture({getBlock:async()=>({hash:'0x'+'44'.repeat(32)})}),contract,artifact,transactionHash}),/canonical/);
 await assert.rejects(verifyDeployment({provider:fixture({getTransaction:async()=>({to:contract})}),contract,artifact,transactionHash}),/does not create/);
});
