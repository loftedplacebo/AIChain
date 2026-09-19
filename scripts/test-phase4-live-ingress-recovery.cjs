// Disposable-chain integration: bounded synthetic ingress backlog plus durable
// queue/indexer restart. No secret is written; wallet decryption occurs on host.
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes} = require('ethers');
const {AvrIngressQueue} = require('../sdk/typescript/avr-ingress-queue');
const {createPresentation} = require('../sdk/typescript/avr-presentation');
const {syncIndex, lookupReceipt} = require('../sdk/typescript/avr-event-indexer');

const MAX_RECEIPTS = 100;
const BATCH_SIZE = 25;
const START_BLOCK = 4673;
const p95 = values => values.sort((a,b)=>a-b)[Math.round((values.length - 1) * .95)];
const readJson = file => JSON.parse(fs.readFileSync(file,'utf8'));
function writeAtomic(file, value) { const temporary=`${file}.tmp`; fs.writeFileSync(temporary,`${JSON.stringify(value,null,2)}\n`); fs.renameSync(temporary,file); }
function requireLoopback(url) { assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname),'Loopback RPC required'); }

async function consumer(args) {
  const queue=AvrIngressQueue.fromSnapshot(readJson(args.queueState));
  const traffic=readJson(path.join(args.traffic,'report.json'));
  const artifact=readJson(path.join(args.traffic,'ReceiptBatchAnchor.json'));
  const provider=new JsonRpcProvider(args.rpc,undefined,{cacheTimeout:-1}); provider.pollingInterval=1000;
  const wallet=(await Wallet.fromEncryptedJson(fs.readFileSync(args.keystore,'utf8'),fs.readFileSync(args.password,'utf8').trim())).connect(provider);
  const batch=new Contract(traffic.batch,artifact.abi,wallet);
  const results=[];
  try {
    for (let item; (item=queue.drain(Date.now(),true));) {
      const began=Date.now();
      const transaction=await batch.anchorBatch(item.manifest.batchRoot,item.receiptIds.length,'0.1.0-draft',{type:0,gasPrice:1000000000n});
      const receipt=await transaction.wait(1,180000);
      assert.equal(receipt.status,1);
      queue.recordAnchorResult(item,{status:'included',anchor:{transactionHash:receipt.hash,blockNumber:receipt.blockNumber}});
      writeAtomic(args.queueState,queue.snapshot());
      writeAtomic(path.join(args.manifests,`${item.batchId}.json`),item.manifest);
      results.push({batchId:item.batchId,receiptCount:item.receiptIds.length,transactionHash:receipt.hash,blockNumber:receipt.blockNumber,inclusionMs:Date.now()-began});
    }
    writeAtomic(args.consumerResult,{status:'passed',batches:results});
  } finally { provider.destroy(); }
}

