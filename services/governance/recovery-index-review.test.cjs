'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{keccak256}=require('ethers'),index=require('../../sdk/typescript/avr-event-indexer'),{CONTRACT}=require('./evidence.cjs'),{baseBatchId}=require('../../sdk/typescript/base-sepolia-batch-adapter'),{reviewIndexSnapshot}=require('./recovery-index-review.cjs');
const h=n=>'0x'+n.repeat(64),publisher='0x'+'ab'.repeat(20),root=h('a'),batch=baseBatchId(CONTRACT,publisher,root),code='0x6001',encoded=index.EVENT_INTERFACE.encodeEventLog(index.EVENT_INTERFACE.getEvent('ReceiptBatchAnchoredV2'),[batch,root,publisher,1,'0.1.0-draft',100]);
async function fixture(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-index-review-')),file=path.join(directory,'index.json'),logs=[{address:CONTRACT,...encoded,blockNumber:1,blockHash:h('1'),transactionHash:h('d'),index:0}],blocks=new Map(Array.from({length:31},(_,number)=>[number,{number,hash:h(String(number%10))}]));let calls=0;
 const provider={getNetwork:async()=>({chainId:84532n}),getBlockNumber:async()=>30,getBlock:async n=>{calls++;return blocks.get(n);},getCode:async()=>code,getLogs:async({fromBlock,toBlock})=>logs.filter(l=>l.blockNumber>=fromBlock&&l.blockNumber<=toBlock).map(l=>({...l}))};
 await index.syncIndex({provider:{...provider,getBlockNumber:async()=>3},contracts:[{kind:'batch',address:CONTRACT}],statePath:file,maxRange:2});
 return {file,directory,provider,logs,blocks,options:{environment:'test',file,startBlock:0,provider,codeHash:keccak256(code)},calls:()=>calls,write(fn){const s=JSON.parse(fs.readFileSync(file,'utf8'));fn(s);fs.writeFileSync(file,JSON.stringify(s));},close(){const resolved=fs.realpathSync(directory);if(path.dirname(resolved)!==fs.realpathSync(os.tmpdir())||!path.basename(resolved).startsWith('synthetic-index-review-'))throw Error('Unsafe synthetic cleanup target');fs.rmSync(resolved,{recursive:true,force:true});}};
}
test('actual persisted JSON index replays canonical logs without writes or activation',async()=>{
 const f=await fixture();try{const before=fs.readFileSync(f.file),result=await reviewIndexSnapshot(f.options);assert.equal(result.cacheIntegrity,'matched');assert.equal(result.observation.canonicalCheckpoints,2);assert.equal(result.observation.canonicalAnchors,1);assert.equal(result.observation.observedLogs,1);assert.equal(result.observation.lag,27);assert.equal(result.confirmationPolicy,'satisfied');assert.equal(result.activation,'review-required');assert.deepEqual(fs.readFileSync(f.file),before);for(const hidden of [publisher,batch,h('d')])assert.ok(!JSON.stringify(result).includes(hidden));
  f.provider.getBlockNumber=async()=>3;assert.equal((await reviewIndexSnapshot(f.options)).confirmationPolicy,'pending');
  f.write(s=>{s.batches[batch].batchRoot=h('b');});assert.equal((await reviewIndexSnapshot(f.options)).cacheIntegrity,'failed');
 }finally{f.close();}
});
test('reorgs, missing anchors, wrong code/network, bounded history and malformed configuration cannot pass',async()=>{
 const f=await fixture();try{
  await assert.rejects(reviewIndexSnapshot({...f.options,maxCheckpoints:1}),/full-review limit/);assert.equal(f.calls()>0,true);
  f.blocks.set(3,{number:3,hash:h('9')});await assert.rejects(reviewIndexSnapshot(f.options),/no longer canonical/);f.blocks.set(3,{number:3,hash:h('3')});
  await assert.rejects(reviewIndexSnapshot({...f.options,provider:{...f.provider,getCode:async()=> '0x6002'}}),/code mismatch/);await assert.rejects(reviewIndexSnapshot({...f.options,provider:{...f.provider,getNetwork:async()=>({chainId:1n})}}),/network mismatch/);
  f.write(s=>{s.batches={};});assert.equal((await reviewIndexSnapshot(f.options)).cacheIntegrity,'failed');
  f.write(s=>{s.binding=JSON.stringify({contracts:[{kind:'batch',address:publisher}],startBlock:0});});await assert.rejects(reviewIndexSnapshot(f.options),/binding mismatch/);
 }finally{f.close();}
 const second=await fixture();try{second.write(s=>{s.checkpoints[1].fromBlock=1;});await assert.rejects(reviewIndexSnapshot(second.options),/history malformed/);}finally{second.close();}
});
test('invalid or duplicate RPC logs, changed observation tip, file drift and stalled reads fail',async()=>{
 const f=await fixture();try{
  const duplicate={...f.logs[0]};f.logs.push(duplicate);await assert.rejects(reviewIndexSnapshot(f.options),/Duplicate/);f.logs.pop();await assert.rejects(reviewIndexSnapshot({...f.options,maxLogs:1,provider:{...f.provider,getLogs:async()=>[duplicate,duplicate]}}),/full-review limit/);
  for(const invalid of [{...duplicate,removed:true},{...duplicate,blockNumber:9}])await assert.rejects(reviewIndexSnapshot({...f.options,provider:{...f.provider,getLogs:async()=>[invalid]}}),/Invalid canonical index log/);
  f.logs[0].blockHash=h('9');await assert.rejects(reviewIndexSnapshot(f.options),/event block changed/);f.logs[0].blockHash=h('1');
  const originalData=f.logs[0].data;f.logs[0].data='0x';await assert.rejects(reviewIndexSnapshot(f.options),/Malformed batch anchor log/);f.logs[0].data=originalData;
  let reads=0;await assert.rejects(reviewIndexSnapshot({...f.options,provider:{...f.provider,getBlock:async n=>n===30&&++reads===2?{number:30,hash:h('9')}:f.blocks.get(n)}}),/tip changed/);
  let changed=false;await assert.rejects(reviewIndexSnapshot({...f.options,provider:{...f.provider,getLogs:async args=>{if(!changed){changed=true;f.write(s=>{s.updatedAt='synthetic-drift';});}return f.provider.getLogs(args);}}}),/file changed/);
  await assert.rejects(reviewIndexSnapshot({...f.options,timeoutMs:10,provider:{...f.provider,getNetwork:()=>new Promise(()=>{})}}),/timeout/);
 }finally{f.close();}
});
