// Dedicated testnet worker. Keys stay in local files, never in command arguments or logs.
const fs=require('node:fs');
const {Wallet,JsonRpcProvider}=require('ethers');
const {GovernanceStore}=require('../services/governance/store');
const {GovernanceWorker}=require('../services/governance/worker.cjs');
async function main(){
 const env=process.env;
 for(const name of ['GOVERNANCE_TENANT','GOVERNANCE_PROJECT','GOVERNANCE_RECEIPT_KEY_FILE','GOVERNANCE_RELAYER_KEY_FILE','GOVERNANCE_WORKER_JOURNAL','GOVERNANCE_EVIDENCE_RPC_URL'])if(!env[name])throw Error('Missing '+name);
 if(!['test','dev'].includes(env.GOVERNANCE_ENV||'dev'))throw Error('Production is not enabled');
 const url=new URL(env.GOVERNANCE_EVIDENCE_RPC_URL);if(url.protocol!=='https:')throw Error('HTTPS RPC required');
 const recorder=new Wallet(fs.readFileSync(env.GOVERNANCE_RECEIPT_KEY_FILE,'utf8').trim()),signer=new Wallet(fs.readFileSync(env.GOVERNANCE_RELAYER_KEY_FILE,'utf8').trim());
 if(recorder.address===signer.address)throw Error('Use separate recording and gas-paying keys');
 const principal={tenant:env.GOVERNANCE_TENANT,project:env.GOVERNANCE_PROJECT},policy=require('../services/governance/worker-policy.cjs').workerPolicy({...JSON.parse(env.GOVERNANCE_WORKER_POLICY||'{}'),paused:env.GOVERNANCE_WORKER_ENABLED!=='true'});
 // A new journal must carry its test-environment marker so coordinated
 // encrypted backups can inspect and restore it without adopting old state.
 if(!fs.existsSync(env.GOVERNANCE_WORKER_JOURNAL))require('../services/governance/environment.cjs').bindSqlite(env.GOVERNANCE_WORKER_JOURNAL,env.GOVERNANCE_ENV||'dev');
 const recoveryPublisher=require('../services/governance/worker-launch-binding.cjs').loadWorkerBinding({journal:env.GOVERNANCE_WORKER_JOURNAL,environment:env.GOVERNANCE_ENV||'dev',storage:env.GOVERNANCE_STORAGE||'sqlite',principal,publisher:signer.address,recorder:recorder.address,policy,codeHash:require('../services/governance/evidence.cjs').CODE_HASH});
 const provider=new JsonRpcProvider(url.href,84532,{staticNetwork:false,cacheTimeout:0});
 let store;
 if(env.GOVERNANCE_STORAGE==='postgres'){
  const {Pool}=require('pg');const {PostgresGovernanceStore}=require('../services/governance/postgres-store.cjs');
  if(!env.GOVERNANCE_DATABASE_URL)throw Error('Database URL required');const pool=new Pool(require('../services/governance/postgres-connection.cjs').connectionOptions(env.GOVERNANCE_DATABASE_URL,{caFile:env.GOVERNANCE_DATABASE_CA_FILE}));store=new PostgresGovernanceStore(pool,{runtimeProfile:'evidence-worker',recoveryPublisher});try{await store.ready(env.GOVERNANCE_ENV||'dev');}catch(error){await pool.end();provider.destroy();throw error;}
 }else{if(!env.GOVERNANCE_DB||!fs.existsSync(env.GOVERNANCE_DB))throw Error('Existing governance database required');store=new GovernanceStore(env.GOVERNANCE_DB);}
 if(process.argv.includes('--prepare-only')){
  try{
   if(!process.argv.includes('--once')||env.GOVERNANCE_WORKER_ENABLED!=='true'||env.GOVERNANCE_STORAGE!=='postgres'||!env.GOVERNANCE_EXPECTED_EVENT_ID)throw Error('Bounded PostgreSQL preparation required');
   const existing=await store.evidenceBatchIds(principal),pending=await store.pendingEvidence(principal,2);
   if(existing.length||pending.length!==1||pending[0].eventId!==env.GOVERNANCE_EXPECTED_EVENT_ID)throw Error('Preparation requires exactly the reviewed pending event and no existing evidence');
  }catch(error){await store.close();provider.destroy();throw error;}
 }
 if(process.argv.includes('--broadcast-only')){
  try{
   if(!process.argv.includes('--once')||env.GOVERNANCE_WORKER_ENABLED!=='true'||env.GOVERNANCE_STORAGE!=='postgres'||!env.GOVERNANCE_EXPECTED_BATCH_ID)throw Error('Bounded PostgreSQL broadcast required');
   const ids=await store.evidenceBatchIds(principal),entries=ids.length===1?await store.batchEvidence(principal,ids[0]):[];
   const pending=await store.pendingEvidence(principal,1);
   const journal=new (require('node:sqlite').DatabaseSync)(env.GOVERNANCE_WORKER_JOURNAL,{readOnly:true});let jobs;
   try{jobs=journal.prepare('SELECT count(*) n FROM jobs').get().n;}finally{journal.close();}
   if(ids.length!==1||ids[0]!==env.GOVERNANCE_EXPECTED_BATCH_ID||entries.length!==1||entries[0].bundle.transactions.length||pending.length||jobs)throw Error('Broadcast requires exactly the reviewed unsubmitted batch and no existing journal job');
  }catch(error){await store.close();provider.destroy();throw error;}
 }
 let worker;let stopping=false;process.once('SIGINT',()=>{stopping=true;});process.once('SIGTERM',()=>{stopping=true;});
 try{
  worker=new GovernanceWorker({store,principal,recorder,signer,provider,journal:env.GOVERNANCE_WORKER_JOURNAL,policy});
  console.log(JSON.stringify({publisher:signer.address,mode:env.GOVERNANCE_WORKER_ENABLED==='true'?'testnet-enabled':'paused'}));
  do{try{const result=await worker.tick();console.log(JSON.stringify(result));if(process.argv.includes('--prepare-only')&&result.state!=='prepared'||process.argv.includes('--broadcast-only')&&!['submitted','broadcast-uncertain'].includes(result.state))process.exitCode=1;}catch{console.error('Worker check failed; durable state retained. Check RPC, configuration and local storage.');if(process.argv.includes('--once'))process.exitCode=1;}
   if(process.argv.includes('--once')||stopping)break;await new Promise(r=>setTimeout(r,5000));
  }while(!stopping);
 }finally{if(worker)await worker.close();await store.close();provider.destroy();}
}
main().catch(()=>{console.error('Worker startup failed. Check explicit configuration, keys and journal ownership; no credentials are logged.');process.exitCode=1;});
