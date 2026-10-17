#!/usr/bin/env node
'use strict';
// Read-only check for the initial public-RPC Production phase. Never signs.
const {JsonRpcProvider,keccak256}=require('ethers');

const CHAIN=8453;
const CONTRACT='0xcF3A904b433c50E2d4F6E2a0d692E855d33910f2';
const CODE_HASH='0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f';
const DEPLOYMENT='0xa32ab8f5a704ecf300b3b4a1de943952f33d1efd6dceed201a16b98191e27626';

async function check(provider,expectedCodeHash=CODE_HASH){
 const started=Date.now();
 const [network,code,head,receipt]=await Promise.all([
  provider.getNetwork(),provider.getCode(CONTRACT),provider.getBlockNumber(),
  provider.getTransactionReceipt(DEPLOYMENT),
 ]);
 const chainId=Number(network.chainId);
 const codeHash=code==='0x'?null:keccak256(code);
 const block=receipt?await provider.getBlock(receipt.blockNumber):null;
 const confirmations=receipt&&Number.isSafeInteger(head)&&Number.isSafeInteger(receipt.blockNumber)?
  head-receipt.blockNumber+1:0;
 const latencyMs=Date.now()-started;
 const healthy=chainId===CHAIN&&codeHash===expectedCodeHash&&
  receipt?.status===1&&receipt.contractAddress?.toLowerCase()===CONTRACT.toLowerCase()&&
  block?.hash===receipt.blockHash&&confirmations>=12&&latencyMs<=10000;
 return {healthy,scope:'Base mainnet public RPC and pinned Production anchor',
  chainId,codeHash,confirmations,latencyMs};
}

async function main(){
 const supplied=process.env.GOVERNANCE_MAINNET_RPC_URL||'https://mainnet.base.org';
 const url=new URL(supplied);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||!url.hostname)throw Error('HTTPS Base RPC required');
 const provider=new JsonRpcProvider(url.href,CHAIN,{staticNetwork:false,cacheTimeout:0});
 try{
  const result=await check(provider);
  console.log(JSON.stringify(result));
  if(!result.healthy)process.exitCode=1;
 }finally{provider.destroy();}
}

if(require.main===module)main().catch(error=>{
 const message=String(error?.message||'');
 console.log(JSON.stringify({healthy:false,
  scope:'Base mainnet public RPC and pinned Production anchor',
  rateLimited:/\b429\b|rate.?limit|too many requests/i.test(message),
  reason:'rpc_check_failed'}));
 process.exitCode=1;
});
module.exports={check};
