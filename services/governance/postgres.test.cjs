const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {migrate}=require('./postgres-migrate.cjs');
const {PostgresGovernanceStore}=require('./postgres-store.cjs');
const fixture=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
const p={tenant:'org-demo',project:'claims-governance-demo'};
async function setup(){
 const db=new PGlite();
 const client={query:(sql,args)=>args?db.query(sql,args):db.exec(sql).then(r=>r.at(-1)||{rows:[]}),release(){}};
 const pool={connect:async()=>client,query:client.query,end:()=>db.close()};
 await migrate(pool);await migrate(pool);
 await db.exec("CREATE ROLE governance_app; GRANT USAGE ON SCHEMA public TO governance_app; GRANT SELECT ON governance_migrations,governance_environment TO governance_app; GRANT SELECT,INSERT ON governance_events TO governance_app; GRANT SELECT,INSERT,UPDATE ON governance_outbox,governance_usage,governance_evidence TO governance_app; SET ROLE governance_app;");
 const store=new PostgresGovernanceStore(pool);await store.ready();return {db,pool,store};
}
test('PostgreSQL migration, atomic outbox, scoped reads, reports and replay',async()=>{
 const {store}=await setup();try{
  for(const e of fixture.events)await store.ingest(e,p);
  assert.equal((await store.list(p)).total,182);
  assert.equal((await store.ingest(fixture.events[0],p)).status,'duplicate');
  await assert.rejects(store.ingest({...fixture.events[0],agentRef:'changed'},p),e=>e.status===409);
  await assert.rejects(store.ingest({...fixture.events[0],eventId:'collision'},p),e=>e.status===409);
  const report=await store.report(p);assert.deepEqual(report.models.map(m=>m.accuracy).sort(),[.7,.9]);
  const expected=require('./report').buildReport(fixture.events);
  assert.deepEqual(report.kpis,expected.kpis);
  assert.deepEqual(report.models.map(m=>m.p95LatencyMs).sort(),expected.models.map(m=>m.p95LatencyMs).sort());
  assert.equal((await store.list(p,{q:fixture.events[0].eventId})).total,1);
  assert.equal((await store.list({...p,tenant:'other'})).total,0);
  assert.equal(await store.get({...p,tenant:'other'},fixture.events[0].eventId),null);
  const counters=await store.transaction(p,async c=>(await c.query('SELECT (SELECT count(*) FROM governance_outbox) AS outbox,event_count FROM governance_usage')).rows[0]);
  assert.equal(Number(counters.outbox),182);assert.equal(Number(counters.event_count),182);
  const signer=require('ethers').Wallet.createRandom();const prepared=await require('./evidence.cjs').prepareBatch(store,p,signer,{publisher:signer.address,limit:3});
  assert.deepEqual(await store.evidenceBatchIds(p),[prepared.batchId]);assert.deepEqual(await store.evidenceBatchIds({...p,tenant:'other'}),[]);
  const status=await store.evidenceStatus(p);assert.equal(status.total,182);assert.equal(status.counts.batched,3);assert.equal(status.counts.pending,179);assert.equal(status.awaitingSubmission,182);assert.equal(status.verification,'not-evaluated');assert.equal((await store.evidenceStatus({...p,tenant:'other'})).total,0);
 }finally{await store.close();}
});

