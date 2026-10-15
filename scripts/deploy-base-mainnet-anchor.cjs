#!/usr/bin/env node
'use strict';
// Two-step Base mainnet deployment. Prepare persists one signed transaction;
// broadcast can only resend those same bytes, so a retry cannot change nonce.
const fs=require('node:fs'),path=require('node:path');
const {JsonRpcProvider,Wallet,Transaction,getCreateAddress,keccak256}=require('ethers');
const {prepare}=require('./prepare-base-mainnet-deploy.cjs');

const CHAIN=8453;
const CREATION_HASH='0xccf23437b086cba0f033a19c353ca582953b1e725e57c59798fb43531c06d1ce';
const RUNTIME_HASH='0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f';
const ROOT=path.resolve(__dirname,'../build/base-mainnet');
const KEY='/etc/aichain/production/mainnet-publisher.key';
const STATE='/var/lib/aichain-production-deployment';
const INTENT=path.join(STATE,'anchor-intent.json');

function reviewedArtifact(bytes){
 const result=prepare(bytes);
 if(result.creation.dataKeccak256!==CREATION_HASH||result.expectedRuntimeCodeHash!==RUNTIME_HASH)throw Error('Pinned mainnet contract bytes required');
 return result;
}
function positive(value,label){
 if(!/^[1-9][0-9]*$/.test(String(value||'')))throw Error('Positive '+label+' required');
 return BigInt(value);
}
function protectedFile(file){
 const info=fs.lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||info.uid!==0||(info.mode&0o777)!==0o600||info.size<1||info.size>4096)throw Error('Root-only file required');
 return fs.readFileSync(file,'utf8').trim();
}
function protectedDirectory(dir){
 const info=fs.lstatSync(dir);
 if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==0||(info.mode&0o777)!==0o700)throw Error('Root-only deployment directory required');
}
async function quote({provider,address,manifest}){
 if(Number((await provider.getNetwork()).chainId)!==CHAIN)throw Error('Base mainnet RPC required');
 const [nonce,gasEstimate,fees,balance]=await Promise.all([
  provider.getTransactionCount(address,'pending'),
  provider.estimateGas({from:address,to:null,value:0n,data:manifest.creation.data}),
  provider.getFeeData(),provider.getBalance(address),
 ]);
 if(!Number.isSafeInteger(nonce)||nonce<0||gasEstimate<=0n||fees.maxFeePerGas==null||fees.maxPriorityFeePerGas==null||fees.maxFeePerGas<fees.maxPriorityFeePerGas)throw Error('Valid mainnet nonce and EIP-1559 fee quote required');
 const gasLimit=(gasEstimate*125n+99n)/100n;
 return {address,nonce,gasEstimate,gasLimit,maxFeePerGas:fees.maxFeePerGas,
  maxPriorityFeePerGas:fees.maxPriorityFeePerGas,balance,
  maximumCost:gasLimit*fees.maxFeePerGas};
}
async function prepareIntent({provider,signer,manifest,maxFeeWei,maxTotalWei}){
 const review=await quote({provider,address:signer.address,manifest});
 if(review.maxFeePerGas>positive(maxFeeWei,'fee cap')||
    review.maximumCost>positive(maxTotalWei,'total spend cap')||
    review.balance<review.maximumCost)throw Error('Mainnet fee, total spend or balance limit exceeded');
 const raw=await signer.signTransaction({type:2,chainId:CHAIN,nonce:review.nonce,
  to:null,value:0n,data:manifest.creation.data,gasLimit:review.gasLimit,
  maxFeePerGas:review.maxFeePerGas,
  maxPriorityFeePerGas:review.maxPriorityFeePerGas});
 const tx=Transaction.from(raw);
 if(tx.from?.toLowerCase()!==signer.address.toLowerCase()||tx.to!==null||tx.chainId!==BigInt(CHAIN)||tx.nonce!==review.nonce||tx.value!==0n||tx.data.toLowerCase()!==manifest.creation.data.toLowerCase()||tx.gasLimit!==review.gasLimit||tx.maxFeePerGas!==review.maxFeePerGas||tx.maxPriorityFeePerGas!==review.maxPriorityFeePerGas)throw Error('Signed mainnet creation transaction mismatch');
 return {version:1,chainId:CHAIN,contract:'ReceiptBatchAnchor',
  from:signer.address,nonce:review.nonce,contractAddress:getCreateAddress({from:signer.address,nonce:review.nonce}),
  transactionHash:tx.hash,rawTransaction:raw,creationDataHash:CREATION_HASH,
  runtimeCodeHash:RUNTIME_HASH,maximumCostWei:review.maximumCost.toString(),
  maxFeePerGasWei:review.maxFeePerGas.toString(),gasLimit:review.gasLimit.toString()};
}
function validateIntent(intent,manifest){
 if(!intent||typeof intent!=='object'||Object.keys(intent).sort().join(',')!==[
  'version','chainId','contract','from','nonce','contractAddress',
  'transactionHash','rawTransaction','creationDataHash','runtimeCodeHash',
  'maximumCostWei','maxFeePerGasWei','gasLimit'].sort().join(',')||
  intent.version!==1||intent.chainId!==CHAIN||intent.contract!=='ReceiptBatchAnchor'||
  intent.creationDataHash!==CREATION_HASH||intent.runtimeCodeHash!==RUNTIME_HASH)throw Error('Exact reviewed deployment intent required');
 const tx=Transaction.from(intent.rawTransaction);
 if(tx.hash!==intent.transactionHash||tx.from?.toLowerCase()!==intent.from.toLowerCase()||
  tx.chainId!==BigInt(CHAIN)||tx.type!==2||tx.to!==null||tx.value!==0n||
  tx.data.toLowerCase()!==manifest.creation.data.toLowerCase()||
  tx.nonce!==intent.nonce||tx.gasLimit.toString()!==intent.gasLimit||
  tx.maxFeePerGas.toString()!==intent.maxFeePerGasWei||
  (tx.gasLimit*tx.maxFeePerGas).toString()!==intent.maximumCostWei||
  getCreateAddress({from:tx.from,nonce:tx.nonce}).toLowerCase()!==intent.contractAddress.toLowerCase())throw Error('Signed deployment intent mismatch');
 return tx;
}
function saveIntent(intent,manifest){
 validateIntent(intent,manifest);
 if(!fs.existsSync(STATE))fs.mkdirSync(STATE,{mode:0o700});
 protectedDirectory(STATE);
 const fd=fs.openSync(INTENT,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(intent)+'\n');fs.fsyncSync(fd);}
 catch(error){fs.closeSync(fd);fs.unlinkSync(INTENT);throw error;}
 fs.closeSync(fd);
 const directory=fs.openSync(STATE,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
}
async function broadcastIntent({provider,intent,manifest}){
 const tx=validateIntent(intent,manifest);
 if(Number((await provider.getNetwork()).chainId)!==CHAIN)throw Error('Base mainnet RPC required');
 const existing=await provider.getTransactionReceipt(tx.hash);
 if(existing){
  if(existing.status!==1||existing.contractAddress?.toLowerCase()!==intent.contractAddress.toLowerCase())throw Error('Deployment receipt failed or address mismatch');
  return {status:'mined-awaiting-independent-verification',transactionHash:tx.hash,contractAddress:intent.contractAddress};
 }
 if(await provider.getTransaction(tx.hash))return {status:'pending',transactionHash:tx.hash,contractAddress:intent.contractAddress};
 if(await provider.getCode(intent.contractAddress)!=='0x')throw Error('Expected contract address already contains code');
 if(await provider.getTransactionCount(intent.from,'pending')!==intent.nonce)throw Error('Wallet nonce changed; do not create another deployment intent');
 if(await provider.getBalance(intent.from)<BigInt(intent.maximumCostWei))throw Error('Wallet balance below signed maximum spend');
 const sent=await provider.broadcastTransaction(intent.rawTransaction);
 if(sent.hash!==tx.hash)throw Error('RPC returned a different transaction hash');
 return {status:'broadcast-awaiting-independent-verification',transactionHash:tx.hash,contractAddress:intent.contractAddress};
}
function rpcProvider(){
 const value=process.env.GOVERNANCE_MAINNET_RPC_URL;
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||!url.hostname)throw Error('HTTPS mainnet RPC required');
 return new JsonRpcProvider(url.href,CHAIN,{staticNetwork:false,cacheTimeout:0});
}
async function main(){
 if(process.getuid()!==0)throw Error('Root operator required');
 const [mode,...args]=process.argv.slice(2);
 if(!['--quote','--prepare','--status','--broadcast'].includes(mode)||
  ((mode==='--prepare')!== (args.length===2))||
  (mode!=='--prepare'&&args.length))throw Error('Use --quote, --prepare <max-fee-wei> <max-total-wei>, --status or --broadcast');
 const manifest=reviewedArtifact(fs.readFileSync(path.join(ROOT,'ReceiptBatchAnchor.json')));
 const provider=rpcProvider();
 try{
  if(mode==='--quote'||mode==='--prepare'){
   const key=protectedFile(KEY);
   if(!/^0x[0-9a-fA-F]{64}$/.test(key))throw Error('Protected wallet key malformed');
   const signer=new Wallet(key);
   if(mode==='--quote'){
    const result=await quote({provider,address:signer.address,manifest});
    console.log(JSON.stringify({status:'quote-only',chainId:CHAIN,address:signer.address,
     nonce:result.nonce,gasEstimate:result.gasEstimate.toString(),gasLimit:result.gasLimit.toString(),
     maxFeePerGasWei:result.maxFeePerGas.toString(),maximumCostWei:result.maximumCost.toString(),
     balanceWei:result.balance.toString(),creationDataHash:CREATION_HASH}));
   }else{
    const intent=await prepareIntent({provider,signer,manifest,maxFeeWei:args[0],maxTotalWei:args[1]});
    saveIntent(intent,manifest);
    console.log(JSON.stringify({status:'signed-not-broadcast',chainId:CHAIN,
     from:intent.from,nonce:intent.nonce,contractAddress:intent.contractAddress,
     transactionHash:intent.transactionHash,maximumCostWei:intent.maximumCostWei}));
   }
  }else{
   protectedDirectory(STATE);
   const intent=JSON.parse(protectedFile(INTENT));
   const tx=validateIntent(intent,manifest);
   if(Number((await provider.getNetwork()).chainId)!==CHAIN)throw Error('Base mainnet RPC required');
   if(mode==='--status'){
    const receipt=await provider.getTransactionReceipt(tx.hash);
    if(receipt&&(receipt.status!==1||receipt.contractAddress?.toLowerCase()!==intent.contractAddress.toLowerCase()))throw Error('Deployment receipt failed or address mismatch');
    const pending=receipt?null:await provider.getTransaction(tx.hash);
    console.log(JSON.stringify({status:receipt?'mined-awaiting-independent-verification':pending?'pending':'signed-not-broadcast',
     transactionHash:tx.hash,contractAddress:intent.contractAddress}));
   }else console.log(JSON.stringify(await broadcastIntent({provider,intent,manifest})));
  }
 }finally{provider.destroy();}
}
if(require.main===module)main().catch(()=>{console.error('Mainnet deployment step failed; no key or raw transaction printed.');process.exitCode=1;});
module.exports={reviewedArtifact,quote,prepareIntent,validateIntent,broadcastIntent};
