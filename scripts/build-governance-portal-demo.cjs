const fs=require('node:fs');const path=require('node:path');
const {buildReport}=require('../services/governance/report');
const {validateGovernanceEvent}=require('../sdk/typescript/governance-event');
const base=require('../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
const events=[];
for(let day=0;day<14;day++) for(const original of base.events) {
  const caseNumber=Number(original.caseRef?.split('-').pop()||0);
  if(caseNumber>22+day%9)continue;
  if(original.monitor && ![4,12].includes(day))continue;
  const e=structuredClone(original);const prefix=`d${String(day+1).padStart(2,'0')}-`;
  e.eventId=prefix+e.eventId;e.streamRef=prefix+e.streamRef;
  for(const key of ['runRef','caseRef'])if(e[key])e[key]=prefix+e[key];
  if(e.outcome)e.outcome.forEventId=prefix+e.outcome.forEventId;
  for(const key of ['occurredAt','receivedAt'])e[key]=new Date(Date.parse(e[key])+day*86400000).toISOString();
  if(e.outcome?.adjudicatedAt)e.outcome.adjudicatedAt=new Date(Date.parse(e.outcome.adjudicatedAt)+day*86400000).toISOString();
  if(e.agentRef)e.agentRef=['claims-intake','invoice-review','routing-assistant'][day%3];
  if(e.activity)e.activity.latencyMs+=((day*37)%200)-100;
  if(e.monitor)e.model={providerRef:'provider-demo',modelRef:'claims-assistant',deploymentRef:'claims-model-v2',configVersion:'config-21'};
  if(e.policy && day%4===0 && e.eventId.includes('case-001'))e.policy.decision='review';
  validateGovernanceEvent(e);events.push(e);
}
const views=[];
for(const days of [7,14])for(const deployment of ['all','claims-model-v1','claims-model-v2']){
 const from=`2026-09-${String(15-days).padStart(2,'0')}T00:00:00.000Z`,to='2026-09-15T00:00:00.000Z';
 const selected=events.filter(e=>e.eventType!=='ai.outcome.adjudicated'&&e.occurredAt>=from&&e.occurredAt<to&&(deployment==='all'||e.model?.deploymentRef===deployment));
 const ids=new Set(selected.map(e=>e.eventId));const enriched=[...selected,...events.filter(e=>ids.has(e.outcome?.forEventId))];
 views.push({key:`${days}:${deployment}`,report:buildReport(enriched),events:enriched.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,100),from,to,detailLimit:100});
}
const output={synthetic:true,asOf:'2026-09-16T00:00:00.000Z',labelPolicy:'Runs selected by occurrence date; linked outcomes available by report snapshot included.',views};
const target=path.join(__dirname,'..','website','public','governance-demo.json');fs.writeFileSync(target,JSON.stringify(output));console.log(`Generated ${views.length} portal views from ${events.length} synthetic events`);
fs.writeFileSync(path.join(__dirname,'..','website','public','governance-demo-events.json'),JSON.stringify({synthetic:true,schemaVersion:'0.1.0-draft',events}));
