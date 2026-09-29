const {test}=require('node:test'),assert=require('node:assert/strict');
const {Client}=require('./orvessian-ingest'),{mapOtlpSpan,mapEvaluationRows}=require('./orvessian-mappings');
const c=new Client({baseUrl:'http://127.0.0.1',token:'x'.repeat(32),tenant:'t',project:'p'});
const context={agentRef:'a',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',taskClass:'classification',caseRef:'c',predictedLabel:'yes'};
const span={traceId:'a'.repeat(32),spanId:'b'.repeat(16),startTimeUnixNano:'1790553600000000000',endTimeUnixNano:'1790553600123000000',status:{code:1,message:'private'},name:'private',attributes:[{key:'gen_ai.input.messages',value:{stringValue:'private'}}],events:[{name:'private'}]};
test('OTLP mapping preserves stable correlation/timing and never copies source payloads',()=>{
 const event=mapOtlpSpan(c,span,context);assert.equal(event.activity.latencyMs,123);assert.equal(event.runRef,'trace-'+span.traceId);assert.equal(event.eventId,mapOtlpSpan(c,{...span,name:'different-source'},context).eventId);assert.ok(!JSON.stringify(event).includes('private'));assert.equal(event.source.integrationVersion,'otlp-json-1.9.0-alpha');
 for(const mutation of [{traceId:'0'.repeat(32)},{startTimeUnixNano:1},{endTimeUnixNano:'1'},{status:{code:0}}])assert.throws(()=>mapOtlpSpan(c,{...span,...mutation},context));
 assert.throws(()=>mapOtlpSpan(c,span,{...context,prompt:'private'}));
 assert.equal(mapOtlpSpan(c,{...span,status:{code:2}},context).result.predictedLabel,undefined);
});
test('evaluation import is bounded, deterministic and cannot promote automation to human accuracy',()=>{
 const row={evaluationId:'ev-1',forEventId:'e',caseRef:'c',label:'yes',occurredAt:'2026-09-28T00:00:00.000Z'};
 const opts={environment:'test',evaluatorRef:'customer-evaluator',rubricVersion:'v1'};
 const events=mapEvaluationRows(c,[row],opts);assert.equal(events[0].outcome.labelSource,'automated-evaluator');assert.equal(events[0].eventId,mapEvaluationRows(c,[row],opts)[0].eventId);
 assert.throws(()=>mapEvaluationRows(c,[{...row,prompt:'private'}],opts));assert.throws(()=>mapEvaluationRows(c,Array(501).fill(row),opts));
 const {GovernanceStore}=require('../../services/governance/store');const store=new GovernanceStore(':memory:');try{
  store.ingest(c.buildRun({...context,eventId:'e',streamRef:'e',sequence:'0',occurredAt:row.occurredAt,runRef:'r',status:'completed'}),{tenant:'t',project:'p'});
  store.ingest(events[0],{tenant:'t',project:'p'});const report=store.report({tenant:'t',project:'p'});assert.equal(report.kpis.reviewedLabels,0);assert.equal(report.models[0].excluded,1);
 }finally{store.close();}
});
