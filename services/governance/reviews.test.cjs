const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {GovernanceStore}=require('./store'),{createServer}=require('./server.cjs'),{passwordHash}=require('./auth.cjs');
const reviews=require('./reviews.cjs');
const fixture=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
const run=fixture.events.find(e=>e.eventType==='ai.run.completed');
const p={tenant:run.tenantRef,project:run.projectRef,scopes:['read','review'],actorId:'alice'};
const request=(verdict='correct')=>({requestId:randomUUID(),eventId:run.eventId,verdict,rubricVersion:'test-rubric-v1'});
async function exercise(store){
 await store.ingest(run,p);
 assert.equal((await reviews.investigation(store,p,run.eventId)).reviewState,'awaiting-review');
 const body=request();const saved=await reviews.submitReview(store,p,body);
 assert.equal(saved.status,'accepted');assert.equal((await reviews.submitReview(store,p,body)).status,'duplicate');
 await assert.rejects(reviews.submitReview(store,{...p,actorId:'bob'},body),e=>e.status===409);
 await assert.rejects(reviews.submitReview(store,p,{...body,verdict:'needs-investigation'}),e=>e.status===409);
 await assert.rejects(reviews.submitReview(store,{...p,scopes:['read']},request()),e=>e.status===403);
 await assert.rejects(reviews.submitReview(store,p,{...request(),actorId:'spoof'}),e=>e.status===400);
 await assert.rejects(reviews.submitReview(store,{...p,tenant:'other'},request()),e=>e.status===404);
 const record=await store.get(p,saved.eventId);assert.equal(record.source.keyRef,reviews.actorRef('alice'));
 assert.equal(record.outcome.label,run.result.predictedLabel);assert.equal(record.outcome.evaluatorRef,'portal-review');
 assert.equal((await reviews.queue(store,p,{state:'reviewed'})).total,1);
 assert.equal((await reviews.investigation(store,{...p,scopes:['read']},run.eventId)).canReview,false);
 const report=await store.report(p);assert.equal(report.models[0].labelled,1);assert.equal(report.models[0].accuracy,null);
 await reviews.submitReview(store,p,request('needs-investigation'));
 assert.equal((await reviews.investigation(store,p,run.eventId)).history.length,2);
 await reviews.submitReview(store,p,{...request('incorrect'),label:'different-label'});
 assert.equal((await reviews.queue(store,p,{state:'conflicting'})).total,1);
 assert.equal((await store.report(p)).models[0].accuracyStatus,'conflicting-labels');
 const signer=require('ethers').Wallet.createRandom();await require('./evidence.cjs').prepareBatch(store,p,signer,{publisher:signer.address,limit:10});
 const status=await require('./evidence.cjs').inspectEvidence(record,await store.evidence(p,record.eventId),{trustedSigners:[signer.address.toLowerCase()]});assert.equal(status.state,'batched');
}
test('immutable reviewer records, replay, permissions, linked reporting and proof in SQLite',async()=>{const store=new GovernanceStore(':memory:');try{await exercise(store);}finally{store.close();}});
test('concurrent retry creates one review; mismatched cases remain visible but ineligible',async()=>{
 const store=new GovernanceStore(':memory:');try{
  store.ingest(run,p);const body=request();const results=await Promise.all([reviews.submitReview(store,p,body),reviews.submitReview(store,p,body)]);
  assert.equal(results.filter(r=>r.status==='accepted').length,1);assert.equal(store.list(p).total,2);
  const review=store.get(p,results[0].eventId);
  const wrong={...review,eventId:'imported-case-mismatch',streamRef:'imported-case-mismatch',caseRef:'foreign-case',source:{...review.source,integrationVersion:'external-test'}};
  store.ingest(wrong,p);
  const investigation=await reviews.investigation(store,p,run.eventId);assert.equal(investigation.history.length,2);assert.equal(investigation.reviewState,'conflicting');
  assert.equal(store.report(p).models[0].accuracyStatus,'conflicting-labels');
 }finally{store.close();}
});
test('review lifecycle works with PostgreSQL row security and migrations',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();const c={query:(sql,args)=>args?db.query(sql,args):db.exec(sql).then(r=>r.at(-1)||{rows:[]}),release(){}};const pool={connect:async()=>c,query:c.query,end:()=>db.close()};await require('./postgres-migrate.cjs').migrate(pool);
 await db.exec('CREATE ROLE governance_app; GRANT USAGE ON SCHEMA public TO governance_app; GRANT SELECT ON governance_migrations,governance_environment TO governance_app; GRANT SELECT,INSERT ON governance_events TO governance_app; GRANT SELECT,INSERT,UPDATE ON governance_outbox,governance_usage,governance_evidence TO governance_app; SET ROLE governance_app;');
 const store=new(require('./postgres-store.cjs').PostgresGovernanceStore)(pool);try{await store.ready();await exercise(store);}finally{await store.close();}
});
test('gateway enforces review role, origin, scope, identity and revocation',async()=>{
 const store=new GovernanceStore(':memory:');store.ingest(run,p);
 const users=[{id:'alice',email:'alice@example.test',passwordHash:passwordHash('test-password-only-123'),workspaces:[{id:'a',name:'A',tenant:p.tenant,project:p.project,role:'reviewer'}]}];
 const token='synthetic-project-token-'.repeat(3),server=createServer(store,[{...p,scopes:['read','write','review'],token}],users);await new Promise(r=>server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${server.address().port}`;
 const {workspaceGateway}=await import('../../website/lib/workspace-gateway.js');
 const call=(action,cookie='',body,origin='http://localhost:3001',workspace='a')=>workspaceGateway(new Request('http://localhost:3001/api/workspace?'+new URLSearchParams({action,workspace}),{method:body?'POST':'GET',headers:{cookie,origin,'content-type':'application/json'},body:body&&JSON.stringify(body)}),{api});
 try{
  const login=await call('session','',{email:users[0].email,password:'test-password-only-123'});const cookie=login.headers.get('set-cookie');assert.equal((await login.json()).workspaces[0].canReview,true);
  const body=request();assert.equal((await call('review',cookie,body,'https://attacker.test')).status,403);
  assert.equal((await call('review',cookie,body,undefined,'other')).status,404);
  const accepted=await call('review',cookie,body);assert.equal(accepted.status,201);assert.equal(accepted.headers.get('set-cookie'),null);
  assert.equal((await call('review',cookie,body)).status,200);assert.equal((await call('reviews',cookie)).status,200);
  const direct=await fetch(api+'/v1/reviews',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(request())});assert.equal(direct.status,403);
  const forged=await fetch(api+'/v1/events',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({...run,eventId:'portal-review-'+randomUUID()})});assert.equal(forged.status,403);
  users[0].workspaces[0].role='reader';assert.equal((await call('review',cookie,request())).status,401);
  const reader=await call('session','',{email:users[0].email,password:'test-password-only-123'});const readerCookie=reader.headers.get('set-cookie');assert.equal((await call('review',readerCookie,request())).status,403);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
