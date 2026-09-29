const {createHash}=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const ref=/^[A-Za-z0-9._:-]{1,128}$/;
const VERSION='portal-review-0.1.0';
const actorRef=id=>'reviewer-'+createHash('sha256').update(id).digest('hex');
function reserved(event){return String(event.eventId||'').startsWith('portal-review-')||event.source?.integrationVersion===VERSION;}
async function linked(store,p,ids){
 if(!ids.length)return [];
 let rows;
 if(store.db){const placeholders=ids.map(()=>'?').join(',');rows=store.db.prepare(`SELECT body FROM events WHERE tenant=? AND project=? AND (json_extract(body,'$.outcome.forEventId') IN (${placeholders}) OR (json_extract(body,'$.source.integrationVersion')=? AND json_extract(body,'$.parentEventRefs[0]') IN (${placeholders}))) ORDER BY occurred,id LIMIT 10001`).all(p.tenant,p.project,...ids,VERSION,...ids).map(r=>JSON.parse(r.body));}
 else rows=await store.transaction(p,async c=>(await c.query("SELECT body FROM governance_events WHERE tenant=$1 AND project=$2 AND (body->'outcome'->>'forEventId'=ANY($3::text[]) OR (body->'source'->>'integrationVersion'=$4 AND body->'parentEventRefs'->>0=ANY($3::text[]))) ORDER BY occurred,id LIMIT 10001",[p.tenant,p.project,ids,VERSION])).rows.map(r=>r.body),true);
 if(rows.length>10000)throw fail(422,'Linked review history exceeds the pilot limit');return rows;
}
function matches(run,e){return e.environment===run.environment&&e.profile===run.profile&&(e.outcome?e.outcome.forEventId===run.eventId:e.parentEventRefs?.[0]===run.eventId);}
function reviewState(run,history){
 const outcomes=history.filter(e=>matches(run,e)&&e.outcome);
 const eligible=outcomes.filter(e=>e.caseRef===run.caseRef&&['human-adjudication','calibrated-measurement'].includes(e.outcome.labelSource)&&e.outcome.rubricVersion&&run.result.predictedLabel);
 if(outcomes.length>1)return 'conflicting';
 if(eligible.length===1)return 'reviewed';
 if(history.some(e=>matches(run,e)&&e.result?.decisionCode==='needs-investigation'))return 'needs-investigation';
 if(!run.caseRef||!run.result.predictedLabel)return 'metadata-required';
 return 'awaiting-review';
}
async function investigation(store,p,id){
 const event=await store.get(p,id);if(!event||event.eventType!=='ai.run.completed')throw fail(404,'Decision not found');
 const history=(await linked(store,p,[id])).filter(e=>matches(event,e));
 return {event,history,reviewState:reviewState(event,history),canReview:Boolean(p.actorId&&p.scopes.includes('review')),asOf:new Date().toISOString()};
}
async function queue(store,p,{from='',to='9999',q='',limit=50,offset=0,state='all'}={}){
 if(!['all','awaiting-review','reviewed','needs-investigation','conflicting','metadata-required'].includes(state)||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||!Number.isSafeInteger(offset)||q.length>128)throw fail(400,'Invalid review filters');
 return require('./aggregate-report.cjs').queue(store,p,{from,to,q,limit,offset,state});
}
async function submitReview(store,p,input){
 if(!p.scopes.includes('review')||!p.actorId)throw fail(403,'Reviewer workspace permission required');
 const keys=['requestId','eventId','verdict','label','rubricVersion'];
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!keys.includes(k))||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestId||'')||typeof input.eventId!=='string'||!ref.test(input.eventId)||typeof input.rubricVersion!=='string'||!ref.test(input.rubricVersion)||!['correct','incorrect','needs-investigation'].includes(input.verdict))throw fail(400,'Invalid structured review');
 const target=await store.get(p,input.eventId);if(!target||target.eventType!=='ai.run.completed')throw fail(404,'Decision not found');
 const adjudication=input.verdict!=='needs-investigation';
 if(adjudication&&(!target.caseRef||!target.result.predictedLabel))throw fail(422,'Decision needs a case reference and predicted label before adjudication');
 const label=input.verdict==='correct'?target.result.predictedLabel:input.label;
 if((input.verdict!=='incorrect'&&input.label!==undefined&&input.label!=='')||(input.verdict==='incorrect'&&(typeof label!=='string'||!ref.test(label)||label===target.result.predictedLabel)))throw fail(400,'Supply a different bounded expected label only for an incorrect decision');
 const id='portal-review-'+input.requestId.toLowerCase();
 const make=time=>({schema:'aichain.governance-event',schemaVersion:'0.1.0-draft',profile:target.profile,tenantRef:p.tenant,projectRef:p.project,environment:target.environment,eventId:id,streamRef:id,sequence:'0',occurredAt:time,eventType:adjudication?'ai.outcome.adjudicated':'ai.human.reviewed',runRef:target.runRef,agentRef:target.agentRef,...(target.caseRef?{caseRef:target.caseRef}:{}),parentEventRefs:[target.eventId],source:{kind:'human-reviewer',integrationVersion:VERSION,keyRef:actorRef(p.actorId)},result:{decisionCode:input.verdict,status:adjudication?'completed':'escalated'},policy:{policyRef:'review-rubric',version:input.rubricVersion},...(adjudication?{outcome:{forEventId:target.eventId,label,labelSource:'human-adjudication',evaluatorRef:'portal-review',rubricVersion:input.rubricVersion,adjudicatedAt:time}}:{})});
 // Reuse the original server timestamp on an uncertain-response retry. The store
 // compares every other immutable field, including the authenticated actor.
 let previous=await store.get(p,id);
 try{return await store.ingest(make(previous?.occurredAt||new Date().toISOString()),p);}
 catch(e){if(e.status!==409)throw e;previous=await store.get(p,id);if(!previous)throw e;return store.ingest(make(previous.occurredAt),p);}
}
module.exports={queue,investigation,submitReview,reserved,actorRef,VERSION};
