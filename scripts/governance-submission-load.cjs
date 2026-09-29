// No remote target, model provider, wallet loading or blockchain broadcasts.
const fs=require('node:fs'),path=require('node:path'),{fork}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function options(input={}){
 const result={count:200,rate:20,concurrency:5,seconds:60,faults:false,batchSample:20,...input};
 for(const [key,max] of Object.entries({count:1000000,rate:10000,concurrency:100,seconds:86400,batchSample:1000})){
  if(!Number.isInteger(result[key])||result[key]<(key==='batchSample'?0:1)||result[key]>max)throw Error(`Invalid ${key}; maximum ${max}`);
 }
 if(typeof result.faults!=='boolean')throw Error('Invalid faults');
 return result;
}
function percentiles(values){
 const sorted=[...values].sort((a,b)=>a-b);
 return Object.fromEntries([50,95,99].map(p=>[`p${p}Ms`,sorted.length?Math.round(sorted[Math.ceil(sorted.length*p/100)-1]*100)/100:null]));
}
async function start(db,token,faults){
 const child=fork(path.join(__dirname,'governance-submission-target.cjs'),[],{env:{...process.env,SUBMISSION_DB:db,SUBMISSION_TOKEN:token,SUBMISSION_FAULTS:faults?'1':'0'},stdio:['ignore','ignore','ignore','ipc']});
 const url=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill();reject(Error('Local target startup timed out'));},15000);
  child.once('message',m=>{clearTimeout(timer);resolve(`http://127.0.0.1:${m.port}`);});
  child.once('error',()=>{clearTimeout(timer);reject(Error('Local target failed to start'));});
  child.once('exit',()=>{clearTimeout(timer);reject(Error('Local target exited'));});
 });
 return {url,stop:()=>new Promise(resolve=>{if(child.exitCode!==null||child.signalCode)return resolve();const timer=setTimeout(()=>child.kill(),5000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.send('stop');})};
}
async function run(input={}){
 const config=options(input),root=path.resolve(__dirname,'..','build');fs.mkdirSync(root,{recursive:true});
 const directory=fs.mkdtempSync(path.join(root,'submission-load-')),db=path.join(directory,'events.sqlite'),token=randomBytes(32).toString('hex');
 const fixture=require('../fixtures/governance/paired-model-comparison-v0.1.0-draft.json').events.find(e=>e.eventType==='ai.run.completed');
 const occurredAt=new Date().toISOString();
 const payload=i=>{const e={...fixture,tenantRef:'capacity-test',projectRef:'synthetic',eventId:`capacity-${i}`,streamRef:`capacity-${i}`,sequence:'1',runRef:`capacity-run-${i}`,caseRef:`capacity-case-${i}`,agentRef:`synthetic-agent-${i%20}`,occurredAt};delete e.receivedAt;return JSON.stringify(e);};
 let target=await start(db,token,config.faults);
 const statuses={},latencies=[],logical=[],samples=[],acknowledged=new Set();
 let next=0,dispatched=0,failed=0,retries=0,accepted=0,duplicates=0,nextDue=0;
 const began=performance.now(),deadline=began+config.seconds*1000;
 async function request(route,body){
  const startTime=performance.now();
  try{
   const response=await fetch(target.url+route,{method:body?'POST':'GET',redirect:'error',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body}:{}),signal:AbortSignal.timeout(5000)});
   const result=await response.json();return {status:response.status,result,ms:performance.now()-startTime};
  }catch{return {status:0,result:{},ms:performance.now()-startTime};}
 }
 try{
  await Promise.all(Array.from({length:config.concurrency},async()=>{
   while(true){
    const i=next++;if(i>=config.count)return;
    // Absolute pacing never catches up in a burst after a slow response.
    const due=Math.max(performance.now(),nextDue);nextDue=due+1000/config.rate;if(due>=deadline)return;
    await sleep(Math.max(0,due-performance.now()));if(performance.now()>=deadline)return;
    dispatched++;const body=payload(i),startTime=performance.now();let ok=false;
    for(let attempt=0;attempt<3;attempt++){
     if(performance.now()>=deadline)break;
     const r=await request('/v1/events',body);statuses[r.status]=(statuses[r.status]||0)+1;latencies.push(r.ms);
     if([200,201].includes(r.status)&&r.result.eventId===`capacity-${i}`&&['accepted','duplicate'].includes(r.result.status)){
      acknowledged.add(`capacity-${i}`);if(r.result.status==='accepted')accepted++;else duplicates++;
      if(samples.length<20)samples.push(body);ok=true;break;
     }
     if(![0,429,502,503,504].includes(r.status)||attempt===2)break;
     retries++;await sleep(100*2**attempt+Math.random()*50);
    }
    logical.push(performance.now()-startTime);if(!ok)failed++;
   }
  }));
  const elapsedMs=performance.now()-began;
  await target.stop();target=await start(db,token,false);
  let replayed=0;for(const body of samples){const r=await request('/v1/events',body);if(r.status===200&&r.result.status==='duplicate')replayed++;}
  const list=await request('/v1/events?limit=1');
  const report=await request('/v1/report');
  await target.stop();target=null;
  const {GovernanceStore}=require('../services/governance/store');const store=new GovernanceStore(db),p={tenant:'capacity-test',project:'synthetic'};
  let reconciliation,batch;
  try{
   const ids=new Set(store.db.prepare('SELECT id FROM events').all().map(r=>r.id));
   const pending=store.db.prepare("SELECT count(*) n FROM outbox WHERE status='pending'").get().n;
   reconciliation={stored:ids.size,outboxPendingBeforeBatch:pending,missingAcknowledged:[...acknowledged].filter(id=>!ids.has(id)).length,storedWithoutAcknowledgement:[...ids].filter(id=>!acknowledged.has(id)).length,replayed,replayExpected:samples.length};
   if(config.batchSample&&ids.size){
    const signer=require('ethers').Wallet.createRandom(),evidence=require('../services/governance/evidence.cjs'),batchStart=performance.now();
    const prepared=await evidence.prepareBatch(store,p,signer,{publisher:signer.address,limit:config.batchSample});
    let verified=0;for(const row of store.batchEvidence(p,prepared.batchId)){
     const result=await evidence.inspectEvidence(store.get(p,row.id),store.evidence(p,row.id),{trustedSigners:[signer.address.toLowerCase()]});
     if(result.state==='batched'&&result.recordCommitment&&result.batchMembership)verified++;
    }
    batch={records:prepared.leafCount,verified,elapsedMs:Math.round(performance.now()-batchStart),broadcast:false};
   }
  }finally{store.close();}
  const passed=dispatched===config.count&&failed===0&&reconciliation.stored===config.count&&reconciliation.missingAcknowledged===0&&reconciliation.storedWithoutAcknowledgement===0&&replayed===samples.length&&reconciliation.outboxPendingBeforeBatch===reconciliation.stored&&list.status===200&&list.result.total===reconciliation.stored&&(!batch||batch.verified===batch.records);
  const result={schemaVersion:1,scope:'local SQLite HTTP ingestion; clean restart; optional receipt sample; no chain or provider calls',config,passed,dispatched,accepted,duplicates,failed,retries,statuses,elapsedMs:Math.round(elapsedMs),acknowledgedPerSecond:Math.round(acknowledged.size/(elapsedMs/1000)*100)/100,requestLatency:percentiles(latencies),submissionLatency:percentiles(logical),reconciliation,reportProbe:{status:report.status,ms:Math.round(report.ms),limited:report.status===422},batch:batch||null,directory};
  fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));return result;
 }finally{if(target)await target.stop();}
}
module.exports={run,options,percentiles};
if(require.main===module){
 const args=process.argv.slice(2),input={};
 try{
  for(let i=0;i<args.length;i++){
   const arg=args[i];if(arg==='--run')continue;if(arg==='--faults'){input.faults=true;continue;}
   const key={'--count':'count','--rate':'rate','--concurrency':'concurrency','--seconds':'seconds','--batch-sample':'batchSample'}[arg];
   if(!key)throw Error('Unknown option');input[key]=Number(args[++i]);
  }
  const config=options(input);
  if(!args.includes('--run'))console.log(JSON.stringify({mode:'preview',config,message:'Add --run to execute against a new isolated local database.'},null,2));
  else run(config).then(result=>{console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;}).catch(()=>{console.error('Submission test did not complete; no provider or chain calls were made.');process.exitCode=1;});
 }catch(e){console.error(e.message);process.exitCode=1;}
}
