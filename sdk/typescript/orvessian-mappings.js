'use strict';
const {createHash}=require('node:crypto');
const reject=()=>{throw new TypeError('Invalid structured integration metadata');};
const keys=(v,allowed)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))reject();};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Pure customer-side OTLP JSON Span mapping. No exporter, collector or raw span transport. */
function mapOtlpSpan(client,span,context){
 keys(context,['agentRef','environment','deploymentRef','providerRef','modelRef','configVersion','taskClass','caseRef','decisionCode','predictedLabel']);
 if(!span||! /^[0-9a-f]{32}$/i.test(span.traceId)||! /^[0-9a-f]{16}$/i.test(span.spanId)||/^0+$/.test(span.traceId)||/^0+$/.test(span.spanId))reject();
 for(const field of ['startTimeUnixNano','endTimeUnixNano'])if(typeof span[field]!=='string'||! /^[0-9]{1,20}$/.test(span[field]))reject();
 const start=BigInt(span.startTimeUnixNano),end=BigInt(span.endTimeUnixNano);
 if(end<start||end-start>86400000000000n||start>253402300799999000000n)reject();
 if(![1,2,'STATUS_CODE_OK','STATUS_CODE_ERROR'].includes(span.status?.code))reject();
 const trace=span.traceId.toLowerCase(),id='otel-'+hash([client.tenant,client.project,context.environment,trace,span.spanId.toLowerCase()]);
 const event=client.buildRun({...context,eventId:id,streamRef:id,sequence:'0',runRef:'trace-'+trace,occurredAt:new Date(Number(start/1000000n)).toISOString(),latencyMs:Number((end-start)/1000000n),status:[2,'STATUS_CODE_ERROR'].includes(span.status.code)?'failed':'completed'});
 if(event.result.status==='failed'){delete event.result.predictedLabel;delete event.result.decisionCode;}
 event.source.integrationVersion='otlp-json-1.9.0-alpha';
 // Names, attributes, resource, events, links, status messages and trace state
 // are deliberately not inspected, serialized, logged or transmitted.
 return client.validate(event);
}
/** Import customer's normalized evaluation labels; no vendor credentials or raw scores/content. */
function mapEvaluationRows(client,rows,options={}){
 keys(options,['environment','evaluatorRef','rubricVersion']);
 const {environment,evaluatorRef,rubricVersion}=options;
 if(!Array.isArray(rows)||rows.length>500)reject();
 return rows.map(row=>{
  keys(row,['evaluationId','forEventId','caseRef','label','occurredAt']);
  if(typeof row.evaluationId!=='string'||! /^[A-Za-z0-9._:-]{1,128}$/.test(row.evaluationId))reject();
  const eventId='eval-'+hash([client.tenant,client.project,environment,evaluatorRef,rubricVersion,row.evaluationId]);
  return client.validate({schema:'aichain.governance-event',schemaVersion:'0.1.0-draft',profile:'urn:orvessian:agent-run:v1',tenantRef:client.tenant,projectRef:client.project,environment,eventId,streamRef:eventId,sequence:'0',occurredAt:row.occurredAt,eventType:'ai.outcome.adjudicated',caseRef:row.caseRef,source:{kind:'customer-sdk',integrationVersion:'evaluation-json-0.1.0-alpha',keyRef:'project-credential'},outcome:{forEventId:row.forEventId,label:row.label,labelSource:'automated-evaluator',evaluatorRef,rubricVersion,adjudicatedAt:row.occurredAt}});
 });
}
module.exports={mapOtlpSpan,mapEvaluationRows};
