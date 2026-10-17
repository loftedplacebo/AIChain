#!/usr/bin/env node
'use strict';
// Reviewed, two-step Base mainnet funding of one registered project relayer.
// Quote and prepare never broadcast; broadcast only resends saved signed bytes.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {JsonRpcProvider,Wallet,Transaction,Interface}=require('ethers');

const CHAIN=8453,OWNER='0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3';
const CONTRACT='0xcF3A904b433c50E2d4F6E2a0d692E855d33910f2';
const CODE_HASH='0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f';
const TARGET_CAP=200000000000000n,FEE_CAP=20000000000000n,GAS_PRICE_CAP=1000000000n;
const KEY='/etc/aichain/production/mainnet-publisher.key';
const REGISTRY='/etc/aichain/production/workers.json';
const PROJECT_PREFLIGHT='/opt/aichain/governance-pilot-db-setup/provision-production-project-worker.py';
const STATE='/var/lib/aichain-production-funding';
const LOCK='/run/orvessian-production-funding.lock';
const ORACLE='0x420000000000000000000000000000000000000F';
const ORACLE_ABI=new Interface(['function getL1Fee(bytes) view returns (uint256)',
 'function getOperatorFee(uint256) view returns (uint256)']);
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ADDRESS=/^0x[a-fA-F0-9]{40}$/;
const instanceFor=(tenant,project)=>createHash('sha256').update(tenant+'\0'+project).digest('hex').slice(0,24);

