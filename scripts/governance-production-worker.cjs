#!/usr/bin/env node
'use strict';
// Isolated Base mainnet publisher. Production credentials are supplied only by
// the worker's protected environment and private files, never command flags.
const fs=require('node:fs');
const {Wallet,JsonRpcProvider,keccak256}=require('ethers');
const {DatabaseSync}=require('node:sqlite');
const {Pool}=require('pg');
const {GovernanceWorker}=require('../services/governance/worker.cjs');
const {PostgresGovernanceStore}=require('../services/governance/postgres-store.cjs');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const {workerPolicy}=require('../services/governance/worker-policy.cjs');
const {evidenceAnchor}=require('../services/governance/evidence.cjs');
const {loadWorkerBinding}=require('../services/governance/worker-launch-binding.cjs');

const DB_HOST='orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com';
const CA='/etc/aichain/governance/digitalocean-ca.crt';
const JOURNAL=/^\/var\/lib\/orvessian-production-workers\/[a-f0-9]{24}\/worker\.sqlite$/;
const SCOPE=/^(org|prj)-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;

function privateFile(file){
 if(typeof file!=='string'||!file.startsWith('/'))throw Error('Absolute private file required');
 const info=fs.lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o777)!==0o600||info.size<1||info.size>4096)throw Error('Worker-owned private file required');
 return file;
}

function configuration(env,parseConnection=connectionOptions){
 if(env.GOVERNANCE_ENV!=='prod'||env.GOVERNANCE_PRODUCTION_HOST!=='contabo-shared'||env.GOVERNANCE_STORAGE!=='postgres'||!['true','false'].includes(env.GOVERNANCE_WORKER_ENABLED))throw Error('Reviewed Production worker environment required');
 const tenant=env.GOVERNANCE_TENANT,project=env.GOVERNANCE_PROJECT;
 if(!SCOPE.test(tenant||'')||!tenant.startsWith('org-')||!SCOPE.test(project||'')||!project.startsWith('prj-'))throw Error('Exact Production project scope required');
 if(!JOURNAL.test(env.GOVERNANCE_WORKER_JOURNAL||''))throw Error('Scoped Production journal path required');
 const rpc=new URL(env.GOVERNANCE_MAINNET_RPC_URL);
 if(rpc.protocol!=='https:'||rpc.username||rpc.password||rpc.hash||!rpc.hostname)throw Error('HTTPS Base mainnet RPC required');
 const anchor=evidenceAnchor(JSON.parse(env.GOVERNANCE_MAINNET_ANCHOR));
 if(anchor.chainId!==8453)throw Error('Base mainnet anchor required');
 if(!ADDRESS.test(env.GOVERNANCE_EXPECTED_RELAYER||'')||!ADDRESS.test(env.GOVERNANCE_EXPECTED_RECORDER||'')||env.GOVERNANCE_EXPECTED_RELAYER.toLowerCase()===env.GOVERNANCE_EXPECTED_RECORDER.toLowerCase())throw Error('Distinct reviewed signer addresses required');
 if(env.GOVERNANCE_DATABASE_CA_FILE!==CA)throw Error('Reviewed Production database CA required');
 const database=parseConnection(env.GOVERNANCE_DATABASE_URL,{caFile:CA});
 if(database.host!==DB_HOST||database.port!==25060||database.database!=='governance_prod'||database.user!=='governance_prod_worker'||!database.ssl)throw Error('Exclusive Production worker database required');
 const policy=workerPolicy({...JSON.parse(env.GOVERNANCE_WORKER_POLICY),paused:env.GOVERNANCE_WORKER_ENABLED!=='true'});
 if(policy.maxTransactionsPerHour>100||BigInt(policy.maxGasPriceWei)>1000000000000n||BigInt(policy.dailyReservationWei)>1000000000000000000n||BigInt(policy.l1AllowanceWei)>1000000000000000000n)throw Error('Reviewed mainnet worker spending bounds required');
 return {principal:{tenant,project},journal:env.GOVERNANCE_WORKER_JOURNAL,
  recorderKey:env.GOVERNANCE_RECEIPT_KEY_FILE,
  relayerKey:env.GOVERNANCE_RELAYER_KEY_FILE,
  expectedRecorder:env.GOVERNANCE_EXPECTED_RECORDER.toLowerCase(),
  expectedRelayer:env.GOVERNANCE_EXPECTED_RELAYER.toLowerCase(),
  rpc:rpc.href,anchor,database,policy};
}

