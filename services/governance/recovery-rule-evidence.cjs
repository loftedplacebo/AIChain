'use strict';
const {createHash}=require('node:crypto'),{readRuleDeliverySnapshot}=require('./recovery-delivery-review.cjs'),{inspectRow}=require('./recovery-evidence-review.cjs'),{ruleDigest,assess}=require('./governance-rules.cjs'),{verify}=require('./postgres-migrate.cjs');
const key=(...v)=>JSON.stringify(v),scope=r=>[r.tenant,r.project],canonical=v=>v instanceof Date?v.toISOString():Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
async function compareRuleEvidence(ruleRows,entries,trustedSigners,deadline=Date.now()+30000){
 const map=new Map(entries.map(r=>[key(...scope(r),r.id),r])),counts={matchedSources:0,matchedDerived:0,missingSources:0,sourceDigestMismatch:0,assessmentMismatch:0,missingPublished:0,unpublishedDerived:0,acknowledgementRepair:0,derivedBodyMismatch:0,unsignedEvidence:0,invalidEvidence:0},checked=new Set();
 async function evidence(row){const id=key(...scope(row),row.id);if(checked.has(id))return;checked.add(id);const status=await inspectRow(row,trustedSigners);if(status==='unsigned-pending')counts.unsignedEvidence++;else if(!['signed-batched','submitted-offline'].includes(status))counts.invalidEvidence++;}
 for(const p of ruleRows.governance_processed_events){
  if(Date.now()>deadline)throw Error('Rule evidence review exceeded bounded duration');
  const row=map.get(key(...scope(p),p.id));if(!row){counts.missingSources++;continue;}
  if(ruleDigest(row.body)!==p.digest){counts.sourceDigestMismatch++;continue;}await evidence(row);counts.matchedSources++;
  const latest=new Map();for(const r of ruleRows.governance_rules)if(r.tenant===p.tenant&&r.project===p.project&&r.created_at<=Date.parse(row.body.receivedAt)&&(!latest.has(r.id)||r.version>latest.get(r.id).version))latest.set(r.id,r);
  const checks=ruleRows.governance_checks.filter(r=>r.tenant===p.tenant&&r.project===p.project&&r.event_id===p.id);
  if(checks.length!==latest.size)counts.assessmentMismatch++;
  for(const check of checks){const r=latest.get(check.rule_id);if(!r||r.version!==check.version||assess(JSON.parse(r.body),row.body)!==check.assessment)counts.assessmentMismatch++;}
 }
 for(const outbox of ruleRows.governance_detected_outbox){
  if(Date.now()>deadline)throw Error('Rule evidence review exceeded bounded duration');
  const row=map.get(key(...scope(outbox),outbox.id));if(!row){counts[outbox.state==='published'?'missingPublished':'unpublishedDerived']++;continue;}
  const accepted={...row.body};delete accepted.receivedAt;if(JSON.stringify(canonical(accepted))!==JSON.stringify(canonical(JSON.parse(outbox.body)))){counts.derivedBodyMismatch++;continue;}
  await evidence(row);counts.matchedDerived++;if(outbox.state==='pending')counts.acknowledgementRepair++;
 }
 const failures=counts.missingSources+counts.sourceDigestMismatch+counts.assessmentMismatch+counts.missingPublished+counts.derivedBodyMismatch+counts.invalidEvidence,uncertain=counts.unpublishedDerived+counts.acknowledgementRepair+counts.unsignedEvidence;
 const references=new Set([...ruleRows.governance_processed_events.map(r=>key(...scope(r),r.id)),...ruleRows.governance_detected_outbox.map(r=>key(...scope(r),r.id))]);
 return {counts,evidenceChecked:checked.size,unreferencedRecords:entries.filter(r=>!references.has(key(...scope(r),r.id))).length,recordingEvidence:failures?'failed':uncertain?'incomplete':'matched',cursorReconciliation:ruleRows.governance_rule_cursors.some(r=>r.position>0)?'sqlite-rowid-mapping-required':'not-required'};
}
async function reviewRuleEvidence(pool,options){
 const {environment,restoreId,trustedSigners,maxRecords=1000}=options;
 if(typeof restoreId!=='string'||!/^[-a-f0-9]{36}$/.test(restoreId)||!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>10000||!Array.isArray(trustedSigners)||!trustedSigners.length||trustedSigners.length>64||trustedSigners.some(s=>typeof s!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(s)))throw Error('Explicit restored identity and bounded signer policy required');
 const signers=[...new Set(trustedSigners.map(s=>s.toLowerCase()))].sort(),snapshot=readRuleDeliverySnapshot(options);if(snapshot.report.journalIntegrity!=='passed'||snapshot.report.routingBindings!=='matched'||snapshot.report.ruleLinks.localLinks!=='matched')throw Error('Journal structure, rule links and routing review must pass');
 const deadline=Date.now()+30000,c=await pool.connect();try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SELECT set_config('statement_timeout','30000',true),set_config('lock_timeout','5000',true)");await require('./postgres-offline-administrator.cjs').assertOfflineAdministrator(c);await verify(c);
  const stage=(await c.query('SELECT name FROM governance_environment')).rows,gate=(await c.query('SELECT * FROM governance_recovery_gate')).rows,database=(await c.query('SELECT current_database() name,oid FROM pg_database WHERE datname=current_database()')).rows[0];
  if(stage.length!==1||stage[0].name!==environment||gate.length!==1||!['review-required','access-reviewed'].includes(gate[0].state)||gate[0].restore_id!==restoreId||!database.name.startsWith('gov_restore_'))throw Error('Recovery gate or environment mismatch');
  const total=Number((await c.query('SELECT count(*) n FROM governance_events')).rows[0].n);if(!Number.isSafeInteger(total)||total>maxRecords)throw Error('Rule evidence exceeds bounded full-review limit');
  const bytes=Number((await c.query("SELECT coalesce(sum(octet_length(e.body::text)+coalesce(octet_length(v.bundle::text),0)),0) bytes FROM governance_events e LEFT JOIN governance_evidence v USING(tenant,project,id)")).rows[0].bytes);if(!Number.isSafeInteger(bytes)||bytes>32*1024*1024)throw Error('Rule evidence exceeds bounded body limit');
  const entries=[],digest=createHash('sha256');digest.update(JSON.stringify({environment,restoreId,database,journalDigest:snapshot.report.snapshotDigest,signers}));let cursor=null;
  while(entries.length<total){if(Date.now()>deadline)throw Error('Rule evidence review exceeded bounded duration');const rows=(await c.query(`SELECT e.tenant,e.project,e.id,e.digest,e.received,e.body,o.status,v.revision,v.batch_id,v.bundle FROM governance_events e LEFT JOIN governance_outbox o USING(tenant,project,id) LEFT JOIN governance_evidence v USING(tenant,project,id) ${cursor?'WHERE (e.tenant,e.project,e.id)>($1,$2,$3)':''} ORDER BY e.tenant,e.project,e.id LIMIT 100`,cursor||[])).rows;if(!rows.length)throw Error('Rule evidence snapshot incomplete');for(const row of rows){digest.update(JSON.stringify(canonical(row))+'\n');entries.push(row);}const last=rows.at(-1);cursor=[last.tenant,last.project,last.id];}
  const result=await compareRuleEvidence(snapshot.ruleRows,entries,signers,deadline);if(Date.now()>deadline)throw Error('Rule evidence review exceeded bounded duration');if(readRuleDeliverySnapshot(options).report.snapshotDigest!==snapshot.report.snapshotDigest)throw Error('Rule journal changed during evidence review');
  await c.query('COMMIT');return {environment,restoreId,reviewedRecords:entries.length,...result,snapshotDigest:digest.digest('hex'),baseVerification:'not-checked',receiverAcknowledgements:'not-checked',activation:'review-required',interpretation:'Restored snapshot and trusted recording evidence only; source authenticity, current Base inclusion, receiver acknowledgements, post-backup activity and release remain separate'};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
module.exports={reviewRuleEvidence,compareRuleEvidence};
