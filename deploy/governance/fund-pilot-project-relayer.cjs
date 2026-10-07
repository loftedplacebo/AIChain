#!/usr/bin/env node
'use strict';
// Bounded, one-time Base Sepolia funding for a registered pilot project.
const fs=require('node:fs'),path=require('node:path');
const {Wallet,JsonRpcProvider,keccak256}=require('/opt/aichain/governance-pilot-worker/node_modules/ethers');
const {instance_for}=(()=>{const crypto=require('node:crypto');return {instance_for:(tenant,project)=>crypto.createHash('sha256').update(tenant+'\0'+project).digest('hex').slice(0,24)}})();
const KEY='/etc/aichain/pilot-self-service-funder.key';
const REGISTRY='/etc/aichain/pilot-workers.json';
const JOURNAL='/var/lib/aichain-self-service-funding';
const RPC='https://sepolia.base.org';
const MAX_TARGET=1000000000000000n; // 0.001 test ETH per project.
const MAX_FEE=1000000000n; // 1 gwei; 21,000 gas per transfer.
const fail=message=>{throw Error(message)};
function protectedRead(file,max=32768){
 const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077)||s.size<1||s.size>max)fail('Protected root-owned file required');
 return fs.readFileSync(file,'utf8').trim();
}
function atomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const dir=fs.lstatSync(path.dirname(file));
 if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==0||(dir.mode&0o077))fail('Protected funding journal directory required');
 const temp=file+'.'+process.pid+'.tmp';
 const fd=fs.openSync(temp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(temp,file);
 const directoryFd=fs.openSync(path.dirname(file),fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
 try{fs.fsyncSync(directoryFd);}finally{fs.closeSync(directoryFd);}
}
async function main(){
 if(process.platform!=='linux'||process.getuid()!==0)fail('Root on pilot VPS required');
 const key=protectedRead(KEY,100);if(!/^0x[a-f0-9]{64}$/.test(key))fail('Invalid funding wallet');
 const wallet=new Wallet(key),provider=new JsonRpcProvider(RPC);
 try{
  if((await provider.getNetwork()).chainId!==84532n)fail('Wrong funding chain');
  if(process.argv[2]==='--check'&&process.argv.length===3){
   console.log(JSON.stringify({network:'Base Sepolia',address:wallet.address,
    balanceWei:String(await provider.getBalance(wallet.address))}));return;
  }
  if(process.argv.length!==3)fail('Use --check or protected project request path');
  const request=JSON.parse(protectedRead(process.argv[2],8192));
  if(!/^org-[a-z0-9-]{36}$/.test(request.tenant)||!/^prj-[a-z0-9-]{36}$/.test(request.project))fail('Invalid project');
  const target=BigInt(request.fundingTargetWei);
  if(target<1n||target>MAX_TARGET)fail('Funding target exceeds one-project cap');
  const registry=JSON.parse(protectedRead(REGISTRY));
  const entries=registry.workers.filter(w=>w.tenant===request.tenant&&w.project===request.project);
  if(entries.length!==1||entries[0].state!=='paused'&&!['active'].includes(entries[0].state))fail('Registered project worker required');
  const to=entries[0].relayer;
  if(!/^0x[0-9a-fA-F]{40}$/.test(to))fail('Invalid relayer address');
  const file=path.join(JOURNAL,instance_for(request.tenant,request.project)+'.json');
  const balance=await provider.getBalance(to);
  if(balance>=target){console.log(JSON.stringify({status:'funded',project:request.project,address:to}));return;}
  let journal;
  if(fs.existsSync(file)){
   journal=JSON.parse(protectedRead(file,8192));
   if(journal.to.toLowerCase()!==to.toLowerCase()||journal.targetWei!==String(target)||
      !/^0x[0-9a-f]+$/.test(journal.raw)||keccak256(journal.raw)!==journal.hash)fail('Funding journal mismatch');
  }else{
   const value=target-balance;
   const feeData=await provider.getFeeData();
   const maxFeePerGas=feeData.maxFeePerGas&&feeData.maxFeePerGas<MAX_FEE?feeData.maxFeePerGas:MAX_FEE;
   const maxPriorityFeePerGas=feeData.maxPriorityFeePerGas&&feeData.maxPriorityFeePerGas<maxFeePerGas?feeData.maxPriorityFeePerGas:maxFeePerGas;
   if(await provider.getBalance(wallet.address)<value+21000n*maxFeePerGas)fail('Funding wallet balance insufficient');
   const nonce=await provider.getTransactionCount(wallet.address,'pending');
   const raw=await wallet.signTransaction({type:2,chainId:84532,nonce,to,value,
      gasLimit:21000,maxFeePerGas,maxPriorityFeePerGas});
   journal={version:1,to,targetWei:String(target),raw,hash:keccak256(raw)};
   atomic(file,journal);
  }
  try{await provider.broadcastTransaction(journal.raw);}catch(error){
   const existing=await provider.getTransaction(journal.hash);
   if(!existing)fail('Funding broadcast unavailable');
  }
  const receipt=await provider.waitForTransaction(journal.hash,1,45000);
  if(!receipt){console.log(JSON.stringify({status:'pending',project:request.project,transactionHash:journal.hash}));process.exitCode=2;return;}
  if(receipt.status!==1||await provider.getBalance(to)<target)fail('Funding transaction did not meet target');
  console.log(JSON.stringify({status:'funded',project:request.project,address:to,transactionHash:journal.hash}));
 }finally{provider.destroy();}
}
main().catch(()=>{console.error('Pilot relayer funding failed; inspect protected wallet, journal and chain state.');process.exitCode=1;});