async function main() {
  assert.equal(process.env.AICHAIN_ENABLE_AVR_INGRESS_RECOVERY,'1','Explicit ingress-recovery opt-in required');
  const [rpc,traffic,output,keystore,password,stage] = process.argv.slice(2);
  requireLoopback(rpc); assert(rpc&&traffic&&output&&keystore&&password,'Usage: rpc traffic output keystore password [consumer]');
  const expectedGenesis='0x6214e0a95e9d8bf2f7d9aad65d2cb5b219121a834d4cb9e5409aabd3bb54493d';
  const queueState=path.join(output,'queue-state.json'); const manifests=path.join(output,'manifests'); const consumerResult=path.join(output,'consumer-result.json');
  const args={rpc,traffic,output,keystore,password,queueState,manifests,consumerResult};
  if (stage==='consumer') return consumer(args);
  assert(!fs.existsSync(output),'Refusing to overwrite evidence directory'); fs.mkdirSync(manifests,{recursive:true});
  const provider=new JsonRpcProvider(rpc,undefined,{cacheTimeout:-1});
  try {
    const genesis=await provider.getBlock(0); assert.equal(genesis.hash,expectedGenesis);
    const trafficReport=readJson(path.join(traffic,'report.json')); assert.equal(trafficReport.status,'passed');
    const contracts=[{kind:'individual',address:trafficReport.anchor},{kind:'batch',address:trafficReport.batch}];
    const indexState=path.join(output,'index-state.json');
    // Indexer is healthy here, then deliberately left stopped while batches are anchored.
    await syncIndex({provider,contracts,statePath:indexState,manifestsDirectory:manifests,startBlock:START_BLOCK});
    const fixture=readJson(path.join(__dirname,'..','fixtures','avr','receipt-v0.1.0-draft.json'));
    const runId=`phase4-live-ingress:${Date.now()}`;
    const queue=new AvrIngressQueue({maxQueueReceipts:MAX_RECEIPTS,maxBatchReceipts:BATCH_SIZE,microBatchMs:1});
    const latency=[]; let first;
    for(let index=0; index<MAX_RECEIPTS; index++) {
      const receipt=structuredClone(fixture); receipt.commitments.input=`0x${keccak256(toUtf8Bytes(`${runId}:${index}`)).slice(2)}`;
      const presentation=createPresentation(receipt,{level:'commitment-only'}); if(!first) first=presentation;
      const began=performance.now(); const accepted=queue.submit(presentation); latency.push(performance.now()-began); assert.equal(accepted.accepted,true);
    }
    assert.equal(queue.submit(first).duplicate,true);
    const overflow=structuredClone(fixture); overflow.commitments.input=`0x${keccak256(toUtf8Bytes(`${runId}:overflow`)).slice(2)}`;
    assert.equal(queue.submit(createPresentation(overflow,{level:'commitment-only'})).status,'rejected-queue-full');
    writeAtomic(queueState,queue.snapshot()); // Durable handoff before the consumer process is "stopped".
    const child=spawnSync(process.execPath,[__filename,rpc,traffic,output,keystore,password,'consumer'],{env:process.env,encoding:'utf8',timeout:720000});
    assert.equal(child.status,0,child.stderr||String(child.error));
    const consumption=readJson(consumerResult); assert.equal(consumption.status,'passed'); assert.equal(consumption.batches.length,4);
    const before=readJson(indexState); const latest=await provider.getBlockNumber();
    const began=Date.now(); const recovered=await syncIndex({provider,contracts,statePath:indexState,manifestsDirectory:manifests,startBlock:START_BLOCK}); const rebuildMs=Date.now()-began;
    const state=readJson(indexState); assert.equal(recovered.reorged,false); assert.equal(state.nextBlock,latest+1); assert.equal(latest-(state.nextBlock-1),0);
    const restored=AvrIngressQueue.fromSnapshot(readJson(queueState));
    const included=[...restored.records.values()].filter(entry=>entry.status==='provisionally-included'); assert.equal(included.length,MAX_RECEIPTS);
    for (const result of consumption.batches) { const item=included.find(entry=>entry.batchId===result.batchId); assert(item); assert.equal(lookupReceipt(state,item.receiptId).mode,'batch'); }
    const report={schema:'aichain.phase4-live-ingress-recovery',schemaVersion:'0.1.0-draft',status:'passed',genesisHash:expectedGenesis,
      workload:{runId,syntheticReceipts:MAX_RECEIPTS,batchSize:BATCH_SIZE,duplicateRejected:true,overflowRejected:true,consumerRestartedInFreshProcess:true,indexerStoppedDuringAnchoring:true},
      ingress:{p95Ms:p95(latency),queueLimit:MAX_RECEIPTS},anchorBatches:consumption.batches,indexer:{lagBeforeRestartBlocks:latest-(before.nextBlock-1),lagAfterRestartBlocks:latest-(state.nextBlock-1),rebuildMs,indexedBlocks:recovered.indexedBlocks},
      checks:['durable-queue-handoff','duplicate-rejection','queue-backpressure','fresh-process-consumer-restart','batch-inclusion-lookup','indexer-cursor-catchup'],
      limitations:['Synthetic public-safe receipts only','No real external client/API outage','No proof queue traffic','One GPU miner; no capacity or public TPS claim']};
    writeAtomic(path.join(output,'report.json'),report); console.log(JSON.stringify(report));
  } finally { provider.destroy(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
