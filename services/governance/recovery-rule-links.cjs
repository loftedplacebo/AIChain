'use strict';
const {createHash}=require('node:crypto'),{ruleDefinition,ruleDigest}=require('./governance-rules.cjs'),{validateGovernanceEvent}=require('../../sdk/typescript/governance-event');
const ref=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v),clock=v=>Number.isSafeInteger(v)&&v>=0&&v<=8640000000000000,key=(...v)=>JSON.stringify(v),scope=r=>[r.tenant,r.project],hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
// Called only inside the offline journal reader's existing read transaction.
function inspectRuleLinks(db,jobs,maxRows,privateSnapshot=null){
 if(!Number.isInteger(maxRows)||maxRows<1||maxRows>10000)throw Error('Bounded full rule-review limit required');
 const tables=['governance_rules','governance_active_rules','governance_processed_events','governance_checks','detected_incidents','incident_actions','governance_detected_outbox','governance_rule_cursors'],rows={},digest=createHash('sha256');let total=0,bytes=0;
 for(const table of tables){
  const n=db.prepare(`SELECT count(*) n FROM ${table}`).get().n;total+=n;if(total>maxRows)throw Error('Rule journal exceeds bounded full-review limit');
  const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name);if(columns.includes('body'))bytes+=db.prepare(`SELECT coalesce(sum(length(CAST(body AS BLOB))),0) bytes FROM ${table}`).get().bytes;
  if(bytes>16*1024*1024)throw Error('Rule journal exceeds bounded body limit');
  rows[table]=db.prepare(`SELECT * FROM ${table} ORDER BY ${columns.map(c=>'"'+c.replaceAll('"','""')+'"').join(',')}`).all();
  digest.update(table+'\n');for(const row of rows[table])digest.update(JSON.stringify(row)+'\n');
 }
 if(privateSnapshot)privateSnapshot.rows=rows;
 const counts={invalidRules:0,invalidActiveRules:0,invalidProcessed:0,invalidChecks:0,invalidIncidents:0,invalidActions:0,invalidOutbox:0,invalidCursors:0,invalidDeliveries:0,missingIncidents:0,missingOutbox:0,missingDeliveries:0,pendingDerived:0,publishedDerived:0};
 const rules=new Map(),latest=new Map(),processed=new Map(),checks=new Map(),incidents=new Map(),outbox=new Map(),deliveries=new Map(),actions=new Map();
 const safe=(category,fn)=>{try{fn();}catch{counts[category]++;}};
 const scoped=r=>{if(!scope(r).every(ref))throw Error();};
 for(const r of rows.governance_rules)safe('invalidRules',()=>{
  scoped(r);if(typeof r.body!=='string'||Buffer.byteLength(r.body)>4096||!clock(r.created_at)||!ref(r.actor))throw Error();
  const rule=ruleDefinition(JSON.parse(r.body));if(rule.id!==r.id||rule.version!==r.version)throw Error();const id=key(...scope(r),r.id,r.version);rules.set(id,{row:r,rule});
  const group=key(...scope(r),r.id),old=latest.get(group);if(old&&(r.version<=old.version||r.created_at<old.created_at))throw Error();latest.set(group,r);
 });
 const active=new Set();for(const r of rows.governance_active_rules)safe('invalidActiveRules',()=>{scoped(r);const group=key(...scope(r),r.id);if(!rules.has(key(...scope(r),r.id,r.version))||latest.get(group)?.version!==r.version)throw Error();active.add(group);});for(const group of latest.keys())if(!active.has(group))counts.invalidActiveRules++;
 for(const r of rows.governance_processed_events)safe('invalidProcessed',()=>{scoped(r);if(!ref(r.id)||!hash(r.digest))throw Error();processed.set(key(...scope(r),r.id),r);});
 for(const r of rows.governance_checks)safe('invalidChecks',()=>{scoped(r);if(!rules.has(key(...scope(r),r.rule_id,r.version))||!hash(r.digest)||processed.get(key(...scope(r),r.event_id))?.digest!==r.digest||!['match','clear','missing','not-applicable'].includes(r.assessment))throw Error();checks.set(key(...scope(r),r.event_id,r.rule_id,r.version),r);});
 for(const r of rows.detected_incidents)safe('invalidIncidents',()=>{
  scoped(r);const rule=rules.get(key(...scope(r),r.rule_id,r.rule_version))?.rule,check=checks.get(key(...scope(r),r.event_id,r.rule_id,r.rule_version));
  if(!rule||check?.assessment!=='match'||r.id!=='incident-'+ruleDigest([...scope(r),r.event_id,r.rule_id,r.rule_version])||r.severity!==rule.severity||!['open','acknowledged','resolved'].includes(r.state)||!Number.isSafeInteger(r.revision)||r.revision<0||!clock(r.detected_at))throw Error();incidents.set(key(...scope(r),r.id),{row:r,rule});
 });
 for(const r of rows.incident_actions)safe('invalidActions',()=>{scoped(r);if(typeof r.body!=='string'||Buffer.byteLength(r.body)>4096||!incidents.has(key(...scope(r),r.incident_id))||!clock(r.created_at))throw Error();const b=JSON.parse(r.body);if(!b||Object.keys(b).sort().join(',')!=='action,actionId,actorRef,expectedRevision,reasonCode'||b.actionId!==r.id||![b.actionId,b.actorRef,b.reasonCode].every(ref)||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0||r.revision!==b.expectedRevision+1)throw Error();const group=key(...scope(r),r.incident_id),list=actions.get(group)||[];list.push({...r,input:b});actions.set(group,list);});
 for(const [group,{row:r}] of incidents){let state='open',revision=0,at=r.detected_at;const list=(actions.get(group)||[]).sort((a,b)=>a.revision-b.revision);for(const a of list){const next=a.input.action==='acknowledge'&&state==='open'?'acknowledged':a.input.action==='resolve'&&['open','acknowledged'].includes(state)?'resolved':a.input.action==='reopen'&&state==='resolved'?'open':null;if(!next||a.revision!==revision+1||a.created_at<at){counts.invalidActions++;break;}state=next;revision=a.revision;at=a.created_at;}if(state!==r.state||revision!==r.revision)counts.invalidIncidents++;}
 for(const r of rows.governance_detected_outbox)safe('invalidOutbox',()=>{
  scoped(r);if(typeof r.body!=='string'||Buffer.byteLength(r.body)>1048576||!['pending','published'].includes(r.state))throw Error();const b=JSON.parse(r.body);validateGovernanceEvent({...b,receivedAt:b.occurredAt});const incident=incidents.get(key(...scope(r),b.streamRef));if(!incident)throw Error();const {row:i,rule}=incident;
  if(b.tenantRef!==r.tenant||b.projectRef!==r.project||b.eventId!==r.id||r.id!=='detected-'+ruleDigest(i.id)||b.eventType!=='ai.monitor.alerted'||b.environment!==rule.environment||b.sequence!=='0'||b.occurredAt!==new Date(i.detected_at).toISOString()||JSON.stringify(b.parentEventRefs)!==JSON.stringify([i.event_id])||b.source.kind!=='downstream-system'||b.source.integrationVersion!=='orvessian-rules-0.1.0-alpha'||b.source.keyRef!=='governance-rule-engine'||b.policy?.policyRef!==rule.id||b.policy.version!==String(rule.version)||b.monitor?.monitorRef!==rule.id||b.monitor.signalCode!==rule.condition||b.monitor.severity!==rule.severity||b.monitor.disposition!=='open')throw Error();outbox.set(key(...scope(r),r.id),r);counts[r.state==='pending'?'pendingDerived':'publishedDerived']++;
 });
 for(const r of rows.governance_rule_cursors)safe('invalidCursors',()=>{scoped(r);if(!Number.isSafeInteger(r.position)||r.position<0)throw Error();});
 for(const r of jobs)safe('invalidDeliveries',()=>{const b=JSON.parse(r.body),incident=incidents.get(key(...scope(r),b.incidentRef));if(!incident)throw Error();const {row:i,rule}=incident;if(!rule.destinationRef||r.destination!==rule.destinationRef||r.key_ref!==rule.keyRef||r.id!=='alert-'+ruleDigest([i.id,rule.destinationRef])||b.eventRef!==i.event_id||b.severity!==i.severity)throw Error();deliveries.set(key(...scope(r),r.id),r);});
 for(const r of checks.values())if(r.assessment==='match'&&!incidents.has(key(...scope(r),'incident-'+ruleDigest([...scope(r),r.event_id,r.rule_id,r.version]))))counts.missingIncidents++;
 for(const {row:r,rule} of incidents.values()){if(!outbox.has(key(...scope(r),'detected-'+ruleDigest(r.id))))counts.missingOutbox++;if(rule.destinationRef&&!deliveries.has(key(...scope(r),'alert-'+ruleDigest([r.id,rule.destinationRef]))))counts.missingDeliveries++;}
 const failures=Object.entries(counts).filter(([name])=>!['pendingDerived','publishedDerived'].includes(name)).reduce((n,[,v])=>n+v,0);
 return {reviewedRows:total,counts,snapshotDigest:digest.digest('hex'),localLinks:failures?'failed':'matched',eventEvidence:'not-checked',cursorAgainstEventStore:'not-checked',sourceAuthenticity:'not-proven',activation:'review-required'};
}
module.exports={inspectRuleLinks};
