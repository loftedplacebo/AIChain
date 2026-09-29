const {createHash}=require('node:crypto');
const {validateGovernanceEvent}=require('../../sdk/typescript/governance-event');
const ref=v=>{if(typeof v!=='string'||! /^[A-Za-z0-9._:-]{1,128}$/.test(v))throw Error('Invalid governance reference');return v;};
const only=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Unsupported rule field');};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const encode=v=>JSON.stringify(canonical(v));
const digest=v=>createHash('sha256').update(encode(v)).digest('hex');
const clock=v=>{if(!Number.isSafeInteger(v)||v<0||v>8640000000000000)throw Error('Invalid governance clock');return v;};
function ruleDefinition(input){
 only(input,['id','version','environment','agentRef','taskClass','condition','thresholdMs','severity','destinationRef','keyRef']);
 const rule=JSON.parse(encode(input));ref(rule.id);
 if(!Number.isSafeInteger(rule.version)||rule.version<1||rule.version>100000)throw Error('Invalid rule version');
 if(typeof rule.environment!=='string'||! /^[A-Za-z0-9._-]{1,64}$/.test(rule.environment))throw Error('Invalid rule environment');
 for(const key of ['agentRef','taskClass'])if(rule[key]!==undefined)ref(rule[key]);
 if(!['run-failed','latency-exceeded','tool-permission-denied','tool-failed'].includes(rule.condition))throw Error('Unsupported rule condition');
 if(rule.condition==='latency-exceeded'){
  if(!Number.isInteger(rule.thresholdMs)||rule.thresholdMs<0||rule.thresholdMs>86400000)throw Error('Invalid latency threshold');
 }else if(rule.thresholdMs!==undefined)throw Error('Threshold not supported by this condition');
 if(!['info','low','medium','high','critical'].includes(rule.severity))throw Error('Invalid rule severity');
 if(rule.destinationRef!==undefined||rule.keyRef!==undefined){ref(rule.destinationRef);ref(rule.keyRef);}
 return rule;
}
function assess(rule,event){
 if(event.eventType!=='ai.run.completed'||event.environment!==rule.environment||(rule.agentRef&&event.agentRef!==rule.agentRef)||(rule.taskClass&&event.activity?.taskClass!==rule.taskClass))return 'not-applicable';
 if(rule.condition==='run-failed')return event.result?.status==='failed'?'match':event.result?.status==='pending'?'missing':'clear';
 if(rule.condition==='latency-exceeded')return event.activity?.latencyMs===undefined?'missing':event.activity.latencyMs>rule.thresholdMs?'match':'clear';
 const tools=event.activity?.toolCalls;
 if(!tools?.length)return 'missing';
 if(rule.condition==='tool-failed')return tools.some(t=>t.resultCode==='failed')?'match':tools.some(t=>!['completed','failed'].includes(t.resultCode))?'missing':'clear';
 return tools.some(t=>t.allowed===false)?'match':tools.some(t=>t.allowed===undefined)?'missing':'clear';
}
class RuleEngine{
 constructor(journal){
  this.journal=journal;this.db=journal.db;
  this.db.exec(`CREATE TABLE IF NOT EXISTS governance_rules(tenant TEXT NOT NULL,project TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL,actor TEXT NOT NULL,PRIMARY KEY(tenant,project,id,version));
   CREATE TABLE IF NOT EXISTS governance_active_rules(tenant TEXT NOT NULL,project TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(tenant,project,id));
   CREATE TABLE IF NOT EXISTS governance_checks(tenant TEXT NOT NULL,project TEXT NOT NULL,event_id TEXT NOT NULL,rule_id TEXT NOT NULL,version INTEGER NOT NULL,digest TEXT NOT NULL,assessment TEXT NOT NULL,PRIMARY KEY(tenant,project,event_id,rule_id,version));
   CREATE TABLE IF NOT EXISTS governance_processed_events(tenant TEXT NOT NULL,project TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(tenant,project,id));
   CREATE TABLE IF NOT EXISTS governance_rule_cursors(tenant TEXT NOT NULL,project TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(tenant,project));
   CREATE TABLE IF NOT EXISTS governance_detected_outbox(tenant TEXT NOT NULL,project TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(tenant,project,id));
   CREATE TABLE IF NOT EXISTS detected_incidents(tenant TEXT NOT NULL,project TEXT NOT NULL,id TEXT NOT NULL,event_id TEXT NOT NULL,rule_id TEXT NOT NULL,rule_version INTEGER NOT NULL,severity TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL,detected_at INTEGER NOT NULL,PRIMARY KEY(tenant,project,id));
   CREATE TABLE IF NOT EXISTS incident_actions(tenant TEXT NOT NULL,project TEXT NOT NULL,incident_id TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,revision INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(tenant,project,incident_id,id));`);
 }
 #scope(p){ref(p.tenant);ref(p.project);}
 register(p,input,{actorRef,now=Date.now()}){
  this.#scope(p);ref(actorRef);clock(now);const rule=ruleDefinition(input),body=encode(rule);
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const old=this.db.prepare('SELECT body FROM governance_rules WHERE tenant=? AND project=? AND id=? AND version=?').get(p.tenant,p.project,rule.id,rule.version);
   if(old){if(old.body!==body)throw Error('Immutable rule version conflict');this.db.exec('COMMIT');return false;}
   const active=this.db.prepare('SELECT a.version,r.created_at FROM governance_active_rules a JOIN governance_rules r ON r.tenant=a.tenant AND r.project=a.project AND r.id=a.id AND r.version=a.version WHERE a.tenant=? AND a.project=? AND a.id=?').get(p.tenant,p.project,rule.id);
   if(active&&rule.version<=active.version)throw Error('Rule version must increase');
   if(active&&now<active.created_at)throw Error('Rule activation time must not decrease');
   const count=this.db.prepare('SELECT COUNT(*) n FROM governance_active_rules WHERE tenant=? AND project=?').get(p.tenant,p.project).n;
   if(!active&&count>=100)throw Error('Active rule capacity reached');
   this.db.prepare('INSERT INTO governance_rules VALUES(?,?,?,?,?,?,?)').run(p.tenant,p.project,rule.id,rule.version,body,now,actorRef);
   this.db.prepare('INSERT INTO governance_active_rules VALUES(?,?,?,?) ON CONFLICT(tenant,project,id) DO UPDATE SET version=excluded.version').run(p.tenant,p.project,rule.id,rule.version);
   this.db.exec('COMMIT');return true;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 preview(p,input,events){
  this.#scope(p);const rule=ruleDefinition(input);
  if(!Array.isArray(events)||events.length>1000)throw Error('Preview limited to 1000 records');
  return events.map(event=>{validateGovernanceEvent(event);if(event.tenantRef!==p.tenant||event.projectRef!==p.project)throw Error('Preview scope mismatch');return {eventId:event.eventId,assessment:assess(rule,event)};});
 }
 process(p,event,{now=Date.now()}={}){
  this.#scope(p);clock(now);validateGovernanceEvent(event);
  if(event.tenantRef!==p.tenant||event.projectRef!==p.project)throw Error('Rule event scope mismatch');
  const hash=digest(event),incidents=[];this.db.exec('BEGIN IMMEDIATE');
  try{
   const previous=this.db.prepare('SELECT digest FROM governance_processed_events WHERE tenant=? AND project=? AND id=?').get(p.tenant,p.project,event.eventId);
   if(previous){if(previous.digest!==hash)throw Error('Evaluated event identity conflict');this.db.exec('COMMIT');return [];}
   const received=Date.parse(event.receivedAt);
   const rules=this.db.prepare('SELECT r.* FROM governance_rules r WHERE r.tenant=? AND r.project=? AND r.created_at<=? AND r.version=(SELECT MAX(v.version) FROM governance_rules v WHERE v.tenant=r.tenant AND v.project=r.project AND v.id=r.id AND v.created_at<=?) ORDER BY r.id').all(p.tenant,p.project,received,received);
   for(const stored of rules){
    // Versions apply prospectively by server receive time, not model event time.
    if(Date.parse(event.receivedAt)<stored.created_at)continue;
    const rule=JSON.parse(stored.body),prior=this.db.prepare('SELECT digest FROM governance_checks WHERE tenant=? AND project=? AND event_id=? AND rule_id=? AND version=?').get(p.tenant,p.project,event.eventId,rule.id,rule.version);
    if(prior){if(prior.digest!==hash)throw Error('Evaluated event identity conflict');continue;}
    const assessment=assess(rule,event);
    this.db.prepare('INSERT INTO governance_checks VALUES(?,?,?,?,?,?,?)').run(p.tenant,p.project,event.eventId,rule.id,rule.version,hash,assessment);
    if(assessment!=='match')continue;
    const id='incident-'+digest([p.tenant,p.project,event.eventId,rule.id,rule.version]);
    this.db.prepare('INSERT INTO detected_incidents VALUES(?,?,?,?,?,?,?,?,?,?)').run(p.tenant,p.project,id,event.eventId,rule.id,rule.version,rule.severity,'open',0,now);
    const alert={schema:event.schema,schemaVersion:event.schemaVersion,profile:event.profile,tenantRef:p.tenant,projectRef:p.project,environment:event.environment,eventId:'detected-'+digest(id),streamRef:id,sequence:'0',occurredAt:new Date(now).toISOString(),eventType:'ai.monitor.alerted',agentRef:event.agentRef,runRef:event.runRef,parentEventRefs:[event.eventId],source:{kind:'downstream-system',integrationVersion:'orvessian-rules-0.1.0-alpha',keyRef:'governance-rule-engine'},policy:{policyRef:rule.id,version:String(rule.version)},monitor:{monitorRef:rule.id,signalCode:rule.condition,severity:rule.severity,disposition:'open'}};
    validateGovernanceEvent({...alert,receivedAt:alert.occurredAt});
    this.db.prepare('INSERT INTO governance_detected_outbox VALUES(?,?,?,?,?)').run(p.tenant,p.project,alert.eventId,encode(alert),'pending');
    if(rule.destinationRef)this.journal.enqueue(p,{schemaVersion:1,deliveryId:'alert-'+digest([id,rule.destinationRef]),tenantRef:p.tenant,projectRef:p.project,incidentRef:id,eventRef:event.eventId,severity:rule.severity},{destinationRef:rule.destinationRef,keyRef:rule.keyRef},now);
    incidents.push(id);
   }
   this.db.prepare('INSERT INTO governance_processed_events VALUES(?,?,?,?)').run(p.tenant,p.project,event.eventId,hash);
   this.db.exec('COMMIT');return incidents;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 processStored(store,p,id,options){ref(id);const event=store.get(p,id);if(!event)throw Error('Scoped event not found');return this.process(p,event,options);}
 async publishDetected(store,p,{limit=100}={}){
  this.#scope(p);if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Invalid detected outbox limit');
  const rows=this.db.prepare("SELECT id,body FROM governance_detected_outbox WHERE tenant=? AND project=? AND state='pending' ORDER BY id LIMIT ?").all(p.tenant,p.project,limit);
  let published=0;
  for(const row of rows){
   const ack=await store.ingest(JSON.parse(row.body),p);
   if(!ack||ack.eventId!==row.id||!['accepted','duplicate'].includes(ack.status))throw Error('Detected-event acknowledgement mismatch');
   this.db.prepare("UPDATE governance_detected_outbox SET state='published' WHERE tenant=? AND project=? AND id=?").run(p.tenant,p.project,row.id);published++;
  }
  return {published};
 }
 scanStored(store,p,{limit=100,now=Date.now()}={}){
  this.#scope(p);clock(now);
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Invalid rule scan limit');
  if(typeof store.db?.prepare!=='function')throw Error('Rule scan currently requires SQLite governance storage');
  const position=this.db.prepare('SELECT position FROM governance_rule_cursors WHERE tenant=? AND project=?').get(p.tenant,p.project)?.position??0;
  const rows=store.db.prepare('SELECT rowid AS position,body FROM events WHERE tenant=? AND project=? AND rowid>? ORDER BY rowid LIMIT ?').all(p.tenant,p.project,position,limit);
  const incidents=[];
  for(const row of rows){
   incidents.push(...this.process(p,JSON.parse(row.body),{now}));
   // A crash between process and cursor update replays the already-evaluated
   // record, which is deduplicated before the cursor advances. Never skip failures.
   this.db.prepare('INSERT INTO governance_rule_cursors VALUES(?,?,?) ON CONFLICT(tenant,project) DO UPDATE SET position=MAX(position,excluded.position)').run(p.tenant,p.project,row.position);
  }
  return {processed:rows.length,incidents};
 }
 list(p){this.#scope(p);return this.db.prepare('SELECT id,event_id,rule_id,rule_version,severity,state,revision,detected_at FROM detected_incidents WHERE tenant=? AND project=? ORDER BY detected_at DESC,id LIMIT 100').all(p.tenant,p.project);}
 incidentPage(p,{limit=50,offset=0}={}){this.#scope(p);if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw Error('Invalid incident pagination');const total=this.db.prepare('SELECT COUNT(*) n FROM detected_incidents WHERE tenant=? AND project=?').get(p.tenant,p.project).n;const incidents=this.db.prepare('SELECT id,event_id,rule_id,rule_version,severity,state,revision,detected_at FROM detected_incidents WHERE tenant=? AND project=? ORDER BY detected_at DESC,id LIMIT ? OFFSET ?').all(p.tenant,p.project,limit,offset);return {incidents,total,nextOffset:offset+limit<total?offset+limit:null};}
 activeRules(p){this.#scope(p);return this.db.prepare('SELECT r.body,r.created_at FROM governance_rules r JOIN governance_active_rules a ON a.tenant=r.tenant AND a.project=r.project AND a.id=r.id AND a.version=r.version WHERE r.tenant=? AND r.project=? ORDER BY r.id').all(p.tenant,p.project).map(row=>{const definition=JSON.parse(row.body);delete definition.keyRef;return {...definition,activatedAt:new Date(row.created_at).toISOString()};});}
 getIncident(p,id){this.#scope(p);ref(id);return this.db.prepare('SELECT id,event_id,rule_id,rule_version,severity,state,revision,detected_at FROM detected_incidents WHERE tenant=? AND project=? AND id=?').get(p.tenant,p.project,id)||null;}
 transition(p,id,input,{now=Date.now()}={}){
  this.#scope(p);ref(id);clock(now);only(input,['actionId','actorRef','action','reasonCode','expectedRevision']);
  for(const key of ['actionId','actorRef','reasonCode'])ref(input[key]);
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||!['acknowledge','resolve','reopen'].includes(input.action))throw Error('Invalid incident action');
  const body=encode(input);this.db.exec('BEGIN IMMEDIATE');
  try{
   const previous=this.db.prepare('SELECT body,revision FROM incident_actions WHERE tenant=? AND project=? AND incident_id=? AND id=?').get(p.tenant,p.project,id,input.actionId);
   if(previous){if(previous.body!==body)throw Error('Incident action identity conflict');this.db.exec('COMMIT');return previous.revision;}
   const incident=this.db.prepare('SELECT state,revision FROM detected_incidents WHERE tenant=? AND project=? AND id=?').get(p.tenant,p.project,id);
   if(!incident)throw Error('Scoped incident not found');if(incident.revision!==input.expectedRevision)throw Error('Incident revision conflict');
   const state=input.action==='acknowledge'&&incident.state==='open'?'acknowledged':input.action==='resolve'&&['open','acknowledged'].includes(incident.state)?'resolved':input.action==='reopen'&&incident.state==='resolved'?'open':null;
   if(!state)throw Error('Invalid incident transition');
   const revision=incident.revision+1;
   this.db.prepare('UPDATE detected_incidents SET state=?,revision=? WHERE tenant=? AND project=? AND id=?').run(state,revision,p.tenant,p.project,id);
   this.db.prepare('INSERT INTO incident_actions VALUES(?,?,?,?,?,?,?)').run(p.tenant,p.project,id,input.actionId,body,revision,now);this.db.exec('COMMIT');return revision;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 history(p,id){this.#scope(p);ref(id);return this.db.prepare('SELECT body,revision,created_at FROM incident_actions WHERE tenant=? AND project=? AND incident_id=? ORDER BY revision LIMIT 100').all(p.tenant,p.project,id).map(r=>({...JSON.parse(r.body),revision:r.revision,createdAt:r.created_at}));}
}
module.exports={RuleEngine,ruleDefinition,assess,ruleDigest:digest};
