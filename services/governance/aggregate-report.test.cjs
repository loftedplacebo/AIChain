const {test}=require('node:test'),assert=require('node:assert/strict');
const {GovernanceStore}=require('./store'),{buildReport}=require('./report');
const reviews=require('./reviews.cjs');
const fixture=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
const p={tenant:fixture.events[0].tenantRef,project:fixture.events[0].projectRef};
function comparable(report){return {eventCount:report.eventCount,kpis:report.kpis,trends:report.trends,models:report.models.map(m=>({...m,latency:undefined,rubrics:[...m.rubrics].sort()})).sort((a,b)=>a.key.localeCompare(b.key)),alerts:[...report.alerts].sort((a,b)=>a.eventId.localeCompare(b.eventId))};}
test('SQL report matches reference metrics, exact percentile and delayed/conflicting outcome semantics',()=>{
 const store=new GovernanceStore(':memory:');try{
  for(const e of fixture.events)store.ingest(e,p);
  assert.deepEqual(comparable(store.report(p)),comparable(buildReport(fixture.events)));
  const label=fixture.events.find(e=>e.outcome);const extra={...label,eventId:'extra-label',streamRef:'extra-label',sequence:'0',occurredAt:'2026-09-25T00:00:00.000Z'};
  store.ingest(extra,p);
  const expected=buildReport([...fixture.events,extra]);assert.deepEqual(comparable(store.report(p,{to:'2026-09-20T00:00:00.000Z'})),comparable(expected));
  assert.equal(store.report({...p,tenant:'foreign'}).eventCount,0);
 }finally{store.close();}
});
test('reports and filtered review pagination work beyond 10000 with bounded incident preview',async()=>{
 const store=new GovernanceStore(':memory:');try{
  const run=fixture.events.find(e=>e.eventType==='ai.run.completed');
  for(let i=0;i<10050;i++)store.ingest({...run,eventId:`large-${i}`,streamRef:`large-${i}`,sequence:'0',activity:{...run.activity,latencyMs:i},agentRef:`agent-${i%20}`},p);
  const alert=fixture.events.find(e=>e.eventType==='ai.monitor.alerted');
  for(let i=0;i<105;i++)store.ingest({...alert,eventId:`alert-${i}`,streamRef:`alert-${i}`,sequence:'0'},p);
  const report=store.report(p);assert.equal(report.eventCount,10155);assert.equal(report.kpis.runs,10050);assert.equal(report.kpis.agentsReporting,20);assert.equal(report.models[0].p95LatencyMs,9547);
  assert.equal(report.alerts.length,100);assert.equal(report.alertSummary.total,105);assert.equal(report.alertSummary.truncated,true);
  const queue=await reviews.queue(store,p,{state:'awaiting-review',offset:10000,limit:20});assert.equal(queue.total,10050);assert.equal(queue.rows.length,20);assert.equal(queue.nextOffset,10020);
  assert.equal((await reviews.queue(store,{...p,tenant:'foreign'})).total,0);
 }finally{store.close();}
});

test('grouped outcome lookup preserves exclusions, scope boundaries and filtered cohorts',()=>{
 const store=new GovernanceStore(':memory:');try{
  const events=structuredClone(fixture.events);const labels=events.filter(e=>e.outcome);
  labels[0].outcome.labelSource='automated-evaluator';
  labels[1].caseRef='different-case';
  labels[2].outcome.evaluatorRef='other-evaluator';
  const cross={...labels[3],eventId:'cross-environment',streamRef:'cross-environment',sequence:'0',environment:'test'};
  events.push(cross);for(const e of events)store.ingest(e,p);
  assert.deepEqual(comparable(store.report(p)),comparable(buildReport(events)));
  const deployment=events.find(e=>e.model).model.deploymentRef;
  const selected=events.filter(e=>e.model?.deploymentRef===deployment);
  const ids=new Set(selected.filter(e=>e.eventType==='ai.run.completed').map(e=>e.eventId));
  const selectedIds=new Set(selected.map(e=>e.eventId));
  const joined=[...selected,...events.filter(e=>ids.has(e.outcome?.forEventId)&&!selectedIds.has(e.eventId))];
  assert.deepEqual(comparable(store.report(p,{deployment})),comparable(buildReport(joined)));
 }finally{store.close();}
});
