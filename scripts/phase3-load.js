// Bounded mixed-workload smoke measurement, not a capacity/saturation claim.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {JsonRpcProvider,Contract,NonceManager}=require('ethers');
const {derivePolicyReceipt}=require('../sdk/typescript/zk-policy-statement');
const {createPresentation}=require('../sdk/typescript/avr-presentation');
const {AvrIngressQueue}=require('../sdk/typescript/avr-ingress-queue');
const {syncIndex,lookupReceipt}=require('../sdk/typescript/avr-event-indexer');
async function main(){
 if(process.env.AICHAIN_ENABLE_PHASE3!=='1')throw Error('Explicit alpha opt-in required');
 const dir=path.resolve(process.argv[2]); const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n)));
 const c=read('context.json'); const p=new JsonRpcProvider('http://127.0.0.1:18548',undefined,{cacheTimeout:-1});p.pollingInterval=100;
 try{
 assert.equal((await p.getBlock(0)).hash,c.genesisHash);assert.equal((await p.getNetwork()).chainId,1337n);
 const signer=new NonceManager(await p.getSigner(0));
 const batch=new Contract(c.batch,read('artifacts/ReceiptBatchAnchor.json').abi,signer);
 const queue=new AvrIngressQueue({maxBatchReceipts:100,maxQueueReceipts:1000});const presentations=[];const ingest=[];
 const begun=performance.now();
 for(let i=0;i<1000;i++){
 const d=read('witness.json');d.privateWitness.action.amount+=10000+i;
 const presentation=createPresentation(derivePolicyReceipt(d.publicMetadata,d.privateWitness),{level:'commitment-only'});
 const t=performance.now();assert(queue.submit(presentation).accepted);ingest.push(performance.now()-t);presentations.push(presentation);
 }
 const batches=[];for(let b;(b=queue.drain(Date.now(),true));)batches.push(b);
 const manifests=path.join(dir,'load-manifests');fs.mkdirSync(manifests,{recursive:true});
 const latency=[];const mined=[];let cursor=0;
 async function worker(){while(cursor<batches.length){const b=batches[cursor++];const t=performance.now();
 const r=await(await batch.anchorBatch(b.manifest.batchRoot,b.manifest.leafCount,b.manifest.anchorSchemaVersion)).wait();
 mined.push(r);latency.push(performance.now()-t);queue.recordAnchorResult(b,{status:'included',anchor:{transactionHash:r.hash}});
 fs.writeFileSync(path.join(manifests,`${b.batchId}.json`),JSON.stringify(b.manifest));
 }}
 await Promise.all([worker(),worker()]);
 const includedMs=performance.now()-begun;
 const proofTx=await p.getTransaction(read('report.json').proofTransaction);
 const proofReplay=await(await signer.sendTransaction({to:proofTx.to,data:proofTx.data})).wait();assert.equal(proofReplay.status,1);
 const indexStart=performance.now();const statePath=path.join(dir,'load-index.json');
 const opts={provider:p,contracts:[{kind:'batch',address:c.batch}],statePath,manifestsDirectory:manifests,startBlock:Math.min(...mined.map(r=>r.blockNumber))};
 const indexed=await syncIndex(opts);const indexMs=performance.now()-indexStart;
 const readStart=performance.now();for(const v of presentations)assert(lookupReceipt(indexed.state,v.receiptId));
 const lookupMs=performance.now()-readStart;await syncIndex(opts);
 const percentile=(a,q)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))];
 const report={scope:'1000 synthetic receipt commitments, 10 batches, concurrency 2, one real-proof replay; smoke test, NOT maximum capacity',logicalReceipts:1000,batchTransactions:10,includedMs,transactionTps:10/(includedMs/1000),logicalReceiptTps:1000/(includedMs/1000),ingestionP95Ms:percentile(ingest,.95),inclusionP95Ms:percentile(latency,.95),indexMs,lookup1000Ms:lookupMs,indexBytes:fs.statSync(statePath).size,indexedBlocks:indexed.indexedBlocks,proofReplayTransaction:proofReplay.hash};
 fs.writeFileSync(path.join(dir,'load-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{p.destroy();}
}
main().catch(e=>{console.error(e.shortMessage||e.message);process.exitCode=1;});
