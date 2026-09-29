const {test}=require('node:test'),assert=require('node:assert/strict');
const {Client,IngestionError}=require('./orvessian-ingest');
const config={baseUrl:'http://127.0.0.1',token:'x'.repeat(32),tenant:'t',project:'p'};
const run={eventId:'e',streamRef:'s',sequence:'1',occurredAt:'2026-09-28T00:00:00.000Z',runRef:'r',agentRef:'a',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',taskClass:'classification',status:'completed',predictedLabel:'review',caseRef:'case-1'};
const outcome={eventId:'outcome-1',forEventId:'e',caseRef:'case-1',environment:'test',label:'review',labelSource:'automated-evaluator',evaluatorRef:'eval-1',rubricVersion:'v1',occurredAt:run.occurredAt};
const observation={eventId:'config-1',streamRef:'config-stream',sequence:0,occurredAt:run.occurredAt,agentRef:'a',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',observedConfigDigest:'0x'+'a'.repeat(64),approvedConfigDigest:'0x'+'b'.repeat(64),observationSource:'customer-runtime'};
test('scope cannot be retargeted and structured builders reject content and false provenance',()=>{
 const c=new Client(config);
 for(const key of ['baseUrl','tenant','project','timeoutMs','attempts'])assert.equal(Reflect.set(c,key,'foreign'),false);
 assert.throws(()=>Object.defineProperty(c,'tenant',{value:'foreign'}));
 for(const invalid of [{...outcome,prompt:'private'},{...outcome,labelSource:'human-adjudication'},{...outcome,labelSource:'toString'},{...outcome,occurredAt:'2026-02-30T00:00:00.000Z'},{...outcome,rubricVersion:undefined}])assert.throws(()=>c.buildOutcome(invalid));
 for(const invalid of [{...observation,messages:['private']},{...observation,observedConfigDigest:undefined},{...observation,observedConfigDigest:'invalid'},{...observation,sequence:Number.MAX_SAFE_INTEGER+1},{...observation,observationSource:undefined}])assert.throws(()=>c.buildConfigObservation(invalid));
 for(const labelSource of ['automated-evaluator','customer-feedback','downstream-system','calibrated-measurement'])assert.equal(c.buildOutcome({...outcome,labelSource}).outcome.labelSource,labelSource);
 const event=c.buildConfigObservation(observation);assert.equal(event.source.kind,'customer-sdk');assert.equal(event.model.observedConfigDigest,observation.observedConfigDigest);
});
test('exact bytes survive retry and credentials do not appear in errors',async()=>{
 const calls=[];const c=new Client(config,async(url,options)=>{calls.push(options);return calls.length===1?new Response('private',{status:503}):Response.json({eventId:'e',status:'duplicate'});});
 assert.equal((await c.recordRun(run)).status,'duplicate');assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].redirect,'manual');
 const bad=new Client(config,async()=>new Response('private-source',{status:409}));await assert.rejects(bad.recordRun(run),e=>e instanceof IngestionError&&e.status===409&&!String(e).includes('private-source')&&!String(e).includes(config.token));
});
test('privacy, scope, origins, sequence and registration validated before transport',async()=>{
 let calls=0;const c=new Client(config,async()=>{calls++;throw Error('should not send');});
 for(const x of [{...run,prompt:'private'},{...run,sequence:Number.MAX_SAFE_INTEGER+1},{...run,occurredAt:'2026-02-30T00:00:00.000Z'}])assert.throws(()=>c.buildRun(x));
 await assert.rejects(c.submit({...c.buildRun(run),tenantRef:'foreign'}));
 assert.throws(()=>c.registerAgent({purpose:'hello',prompt:'private'}));
 for(const baseUrl of ['http://example.com','https://user:secret@example.com','https://example.com/path'])assert.throws(()=>new Client({...config,baseUrl}));
 assert.equal(calls,0);
});
test('redirects, oversized responses and wrong acknowledgements fail closed',async()=>{
 for(const response of [new Response('',{status:302}),Response.json({status:'accepted',eventId:'wrong'}),new Response('x'.repeat(2097153)),new Response('{invalid')]){
  const c=new Client({...config,attempts:1},async()=>response);await assert.rejects(c.recordRun(run),IngestionError);
 }
});
test('Node client integrates registration, replay, reporting and signed evidence with real API',async()=>{
 const {GovernanceStore}=require('../../services/governance/store'),{createServer}=require('../../services/governance/server.cjs');
 const store=new GovernanceStore(':memory:'),p={tenant:'t',project:'p',token:config.token,scopes:['read','write']},server=createServer(store,[p]);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const c=new Client({...config,baseUrl:`http://127.0.0.1:${server.address().port}`});
  await c.registerAgent({agentRef:'a',environment:'test',deploymentRef:'d',ownerRef:'owner',purpose:'Synthetic test',modelRef:'m',configVersion:'v1'});
  await c.heartbeat({agentRef:'a',environment:'test',deploymentRef:'d',sequence:1});
  assert.equal((await c.recordRun(run)).status,'accepted');assert.equal((await c.recordRun(run)).status,'duplicate');
  assert.equal(store.report(p).kpis.runs,1);
  assert.equal((await c.recordOutcome(outcome)).status,'accepted');assert.equal((await c.recordOutcome(outcome)).status,'duplicate');
  assert.equal((await c.recordConfigObservation(observation)).status,'accepted');assert.equal((await c.recordConfigObservation(observation)).status,'duplicate');
  const accuracy=require('./governance-event').adjudicatedAccuracy([c.buildRun(run),c.buildOutcome(outcome)],{minimumSampleSize:1});assert.equal(accuracy[0].total,0);assert.equal(accuracy[0].rate,null);
  const signer=require('ethers').Wallet.createRandom(),e=require('../../services/governance/evidence.cjs');await e.prepareBatch(store,p,signer,{publisher:signer.address,limit:10});
  const fetched=await c.evidence('e');const verified=await e.inspectEvidence(fetched.event,{bundle:fetched.evidence},{trustedSigners:[signer.address.toLowerCase()]});
  assert.equal(verified.state,'batched');assert.equal(verified.recordCommitment,true);
  await e.prepareBatch(store,p,signer,{publisher:signer.address,limit:10});
  for(const id of ['outcome-1','config-1']){const item=await c.evidence(id);const check=await e.inspectEvidence(item.event,{bundle:item.evidence},{trustedSigners:[signer.address.toLowerCase()]});assert.equal(check.state,'batched');assert.equal(check.recordCommitment,true);}
 }finally{await new Promise(r=>server.close(r));store.close();}
});