function journalMarker(file,verifyFile=privateFile,expected=null){
 verifyFile(file);
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||
   db.prepare('SELECT name FROM governance_environment LIMIT 2').all().length!==1||
   db.prepare('SELECT name FROM governance_environment').get().name!=='prod')throw Error('Production journal marker required');
  const table=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='config'").get();
  if(table){
   const rows=db.prepare('SELECT id,body FROM config LIMIT 2').all();
   if(rows.length>1||rows.some(row=>row.id!==1||typeof row.body!=='string'||Buffer.byteLength(row.body)>4096))throw Error('Production journal identity invalid');
   if(rows.length&&expected){
    const identity=JSON.parse(rows[0].body);
    if(identity.scope?.tenant!==expected.principal.tenant||identity.scope?.project!==expected.principal.project||
     identity.publisher!==expected.publisher.toLowerCase()||identity.recorder!==expected.recorder.toLowerCase()||
     identity.contract!==expected.anchor.contract||identity.chain!==8453)throw Error('Production journal identity mismatch');
   }
  }
 }finally{db.close();}
}

async function main(){
 const flags=process.argv.slice(2);
 if(flags.length>1||flags.length===1&&!['--preflight','--once'].includes(flags[0]))throw Error('Only --preflight or --once is supported');
 const config=configuration(process.env);
 const recorder=new Wallet(fs.readFileSync(privateFile(config.recorderKey),'ascii').trim());
 const signer=new Wallet(fs.readFileSync(privateFile(config.relayerKey),'ascii').trim());
 if(recorder.address.toLowerCase()!==config.expectedRecorder||signer.address.toLowerCase()!==config.expectedRelayer)throw Error('Worker signer address mismatch');
 journalMarker(config.journal,privateFile,{principal:config.principal,
  publisher:signer.address,recorder:recorder.address,anchor:config.anchor});
 const recoveryPublisher=loadWorkerBinding({journal:config.journal,environment:'prod',storage:'postgres',principal:config.principal,publisher:signer.address,recorder:recorder.address,policy:config.policy,codeHash:config.anchor.codeHash});
 const provider=new JsonRpcProvider(config.rpc,8453,{staticNetwork:false,cacheTimeout:0});
 const pool=new Pool(config.database);
 const store=new PostgresGovernanceStore(pool,{runtimeProfile:'evidence-worker',recoveryPublisher});
 let worker;
 try{
  await store.ready('prod');
  if(Number((await provider.getNetwork()).chainId)!==8453||keccak256(await provider.getCode(config.anchor.contract))!==config.anchor.codeHash)throw Error('Mainnet chain or contract code mismatch');
  if(flags[0]==='--preflight'){
   console.log(JSON.stringify({productionWorker:'ready',mode:'read-only',publisher:signer.address,paused:config.policy.paused}));
   return;
  }
  worker=new GovernanceWorker({store,principal:config.principal,recorder,signer,provider,journal:config.journal,policy:config.policy,anchor:config.anchor,codeHash:config.anchor.codeHash});
  let stopping=false;
  process.once('SIGINT',()=>{stopping=true});
  process.once('SIGTERM',()=>{stopping=true});
  do{
   try{console.log(JSON.stringify(await worker.tick()));}
   catch{console.error('Production worker check failed; durable state retained. Inspect RPC, scope and journal.');if(flags[0]==='--once')process.exitCode=1;}
   if(flags[0]==='--once'||stopping)break;
   await new Promise(resolve=>setTimeout(resolve,5000));
  }while(!stopping);
 }finally{
  if(worker)await worker.close();
  await store.close();
  provider.destroy();
 }
}

if(require.main===module)main().catch(()=>{console.error('Production worker startup failed; no credential printed.');process.exitCode=1});
module.exports={configuration,journalMarker,privateFile};
