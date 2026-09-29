const {createHash}=require('node:crypto');
const {validateGovernanceEvent}=require('../../sdk/typescript/governance-event');
const {buildReport}=require('./report');
const {verify}=require('./postgres-migrate.cjs');
const error=(status,message)=>Object.assign(new Error(message),{status});
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
class PostgresGovernanceStore {
 async assertPublisherActive(observed=null){
  const binding=this.recoveryPublisher;if(!binding)return require('./postgres-recovery.cjs').assertActive(this.pool,{publisher:true});
  if(observed&&!require('./publisher-release-binding.cjs').sameBinding(binding,observed))throw Error('Publisher journal, identity or current policy differs from reviewed release');
  const c=await this.pool.connect();try{await c.query('BEGIN READ ONLY');await c.query("SELECT set_config('governance.tenant',$1,true),set_config('governance.project',$2,true),set_config('statement_timeout','10000',true),set_config('lock_timeout','5000',true)",[binding.tenant,binding.project]);await require('./postgres-recovery.cjs').assertActive(c,{publisher:true,binding,principal:binding});await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 constructor(pool,{maxEvents=100000,maxBytes=268435456,maxDailyEvents=50000,runtimeProfile='pilot',recoveryPublisher=null}={}){if(!['pilot','api','evidence-worker'].includes(runtimeProfile)||recoveryPublisher&&runtimeProfile!=='evidence-worker')throw Error('Unknown or incompatible database runtime profile');this.runtimeProfile=runtimeProfile;this.recoveryPublisher=recoveryPublisher?require('./publisher-release-binding.cjs').validateBinding(recoveryPublisher):null;this.pool=pool;this.limits={maxEvents,maxBytes,maxDailyEvents};for(const v of Object.values(this.limits))if(!Number.isSafeInteger(v)||v<1)throw new Error('Storage limits must be positive safe integers');}
 async ready(environment='test'){if(this.runtimeProfile!=='pilot')await require('./postgres-runtime-profile.cjs').verifyProfile(this.pool,this.runtimeProfile);await verify(this.pool);if(this.runtimeProfile==='evidence-worker')await this.assertPublisherActive();else await require('./postgres-recovery.cjs').assertActive(this.pool);if((await this.pool.query('SELECT name FROM governance_environment')).rows[0]?.name!==environment)throw new Error('Database environment mismatch');const {rows}=await this.pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');if(rows[0]?.rolsuper||rows[0]?.rolbypassrls)throw new Error('Governance runtime must not bypass row security');}
 async transaction(principal,fn,readOnly=false){
  if(!principal?.tenant||!principal?.project)throw error(403,'Project scope required');
  const client=await this.pool.connect();
  try{await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');await client.query("SELECT set_config('governance.tenant',$1,true),set_config('governance.project',$2,true),set_config('statement_timeout','10000',true),set_config('lock_timeout','5000',true)",[principal.tenant,principal.project]);await require('./postgres-recovery.cjs').assertActive(client,{publisher:this.runtimeProfile==='evidence-worker',binding:this.recoveryPublisher,principal});const result=await fn(client);await client.query('COMMIT');return result;}
  catch(e){await client.query('ROLLBACK');if(e.code==='23505')throw error(409,'Event or stream sequence already exists');if(['57014','55P03'].includes(e.code))throw error(503,'Storage busy; retry with the same event ID');throw e;}finally{client.release();}
 }
 async ingest(input,principal){
  if(input.tenantRef!==principal.tenant||input.projectRef!==principal.project)throw error(403,'Event scope does not match credential');
  const submitted={...input};delete submitted.receivedAt;
  const digest=createHash('sha256').update(JSON.stringify(canonical(submitted))).digest('hex');
  const event={...submitted,receivedAt:new Date().toISOString()};validateGovernanceEvent(event);
  const body=JSON.stringify(event),bytes=Buffer.byteLength(body),day=event.receivedAt.slice(0,10);
  return this.transaction(principal,async c=>{
   const scope=[principal.tenant,principal.project];
   await c.query('INSERT INTO governance_usage(tenant,project,day) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[...scope,day]);
   const usage=(await c.query('SELECT * FROM governance_usage WHERE tenant=$1 AND project=$2 FOR UPDATE',scope)).rows[0];
   const previous=(await c.query('SELECT digest FROM governance_events WHERE tenant=$1 AND project=$2 AND id=$3',[...scope,event.eventId])).rows[0];
   if(previous){if(previous.digest!==digest)throw error(409,'Event ID already exists with different data');const anchorStatus=(await c.query('SELECT status FROM governance_outbox WHERE tenant=$1 AND project=$2 AND id=$3',[...scope,event.eventId])).rows[0].status;return {eventId:event.eventId,status:'duplicate',anchorStatus};}
   const daily=usage.day===day?Number(usage.daily_count):0;
   if(Number(usage.event_count)>=this.limits.maxEvents||Number(usage.stored_bytes)+bytes>this.limits.maxBytes||daily>=this.limits.maxDailyEvents)throw error(429,'Project storage or daily event allowance reached');
   await c.query('INSERT INTO governance_events(tenant,project,id,stream,sequence,digest,occurred,received,body,bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[...scope,event.eventId,event.streamRef,event.sequence,digest,event.occurredAt,event.receivedAt,body,bytes]);
   await c.query('INSERT INTO governance_outbox(tenant,project,id) VALUES($1,$2,$3)',[...scope,event.eventId]);
   await c.query('UPDATE governance_usage SET event_count=event_count+1,stored_bytes=stored_bytes+$3,day=$4,daily_count=$5 WHERE tenant=$1 AND project=$2',[...scope,bytes,day,daily+1]);
   return {eventId:event.eventId,status:'accepted',anchorStatus:'pending',receivedAt:event.receivedAt};
  });
 }
 async listOn(c,p,{from='',to='9999',deployment='',q='',limit=100,offset=0}={}){
  let where='tenant=$1 AND project=$2 AND occurred>=$3 AND occurred<$4';const values=[p.tenant,p.project,from,to];
  if(deployment){values.push(deployment);where+=` AND body->'model'->>'deploymentRef'=$${values.length}`;}
  if(q){values.push(q.toLowerCase());where+=` AND strpos(lower(id || ' ' || coalesce(body->>'agentRef','') || ' ' || coalesce(body->>'caseRef','') || ' ' || (body->>'eventType')),$${values.length})>0`;}
  const total=Number((await c.query(`SELECT count(*) AS n FROM governance_events WHERE ${where}`,values)).rows[0].n);
  const rows=(await c.query(`SELECT body FROM governance_events WHERE ${where} ORDER BY occurred DESC,id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,limit,offset])).rows;
  return {total,events:rows.map(r=>r.body),nextOffset:offset+limit<total?offset+limit:null};
 }
 list(p,range){return this.transaction(p,c=>this.listOn(c,p,range),true);}
 get(p,id){return this.transaction(p,async c=>(await c.query('SELECT body FROM governance_events WHERE tenant=$1 AND project=$2 AND id=$3',[p.tenant,p.project,id])).rows[0]?.body||null,true);}
 report(p,range={}){return this.transaction(p,c=>require('./aggregate-report.cjs').postgresReport(c,p,range),true);}
 evidenceStatus(p){return this.transaction(p,async c=>require('./evidence-status.cjs').summarize((await c.query('SELECT o.status,count(*) count,min(e.received) AS "oldestAcceptedAt" FROM governance_events e LEFT JOIN governance_outbox o ON e.tenant=o.tenant AND e.project=o.project AND e.id=o.id WHERE e.tenant=$1 AND e.project=$2 GROUP BY o.status',[p.tenant,p.project])).rows),true);}
 pendingEvidence(p,limit=100){return this.transaction(p,async c=>(await c.query('SELECT e.body FROM governance_events e LEFT JOIN governance_evidence g ON g.tenant=e.tenant AND g.project=e.project AND g.id=e.id WHERE e.tenant=$1 AND e.project=$2 AND g.id IS NULL ORDER BY e.occurred,e.id LIMIT $3',[p.tenant,p.project,limit])).rows.map(r=>r.body),true);}
 evidence(p,id){return this.transaction(p,async c=>(await c.query('SELECT revision,bundle FROM governance_evidence WHERE tenant=$1 AND project=$2 AND id=$3',[p.tenant,p.project,id])).rows[0]||null,true);}
 evidenceBatchIds(p){return this.transaction(p,async c=>(await c.query('SELECT DISTINCT batch_id FROM governance_evidence WHERE tenant=$1 AND project=$2 ORDER BY batch_id',[p.tenant,p.project])).rows.map(r=>r.batch_id),true);}
 batchEvidence(p,batchId){return this.transaction(p,async c=>(await c.query('SELECT id,revision AS "expectedRevision",bundle FROM governance_evidence WHERE tenant=$1 AND project=$2 AND batch_id=$3 ORDER BY id',[p.tenant,p.project,batchId])).rows,true);}
 commitEvidence(p,entries){return this.transaction(p,async c=>{for(const e of [...entries].sort((a,b)=>a.id.localeCompare(b.id))){const scope=[p.tenant,p.project,e.id];const old=(await c.query('SELECT revision,bundle FROM governance_evidence WHERE tenant=$1 AND project=$2 AND id=$3 FOR UPDATE',scope)).rows[0];if((old?.revision||0)!==e.expectedRevision)throw error(409,'Evidence changed; retry the worker operation');if(old&&JSON.stringify(canonical({...old.bundle,transactions:[]}))!==JSON.stringify(canonical({...e.bundle,transactions:[]})))throw error(409,'Signed evidence is immutable');if(old)await c.query('UPDATE governance_evidence SET revision=$4,bundle=$5 WHERE tenant=$1 AND project=$2 AND id=$3',[...scope,e.expectedRevision+1,JSON.stringify(e.bundle)]);else await c.query('INSERT INTO governance_evidence VALUES($1,$2,$3,$4,$5,$6)',[...scope,e.bundle.batch.id,1,JSON.stringify(e.bundle)]);await c.query('UPDATE governance_outbox SET status=$4 WHERE tenant=$1 AND project=$2 AND id=$3',[...scope,e.bundle.transactions.length?'submitted':'batched']);}});}
 close(){return this.pool.end();}
}
module.exports={PostgresGovernanceStore};
