#!/usr/bin/env node
'use strict';
// Read-only deployment check. Never signs, deploys, or broadcasts.
const fs=require('node:fs'),path=require('node:path');
const {JsonRpcProvider,getAddress,keccak256}=require('ethers');

async function verifyDeployment({provider,contract,artifact,transactionHash,minimumConfirmations=12}){
 const address=getAddress(contract);
 if(!artifact||typeof artifact.deployedBytecode!=='string'||!/^0x[0-9a-fA-F]+$/.test(artifact.deployedBytecode)||!Number.isInteger(minimumConfirmations)||minimumConfirmations<1)throw Error('Reviewed compiled artifact and confirmation policy required');
 if(transactionHash&&!/^0x[0-9a-fA-F]{64}$/.test(transactionHash))throw Error('Valid deployment transaction hash required');
 const network=await provider.getNetwork();
 if(Number(network.chainId)!==8453)throw Error('Expected Base mainnet chain ID 8453');
 const code=await provider.getCode(address);
 if(code==='0x'||code.toLowerCase()!==artifact.deployedBytecode.toLowerCase())throw Error('Deployed runtime bytecode differs from reviewed artifact');
 const result={status:'runtime-code-matched',chainId:8453,contract:address.toLowerCase(),codeHash:keccak256(code),deploymentTransaction:'not-provided'};
 if(!transactionHash)return result;
 const [tx,receipt,head]=await Promise.all([provider.getTransaction(transactionHash),provider.getTransactionReceipt(transactionHash),provider.getBlockNumber()]);
 if(!tx||!receipt||tx.to!==null||receipt.status!==1||getAddress(receipt.contractAddress||'')!==address||!Number.isSafeInteger(head)||head<receipt.blockNumber)throw Error('Deployment transaction is missing, failed, or does not create this contract');
 const block=await provider.getBlock(receipt.blockNumber);
 if(!block||block.hash!==receipt.blockHash)throw Error('Deployment block is not canonical at checked RPC head');
 const confirmations=head-receipt.blockNumber+1;
 return {...result,status:confirmations>=minimumConfirmations?'verified':'confirming',deploymentTransaction:transactionHash.toLowerCase(),blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,confirmations,minimumConfirmations};
}

async function main(){
 const [contract,transactionHash,...extra]=process.argv.slice(2);
 if(!contract||extra.length)throw Error('Use <contract-address> [deployment-tx-hash]');
 const rpc=process.env.GOVERNANCE_MAINNET_RPC_URL;
 if(!rpc||new URL(rpc).protocol!=='https:')throw Error('HTTPS GOVERNANCE_MAINNET_RPC_URL required');
 const artifact=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../build/base-mainnet/ReceiptBatchAnchor.json'),'utf8'));
 const provider=new JsonRpcProvider(rpc,8453,{staticNetwork:false,cacheTimeout:0});
 try{const result=await verifyDeployment({provider,contract,artifact,transactionHash});console.log(JSON.stringify(result,null,2));if(result.status!=='verified')process.exitCode=1;}
 finally{provider.destroy();}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={verifyDeployment};