test('PostgreSQL aggregates and review pagination exceed the former event cap',async()=>{
 const {store,pool}=await setup();try{
  const run=fixture.events.find(e=>e.eventType==='ai.run.completed');
  // Bulk synthetic setup exercises query scale without spending time on 10020 HTTP calls.
  await store.transaction(p,c=>c.query(`INSERT INTO governance_events(tenant,project,id,stream,sequence,digest,occurred,received,body,bytes)
   SELECT $1,$2,'scale-'||n,'scale-'||n,'0','synthetic', $3::text,($3::text)::timestamptz,
   $4::jsonb || jsonb_build_object('eventId','scale-'||n,'streamRef','scale-'||n,'sequence','0'),1000
   FROM generate_series(1,10020) n`,[p.tenant,p.project,run.occurredAt,JSON.stringify(run)]));
  // PGlite has no autovacuum daemon; refresh statistics as after a bulk import.
  await pool.query('RESET ROLE');await pool.query('ANALYZE governance_events');await pool.query('SET ROLE governance_app');
  const report=await store.report(p);assert.equal(report.kpis.runs,10020);assert.equal(report.eventCount,10020);
  const queue=await require('./reviews.cjs').queue(store,p,{offset:10000,limit:50});assert.equal(queue.total,10020);assert.equal(queue.rows.length,20);assert.equal(queue.nextOffset,null);
  assert.equal((await store.report({...p,tenant:'other'})).eventCount,0);
 }finally{await store.close();}
});
test('PostgreSQL RLS denies unscoped reads and foreign inserts even without application predicates',async()=>{
 const {store,pool}=await setup();try{
  await store.ingest(fixture.events[0],p);
  await assert.rejects(store.ready('dev'),/environment mismatch/);
  assert.equal((await pool.query('SELECT * FROM governance_events')).rows.length,0);
  await assert.rejects(store.transaction({...p,tenant:'other'},c=>c.query("INSERT INTO governance_usage(tenant,project,day) VALUES($1,$2,'2026-09-27')",[p.tenant,p.project])),/row-level security/);
  await pool.query('RESET ROLE');await assert.rejects(store.ready(),/must not bypass/);
 }finally{await store.close();}
});
test('PostgreSQL outbox failure rolls back accepted event and usage',async()=>{
 const {store,pool}=await setup();try{
  await pool.query('RESET ROLE');await pool.query('REVOKE INSERT ON governance_outbox FROM governance_app');await pool.query('SET ROLE governance_app');
  await assert.rejects(store.ingest(fixture.events[0],p),/permission denied/);
  assert.equal((await store.list(p)).total,0);
  assert.equal(await store.transaction(p,async c=>(await c.query('SELECT * FROM governance_usage')).rows.length),0);
 }finally{await store.close();}
});
test('PostgreSQL limits reject atomically and replay does not consume quota',async()=>{
 const {store,pool}=await setup();try{
  const capped=new PostgresGovernanceStore(pool,{maxEvents:1});await capped.ingest(fixture.events[0],p);
  await assert.rejects(capped.ingest(fixture.events[1],p),e=>e.status===429);
  assert.equal((await capped.ingest(fixture.events[0],p)).status,'duplicate');assert.equal((await capped.list(p)).total,1);
  const tiny=new PostgresGovernanceStore(pool,{maxBytes:1});await assert.rejects(tiny.ingest({...fixture.events[1],tenantRef:'tiny'}, {...p,tenant:'tiny'}),e=>e.status===429);
  assert.equal((await tiny.list({...p,tenant:'tiny'})).total,0);
  const daily=new PostgresGovernanceStore(pool,{maxDailyEvents:1});const scope={...p,tenant:'daily'};
  await daily.ingest({...fixture.events[0],tenantRef:'daily'},scope);
  await assert.rejects(daily.ingest({...fixture.events[1],tenantRef:'daily'},scope),e=>e.status===429);
  await daily.transaction(scope,c=>c.query("UPDATE governance_usage SET day='2000-01-01'"));
  await daily.ingest({...fixture.events[1],tenantRef:'daily'},scope);assert.equal((await daily.list(scope)).total,2);
 }finally{await store.close();}
});
test('PostgreSQL report joins later labels and migrations reject changed history',async()=>{
 const {store,pool}=await setup();try{
  const run=fixture.events.find(e=>e.eventType==='ai.run.completed'),label=fixture.events.find(e=>e.outcome?.forEventId===run.eventId);
  await store.ingest(run,p);await store.ingest(label,p);
  assert.equal((await store.report(p,{from:'2026-09-01T00:00:00.000Z',to:'2026-09-02T00:00:00.000Z'})).models[0].labelled,1);
  await pool.query('RESET ROLE');await pool.query("UPDATE governance_migrations SET checksum='changed'");await assert.rejects(migrate(pool),/modified/);
 }finally{await store.close();}
});
test('HTTP service awaits PostgreSQL persistence and returns real report data',async()=>{
 const {store}=await setup();const {DatabaseSync}=require('node:sqlite');const sessions=new DatabaseSync(':memory:');
 const {createServer}=require('./server.cjs');const token='postgres-http-test-token-'.repeat(2);
 const server=createServer(store,[{...p,token,scopes:['read','write']}],[],sessions);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
  const accepted=await fetch(base+'/v1/events',{method:'POST',headers,body:JSON.stringify(fixture.events[0])});assert.equal(accepted.status,201);assert.equal((await accepted.json()).status,'accepted');
  assert.equal((await (await fetch(base+'/v1/events',{headers})).json()).total,1);
  assert.equal((await (await fetch(base+'/v1/report',{headers})).json()).eventCount,1);
  assert.equal((await (await fetch(base+'/v1/events/'+fixture.events[0].eventId,{headers})).json()).eventId,fixture.events[0].eventId);
 }finally{await new Promise(r=>server.close(r));sessions.close();await store.close();}
});
