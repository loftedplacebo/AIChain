// Saturated closed-loop internal-alpha workload, with bounded outstanding work.
// Measures an operating point; it does not establish distributed-network capacity.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {JsonRpcProvider,ContractFactory,NonceManager}=require('ethers');
const {derivePolicyReceipt}=require('../sdk/typescript/zk-policy-statement');
const {deriveAuthorisedReceipt}=require('../sdk/typescript/authorised-receipt');
const {createPresentation}=require('../sdk/typescript/avr-presentation');
const {AvrIngressQueue}=require('../sdk/typescript/avr-ingress-queue');
const {syncIndex,lookupReceipt}=require('../sdk/typescript/avr-event-indexer');

async function main(){
 assert.equal(process.env.AICHAIN_ENABLE_PHASE3,'1');
 const dir=path.resolve(process.argv[2]);const seconds=Number(process.argv[3]||300);
 assert(Number.isInteger(seconds)&&seconds>=300&&seconds<=3600);
 const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n)));
 const write=(n,v)=>fs.writeFileSync(path.join(dir,n),JSON.stringify(v,null,2)+'\n');
 assert(!fs.existsSync(path.join(dir,'sustained-report.json')),'Use a new run directory');
 const provider=new JsonRpcProvider('http://127.0.0.1:18548',undefined,{cacheTimeout:-1});provider.pollingInterval=100;
 try{
 assert.equal((await provider.getNetwork()).chainId,1337n);
 const owner=await provider.getSigner(0);const signer=new NonceManager(owner);
 const deploy=async(n,args=[])=>{const a=read(`artifacts/${n}.json`);const c=await new ContractFactory(a.abi,a.bytecode.object,signer).deploy(...args);await c.waitForDeployment();return c;};
 const registry=await deploy('AuthorityRegistry');const anchor=await deploy('AuthorisedAVRAnchor',[await registry.getAddress()]);const batch=await deploy('ReceiptBatchAnchor');
 const witness=read('witness.json');witness.publicMetadata.issuer=(await owner.getAddress()).toLowerCase();
 const m=witness.publicMetadata;
 const stamp=(await provider.getBlock('latest')).timestamp;m.claimedAtEpochSeconds=stamp;
 await(await registry.registerOrganization(m.organizationId)).wait();
 await(await registry.authorizeAgent(m.organizationId,m.issuer,m.authorityCommitment,stamp,stamp+86400)).wait();
 const official=await deploy('RiscZeroGroth16Verifier',['0xa54dc85ac99f851c92d7c96d7318af41dbe7c0194edfcc37eb4d422a998c1f56','0x04446e66d300eb7fb45c9726bb53c793dda407a62e9601618bb43c5c14657ac0']);
 const proof=read('proof.json');const image=fs.readFileSync(path.join(dir,'image-id.txt'),'utf8').trim();assert.equal(proof.imageId,image);
 const adapter=await deploy('RiscZeroAVRProofVerifierAdapter',[await official.getAddress(),image]);assert(await adapter.verifyProof(proof.seal,proof.journal));
 const startBlock=await provider.getBlockNumber();
 const manifests=path.join(dir,'sustained-manifests');fs.mkdirSync(manifests,{recursive:true});
 const opts={provider,contracts:[{kind:'authorised',address:await anchor.getAddress()},{kind:'batch',address:await batch.getAddress()}],startBlock,statePath:path.join(dir,'sustained-index.json'),manifestsDirectory:manifests};
 const ids=[],samples=[],latencies=[],ingress=[],batchBuild=[];let txCount=0,cycle=0,batchCount=0,proofCount=0;let blockPacking=[];
 const started=performance.now();const initialMemory=process.memoryUsage().rss;
 while(performance.now()-started<seconds*1000){
   const queue=new AvrIngressQueue({maxQueueReceipts:400,maxBatchReceipts:100});const current=[];
   for(let i=0;i<401;i++){
     const d=structuredClone(witness);d.privateWitness.action.amount+=100000+cycle*401+i;
     const receipt=derivePolicyReceipt(d.publicMetadata,d.privateWitness);current.push(receipt);
     if(i<400){const p=createPresentation(receipt,{level:'commitment-only'});const t=performance.now();assert(queue.submit(p).accepted);ingress.push(performance.now()-t);ids.push(p.receiptId);}
   }
   assert.equal(queue.submit(createPresentation(current[400],{level:'commitment-only'})).status,'rejected-queue-full');
   const batches=[];for(let b;(b=queue.drain(Date.now(),true));){batches.push(b);}
   const begun=performance.now();
   // Four batch submissions are the only concurrent writes; the queue is
   // rotated only once all four have been reconciled to successful receipts.
   await Promise.all(batches.map(async(b,i)=>{
     const r=await(await batch.anchorBatch(b.manifest.batchRoot,100,b.manifest.anchorSchemaVersion)).wait();assert.equal(r.status,1);
     queue.recordAnchorResult(b,{status:'included',anchor:{transactionHash:r.hash}});latencies.push(performance.now()-begun);
     const t=performance.now();fs.writeFileSync(path.join(manifests,`${cycle}-${i}.json`),JSON.stringify(b.manifest));batchBuild.push(performance.now()-t);
   }));batchCount+=4;txCount+=4;
   const d=deriveAuthorisedReceipt(current[400]);ids.push(d.receiptId);
   const ar=await(await anchor.anchorAuthorisedReceipt(d.receiptId,d.commitmentsRoot,m.organizationId,m.authorityCommitment,current[400].schemaVersion)).wait();assert.equal(ar.status,1);txCount++;
   // Replay verification is real cryptographic work, not a claim of a newly
   // generated proof or proof of any of the workload's new receipts.
   const pr=await(await signer.sendTransaction({to:await adapter.getAddress(),data:adapter.interface.encodeFunctionData('verifyProof',[proof.seal,proof.journal])})).wait();assert.equal(pr.status,1);proofCount++;txCount++;
   const t=performance.now();const indexed=await syncIndex(opts);const indexMs=performance.now()-t;
   const lookupStart=performance.now();for(const id of ids.slice(-11))assert(lookupReceipt(indexed.state,id));
   const block=await provider.getBlock(pr.blockNumber);blockPacking.push(Number(block.gasUsed)*100/Number(block.gasLimit));
   samples.push({cycle,elapsedMs:performance.now()-started,receipts:ids.length,indexMs,lookup11Ms:performance.now()-lookupStart,indexBytes:fs.statSync(opts.statePath).size,rssBytes:process.memoryUsage().rss,headLagBlocks:(await provider.getBlockNumber())-(indexed.state.nextBlock-1)});
   write('sustained-progress.json',{status:'running',last:samples.at(-1)});cycle++;
 }
 const elapsedMs=performance.now()-started;
 const recoverStart=performance.now();const rebuilt=await syncIndex({...opts,statePath:path.join(dir,'sustained-rebuilt-index.json')});
 for(const id of ids.filter((_,i)=>i%401===400))assert(lookupReceipt(rebuilt.state,id));
 for(const b of Object.values(rebuilt.state.batches)){assert(b.manifest);}
 assert.equal(Object.keys(rebuilt.state.batches).length,batchCount);
 const recoveryMs=performance.now()-recoverStart;
 const pct=(arr,p)=>[...arr].sort((a,b)=>a-b)[Math.min(arr.length-1,Math.floor(arr.length*p))];
 write('sustained-report.json',{status:'passed',profile:'single-node Core-Geth dev, closed loop, max four concurrent batches; NOT KawPoW saturation capacity',requestedSeconds:seconds,elapsedMs,logicalReceipts:ids.length,transactions:txCount,batchTransactions:batchCount,individualTransactions:cycle,realProofReplays:proofCount,logicalReceiptTps:ids.length/(elapsedMs/1000),transactionTps:txCount/(elapsedMs/1000),ingressP95Ms:pct(ingress,.95),batchInclusionP95Ms:pct(latencies,.95),manifestWriteP95Ms:pct(batchBuild,.95),proofBlockGasUsageP95Percent:pct(blockPacking,.95),initialRssBytes:initialMemory,recoveryMs,checks:['backpressure','no-failed-transactions','all-cycle-lookups','durable-index-resume','fresh-index-replay'],samples});
 console.log(JSON.stringify({...read('sustained-report.json'),samples:undefined},null,2));
 }finally{provider.destroy();}
}
main().catch(e=>{console.error(e.shortMessage||e.message);process.exitCode=1;});
