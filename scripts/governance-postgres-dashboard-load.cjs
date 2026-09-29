// Used by the native acceptance runner in its newly created synthetic database.
const assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {createServer}=require('../services/governance/server.cjs');
const {passwordHash}=require('../services/governance/auth.cjs');
const fixture=require('../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function stats(values){const s=[...values].sort((a,b)=>a-b);return {requests:s.length,...Object.fromEntries([50,95,99].map(p=>[`p${p}Ms`,s.length?Math.round(s[Math.ceil(s.length*p/100)-1]):null]))};}
async function dashboardLoad(store,ownerPool,{long=false,onProgress=()=>{}}={}){
 if(long&&require('node:os').freemem()<512*1024**2)throw Error('Preflight stopped: host free RAM is below 512 MiB; free memory before retrying');
 const principal={tenant:'dashboard-load',project:'concurrent'},foreign={tenant:'dashboard-other',project:'concurrent'};
 const template=fixture.events.find(e=>e.eventType==='ai.run.completed');
 const event=(i,p=principal)=>({...template,...(long?{caseRef:`case-${i}`,model:{...template.model,deploymentRef:`synthetic-model-${i%3}`},activity:{...template.activity,taskClass:`task-${i%4}`}}:{}),tenantRef:p.tenant,projectRef:p.project,eventId:`dashboard-${i}`,streamRef:`dashboard-${i}`,sequence:'1',agentRef:`synthetic-agent-${i%20}`});
 const seedCount=10020,writeCount=long?12000:600,rate=40,readers=4;
 const outcomeTemplate=fixture.events.find(e=>e.outcome);
 const submission=i=>{
  if(!long||i%5!==4)return event(seedCount+i);
  // Every fifth submission labels a prior run. Every fifth label deliberately
  // conflicts with an earlier assessment, leaving another run unreviewed.
  const target=event(seedCount+(i%25===24?i-6:i-1));
  return {...outcomeTemplate,tenantRef:principal.tenant,projectRef:principal.project,eventId:`dashboard-${seedCount+i}`,streamRef:`dashboard-${seedCount+i}`,sequence:'1',caseRef:target.caseRef,runRef:target.runRef,agentRef:target.agentRef,outcome:{...outcomeTemplate.outcome,forEventId:target.eventId,label:i%10===4?target.result.predictedLabel:'different-label'}};
 };
 let cursor=0;await Promise.all(Array.from({length:12},async()=>{for(;;){const i=cursor++;if(i>=seedCount)return;await store.ingest(event(i),principal);}}));
 for(let i=0;i<20;i++)await store.ingest(event(i,foreign),foreign);
 // Same maintenance needed after bulk imports; no automatic statistics daemon in PGlite.
 await ownerPool.query('ANALYZE governance_events');
 console.log('Prepared 10020 primary and 20 isolated-tenant records; starting concurrent HTTP/dashboard phase');
 const sessionDb=new DatabaseSync(':memory:'),token=randomBytes(32).toString('hex'),password=randomBytes(24).toString('hex');
 const users=[principal,foreign].map((p,i)=>({id:`load-user-${i}`,email:`load-${i}@example.test`,passwordHash:passwordHash(password),workspaces:[{id:'test',name:'Synthetic load',...p}]}));
 const server=createServer(store,[{...principal,token,scopes:['read','write']}],users,sessionDb);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const api=`http://127.0.0.1:${server.address().port}`;
 const {workspaceGateway}=await import('../website/lib/workspace-gateway.js');
 const cookies=[];
 const metrics={submissions:[],report:[],reviews:[],events:[],foreignReport:[]};
 let completed=0,writesDone=false,next=0,overlappingReads=0;const observed=[];
 try{
  for(const user of users){
   const login=await workspaceGateway(new Request('http://localhost:3001/api/workspace?action=session',{method:'POST',headers:{origin:'http://localhost:3001','content-type':'application/json'},body:JSON.stringify({email:user.email,password})}),{api});
   assert.equal(login.status,200);cookies.push(login.headers.get('set-cookie'));
  }
  const started=performance.now(),deadline=started+(long?360000:90000);
  const resources=[];let stopReason=null;const initialCpu=process.cpuUsage();
  const guard=()=>{if(stopReason)throw Error(stopReason);if(performance.now()>deadline)throw Error('Concurrent native validation exceeded deadline');};
  const writers=Promise.allSettled(Array.from({length:12},async()=>{try{while(true){const i=next++;if(i>=writeCount)return;guard();await sleep(Math.max(0,started+i*1000/rate-performance.now()));guard();const began=performance.now();
   const e=submission(i),response=await fetch(api+'/v1/events',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(e),signal:AbortSignal.timeout(15000)});
   assert.equal(response.status,201);const body=await response.json();assert.equal(body.status,'accepted');assert.equal(body.eventId,e.eventId);metrics.submissions.push(performance.now()-began);completed++;
  }}catch(e){stopReason=stopReason||'Submission task failed';throw e;}})).then(results=>{const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}).finally(()=>{writesDone=true;});
  const readTasks=Array.from({length:readers},(_,index)=>(async()=>{
   const kind=['report','reviews','events','foreignReport'][index],action=kind==='foreignReport'?'report':kind;let previous=seedCount,round=0;
   while(!writesDone||round<5){guard();const before=completed,began=performance.now();
    const response=await workspaceGateway(new Request(`http://localhost:3001/api/workspace?action=${action}&workspace=test&limit=20`,{headers:{cookie:cookies[index===3?1:0]}}),{api});
    assert.equal(response.status,200,`${kind} returned ${response.status}`);const data=await response.json();metrics[kind].push(performance.now()-began);
    if(before>0&&before<writeCount)overlappingReads++;
    if(index===3){assert.equal(data.kpis.runs,20);assert.equal(data.eventCount,20);}
    else{
     const total=index===0?data.kpis.runs:data.total;assert.ok(total>=previous&&total<=seedCount+writeCount);previous=total;
     if(index===0){if(!long){assert.equal(data.eventCount,total);assert.equal(data.kpis.reviewedLabels,0);assert.equal(data.models[0].accuracy,null);}observed.push(total);}
     if(index===1){assert.equal(Object.values(data.counts).reduce((a,b)=>a+b,0),total);assert.equal(data.rows.length,20);assert.ok(data.rows.every(r=>r.event.tenantRef===principal.tenant));}
     if(index===2)assert.ok(data.events.every(e=>e.tenantRef===principal.tenant));
    }
    round++;await sleep(100);
   }
  })());
  // Wait for every task to settle before closing the API or its database pool.
  const monitor=(async()=>{
   do{
    try{
     const r=(await store.transaction(principal,c=>c.query("SELECT pg_database_size(current_database()) AS bytes,(SELECT count(*) FROM governance_outbox WHERE status='pending') AS pending,(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()) AS connections"),true)).rows[0];
     const rss=process.memoryUsage().rss,free=require('node:os').freemem(),cpu=process.cpuUsage(initialCpu);
     const sample={elapsedMs:Math.round(performance.now()-started),completed,nodeRssBytes:rss,hostFreeBytes:free,nodeCpuMs:Math.round((cpu.user+cpu.system)/1000),databaseBytes:Number(r.bytes),pending:Number(r.pending),connections:Number(r.connections),poolWaiting:store.pool.waitingCount};resources.push(sample);onProgress(sample);
     if(rss>1024**3)stopReason='Node RSS exceeded 1 GiB';
     if(free<512*1024**2)stopReason='Host free RAM fell below 512 MiB';
     if(Number(r.bytes)>512*1024**2)stopReason='Database size exceeded 512 MiB';
     if(Number(r.pending)>30000)stopReason='Pending records exceeded 30000';
     if(stopReason)break;
    }catch(e){stopReason='Resource monitoring failed';throw e;}
    if(writesDone)break;await sleep(5000);
   }while(!writesDone);
  })();
  const settled=await Promise.allSettled([writers,...readTasks,monitor]);for(const r of settled)if(r.status==='rejected')throw r.reason;
  const elapsedMs=Math.round(performance.now()-started);
  assert.equal(completed,writeCount);assert.ok(overlappingReads>0);assert.ok(observed.some(n=>n>seedCount&&n<seedCount+writeCount));
  const report=await store.report(principal);assert.equal(report.kpis.runs,seedCount+writeCount-(long?writeCount/5:0));
  if(long){
   const all=await store.list(principal,{limit:seedCount+writeCount+1});
   const expected=require('../services/governance/report').buildReport(all.events);
   assert.deepEqual(report.kpis,expected.kpis);assert.deepEqual(report.trends,expected.trends);
   const normalize=models=>models.map(m=>({...m,latency:undefined,rubrics:[...m.rubrics].sort()})).sort((a,b)=>a.key.localeCompare(b.key));
   assert.deepEqual(normalize(report.models),normalize(expected.models));
  }
  const counts=await store.transaction(principal,async c=>(await c.query(`SELECT (SELECT count(*) FROM governance_events) AS events,(SELECT count(*) FROM governance_outbox) AS outbox,(SELECT sum(event_count) FROM governance_usage) AS metered`)).rows[0],true);
  for(const n of Object.values(counts))assert.equal(Number(n),seedCount+writeCount);
  assert.equal((await store.pool.query('SELECT id FROM governance_events')).rows.length,0);
  const denial=await workspaceGateway(new Request('http://localhost:3001/api/workspace?action=report&workspace=foreign',{headers:{cookie:cookies[0]}}),{api});assert.equal(denial.status,404);
  return {mode:long?'five-minute-mixed-labelled':'short',resources,resourceLimits:{nodeRssBytes:1024**3,minHostFreeBytes:512*1024**2,databaseBytes:512*1024**2,pending:30000},finalKpis:report.kpis,seedCount,writeCount,targetSubmissionsPerSecond:rate,submissionConcurrency:12,dashboardReaders:readers,elapsedMs,overlappingReads,observedRunRange:[Math.min(...observed),Math.max(...observed)],metrics:Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,stats(v)])),counts,errors:0,note:'Native PostgreSQL; real ingestion HTTP and authenticated portal gateway data requests. No browser rendering, model calls, receipt worker or Base broadcasts. Bounded paced functional concurrency test, not maximum capacity. Resource samples cover Node RSS/CPU, host free RAM, database size, connections and pending records; not PostgreSQL process RSS/CPU or disk free space.'};
 }finally{await new Promise(r=>server.close(r));sessionDb.close();}
}
module.exports={dashboardLoad};