function protectedFile(file,limit){
 const info=fs.lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||info.uid!==0||(info.mode&0o777)!==0o600||
  info.size<1||info.size>limit)throw Error('Protected root-only input required');
 return fs.readFileSync(file,'utf8').trim();
}
function protectedDirectory(directory){
 const info=fs.lstatSync(directory);
 if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==0||
  (info.mode&0o777)!==0o700)throw Error('Protected funding state directory required');
}
function positive(value,label){
 if(!/^[1-9][0-9]*$/.test(String(value||'')))throw Error('Positive '+label+' required');
 return BigInt(value);
}
async function withFundingLock(action){
 fs.mkdirSync(LOCK,{mode:0o700});
 try{return await action();}finally{fs.rmdirSync(LOCK);}
}
function binding(requestFile,{registryFile=REGISTRY}={}){
 if(!path.isAbsolute(requestFile))throw Error('Absolute reviewed request required');
 const request=JSON.parse(protectedFile(requestFile,8192));
 if(!request||typeof request!=='object'||Object.keys(request).sort().join(',')!==
  ['tenant','project','databaseUrlFile','rpcUrl','workerPolicy','fundingTargetWei','reviewId'].sort().join(',')||
  typeof request.tenant!=='string'||!request.tenant.startsWith('org-')||!ID.test(request.tenant.slice(4))||
  typeof request.project!=='string'||!request.project.startsWith('prj-')||!ID.test(request.project.slice(4))||
  request.rpcUrl!=='https://mainnet.base.org'||
  typeof request.reviewId!=='string'||!/^[A-Za-z0-9._-]{4,80}$/.test(request.reviewId)||
  typeof request.databaseUrlFile!=='string'||!path.isAbsolute(request.databaseUrlFile)||
  !request.workerPolicy||typeof request.workerPolicy!=='object'||
  Object.keys(request.workerPolicy).sort().join(',')!==[
   'batchSize','maxTransactionsPerHour','maxGasPriceWei',
   'dailyReservationWei','l1AllowanceWei'].sort().join(',')||
  !Number.isSafeInteger(request.workerPolicy.batchSize)||
  request.workerPolicy.batchSize<1||request.workerPolicy.batchSize>1000||
  !Number.isSafeInteger(request.workerPolicy.maxTransactionsPerHour)||
  request.workerPolicy.maxTransactionsPerHour<1||
  request.workerPolicy.maxTransactionsPerHour>10||
  !/^[1-9][0-9]*$/.test(request.workerPolicy.dailyReservationWei||'')||
  !/^[1-9][0-9]*$/.test(request.workerPolicy.maxGasPriceWei||'')||
  BigInt(request.workerPolicy.maxGasPriceWei)>GAS_PRICE_CAP||
  !/^[1-9][0-9]*$/.test(request.workerPolicy.l1AllowanceWei||''))
  throw Error('Exact reviewed Production funding request required');
 const target=positive(request.fundingTargetWei,'funding target');
 if(target>TARGET_CAP||target<BigInt(request.workerPolicy.dailyReservationWei))
  throw Error('Production funding target exceeds reviewed policy');
 const document=JSON.parse(protectedFile(registryFile,32768));
 if(document?.environment!=='prod'||document?.version!==1||
  document?.chain?.chainId!==CHAIN||document.chain.contract.toLowerCase()!==CONTRACT.toLowerCase()||
  document.chain.codeHash.toLowerCase()!==CODE_HASH||!Array.isArray(document.workers)||
  document.workers.length>10)throw Error('Reviewed Production registry required');
 const instance=instanceFor(request.tenant,request.project);
 const matches=document.workers.filter(worker=>worker.tenant===request.tenant&&
  worker.project===request.project&&worker.role==='worker_'+instance&&
  worker.unit===`orvessian-production-project-worker@${instance}.service`&&
  worker.state==='paused'&&ADDRESS.test(worker.relayer)&&
  worker.relayer.toLowerCase()!==OWNER.toLowerCase());
 if(matches.length!==1)throw Error('One paused Production project relayer required');
 return {request,instance,relayer:matches[0].relayer,target};
}
function projectPreflight(requestFile){
 const result=spawnSync('python3',[PROJECT_PREFLIGHT,requestFile],{
  encoding:'utf8',timeout:60000,maxBuffer:4096});
 if(result.error||result.status!==0||
  !/^production_project_worker=ready;role=worker_[a-f0-9]{24};service=off;funding=not_sent\s*$/.test(result.stdout||''))
  throw Error('Reviewed inactive Production project preflight required');
}
async function extraFees(provider,unsigned,gasLimit){
 const l1=ORACLE_ABI.decodeFunctionResult('getL1Fee',await provider.call({to:ORACLE,
  data:ORACLE_ABI.encodeFunctionData('getL1Fee',[unsigned])}))[0];
 const operator=ORACLE_ABI.decodeFunctionResult('getOperatorFee',await provider.call({to:ORACLE,
  data:ORACLE_ABI.encodeFunctionData('getOperatorFee',[gasLimit])}))[0];
 if(typeof l1!=='bigint'||typeof operator!=='bigint'||l1<0n||operator<0n)
  throw Error('Valid Base fee-oracle quote required');
 return {l1,operator};
}
async function quote(provider,scope,feeOracle=extraFees,owner=OWNER){
 if(Number((await provider.getNetwork()).chainId)!==CHAIN)throw Error('Base mainnet RPC required');
 const [recipientBalance,ownerBalance,nonce,fees,code]=await Promise.all([
  provider.getBalance(scope.relayer),provider.getBalance(owner),
  provider.getTransactionCount(owner,'pending'),provider.getFeeData(),
  provider.getCode(scope.relayer),
 ]);
 if(code!=='0x'||typeof recipientBalance!=='bigint'||recipientBalance<0n||
  typeof ownerBalance!=='bigint'||!Number.isSafeInteger(nonce)||nonce<0)
  throw Error('Unfunded EOA relayer and valid owner nonce required');
 const amount=scope.target>recipientBalance?scope.target-recipientBalance:0n;
 if(amount===0n)return {status:'already-at-target',amount:0n,recipientBalance};
 if(fees.maxFeePerGas==null||fees.maxPriorityFeePerGas==null||
  fees.maxFeePerGas<fees.maxPriorityFeePerGas||fees.maxFeePerGas>GAS_PRICE_CAP)
  throw Error('Base mainnet fee exceeds reviewed gas policy');
 const estimated=await provider.estimateGas({from:owner,to:scope.relayer,value:amount,data:'0x'});
 if(estimated<21000n||estimated>30000n)throw Error('Native transfer gas estimate exceeds reviewed bound');
 const gasLimit=(estimated*120n+99n)/100n;
 if(gasLimit>30000n)throw Error('Native transfer gas limit exceeds reviewed bound');
 const unsigned=Transaction.from({type:2,chainId:CHAIN,nonce,to:scope.relayer,
  value:amount,data:'0x',gasLimit,maxFeePerGas:fees.maxFeePerGas,
  maxPriorityFeePerGas:fees.maxPriorityFeePerGas}).unsignedSerialized;
 const extras=await feeOracle(provider,unsigned,gasLimit);
 const maximumFee=gasLimit*fees.maxFeePerGas+extras.l1+extras.operator;
 const maximumTotal=amount+maximumFee;
 if(maximumFee>FEE_CAP||ownerBalance<maximumTotal)
  throw Error('Transfer fee or owner balance exceeds reviewed funding policy');
 return {status:'quote-only',chainId:CHAIN,from:owner,to:scope.relayer,
  amount,recipientBalance,ownerBalance,nonce,gasLimit,
  maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,
  l1Fee:extras.l1,operatorFee:extras.operator,maximumFee,maximumTotal};
}
async function prepareIntent(provider,scope,signer,maxFeeWei,maxTotalWei,feeOracle=extraFees,owner=OWNER){
 if(signer.address.toLowerCase()!==owner.toLowerCase())throw Error('Owner wallet mismatch');
 const review=await quote(provider,scope,feeOracle,owner);
 if(review.status!=='quote-only'||review.maxFeePerGas>positive(maxFeeWei,'gas price cap')||
  review.maximumTotal>positive(maxTotalWei,'total cap')||
  positive(maxTotalWei,'total cap')>scope.target+FEE_CAP)
  throw Error('Reviewed transfer caps or target unmet');
 const raw=await signer.signTransaction({type:2,chainId:CHAIN,nonce:review.nonce,
  to:scope.relayer,value:review.amount,data:'0x',gasLimit:review.gasLimit,
  maxFeePerGas:review.maxFeePerGas,maxPriorityFeePerGas:review.maxPriorityFeePerGas});
 const tx=Transaction.from(raw);
 if(tx.from?.toLowerCase()!==owner.toLowerCase()||tx.to?.toLowerCase()!==scope.relayer.toLowerCase()||
  tx.value!==review.amount||tx.chainId!==BigInt(CHAIN)||tx.nonce!==review.nonce)
  throw Error('Signed relayer transfer mismatch');
 return {version:1,chainId:CHAIN,instance:scope.instance,reviewId:scope.request.reviewId,
  tenant:scope.request.tenant,project:scope.request.project,from:owner,to:scope.relayer,
  targetWei:scope.target.toString(),amountWei:review.amount.toString(),
  nonce:review.nonce,gasLimitWei:review.gasLimit.toString(),
  maxFeePerGasWei:review.maxFeePerGas.toString(),
  maxPriorityFeePerGasWei:review.maxPriorityFeePerGas.toString(),
  approvedTotalCapWei:positive(maxTotalWei,'total cap').toString(),
  transactionHash:tx.hash,rawTransaction:raw};
}
function validateIntent(intent,scope,owner=OWNER){
 if(!intent||typeof intent!=='object'||Object.keys(intent).sort().join(',')!==[
  'version','chainId','instance','reviewId','tenant','project','from','to',
  'targetWei','amountWei','nonce','gasLimitWei','maxFeePerGasWei',
  'maxPriorityFeePerGasWei','approvedTotalCapWei','transactionHash','rawTransaction'
 ].sort().join(',')||intent.version!==1||intent.chainId!==CHAIN||
  intent.instance!==scope.instance||intent.reviewId!==scope.request.reviewId||
  intent.tenant!==scope.request.tenant||intent.project!==scope.request.project||
  intent.from.toLowerCase()!==owner.toLowerCase()||
  intent.to.toLowerCase()!==scope.relayer.toLowerCase()||
  intent.targetWei!==scope.target.toString())throw Error('Exact reviewed funding intent required');
 const tx=Transaction.from(intent.rawTransaction);
 if(tx.hash!==intent.transactionHash||tx.from?.toLowerCase()!==owner.toLowerCase()||
  tx.to?.toLowerCase()!==scope.relayer.toLowerCase()||tx.type!==2||
  tx.chainId!==BigInt(CHAIN)||tx.data!=='0x'||tx.nonce!==intent.nonce||
  tx.value.toString()!==intent.amountWei||tx.value<1n||tx.value>scope.target||
  tx.gasLimit.toString()!==intent.gasLimitWei||tx.gasLimit>30000n||
  tx.maxFeePerGas.toString()!==intent.maxFeePerGasWei||
  tx.maxPriorityFeePerGas.toString()!==intent.maxPriorityFeePerGasWei||
  tx.maxFeePerGas>GAS_PRICE_CAP||
  tx.gasLimit*tx.maxFeePerGas>FEE_CAP||
  tx.value+tx.gasLimit*tx.maxFeePerGas>BigInt(intent.approvedTotalCapWei)||
  BigInt(intent.approvedTotalCapWei)>scope.target+FEE_CAP)
  throw Error('Signed funding transaction differs from reviewed cap');
 return tx;
}
function intentFile(scope){return path.join(STATE,'transfer-'+scope.instance+'.json');}
function saveIntent(intent,scope){
 validateIntent(intent,scope);
 if(!fs.existsSync(STATE))fs.mkdirSync(STATE,{mode:0o700});
 protectedDirectory(STATE);
 const file=intentFile(scope);
 const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|
  fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(intent)+'\n');fs.fsyncSync(fd);}
 catch(error){fs.closeSync(fd);fs.unlinkSync(file);throw error;}
 fs.closeSync(fd);
}
async function noPendingOtherIntents(provider,scope){
 if(!fs.existsSync(STATE))return;
 protectedDirectory(STATE);
 for(const file of fs.readdirSync(STATE)){
  if(!/^transfer-[a-f0-9]{24}\.json$/.test(file)||file==='transfer-'+scope.instance+'.json')continue;
  const previous=JSON.parse(protectedFile(path.join(STATE,file),8192));
  const receipt=await provider.getTransactionReceipt(previous.transactionHash);
  if(!receipt||receipt.status!==1)throw Error('Another Production funding intent needs review');
 }
}
async function broadcast(provider,scope,intent,feeOracle=extraFees,owner=OWNER){
 const tx=validateIntent(intent,scope,owner);
 if(Number((await provider.getNetwork()).chainId)!==CHAIN)throw Error('Base mainnet RPC required');
 await noPendingOtherIntents(provider,scope);
 const receipt=await provider.getTransactionReceipt(tx.hash);
 if(receipt){
  if(receipt.status!==1||receipt.from?.toLowerCase()!==owner.toLowerCase()||
    receipt.to?.toLowerCase()!==scope.relayer.toLowerCase())
   throw Error('Funding receipt failed or changed scope');
  return {status:'mined',transactionHash:tx.hash,relayer:scope.relayer};
 }
 if(await provider.getTransaction(tx.hash))return {status:'pending',transactionHash:tx.hash,relayer:scope.relayer};
 if(await provider.getTransactionCount(owner,'pending')!==tx.nonce||
  await provider.getCode(scope.relayer)!=='0x')throw Error('Owner nonce or relayer code changed');
 const [recipientBalance,ownerBalance]=await Promise.all([
  provider.getBalance(scope.relayer),provider.getBalance(owner)]);
 if(recipientBalance+tx.value>scope.target)throw Error('Relayer balance changed since review');
 const extras=await feeOracle(provider,tx.unsignedSerialized,tx.gasLimit);
 const totalFee=tx.gasLimit*tx.maxFeePerGas+extras.l1+extras.operator;
 const maximum=tx.value+totalFee;
 if(totalFee>FEE_CAP)throw Error('Current Base fee exceeds reviewed transfer fee cap');
 if(maximum>BigInt(intent.approvedTotalCapWei)||ownerBalance<maximum)
  throw Error('Current Base fee or owner balance exceeds reviewed cap');
 const sent=await provider.broadcastTransaction(intent.rawTransaction);
 if(sent.hash!==tx.hash)throw Error('RPC returned a different funding hash');
 return {status:'broadcast-awaiting-independent-verification',
  transactionHash:tx.hash,relayer:scope.relayer};
}
function rpcProvider(){
 const value=process.env.GOVERNANCE_MAINNET_RPC_URL||'https://mainnet.base.org';
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||!url.hostname)
  throw Error('HTTPS Base mainnet RPC required');
 return new JsonRpcProvider(url.href,CHAIN,{staticNetwork:false,cacheTimeout:0});
}
async function main(){
 if(process.getuid()!==0)throw Error('Root operator required');
 const [mode,requestFile,...args]=process.argv.slice(2);
 if(!['--quote','--prepare','--status','--broadcast'].includes(mode)||
  !requestFile||((mode==='--prepare')?args.length!==2:args.length!==0))
  throw Error('Use --quote, --prepare <max-fee-wei> <max-total-wei>, --status or --broadcast with an absolute reviewed request');
 if(mode!=='--status')projectPreflight(requestFile);
 const scope=binding(requestFile),provider=rpcProvider();
 try{
  if(mode==='--quote'||mode==='--prepare'){
   if(mode==='--quote'){
    const review=await quote(provider,scope);
    console.log(JSON.stringify({status:review.status,reviewId:scope.request.reviewId,
     relayer:scope.relayer,targetWei:scope.target.toString(),
     amountWei:review.amount.toString(),
     ...(review.status==='quote-only'?{maxFeePerGasWei:review.maxFeePerGas.toString(),
      estimatedMaximumWei:review.maximumTotal.toString(),
      feeMaximumWei:review.maximumFee.toString(),ownerBalanceWei:review.ownerBalance.toString()}: {})}));
   }else{
    await withFundingLock(async()=>{
     await noPendingOtherIntents(provider,scope);
     const key=protectedFile(KEY,128);
     if(!/^0x[0-9a-fA-F]{64}$/.test(key))throw Error('Protected owner wallet key malformed');
     const intent=await prepareIntent(provider,scope,new Wallet(key),args[0],args[1]);
     saveIntent(intent,scope);
     console.log(JSON.stringify({status:'signed-not-broadcast',reviewId:intent.reviewId,
      relayer:intent.to,amountWei:intent.amountWei,
      approvedTotalCapWei:intent.approvedTotalCapWei,
      transactionHash:intent.transactionHash}));
    });
   }
  }else{
   protectedDirectory(STATE);
   const intent=JSON.parse(protectedFile(intentFile(scope),8192));
   const tx=validateIntent(intent,scope);
   if(Number((await provider.getNetwork()).chainId)!==CHAIN)
    throw Error('Base mainnet RPC required');
   if(mode==='--status'){
    const receipt=await provider.getTransactionReceipt(tx.hash);
    if(receipt&&(receipt.from?.toLowerCase()!==OWNER.toLowerCase()||
      receipt.to?.toLowerCase()!==scope.relayer.toLowerCase()))
     throw Error('Funding receipt scope mismatch');
    const pending=receipt?null:await provider.getTransaction(tx.hash);
    console.log(JSON.stringify({status:receipt?.status===1?'mined':receipt?'failed':pending?'pending':'signed-not-broadcast',
     relayer:scope.relayer,transactionHash:tx.hash}));
   }else console.log(JSON.stringify(await withFundingLock(()=>broadcast(provider,scope,intent))));
  }
 }finally{provider.destroy();}
}
if(require.main===module)main().catch(()=>{console.error('Production relayer funding step failed; no key or signed bytes printed.');process.exitCode=1;});
module.exports={binding,projectPreflight,quote,prepareIntent,validateIntent,broadcast,extraFees};
