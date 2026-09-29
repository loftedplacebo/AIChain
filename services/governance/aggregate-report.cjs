// Shared relational reporting for SQLite and PostgreSQL. No full-event scan in JS.
const {buildReport}=require('./report');
function queries(pg,p,{from='',to='9999',deployment='',q=''}={}){
 const table=pg?'governance_events':'events',values=[p.tenant,p.project,from,to];
 const param=n=>pg?`$${n}`:`?${n}`;
 const projected={'eventType':'event_kind','outcome.forEventId':'outcome_ref','parentEventRefs.0':'review_parent','source.integrationVersion':'review_integration'};
 const j=(alias,key)=>pg?(projected[key]?`${alias}.${projected[key]}`:`(${alias}.body${key.split('.').map((k,i,a)=>`${i===a.length-1?'->>':'->'}${/^\d+$/.test(k)?k:`'${k}'`}`).join('')})`):`json_extract(${alias}.body,'$.${key.replace('.0','[0]')}')`;
 let filter=`e.tenant=${param(1)} AND e.project=${param(2)} AND e.occurred>=${param(3)} AND e.occurred<${param(4)}`;
 if(deployment){values.push(deployment);filter+=` AND ${j('e','model.deploymentRef')}=${param(values.length)}`;}
 if(q){values.push(q.toLowerCase());filter+=` AND ${pg?'strpos':'instr'}(lower(e.id || ' ' || coalesce(${j('e','agentRef')},'') || ' ' || coalesce(${j('e','caseRef')},'') || ' ' || ${j('e','eventType')}),${param(values.length)})>0`;}
 const same=`o.tenant=r.tenant AND o.project=r.project AND ${j('o','outcome.forEventId')}=${pg?'r.id':"(r.id || '')"} AND ${j('o','environment')}=${j('r','environment')} AND ${j('o','profile')}=${j('r','profile')}`;
 const eligible=`${j('o','outcome.labelSource')} IN ('human-adjudication','calibrated-measurement') AND coalesce(${j('o','outcome.rubricVersion')},'')<>'' AND coalesce(${j('r','result.predictedLabel')},'')<>'' AND ${j('o','caseRef')}=${j('r','caseRef')}`;
 const fields=['environment','profile','model.deploymentRef','model.configVersion','activity.taskClass'];
 const names=['environment','profile','deployment','configuration','task'];
 const columns=names.join(',');
 const cte=`WITH selected AS NOT MATERIALIZED (SELECT e.* FROM ${table} e WHERE ${filter}),
 runs AS NOT MATERIALIZED (SELECT * FROM selected e WHERE ${j('e','eventType')}='ai.run.completed'),
 outcome_stats AS MATERIALIZED (SELECT r.id,count(*) AS labels,
 sum(CASE WHEN ${eligible} THEN 1 ELSE 0 END) AS eligible,
 sum(CASE WHEN ${eligible} AND ${j('o','outcome.label')}=${j('r','result.predictedLabel')} THEN 1 ELSE 0 END) AS correct,
 max(CASE WHEN ${eligible} THEN ${j('o','outcome.labelSource')} || '/' || ${j('o','outcome.evaluatorRef')} || '/' || ${j('o','outcome.rubricVersion')} END) AS rubric
 FROM runs r JOIN ${table} o ON ${same} AND ${j('o','eventType')}='ai.outcome.adjudicated' GROUP BY r.id),
 assessed AS (SELECT r.id,r.occurred,${fields.map((f,i)=>`${i===4?`coalesce(${j('r',f)},'unspecified')`:j('r',f)} AS ${names[i]}`).join(',')},
 ${j('r','agentRef')} AS agent,${j('r','result.status')} AS status,
 CAST(${j('r','activity.latencyMs')} AS ${pg?'double precision':'REAL'}) AS latency,
 ${j('r','caseRef')} AS case_ref,${j('r','result.predictedLabel')} AS predicted,
 coalesce(os.labels,0) AS labels,coalesce(os.eligible,0) AS eligible,coalesce(os.correct,0) AS correct,os.rubric
 FROM runs r LEFT JOIN outcome_stats os ON os.id=r.id)`;
 return {table,values,j,cte,columns,param};
}
function* aggregate(pg,p,range){
 const {table,values,j,cte,columns}=queries(pg,p,range);
 const ask=sql=>({sql:`${cte} ${sql}`,values});
 const base=buildReport([]);
 const [totals]=yield ask(`SELECT
 count(*)+(SELECT count(*) FROM ${table} o WHERE o.tenant=${pg?'$1':'?1'} AND o.project=${pg?'$2':'?2'} AND ${j('o','outcome.forEventId')} IS NOT NULL AND EXISTS(SELECT 1 FROM runs r WHERE r.id=${j('o','outcome.forEventId')}) AND NOT EXISTS(SELECT 1 FROM selected s WHERE s.id=o.id)) AS events,
 coalesce(sum(CASE WHEN ${j('e','eventType')}='ai.run.completed' THEN 1 ELSE 0 END),0) AS runs,
 count(DISTINCT CASE WHEN ${j('e','eventType')}='ai.run.completed' THEN ${j('e','agentRef')} END) AS agents,
 count(DISTINCT CASE WHEN ${j('e','eventType')}='ai.run.completed' THEN ${j('e','model.deploymentRef')} END) AS deployments,
 coalesce(sum(CASE WHEN ${j('e','eventType')}='ai.policy.evaluated' AND ${j('e','policy.decision')} IN ('allow','deny','review') THEN 1 ELSE 0 END),0) AS policies,
 coalesce(sum(CASE WHEN ${j('e','eventType')}='ai.policy.evaluated' AND ${j('e','policy.decision')}='deny' THEN 1 ELSE 0 END),0) AS denied,
 coalesce(sum(CASE WHEN ${j('e','eventType')}='ai.monitor.alerted' THEN 1 ELSE 0 END),0) AS alerts,
 coalesce(sum(CASE WHEN ${j('e','eventType')}='ai.monitor.alerted' AND coalesce(${j('e','monitor.disposition')},'open') NOT IN ('closed','false-positive') THEN 1 ELSE 0 END),0) AS open_alerts FROM selected e`);
 const grouped=yield ask(`SELECT ${columns},count(*) AS runs,
 sum(CASE WHEN labels=1 AND eligible=1 THEN 1 ELSE 0 END) AS labelled,
 sum(CASE WHEN labels=1 AND eligible=1 THEN correct ELSE 0 END) AS correct,
 sum(CASE WHEN labels=0 THEN 1 ELSE 0 END) AS pending,
 sum(CASE WHEN labels>1 THEN 1 ELSE 0 END) AS conflicting,
 sum(CASE WHEN labels=1 AND eligible=0 THEN 1 ELSE 0 END) AS excluded
 FROM assessed GROUP BY ${columns} ORDER BY ${columns} LIMIT 1001`);
 if(grouped.length>1000)throw Object.assign(Error('Report exceeds 1000 model cohorts; narrow the date range or deployment'),{status:422});
 const rubrics=yield ask(`SELECT DISTINCT ${columns},rubric FROM assessed WHERE labels=1 AND eligible=1 LIMIT 10001`);
 if(rubrics.length>10000)throw Object.assign(Error('Report exceeds 10000 rubric groups; narrow the date range'),{status:422});
 const latencies=yield ask(`, ranked AS (SELECT ${columns},latency,row_number() OVER(PARTITION BY ${columns} ORDER BY latency) AS rank,count(*) OVER(PARTITION BY ${columns}) AS n FROM assessed WHERE latency IS NOT NULL)
 SELECT ${columns},latency FROM ranked WHERE rank=CAST((n*95+99)/100 AS INTEGER)`);
 const key=r=>JSON.stringify([JSON.stringify([p.tenant,p.project,r.environment,r.profile]),r.deployment,r.configuration,r.task]);
 const rubricMap=new Map();for(const r of rubrics){const k=key(r);if(!rubricMap.has(k))rubricMap.set(k,[]);rubricMap.get(k).push(r.rubric);}
 const latencyMap=new Map(latencies.map(r=>[key(r),Number(r.latency)]));
 const models=grouped.map(r=>{const k=key(r),m={key:k,deployment:r.deployment,configuration:r.configuration,task:r.task};for(const n of ['runs','labelled','correct','pending','conflicting','excluded'])m[n]=Number(r[n]);m.rubrics=(rubricMap.get(k)||[]).sort();m.accuracyStatus=m.conflicting?'conflicting-labels':m.rubrics.length>1?'mixed-evaluators':m.labelled<30?'insufficient-sample':'reportable';m.accuracy=m.accuracyStatus==='reportable'?m.correct/m.labelled:null;m.p95LatencyMs=latencyMap.get(k)??null;return m;});
 const trends=(yield ask(`SELECT substr(occurred,1,10) AS day,count(*) AS runs,sum(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failures FROM assessed GROUP BY substr(occurred,1,10) ORDER BY day LIMIT 3661`)).map(r=>({day:r.day,runs:Number(r.runs),failures:Number(r.failures)}));
 if(trends.length>3660)throw Object.assign(Error('Report exceeds 3660 daily trend points; narrow the date range'),{status:422});
 const alertRows=yield ask(`SELECT body FROM selected e WHERE ${j('e','eventType')}='ai.monitor.alerted' ORDER BY occurred DESC,id LIMIT 100`);
 const alerts=buildReport(alertRows.map(r=>typeof r.body==='string'?JSON.parse(r.body):r.body)).alerts;
 return {...base,eventCount:Number(totals.events),kpis:{agentsReporting:Number(totals.agents),runs:Number(totals.runs),modelDeployments:Number(totals.deployments),policyEvaluations:Number(totals.policies),denied:Number(totals.denied),reviewedLabels:models.reduce((n,m)=>n+m.labelled,0),openAlerts:Number(totals.open_alerts)},models,trends,alerts,alertSummary:{total:Number(totals.alerts),returned:alerts.length,limit:100,truncated:Number(totals.alerts)>alerts.length},asOf:new Date().toISOString(),labelPolicy:'Selected event window plus linked outcomes available at snapshot time'};
}
function* reviewQueue(pg,p,range){
 const {table,values,j,cte}=queries(pg,p,range);
 const extended=cte+`, classified AS (SELECT a.*,CASE WHEN labels>1 THEN 'conflicting' WHEN eligible=1 THEN 'reviewed'
 WHEN EXISTS(SELECT 1 FROM ${table} o WHERE o.tenant=${pg?'$1':'?1'} AND o.project=${pg?'$2':'?2'} AND ${j('o','source.integrationVersion')}='portal-review-0.1.0' AND ${j('o','parentEventRefs.0')}=${pg?'a.id':"(a.id || '')"} AND ${j('o','environment')}=a.environment AND ${j('o','profile')}=a.profile AND ${j('o','result.decisionCode')}='needs-investigation') THEN 'needs-investigation'
 WHEN coalesce(case_ref,'')='' OR coalesce(predicted,'')='' THEN 'metadata-required' ELSE 'awaiting-review' END AS review_state FROM assessed a)`;
 const counts=Object.fromEntries(['awaiting-review','reviewed','needs-investigation','conflicting','metadata-required'].map(s=>[s,0]));
 for(const row of yield {sql:`${extended} SELECT review_state,count(*) AS n FROM classified GROUP BY review_state`,values})counts[row.review_state]=Number(row.n);
 const total=range.state==='all'?Object.values(counts).reduce((a,b)=>a+b,0):counts[range.state];
 const filter=range.state==='all'?'':`WHERE c.review_state='${range.state}'`;
 const rows=yield {sql:`${extended} SELECT (SELECT e.body FROM ${table} e WHERE e.tenant=${pg?'$1':'?1'} AND e.project=${pg?'$2':'?2'} AND e.id=c.id) AS body,c.review_state FROM classified c ${filter} ORDER BY c.occurred DESC,c.id LIMIT ${range.limit} OFFSET ${range.offset}`,values};
 return {asOf:new Date().toISOString(),counts,total,rows:rows.map(r=>({event:typeof r.body==='string'?JSON.parse(r.body):r.body,reviewState:r.review_state})),nextOffset:range.offset+range.limit<total?range.offset+range.limit:null};
}
function sqliteExecute(db,iterator){
 let step=iterator.next();
 db.exec('BEGIN');
 try{while(!step.done){const args=[];const sql=step.value.sql.replace(/\?(\d+)/g,(_,n)=>{args.push(step.value.values[Number(n)-1]);return '?';});step=iterator.next(db.prepare(sql).all(...args));}db.exec('COMMIT');return step.value;}
 catch(e){db.exec('ROLLBACK');throw e;}
}
async function postgresExecute(client,iterator){
 let step=iterator.next();
 while(!step.done){const {sql,values}=step.value;step=iterator.next((await client.query(sql,values)).rows);}return step.value;
}
module.exports={sqliteReport:(db,p,range)=>sqliteExecute(db,aggregate(false,p,range)),postgresReport:(c,p,range)=>postgresExecute(c,aggregate(true,p,range)),queue:(store,p,range)=>store.db?sqliteExecute(store.db,reviewQueue(false,p,range)):store.transaction(p,c=>postgresExecute(c,reviewQueue(true,p,range)),true)};
