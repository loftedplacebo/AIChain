'use strict';
// Offline operator review only: no transport, key resolution or queue mutation.
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const {validateEnvelope}=require('./webhook-signatures.cjs');
const ref=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v);
const clock=v=>Number.isSafeInteger(v)&&v>=0&&v<=8640000000000000;
const bindingKey=v=>JSON.stringify([v.tenant,v.project,v.destinationRef,v.keyRef]);
function readReview({environment,file,bindings,maxJobs=1000,maxRuleRows=1000},checkRules=false,includePrivate=false){
 if(!['dev','test'].includes(environment)||typeof file!=='string'||!path.isAbsolute(file)||!Number.isInteger(maxJobs)||maxJobs<1||maxJobs>10000||!Array.isArray(bindings)||bindings.length>1000)throw Error('Explicit restored environment and bounded binding inventory required');
 const keys=new Set();for(const b of bindings){if(!b||Object.keys(b).sort().join(',')!=='destinationRef,keyRef,project,tenant'||!Object.values(b).every(ref)||keys.has(bindingKey(b)))throw Error('Invalid or duplicate delivery binding');keys.add(bindingKey(b));}
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>512*1024*1024)throw Error('Bounded regular restored delivery journal required');
 const db=new DatabaseSync(file,{readOnly:true});try{
  db.exec('PRAGMA busy_timeout=5000; BEGIN');
  const stages=db.prepare('SELECT name FROM governance_environment').all(),gate=db.prepare('SELECT state FROM governance_recovery_gate').all();
  if(stages.length!==1||stages[0].name!==environment||gate.length!==1||gate[0].state!=='review-required')throw Error('Restored delivery environment/gate mismatch');
  const size=db.prepare('SELECT count(*) n,coalesce(sum(length(CAST(body AS BLOB))),0) bytes FROM webhook_jobs').get();
  if(!Number.isSafeInteger(size.n)||size.n>maxJobs||size.bytes>16*1024*1024)throw Error('Delivery journal exceeds bounded full-review limit');
  const rows=db.prepare('SELECT tenant,project,id,destination,key_ref,body,state,attempts,next_at,lease_until,lease_token,last_status FROM webhook_jobs ORDER BY tenant,project,id').all();
  const counts={pending:0,sending:0,delivered:0,dead:0,invalid:0,unmatchedBindings:0},scopes=new Set(),digest=createHash('sha256');
  digest.update(JSON.stringify({environment,bindings:[...keys].sort()}));
  for(const row of rows){
   digest.update(JSON.stringify(row)+'\n');
   let valid=true;try{
    if(![row.tenant,row.project,row.id,row.destination,row.key_ref].every(ref)||typeof row.body!=='string'||Buffer.byteLength(row.body)>4096)throw Error();
    const body=JSON.parse(row.body);validateEnvelope(body);
    if(body.tenantRef!==row.tenant||body.projectRef!==row.project||body.deliveryId!==row.id||!['pending','sending','delivered','dead'].includes(row.state)||!Number.isInteger(row.attempts)||row.attempts<0||row.attempts>8||!clock(row.next_at)||!clock(row.lease_until)||!(row.last_status===null||Number.isInteger(row.last_status)&&row.last_status>=100&&row.last_status<=599))throw Error();
    if(row.state==='sending'){if(row.attempts<1||row.lease_until===0||typeof row.lease_token!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.lease_token))throw Error();}
    else if(row.lease_until!==0||row.lease_token!==null)throw Error();
    if(row.state==='pending'&&row.attempts>=8||row.attempts===0&&row.last_status!==null||row.state==='delivered'&&(row.attempts===0||row.last_status<200||row.last_status>=300||row.last_status===null)||row.state==='dead'&&row.attempts===0)throw Error();
   }catch{valid=false;}
   if(!valid){counts.invalid++;continue;}
   counts[row.state]++;scopes.add(JSON.stringify([row.tenant,row.project]));
   if(!keys.has(bindingKey({tenant:row.tenant,project:row.project,destinationRef:row.destination,keyRef:row.key_ref})))counts.unmatchedBindings++;
  }
  const privateSnapshot={},ruleLinks=checkRules?require('./recovery-rule-links.cjs').inspectRuleLinks(db,rows,maxRuleRows,includePrivate?privateSnapshot:null):null;if(ruleLinks)digest.update(ruleLinks.snapshotDigest);
  db.exec('COMMIT');const report={environment,reviewed:rows.length,scopes:scopes.size,counts,snapshotDigest:digest.digest('hex'),journalIntegrity:counts.invalid?'failed':'passed',routingBindings:counts.invalid?'not-checked':counts.unmatchedBindings?'unmatched':'matched',...(ruleLinks?{ruleLinks}:{ruleLinks:'not-checked'}),sourceAuthenticity:'not-proven',receiverAcknowledgements:'not-checked',postBackupActivity:'not-reconciled',activation:'review-required',interpretation:'Snapshot structure and operator binding references only; sending may already have reached a receiver, delivered is historical, and key availability, receiver deduplication and current ownership require independent reconciliation before any retry'};
  return includePrivate?{report,ruleRows:privateSnapshot.rows}:report;
 }finally{db.close();}
}
const reviewDeliveryJournal=options=>readReview(options),reviewRuleDeliveryJournal=options=>readReview(options,true);
// Private offline snapshot contains identity references and bodies; never serve/log it.
const readRuleDeliverySnapshot=options=>readReview(options,true,true);
module.exports={reviewDeliveryJournal,reviewRuleDeliveryJournal,readRuleDeliverySnapshot};
