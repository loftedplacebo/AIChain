const {test}=require('node:test'),assert=require('node:assert/strict');
const {RuleProcessor}=require('./rule-processing.cjs'),{DeliveryJournal}=require('./webhook-delivery.cjs'),{RuleEngine}=require('./governance-rules.cjs'),{GovernanceStore}=require('./store'),{Client}=require('../../sdk/typescript/orvessian-ingest');
const p={tenant:'t',project:'p'},other={tenant:'t',project:'other'};
function run(client,id){return client.buildRun({eventId:id,streamRef:id,sequence:0,occurredAt:new Date().toISOString(),runRef:id,agentRef:'agent',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',taskClass:'task',status:'failed'});}
test('real processing creates scoped incidents/alert evidence and leaves delivery disabled by default',async()=>{
 const store=new GovernanceStore(':memory:'),journal=new DeliveryJournal(':memory:'),engine=new RuleEngine(journal),client=new Client({baseUrl:'http://127.0.0.1',token:'x'.repeat(32),...p});let processor;
 try{
  for(const project of [p,other])engine.register(project,{id:'failed',version:1,environment:'test',condition:'run-failed',severity:'high',destinationRef:'endpoint',keyRef:'key'},{actorRef:'owner',now:Date.now()-1000});
  store.ingest(run(client,'run-1'),p);store.ingest({...run(client,'foreign'),projectRef:other.project},other);
  processor=new RuleProcessor({engine,store,projects:[p],recordLimit:1});const result=await processor.tick();assert.equal(result.projects[0].incidents,1);assert.equal(result.projects[0].published,1);assert.equal(result.projects[0].delivered,0);
  assert.equal(engine.list(other).length,0);assert.equal(journal.list(p)[0].state,'pending');
  await processor.tick();assert.equal(engine.list(p).length,1);assert.equal(journal.list(p)[0].attempts,0);
  const alert=store.list(p).events.find(event=>event.eventType==='ai.monitor.alerted');assert.ok(alert);
  const signer=require('ethers').Wallet.createRandom(),evidence=require('./evidence.cjs');await evidence.prepareBatch(store,p,signer,{publisher:signer.address});assert.equal((await evidence.inspectEvidence(alert,store.evidence(p,alert.eventId),{trustedSigners:[signer.address.toLowerCase()]})).state,'batched');
 }finally{await processor?.stop();journal.close();store.close();}
});
test('overlapping ticks coalesce; failures stay scoped and stop waits for pending work',async()=>{
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r),calls=[];
 const engine={scanStored:(_,scope)=>{calls.push(scope.project);if(scope.project==='bad')throw Error('PRIVATE-CONTENT');return {processed:1,incidents:[]};},publishDetected:async()=>{entered();await gate;return {published:1};}};
 const processor=new RuleProcessor({engine,store:{db:{prepare(){}}},projects:[{tenant:'t',project:'bad'},p,other]});
 const first=processor.tick();assert.equal(processor.tick(),first);await started;assert.equal(processor.status.running,true);
 let stopped=false;const stopping=processor.stop().then(()=>stopped=true);await Promise.resolve();assert.equal(stopped,false);release();const result=await first;await stopping;
 assert.deepEqual(calls,['bad','p']);assert.equal(result.projects[0].failed,true);assert.equal(result.projects[1].failed,false);assert.doesNotMatch(JSON.stringify(processor.status),/PRIVATE-CONTENT/);await assert.rejects(processor.tick(),/stopped/);
});
test('explicit injected delivery signs metadata; failed outbox publication retains queued jobs',async()=>{
 const store=new GovernanceStore(':memory:'),journal=new DeliveryJournal(':memory:'),engine=new RuleEngine(journal),client=new Client({baseUrl:'http://127.0.0.1',token:'x'.repeat(32),...p});let processor;
 try{
  engine.register(p,{id:'failed',version:1,environment:'test',condition:'run-failed',severity:'high',destinationRef:'endpoint',keyRef:'key'},{actorRef:'owner',now:Date.now()-1000});store.ingest(run(client,'run-1'),p);
  const ingest=store.ingest.bind(store);store.ingest=()=>{throw Error('PRIVATE-SOURCE');};let sends=0;
  processor=new RuleProcessor({engine,store,projects:[p],delivery:{destinations:{endpoint:{...p,url:'https://example.com/hook'}},resolveKey:async()=>Buffer.alloc(32,9),transport:async(_,signed)=>{sends++;assert.equal(require('./webhook-signatures.cjs').verify(signed.body,signed.headers,Buffer.alloc(32,9)),true);return 204;}}});
  assert.equal((await processor.tick()).projects[0].failed,true);assert.equal(sends,0);assert.equal(journal.list(p)[0].state,'pending');store.ingest=ingest;
  const result=await processor.tick();assert.equal(result.projects[0].published,1);assert.equal(result.projects[0].delivered,1);assert.equal(sends,1);
  await processor.tick();assert.equal(sends,1);
 }finally{await processor?.stop();journal.close();store.close();}
});
test('startup processing is explicit, bounded and shuts down cleanly',async()=>{
 const {start}=require('./start.cjs');
 await assert.rejects(start({GOVERNANCE_RULE_PROCESSING_ENABLED:'maybe'}),/flag/);
 await assert.rejects(start({GOVERNANCE_RULE_PROCESSING_ENABLED:'true'}),/journal/);
 await assert.rejects(start({GOVERNANCE_RULES_DB:':memory:',GOVERNANCE_RULE_PROCESSING_ENABLED:'true',GOVERNANCE_RULE_PROJECTS:'[]'}),/projects/);
 const env={GOVERNANCE_DB:':memory:',GOVERNANCE_RULES_DB:':memory:',PORT:'0'};
 let app=await start(env);assert.equal(app.ruleProcessor,null);await app.stop();
 app=await start({...env,GOVERNANCE_RULE_PROCESSING_ENABLED:'true',GOVERNANCE_RULE_PROJECTS:JSON.stringify([p])});assert.equal(app.ruleProcessor.status.scheduled,true);await app.stop();assert.equal(app.ruleProcessor.status.stopped,true);
});
test('scheduler performs repeated cycles and stops future scans',async()=>{
 let scans=0,resolveSecond;const second=new Promise(r=>resolveSecond=r);
 const processor=new RuleProcessor({engine:{scanStored(){scans++;if(scans===2)resolveSecond();return {processed:0,incidents:[]};},async publishDetected(){return {published:0};}},store:{db:{prepare(){}}},projects:[p],intervalMs:1000});
 let timeout;
 try{processor.start();processor.start();await Promise.race([second,new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Scheduler did not run')),3000))]);await processor.stop();assert.equal(scans,2);assert.equal(processor.status.scheduled,false);assert.throws(()=>processor.start(),/stopped/);}
 finally{clearTimeout(timeout);await processor.stop();}
});
