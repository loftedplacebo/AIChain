// Single-host, single-wallet pilot. Persist signed bytes BEFORE any broadcast.
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {keccak256,Transaction}=require('ethers');
const {prepareBatch,attachTransaction,inspectEvidence,CONTRACT,CODE_HASH}=require('./evidence.cjs');
const {BATCH_ABI}=require('../../sdk/typescript/base-sepolia-batch-adapter');
class GovernanceWorker {
 constructor({store,principal,recorder,signer,provider,journal,policy={},clock=()=>Date.now(),codeHash=CODE_HASH}){
  if(!principal?.tenant||!principal.project||!recorder||!signer||!provider)throw Error('Explicit scope, recorder, publisher signer and provider required');
  require('./environment.cjs').assertRecoveryApproved(store.db);
  this.store=store;this.p=principal;this.recorder=recorder;this.signer=signer;this.provider=provider;this.clock=clock;this.codeHash=codeHash;
  this.policy=require('./worker-policy.cjs').workerPolicy(policy);
  fs.mkdirSync(path.dirname(path.resolve(journal)),{recursive:true});this.lock=journal+'.lock';
  // Never reclaim by age: a stalled process could still broadcast. Crash recovery requires a stopped owner.
  fs.writeFileSync(this.lock,JSON.stringify({pid:process.pid,scope:principal}),{flag:'wx',mode:0o600});
  try{this.db=new DatabaseSync(journal);require('./environment.cjs').assertRecoveryApproved(this.db);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY,body TEXT NOT NULL)');}
  catch(e){this.db?.close();fs.unlinkSync(this.lock);throw e;}
  this.tail=Promise.resolve();
 }
 jobs(){return this.db.prepare('SELECT body FROM jobs ORDER BY rowid').all().map(r=>JSON.parse(r.body));}
 save(job){this.db.prepare('INSERT INTO jobs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(job.id,JSON.stringify(job));}
 signedRetryGate(job,batch,publisher,recorder){
  const now=this.clock(),validTime=v=>Number.isSafeInteger(v)&&v>=0&&v<=now,validReserve=v=>typeof v==='string'&&/^[1-9][0-9]{0,77}$/.test(v);
  if(!Number.isSafeInteger(now)||now<0||require('./recovery-worker-review.cjs').inspectJob({id:job.id,body:JSON.stringify(job)},{...this.p,publisher,recorder}).kind!=='signed')throw Error('Stored signed transaction requires journal review');
  const tx=Transaction.from(job.raw),decoded=BATCH_ABI.parseTransaction({data:tx.data});
  if(decoded.args[0]!==batch.root||Number(decoded.args[1])!==batch.leafCount||decoded.args[2]!==batch.schemaVersion||batch.publisher!==publisher)throw Error('Stored signed transaction differs from batch evidence');
  if(tx.maxFeePerGas>BigInt(this.policy.maxGasPriceWei))return 'fee-cap';
  if(Number(decoded.args[1])>this.policy.batchSize)return 'batch-policy-review-required';
  if(!validTime(job.signedAt)||!validReserve(job.reserve)||BigInt(job.reserve)<tx.gasLimit*tx.maxFeePerGas+BigInt(this.policy.l1AllowanceWei))return 'reservation-review-required';
  const signed=this.jobs().filter(j=>j.raw);if(signed.some(j=>!validTime(j.signedAt)||!validReserve(j.reserve)))return 'reservation-review-required';
  const recent=signed.filter(j=>j.signedAt>now-86400000);
  if(recent.filter(j=>j.signedAt>now-3600000).length>this.policy.maxTransactionsPerHour)return 'rate-limited';
  // An old signed retry can still spend now: retain its liability even when
  // its original signing time is outside the rolling reservation window.
  const reserved=recent.reduce((n,j)=>n+BigInt(j.reserve),0n)+(recent.some(j=>j.id===job.id)?0n:BigInt(job.reserve));
  if(reserved>BigInt(this.policy.dailyReservationWei))return 'budget-cap';
  return null;
 }
 tick(){const run=()=>this.run();const result=this.tail.then(run,run);this.tail=result.catch(()=>{});return result;}
 async checkPublisherAccess(){
  if(!this.store.assertPublisherActive)return;
  let observed={};if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='governance_publisher_release'").get()){
   const rows=this.db.prepare('SELECT body FROM governance_publisher_release').all();if(rows.length!==1||typeof rows[0].body!=='string'||Buffer.byteLength(rows[0].body)>4096)throw Error('Reviewed publisher journal binding required');const release=JSON.parse(rows[0].body);
   observed={...this.p,releaseId:release.releaseId,publisher:(await this.signer.getAddress()).toLowerCase(),recorder:(await this.recorder.getAddress()).toLowerCase(),policyDigest:require('./publisher-release-binding.cjs').policyDigest(this.policy),codeHash:this.codeHash};
  }
  await this.store.assertPublisherActive(observed);
 }
 async run(){
  await this.checkPublisherAccess();
  const publisher=(await this.signer.getAddress()).toLowerCase();
  const identity=JSON.stringify({scope:this.p,publisher,contract:CONTRACT,chain:84532,recorder:(await this.recorder.getAddress()).toLowerCase()});
  const config=this.db.prepare('SELECT body FROM config WHERE id=1').get();
  if(config&&config.body!==identity)throw Error('Journal scope or signer changed');
  if(!config)this.db.prepare('INSERT INTO config VALUES(1,?)').run(identity);
  if(Number((await this.provider.getNetwork()).chainId)!==84532||keccak256(await this.provider.getCode(CONTRACT))!==this.codeHash)throw Error('Unexpected chain or contract code');
  // Rediscover evidence committed before an interruption between databases.
  for(const id of await this.store.evidenceBatchIds(this.p)){
   if(this.db.prepare('SELECT 1 FROM jobs WHERE id=?').get(id))continue;
   const entries=await this.store.batchEvidence(this.p,id);const b=entries[0].bundle;
   if(b.batch.publisher!==publisher)continue; // Manual/other-wallet batches are never taken over.
   this.save({id,state:b.transactions.length?'external':'prepared',hash:b.transactions.at(-1)||null,at:this.clock(),attempts:0,nextAttempt:0});
  }
  for(const job of this.jobs()){
   const entries=await this.store.batchEvidence(this.p,job.id);if(!entries.length)throw Error('Journal evidence missing');
   const first=entries[0],b=first.bundle;
   if(job.hash){
    const candidate={...b,transactions:[job.hash]};
    const v=await inspectEvidence(await this.store.get(this.p,first.id),candidate,{provider:this.provider,trustedSigners:[(await this.recorder.getAddress()).toLowerCase()],codeHash:this.codeHash});
    job.verification=v.state;job.checkedAt=this.clock();
    if(v.state==='confirmed'||v.state==='confirming'){
     if(entries.some(e=>!e.bundle.transactions.includes(job.hash)))await attachTransaction(this.store,this.p,job.id,job.hash);
     job.state=v.state;this.save(job);if(v.state==='confirmed')continue;return {state:'confirming',batchId:job.id};
    }
    if(['failed','invalid-evidence','untrusted-signer','verification-failed'].includes(v.state)){job.state='blocked';this.save(job);return {state:'blocked',batchId:job.id,reason:v.reason};}
    this.save(job);
    // No new nonce while a prior transaction is uncertain or reorged.
    if(!job.raw||v.state==='unavailable')return {state:v.state,batchId:job.id};
   }
   if(this.policy.paused)return {state:'paused',batchId:job.id};
   if(job.nextAttempt>this.clock())return {state:'backoff',batchId:job.id};
   if(!job.raw){
    if(entries.length!==b.batch.leafCount)throw Error('Incomplete batch');
    for(const entry of entries){const event=await this.store.get(this.p,entry.id);if(!['test','demo'].includes(event.environment))throw Error('Synthetic/test records only');const v=await inspectEvidence(event,entry.bundle,{trustedSigners:[(await this.recorder.getAddress()).toLowerCase()]});if(v.state!=='batched')throw Error('Refused invalid or already submitted batch');}
    const now=this.clock(),recent=this.jobs().filter(j=>j.raw&&j.signedAt>now-86400000);
    if(recent.filter(j=>j.signedAt>now-3600000).length>=this.policy.maxTransactionsPerHour)return {state:'rate-limited'};
    const data=BATCH_ABI.encodeFunctionData('anchorBatch',[b.batch.root,b.batch.leafCount,b.batch.schemaVersion]);
    const gas=(await this.provider.estimateGas({from:publisher,to:CONTRACT,value:0n,data}))*120n/100n;
    const fees=await this.provider.getFeeData(),fee=fees.maxFeePerGas??fees.gasPrice;
    if(fee==null||fee<=0n||fee>BigInt(this.policy.maxGasPriceWei))return {state:'fee-cap'};
    const reserve=gas*fee+BigInt(this.policy.l1AllowanceWei);
    if(recent.reduce((n,j)=>n+BigInt(j.reserve),0n)+reserve>BigInt(this.policy.dailyReservationWei))return {state:'budget-cap'};
    if(await this.provider.getBalance(publisher)<reserve)return {state:'needs-funding',publisher};
    const nonce=await this.provider.getTransactionCount(publisher,'pending');
    if(nonce!==await this.provider.getTransactionCount(publisher,'latest'))return {state:'external-pending',publisher};
    const tx={chainId:84532,type:2,nonce,to:CONTRACT,data,value:0n,gasLimit:gas,maxFeePerGas:fee,maxPriorityFeePerGas:fees.maxPriorityFeePerGas??0n};
    const raw=await this.signer.signTransaction(tx),signed=Transaction.from(raw);
    if(signed.from.toLowerCase()!==publisher||signed.to.toLowerCase()!==CONTRACT||signed.data!==data||signed.chainId!==84532n||signed.value!==0n||signed.nonce!==nonce||signed.gasLimit!==gas||signed.maxFeePerGas!==fee||signed.maxPriorityFeePerGas!==tx.maxPriorityFeePerGas)throw Error('Signer returned unexpected transaction');
    Object.assign(job,{raw,hash:keccak256(raw),nonce,reserve:reserve.toString(),signedAt:now,state:'signed'});
    this.save(job); // Critical crash boundary: exact bytes and budget survive BEFORE network send.
   }
   const retryGate=this.signedRetryGate(job,b.batch,publisher,(await this.recorder.getAddress()).toLowerCase());if(retryGate)return {state:retryGate,batchId:job.id};
   await this.checkPublisherAccess();
   try{await this.provider.broadcastTransaction(job.raw);job.state='submitted';}
   catch{job.state='broadcast-uncertain';} // A timeout never authorises a replacement transaction.
   job.attempts++;job.nextAttempt=this.clock()+Math.min(300000,5000*2**Math.min(job.attempts,6));this.save(job);
   await attachTransaction(this.store,this.p,job.id,job.hash);
   return {state:job.state,batchId:job.id,transactionHash:job.hash};
  }
  if(this.policy.paused)return {state:'paused'};
  const prepared=await prepareBatch(this.store,this.p,this.recorder,{publisher,limit:this.policy.batchSize});
  return {state:prepared?'prepared':'idle',batchId:prepared?.batchId};
 }
 async close(){await this.tail;this.db.close();fs.unlinkSync(this.lock);}
}
module.exports={GovernanceWorker};
