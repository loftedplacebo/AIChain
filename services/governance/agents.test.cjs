const test=require('node:test'),assert=require('node:assert/strict');
const {GovernanceStore}=require('./store');
const {sqliteSchema,registerAgent,heartbeatAgent,listAgents}=require('./agents.cjs');
const p={tenant:'org-demo',project:'claims-governance-demo'};
const event=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json').events.find(e=>e.eventType==='ai.run.completed');
const registration={agentRef:event.agentRef,environment:event.environment,deploymentRef:event.model.deploymentRef,ownerRef:'claims-team',purpose:'Classify synthetic claims',modelRef:event.model.modelRef,configVersion:event.model.configVersion,heartbeatTtlSeconds:60};
async function exercise(store){
 const t='2026-09-27T12:00:00.000Z',hb={agentRef:registration.agentRef,environment:registration.environment,deploymentRef:registration.deploymentRef,sequence:1};
 assert.equal((await registerAgent(store,p,registration,t)).status,'registered');
 assert.equal((await registerAgent(store,p,registration,t)).status,'duplicate');
 await assert.rejects(registerAgent(store,p,{...registration,modelRef:'changed'}),e=>e.status===409);
 await assert.rejects(registerAgent(store,p,{...registration,prompt:'forbidden'}),e=>e.status===400);
 assert.equal((await listAgents(store,p)).agents[0].heartbeatStatus,'not-observed');
 await heartbeatAgent(store,p,hb,t);
 assert.equal((await heartbeatAgent(store,p,hb,'2026-09-27T12:01:00.000Z')).receivedAt,t);
 await assert.rejects(heartbeatAgent(store,p,{...hb,sequence:0}),e=>e.status===409);
 assert.equal((await listAgents(store,p,{},'2026-09-27T12:00:59.999Z')).agents[0].heartbeatStatus,'fresh');
 assert.equal((await listAgents(store,p,{},'2026-09-27T12:01:00.000Z')).agents[0].heartbeatStatus,'stale');
 const other={...p,tenant:'other'};
 assert.deepEqual((await listAgents(store,other)).agents,[]);
 await assert.rejects(heartbeatAgent(store,other,hb),e=>e.status===404);
 await store.ingest(event,p);
 const row=(await listAgents(store,p)).agents[0];
 assert.equal(row.lastEventReceivedAt,(await store.get(p,event.eventId)).receivedAt);
 assert.notEqual(row.lastEventReceivedAt,event.occurredAt);
 await registerAgent(store,p,{...registration,deploymentRef:'another'});
 assert.equal((await listAgents(store,p,{limit:1})).nextOffset,1);
 assert.equal((await listAgents(store,p,{limit:1,offset:1})).nextOffset,null);
 await assert.rejects(listAgents(store,p,{limit:101}),e=>e.status===400);
}
test('SQLite registry replay, isolation, freshness and event correlation',async()=>{
 const store=new GovernanceStore(':memory:');store.db.exec(sqliteSchema);
 try{await exercise(store);const results=await Promise.all(Array.from({length:5},()=>registerAgent(store,p,{...registration,deploymentRef:'concurrent'})));assert.equal(results.filter(r=>r.status==='registered').length,1);}finally{store.close();}
});
test('PostgreSQL registry uses migrations and enforced tenant RLS',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 const client={query:(sql,args)=>args?db.query(sql,args):db.exec(sql).then(r=>r.at(-1)||{rows:[]}),release(){}};
 const pool={connect:async()=>client,query:client.query,end:()=>db.close()};
 await require('./postgres-migrate.cjs').migrate(pool);
 await db.exec('CREATE ROLE governance_app; GRANT USAGE ON SCHEMA public TO governance_app; GRANT SELECT ON governance_migrations,governance_environment TO governance_app; GRANT SELECT,INSERT ON governance_events TO governance_app; GRANT SELECT,INSERT,UPDATE ON governance_agents,governance_outbox,governance_usage,governance_evidence TO governance_app; SET ROLE governance_app;');
 const store=new (require('./postgres-store.cjs').PostgresGovernanceStore)(pool);await store.ready();
 try{await exercise(store);assert.equal((await pool.query('SELECT * FROM governance_agents')).rows.length,0);
 await assert.rejects(store.transaction({...p,tenant:'other'},c=>c.query('INSERT INTO governance_agents(tenant,project,agent,environment,deployment,body,created) VALUES($1,$2,$3,$4,$5,$6,$7)',[p.tenant,p.project,'foreign','test','v1','{}','now'])),/row-level security/);
 }finally{await store.close();}
});
