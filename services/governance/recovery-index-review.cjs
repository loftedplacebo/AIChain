'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{keccak256}=require('ethers'),index=require('../../sdk/typescript/avr-event-indexer'),{CONTRACT}=require('./evidence.cjs');
const integer=v=>Number.isSafeInteger(v)&&v>=0,hash=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v),object=v=>v&&typeof v==='object'&&!Array.isArray(v),canonical=v=>Array.isArray(v)?v.map(canonical):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
function readIndex({environment,file,startBlock,maxEntries=1000,maxCheckpoints=1000}){
 if(!['dev','test'].includes(environment)||typeof file!=='string'||!path.isAbsolute(file)||!integer(startBlock)||![maxEntries,maxCheckpoints].every(n=>Number.isInteger(n)&&n>=1&&n<=10000))throw Error('Explicit dev/test index identity and bounded review required');
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)throw Error('Bounded regular JSON index required');const raw=fs.readFileSync(file),state=index.validateState(JSON.parse(raw));
 if(state.chainId!==84532||state.startBlock!==startBlock||!integer(state.nextBlock)||state.nextBlock<startBlock||!object(state.individual)||!object(state.batches)||Object.keys(state.individual).length!==0)throw Error('Expected Base Sepolia batch-only index required');
 const contracts=[{kind:'batch',address:CONTRACT}],binding=JSON.parse(state.binding);if(JSON.stringify(canonical(binding))!==JSON.stringify(canonical({contracts,startBlock})))throw Error('Index contract/start binding mismatch');
 if(state.checkpoints.length>maxCheckpoints||Object.keys(state.batches).length>maxEntries)throw Error('Index exceeds bounded full-review limit');let next=startBlock;
 for(const c of state.checkpoints){if(!integer(c.fromBlock)||!integer(c.toBlock)||c.fromBlock!==next||c.toBlock<c.fromBlock||c.toBlock-c.fromBlock>=1000||c.number!==c.toBlock||!hash(c.hash))throw Error('Index checkpoint history malformed');next=c.toBlock+1;}
 if(next!==state.nextBlock)throw Error('Index checkpoint cursor mismatch');
 for(const [id,b] of Object.entries(state.batches)){if(!hash(id)||!object(b)||b.contract!==CONTRACT||!integer(b.blockNumber)||b.blockNumber<startBlock||b.blockNumber>=state.nextBlock||!hash(b.blockHash)||!hash(b.transactionHash)||!integer(b.logIndex))throw Error('Index anchor position malformed');}
 return {state,rawDigest:createHash('sha256').update(raw).digest('hex'),contracts};
}
async function reviewIndexSnapshot(options){
 const {provider,codeHash,minimumConfirmations=12,maxLogs=10000,timeoutMs=5000}=options;
 if(!provider||!['getNetwork','getCode','getBlock','getBlockNumber','getLogs'].every(m=>typeof provider[m]==='function')||!hash(codeHash)||!Number.isInteger(minimumConfirmations)||minimumConfirmations<1||minimumConfirmations>1000||!Number.isInteger(maxLogs)||maxLogs<1||maxLogs>10000||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)throw Error('Bounded read-only index provider and expected code hash required');
 const snapshot=readIndex(options),deadline=Date.now()+30000;
 async function observe(method,...args){if(Date.now()>=deadline)throw Error('Index review exceeded bounded duration');let timer;try{return await Promise.race([Promise.resolve().then(()=>provider[method](...args)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Index observation timeout')),Math.min(timeoutMs,deadline-Date.now()));})]);}finally{clearTimeout(timer);}}
 const network=await observe('getNetwork');if(network?.chainId!==84532&&network?.chainId!==84532n)throw Error('Index review network mismatch');const head=await observe('getBlockNumber');if(!integer(head)||snapshot.state.nextBlock>head+1)throw Error('Index cursor ahead of current chain');
 const tip=await observe('getBlock',head);if(tip?.number!==head||!hash(tip.hash?.toLowerCase()))throw Error('Canonical observation tip required');
 const code=await observe('getCode',CONTRACT,head);if(typeof code!=='string'||code.length>131074||!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)||keccak256(code)!==codeHash)throw Error('Index contract code mismatch');
 const rebuilt=index.newState(84532,options.startBlock),positions=new Set();let observedLogs=0,canonicalCheckpoints=0,manifests=0;
 for(const checkpoint of snapshot.state.checkpoints){
  const before=await observe('getBlock',checkpoint.number);if(before?.number!==checkpoint.number||before?.hash?.toLowerCase()!==checkpoint.hash)throw Error('Index checkpoint no longer canonical; rebuild required');
  const logs=await observe('getLogs',{address:CONTRACT,fromBlock:checkpoint.fromBlock,toBlock:checkpoint.toBlock});if(!Array.isArray(logs)||(observedLogs+=logs.length)>maxLogs)throw Error('Index logs exceed bounded full-review limit');
  logs.sort((a,b)=>a.blockNumber-b.blockNumber||(a.index??a.logIndex)-(b.index??b.logIndex));
  for(const log of logs){
   const position=log.index??log.logIndex;if(log.removed||log.address?.toLowerCase()!==CONTRACT||!integer(log.blockNumber)||log.blockNumber<checkpoint.fromBlock||log.blockNumber>checkpoint.toBlock||!integer(position)||!hash(log.blockHash?.toLowerCase())||!hash(log.transactionHash?.toLowerCase())||typeof log.data!=='string'||log.data.length>8192||!Array.isArray(log.topics)||log.topics.length>5||!log.topics.every(t=>hash(t?.toLowerCase())))throw Error('Invalid canonical index log');
   const id=log.blockNumber+':'+position;if(positions.has(id))throw Error('Duplicate index log position');positions.add(id);
   const block=await observe('getBlock',log.blockNumber);if(block?.number!==log.blockNumber||block?.hash?.toLowerCase()!==log.blockHash.toLowerCase())throw Error('Index event block changed');
   const parsed=index.parsedEvents([log],snapshot.contracts[0]),knownTopics=['ReceiptBatchAnchored','ReceiptBatchAnchoredV2'].map(name=>index.EVENT_INTERFACE.getEvent(name).topicHash);if(knownTopics.includes(log.topics[0]?.toLowerCase())&&!parsed.length)throw Error('Malformed batch anchor log');for(const item of parsed)index.applyEvent(rebuilt,item);
   if(Object.keys(rebuilt.batches).length>(options.maxEntries??1000))throw Error('Canonical anchors exceed bounded full-review limit');
  }
  const after=await observe('getBlock',checkpoint.number);if(after?.number!==checkpoint.number||after?.hash?.toLowerCase()!==checkpoint.hash)throw Error('Index checkpoint changed during review');canonicalCheckpoints++;
 }
 const anchors=Object.fromEntries(Object.entries(snapshot.state.batches).map(([id,b])=>{if(b.manifest)manifests++;return [id,{...b,manifest:null}];}));
 const cacheMatches=JSON.stringify(canonical(anchors))===JSON.stringify(canonical(rebuilt.batches));
 const finalTip=await observe('getBlock',head);if(finalTip?.number!==head||finalTip?.hash?.toLowerCase()!==tip.hash.toLowerCase())throw Error('Index observation tip changed');if(readIndex(options).rawDigest!==snapshot.rawDigest)throw Error('Index file changed during review');
 const lag=head-(snapshot.state.nextBlock-1),confirmations=snapshot.state.checkpoints.length?head-snapshot.state.checkpoints.at(-1).number+1:0,observation={head,headHash:tip.hash.toLowerCase(),indexedThrough:snapshot.state.nextBlock-1,canonicalCheckpoints,observedLogs,canonicalAnchors:Object.keys(rebuilt.batches).length,confirmations,lag};
 const canonicalStateDigest=createHash('sha256').update(JSON.stringify(canonical(rebuilt.batches))).digest('hex');
 return {environment:options.environment,cacheIntegrity:cacheMatches?'matched':'failed',observation,storedAnchors:Object.keys(anchors).length,manifestsNotVerified:manifests,confirmationPolicy:confirmations>=minimumConfirmations?'satisfied':'pending',snapshotDigest:snapshot.rawDigest,observationDigest:createHash('sha256').update(JSON.stringify({snapshotDigest:snapshot.rawDigest,observation,codeHash,canonicalStateDigest,cacheMatches,minimumConfirmations})).digest('hex'),activation:'review-required',interpretation:'Derived JSON cache and bounded RPC log replay only; cache is not a SQLite recovery journal. Manifest/recording evidence, RPC trust, activity after the observation and approved service restart remain separate'};
}
module.exports={reviewIndexSnapshot};
