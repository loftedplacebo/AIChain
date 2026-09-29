'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {DeliveryJournal}=require('./webhook-delivery.cjs'),{RuleEngine}=require('./governance-rules.cjs'),{bindSqlite}=require('./environment.cjs'),{reviewRuleDeliveryJournal,reviewDeliveryJournal}=require('./recovery-delivery-review.cjs'),{Client}=require('../../sdk/typescript/orvessian-ingest');
const p={tenant:'synthetic',project:'test'},binding={destinationRef:'synthetic-receiver',keyRef:'synthetic-key-ref'},bindings=[{...p,...binding}],time=Date.now()-10000;
function event(scope,id){const client=new Client({baseUrl:'http://127.0.0.1',token:'x'.repeat(32),...scope});return {...client.buildRun({eventId:id,streamRef:'stream-'+id,sequence:1,occurredAt:new Date(time).toISOString(),runRef:'run-'+id,agentRef:'synthetic-agent-private-ref',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',taskClass:'task',status:'failed'}),receivedAt:new Date(time).toISOString()};}
function fixture(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-rule-review-')),file=path.join(directory,'rules.sqlite');bindSqlite(file,'test');const journal=new DeliveryJournal(file),engine=new RuleEngine(journal);engine.register(p,{id:'failure',version:1,environment:'test',condition:'run-failed',severity:'high',...binding},{actorRef:'synthetic-owner',now:time-1000});const [incident]=engine.process(p,event(p,'first'),{now:time});return {directory,file,journal,engine,incident,gate(){journal.db.exec("CREATE TABLE governance_recovery_gate(singleton INTEGER PRIMARY KEY CHECK(singleton=1),state TEXT); INSERT INTO governance_recovery_gate VALUES(1,'review-required')");journal.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');},review(options={}){return reviewRuleDeliveryJournal({environment:'test',file,bindings,...options});},close(){try{journal.close();}catch{}const resolved=fs.realpathSync(directory);if(path.dirname(resolved)!==fs.realpathSync(os.tmpdir())||!path.basename(resolved).startsWith('synthetic-rule-review-'))throw Error('Unsafe synthetic cleanup target');fs.rmSync(resolved,{recursive:true,force:true});}};}
test('actual multi-scope historical rules and incident lifecycle reconcile without reopening delivery',()=>{
 const f=fixture();try{
  for(const [i,action] of ['acknowledge','resolve','reopen'].entries())f.engine.transition(p,f.incident,{actionId:'action-'+i,actorRef:'synthetic-reviewer',action,reasonCode:'review',expectedRevision:i},{now:time+i});
  f.engine.register(p,{id:'failure',version:2,environment:'test',condition:'run-failed',severity:'critical',...binding},{actorRef:'synthetic-owner',now:time+1000});const e=event(p,'second');e.receivedAt=new Date(time+2000).toISOString();f.engine.process(p,e,{now:time+2000});
  const other={tenant:'synthetic-other',project:'test'};f.engine.register(other,{id:'unrouted',version:1,environment:'test',condition:'run-failed',severity:'low'},{actorRef:'synthetic-owner',now:time-1000});f.engine.process(other,event(other,'third'),{now:time});f.gate();
  const before=fs.readFileSync(f.file),result=f.review();assert.equal(result.ruleLinks.localLinks,'matched');assert.equal(result.ruleLinks.reviewedRows,20);assert.equal(result.ruleLinks.counts.pendingDerived,3);assert.equal(result.reviewed,2);assert.equal(result.ruleLinks.eventEvidence,'not-checked');assert.equal(result.activation,'review-required');assert.deepEqual(fs.readFileSync(f.file),before);
  for(const hidden of ['synthetic-owner','synthetic-agent-private-ref',f.incident,binding.keyRef])assert.ok(!JSON.stringify(result).includes(hidden));
  assert.equal(reviewDeliveryJournal({environment:'test',file:f.file,bindings}).ruleLinks,'not-checked');assert.throws(()=>f.review({maxRuleRows:19}),/full-review limit/);assert.throws(()=>new DeliveryJournal(f.file),/reviewed recovery/);
 }finally{f.close();}
});
test('rule, check, incident, outbox, routing and lifecycle drift fail a full review',()=>{
 const cases=[
  ["DELETE FROM governance_active_rules",'invalidActiveRules'],
  ["UPDATE governance_checks SET digest='"+'a'.repeat(64)+"'",'invalidChecks'],
  ["DELETE FROM detected_incidents",'missingIncidents'],
  ["UPDATE detected_incidents SET severity='critical'",'invalidIncidents'],
  ["UPDATE detected_incidents SET revision=1,state='resolved'",'invalidIncidents'],
  ["DELETE FROM governance_detected_outbox",'missingOutbox'],
  ["UPDATE governance_detected_outbox SET body=json_set(body,'$.monitor.signalCode','tool-failed')",'invalidOutbox'],
  ["DELETE FROM webhook_jobs",'missingDeliveries'],
  ["UPDATE webhook_jobs SET destination='foreign-destination'",'invalidDeliveries'],
  ["UPDATE governance_rules SET body=json_set(body,'$.version',2)",'invalidRules'],
  ["INSERT INTO governance_rule_cursors VALUES('synthetic','test',-1)",'invalidCursors']
 ];
 for(const [sql,count] of cases){const f=fixture();try{f.gate();f.journal.db.exec(sql);const result=f.review();assert.equal(result.ruleLinks.localLinks,'failed',sql);assert.ok(result.ruleLinks.counts[count]>0,sql);assert.equal(result.activation,'review-required');}finally{f.close();}}
 const f=fixture();try{f.engine.transition(p,f.incident,{actionId:'ack',actorRef:'synthetic-reviewer',action:'acknowledge',reasonCode:'review',expectedRevision:0},{now:time});f.gate();f.journal.db.exec("UPDATE incident_actions SET body=json_set(body,'$.expectedRevision',7)");const result=f.review();assert.equal(result.ruleLinks.localLinks,'failed');assert.ok(result.ruleLinks.counts.invalidActions>0);}finally{f.close();}
});
test('encrypted rule and delivery journal restore retains linked alerts and the service gate',async()=>{
 const f=fixture(),key=randomBytes(32);try{
  f.journal.claim(p,time);f.journal.close();const recovery=require('./recovery.cjs'),archive=await recovery.createBackup({environment:'test',files:[{role:'rules',path:f.file}],outputRoot:path.join(f.directory,'archives'),key,consistency:'quiesced'}),restored=await recovery.restoreBackup({environment:'test',directory:archive.directory,outputRoot:path.join(f.directory,'restores'),key});
  const file=path.join(restored.directory,'rules.sqlite'),result=reviewRuleDeliveryJournal({environment:'test',file,bindings});assert.equal(result.counts.sending,1);assert.equal(result.ruleLinks.localLinks,'matched');assert.equal(result.receiverAcknowledgements,'not-checked');assert.equal(result.activation,'review-required');assert.throws(()=>new DeliveryJournal(file),/reviewed recovery/);
 }finally{key.fill(0);f.close();}
});
