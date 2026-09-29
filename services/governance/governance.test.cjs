const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {GovernanceStore}=require('./store');const {createServer,parseStrictJson}=require('./server.cjs');const {buildReport}=require('./report');
const fixture=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
const principal={tenant:'org-demo',project:'claims-governance-demo',token:'local-test-token-'.repeat(3),scopes:['read','write']};
test('durable acceptance, pending outbox, replay and collision survive restart',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'governance-'));const file=path.join(dir,'events.sqlite');let store=new GovernanceStore(file);
  try {const event=fixture.events[0];assert.equal(store.ingest(event,principal).status,'accepted');store.close();store=new GovernanceStore(file);
    assert.equal(store.ingest(event,principal).status,'duplicate');assert.equal(store.list(principal).total,1);assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get().n,1);
    assert.throws(()=>store.ingest({...event,agentRef:'changed'},principal),e=>e.status===409);
    assert.throws(()=>store.ingest({...event,eventId:'new-id'},principal),e=>e.status===409);assert.equal(store.list(principal).total,1);
  }finally {store.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('governance-'));fs.rmSync(dir,{recursive:true,force:true});}
});
test('tenant and project scopes cannot access or poison each other',()=>{const store=new GovernanceStore(':memory:');try{
  store.ingest(fixture.events[0],principal); const other={...principal,tenant:'other'};
  assert.equal(store.list(other).total,0);assert.equal(store.get(other,fixture.events[0].eventId),null);assert.throws(()=>store.ingest(fixture.events[0],other),e=>e.status===403);
  const original=fixture.events.find(e=>e.eventType==='ai.run.completed');const label=fixture.events.find(e=>e.outcome?.forEventId===original.eventId);
  const report=buildReport([original,{...label,tenantRef:'other'}],{minimumSampleSize:1});assert.equal(report.models[0].pending,1);assert.equal(report.models[0].accuracy,null);
}finally{store.close();}});
test('report discloses label conflicts, insufficient samples and mixed evaluators',()=>{
  const report=buildReport(fixture.events);assert.deepEqual(report.models.map(m=>m.accuracy),[.7,.9]);
  const label=fixture.events.find(e=>e.outcome);const duplicate={...label,eventId:'another'};
  assert.equal(buildReport([...fixture.events,duplicate]).models[0].accuracyStatus,'conflicting-labels');
  const changed=structuredClone(fixture.events);changed.find(e=>e.outcome).outcome.rubricVersion='different-rubric';assert.equal(buildReport(changed).models[0].accuracyStatus,'mixed-evaluators');
});
test('JSON parser rejects escaped duplicate keys',()=>{assert.throws(()=>parseStrictJson('{"tenantRef":"a","tenant\\u0052ef":"b"}'),/Duplicate/);assert.deepEqual(parseStrictJson('{"x":[{"a":1},{"a":2}]}'),{x:[{a:1},{a:2}]});});

test('report joins delayed outcome labels without widening tenant scope',()=>{const store=new GovernanceStore(':memory:');try{
  const run=fixture.events.find(e=>e.eventType==='ai.run.completed');const label=fixture.events.find(e=>e.outcome?.forEventId===run.eventId);
  store.ingest(run,principal);store.ingest(label,principal);
  const report=store.report(principal,{from:'2026-09-01T00:00:00.000Z',to:'2026-09-02T00:00:00.000Z'});assert.equal(report.models[0].labelled,1);assert.equal(report.eventCount,2);
}finally{store.close();}});
test('HTTP authenticates and rejects source content, binary and oversized requests',async()=>{
 const store=new GovernanceStore(':memory:');const server=createServer(store,[principal]);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const headers={authorization:`Bearer ${principal.token}`,'content-type':'application/json'};
 try {assert.equal((await fetch(base+'/v1/events')).status,401);
  assert.equal((await fetch(base+'/v1/events',{method:'POST',headers,body:JSON.stringify(fixture.events[0])})).status,201);
  assert.equal((await fetch(base+'/v1/events',{method:'POST',headers,body:JSON.stringify({...fixture.events[0],transcript:'private source'})})).status,400);
  assert.equal((await fetch(base+'/v1/events',{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'text'})).status,415);
  assert.equal((await fetch(base+'/v1/events',{method:'POST',headers,body:' '.repeat(65537)})).status,413);
  const report=await (await fetch(base+'/v1/report',{headers})).json();assert.equal(report.eventCount,1);
  assert.equal((await fetch(base+'/v1/events/'+fixture.events[0].eventId,{headers})).status,200);
 } finally {await new Promise(r=>server.close(r));store.close();}
});

test('JSON parser rejects excessive nesting',()=>{assert.throws(()=>parseStrictJson('['.repeat(34)+'0'+']'.repeat(34)),/nesting/);});
