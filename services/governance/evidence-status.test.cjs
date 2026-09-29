'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{GovernanceStore}=require('./store'),{createServer}=require('./server.cjs');
const fixture=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json'),p={tenant:'org-demo',project:'claims-governance-demo'};
test('project evidence counts and acceptance age never imply Base confirmation',async()=>{
 const store=new GovernanceStore(':memory:');try{
  assert.equal(store.evidenceStatus(p).total,0);
  for(const event of fixture.events.slice(0,4))store.ingest(event,p);
  const oldest='2026-01-01T00:00:00.000Z';store.db.prepare("UPDATE events SET body=json_set(body,'$.receivedAt',?) WHERE id=?").run(oldest,fixture.events[0].eventId);
  store.db.prepare("UPDATE outbox SET status='batched' WHERE id=?").run(fixture.events[1].eventId);store.db.prepare("UPDATE outbox SET status='submitted' WHERE id=?").run(fixture.events[2].eventId);store.db.prepare("UPDATE outbox SET status='unexpected-private-value' WHERE id=?").run(fixture.events[3].eventId);
  const status=store.evidenceStatus(p);assert.deepEqual(status.counts,{pending:1,batched:1,submitted:1,other:1});assert.equal(status.oldestAwaitingAcceptedAt,oldest);assert.equal(status.awaitingSubmission,2);assert.equal(status.verification,'not-evaluated');assert.ok(!JSON.stringify(status).includes('unexpected-private-value'));assert.equal(store.evidenceStatus({...p,tenant:'foreign'}).total,0);
  store.db.prepare('DELETE FROM outbox WHERE id=?').run(fixture.events[3].eventId);assert.equal(store.evidenceStatus(p).total,4);assert.equal(store.evidenceStatus(p).counts.other,1);
 }finally{store.close();}
});
test('evidence status HTTP requires read authorization and preserves tenant scope',async()=>{
 const store=new GovernanceStore(':memory:');store.ingest(fixture.events[0],p);
 const tokens=[{...p,token:'reader',scopes:['read']},{...p,token:'writer',scopes:['write']},{...p,tenant:'foreign',token:'foreign',scopes:['read']}];const server=createServer(store,tokens);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const url='http://127.0.0.1:'+server.address().port+'/v1/evidence-status';assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{authorization:'Bearer writer'}})).status,403);const response=await fetch(url,{headers:{authorization:'Bearer reader'}});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).total,1);assert.equal((await (await fetch(url,{headers:{authorization:'Bearer foreign'}})).json()).total,0);}finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
