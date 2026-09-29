const {test}=require('node:test'),assert=require('node:assert/strict');
const {DeliveryJournal,deliverOne}=require('./webhook-delivery.cjs'),{RuleEngine}=require('./governance-rules.cjs');
const {Client}=require('../../sdk/typescript/orvessian-ingest'),{GovernanceStore}=require('./store');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const p={tenant:'tenant',project:'project'},time=Date.now()-2000;
const client=new Client({baseUrl:'http://127.0.0.1',token:'x'.repeat(32),...p});
function event(extra={}){return {...client.buildRun({eventId:'event-1',streamRef:'stream-1',sequence:1,occurredAt:new Date(time).toISOString(),runRef:'run-1',agentRef:'agent-1',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',taskClass:'task',status:'failed',latencyMs:1001,...extra}),receivedAt:new Date(time).toISOString()};}
const rule={id:'latency',version:1,environment:'test',condition:'latency-exceeded',thresholdMs:1000,severity:'high',destinationRef:'endpoint',keyRef:'key-v1'};
test('prospective immutable rules, missing data and scope-aware preview',()=>{
 const journal=new DeliveryJournal(':memory:'),engine=new RuleEngine(journal);
 try{
  assert.equal(engine.register(p,rule,{actorRef:'owner',now:time-1000}),true);assert.equal(engine.register(p,rule,{actorRef:'owner',now:time}),false);
  assert.throws(()=>engine.register(p,{...rule,thresholdMs:500},{actorRef:'owner',now:time}),/conflict/);
  assert.throws(()=>engine.register(p,{...rule,prompt:'private'},{actorRef:'owner',now:time}));
  assert.deepEqual(engine.preview(p,rule,[event(),event({eventId:'equal',latencyMs:1000}),event({eventId:'missing',latencyMs:undefined})]).map(x=>x.assessment),['match','clear','missing']);
  assert.throws(()=>engine.preview({...p,tenant:'foreign'},rule,[event()]),/scope/);
  const denied={...rule,condition:'tool-permission-denied'};delete denied.thresholdMs;
  assert.equal(engine.preview(p,denied,[event({toolCalls:[{toolRef:'lookup',version:'v1',resultCode:'completed'}]})])[0].assessment,'missing');
  assert.equal(engine.preview(p,denied,[event({toolCalls:[{toolRef:'lookup',version:'v1',resultCode:'completed',allowed:false}]})])[0].assessment,'match');
  const failed={...denied,condition:'run-failed'};
  assert.deepEqual(engine.preview(p,failed,[event(),event({status:'completed'}),event({status:'pending'}),event({environment:'other'})]).map(x=>x.assessment),['match','clear','missing','not-applicable']);
  const toolFailed={...denied,condition:'tool-failed'};
  assert.deepEqual(engine.preview(p,toolFailed,['failed','completed','pending'].map(resultCode=>event({toolCalls:[{toolRef:'lookup',version:'v1',resultCode}]}))).map(x=>x.assessment),['match','clear','missing']);
  const early={...event({eventId:'early'}),receivedAt:new Date(time-2000).toISOString()};assert.deepEqual(engine.process(p,early,{now:time}),[]);
 }finally{journal.close();}
});
test('incident and webhook job are atomic, replay-safe and deliver through the configured scope',async()=>{
 const journal=new DeliveryJournal(':memory:'),engine=new RuleEngine(journal),store=new GovernanceStore(':memory:');
 try{
  engine.register(p,rule,{actorRef:'owner',now:time-1000});store.ingest(event(),p);
  const original=journal.enqueue; journal.enqueue=()=>{throw Error('Synthetic persistence failure');};
  assert.throws(()=>engine.processStored(store,p,'event-1',{now:time}),/persistence/);assert.equal(engine.list(p).length,0);assert.equal(journal.list(p).length,0);
  assert.equal(journal.db.prepare('SELECT COUNT(*) n FROM governance_detected_outbox').get().n,0);
  journal.enqueue=original;const [id]=engine.processStored(store,p,'event-1',{now:time});assert.ok(id);assert.equal(journal.list(p).length,1);
  await assert.rejects(engine.publishDetected({ingest:async()=>({status:'accepted',eventId:'wrong'})},p),/acknowledgement/);
  assert.equal((await engine.publishDetected(store,p)).published,1);assert.equal((await engine.publishDetected(store,p)).published,0);
  const alert=store.list(p).events.find(e=>e.eventType==='ai.monitor.alerted');assert.ok(alert);assert.equal(alert.source.kind,'downstream-system');assert.equal(alert.policy.version,'1');assert.deepEqual(alert.parentEventRefs,['event-1']);
  const signer=require('ethers').Wallet.createRandom(),evidence=require('./evidence.cjs');await evidence.prepareBatch(store,p,signer,{publisher:signer.address,limit:10});assert.equal((await evidence.inspectEvidence(alert,store.evidence(p,alert.eventId),{trustedSigners:[signer.address.toLowerCase()]})).state,'batched');
  assert.deepEqual(engine.processStored(store,p,'event-1',{now:time+1}),[]);assert.equal(engine.list(p).length,1);
  let captured;const result=await deliverOne(journal,p,{now:()=>time,destinations:{endpoint:{...p,url:'https://example.com/hook'}},resolveKey:async()=>Buffer.alloc(32,7),transport:async(_,signed)=>{captured=JSON.parse(signed.body);return 204;}});
  assert.equal(result.state,'delivered');assert.equal(captured.incidentRef,id);assert.equal(captured.eventRef,'event-1');
  assert.deepEqual(engine.list({...p,tenant:'foreign'}),[]);assert.throws(()=>engine.processStored(store,{...p,tenant:'foreign'},'event-1'),/not found/);
 }finally{journal.close();store.close();}
});
test('delayed records use historical version; replay does not reinterpret under new policy',()=>{
 const journal=new DeliveryJournal(':memory:'),engine=new RuleEngine(journal);
 try{
  engine.register(p,rule,{actorRef:'owner',now:time-1000});engine.register(p,{...rule,version:2,thresholdMs:2000},{actorRef:'owner',now:time+1000});
  const old=event();engine.process(p,old,{now:time+2000});assert.equal(engine.list(p)[0].rule_version,1);
  assert.deepEqual(engine.process(p,old,{now:time+3000}),[]);
  assert.throws(()=>engine.process(p,{...old,result:{status:'completed'}},{now:time+3000}),/identity conflict/);
  assert.deepEqual(engine.process(p,{...event({eventId:'new'}),receivedAt:new Date(time+2000).toISOString()},{now:time+3000}),[]);
 }finally{journal.close();}
});
test('incident transitions preserve actors/reasons, optimistic revision and idempotency',()=>{
 const journal=new DeliveryJournal(':memory:'),engine=new RuleEngine(journal);
 try{
  engine.register(p,rule,{actorRef:'owner',now:time-1000});const [id]=engine.process(p,event(),{now:time});
  const action={actionId:'ack-1',actorRef:'reviewer',action:'acknowledge',reasonCode:'investigating',expectedRevision:0};
  assert.equal(engine.transition(p,id,action,{now:time}),1);assert.equal(engine.transition(p,id,action,{now:time}),1);
  assert.throws(()=>engine.transition(p,id,{...action,reasonCode:'changed'},{now:time}),/identity conflict/);
  assert.throws(()=>engine.transition(p,id,{...action,actionId:'stale'},{now:time}),/revision conflict/);
  engine.transition(p,id,{...action,actionId:'resolve',action:'resolve',expectedRevision:1},{now:time+1});engine.transition(p,id,{...action,actionId:'reopen',action:'reopen',expectedRevision:2},{now:time+2});
  assert.equal(engine.list(p)[0].state,'open');assert.equal(engine.history(p,id).length,3);assert.equal(engine.history(p,id)[0].actorRef,'reviewer');assert.deepEqual(engine.history({...p,tenant:'other'},id),[]);
  engine.process(p,event({eventId:'another'}),{now:time+3});const page=engine.incidentPage(p,{limit:1});assert.equal(page.total,2);assert.equal(page.nextOffset,1);const next=engine.incidentPage(p,{limit:1,offset:1});assert.notEqual(page.incidents[0].id,next.incidents[0].id);assert.equal(next.nextOffset,null);assert.throws(()=>engine.incidentPage(p,{limit:101}));
 }finally{journal.close();}
});

test('bounded stored-record scanner resumes after journal restart without duplicate incidents',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orvessian-rules-')),file=path.join(dir,'rules.sqlite'),store=new GovernanceStore(':memory:');let journal=new DeliveryJournal(file),engine=new RuleEngine(journal);
 try{
  engine.register(p,{...rule,condition:'run-failed',thresholdMs:undefined},{actorRef:'owner',now:time-1000});
  store.ingest(event(),p);store.ingest(event({eventId:'event-2',streamRef:'stream-2'}),p);
  assert.equal(engine.scanStored(store,p,{limit:1,now:time}).processed,1);assert.equal(engine.list(p).length,1);
  journal.close();journal=new DeliveryJournal(file);engine=new RuleEngine(journal);
  assert.equal(engine.scanStored(store,p,{limit:1,now:time}).processed,1);assert.equal(engine.list(p).length,2);assert.equal(journal.list(p).length,2);
  assert.equal(engine.scanStored(store,p,{limit:1,now:time}).processed,0);assert.equal(engine.scanStored(store,{...p,tenant:'other'}).processed,0);
  assert.throws(()=>engine.scanStored({},p),/SQLite/);
 }finally{journal.close();store.close();for(const name of ['rules.sqlite','rules.sqlite-wal','rules.sqlite-shm'])fs.rmSync(path.join(dir,name),{force:true});fs.rmdirSync(dir);}
});
