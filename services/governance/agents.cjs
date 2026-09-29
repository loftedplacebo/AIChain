const queues=new WeakMap();
const error=(status,message)=>Object.assign(new Error(message),{status});
const ref=/^[A-Za-z0-9._:-]{1,128}$/;
function validate(input,heartbeat=false){
 const required=heartbeat?['agentRef','environment','deploymentRef','sequence']:['agentRef','environment','deploymentRef','ownerRef','purpose','modelRef','configVersion','heartbeatTtlSeconds'];
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!required.includes(k))||required.some(k=>input[k]===undefined))throw error(400,'Invalid agent fields');
 for(const k of required.filter(k=>!['purpose','heartbeatTtlSeconds','sequence'].includes(k)))if(typeof input[k]!=='string'||!ref.test(input[k]))throw error(400,'Use bounded agent references');
 if(input.environment.length>64||!/^[A-Za-z0-9._-]+$/.test(input.environment))throw error(400,'Invalid environment');
 if(heartbeat){if(!Number.isSafeInteger(input.sequence)||input.sequence<0)throw error(400,'Heartbeat sequence must be a nonnegative safe integer');}
 else if(typeof input.purpose!=='string'||input.purpose.trim().length<1||input.purpose.length>256||/[\x00-\x1f]/.test(input.purpose)||!Number.isInteger(input.heartbeatTtlSeconds)||input.heartbeatTtlSeconds<60||input.heartbeatTtlSeconds>86400)throw error(400,'Purpose must be 1–256 characters; heartbeat TTL must be 60–86400 seconds');
 return Object.fromEntries(required.map(k=>[k,input[k]]));
}
const sqliteSchema=`CREATE TABLE IF NOT EXISTS governance_agents(tenant TEXT NOT NULL,project TEXT NOT NULL,agent TEXT NOT NULL,environment TEXT NOT NULL,deployment TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL,heartbeat_seq INTEGER NOT NULL DEFAULT -1,heartbeat_at TEXT,PRIMARY KEY(tenant,project,agent,environment,deployment));
CREATE INDEX IF NOT EXISTS events_agent_received ON events(tenant,project,json_extract(body,'$.agentRef'),json_extract(body,'$.environment'),json_extract(body,'$.model.deploymentRef'),json_extract(body,'$.receivedAt'));`;
function transaction(store,p,fn,write=false){
 if(!store.db)return runTransaction(store,p,fn,write);
 const result=(queues.get(store)||Promise.resolve()).then(()=>runTransaction(store,p,fn,write));queues.set(store,result.catch(()=>{}));return result;
}
async function runTransaction(store,p,fn,write=false){
 if(!p?.tenant||!p?.project)throw error(403,'Project scope required');
 if(store.db){if(write)store.db.exec('BEGIN IMMEDIATE');try{const result=await fn(async(sql,args=[])=>{const stmt=store.db.prepare(sql.replace(/\$\d+/g,'?'));return /^\s*(SELECT|WITH)/i.test(sql)?stmt.all(...args):(stmt.run(...args),[]);},false);if(write)store.db.exec('COMMIT');return result;}catch(e){if(write)store.db.exec('ROLLBACK');throw e;}}
 return store.transaction(p,async c=>{if(write)await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[p.tenant,p.project]);return fn(async(sql,args=[])=>(await c.query(sql,args)).rows,true);},!write);
}
async function registerAgent(store,p,input,now=new Date().toISOString()){
 const body=validate(input),scope=[p.tenant,p.project,body.agentRef,body.environment,body.deploymentRef];
 return transaction(store,p,async query=>{
  const old=(await query('SELECT body FROM governance_agents WHERE tenant=$1 AND project=$2 AND agent=$3 AND environment=$4 AND deployment=$5',scope))[0];
  if(old){const previous=typeof old.body==='string'?JSON.parse(old.body):old.body;if(JSON.stringify(previous)!==JSON.stringify(body))throw error(409,'Registration differs; use a new deployment reference for changed configuration');return {status:'duplicate',agent:body};}
  const count=Number((await query('SELECT count(*) AS n FROM governance_agents WHERE tenant=$1 AND project=$2',scope.slice(0,2)))[0].n);
  if(count>=1000)throw error(429,'Pilot registry is limited to 1000 deployments per project');
  await query('INSERT INTO governance_agents(tenant,project,agent,environment,deployment,body,created) VALUES($1,$2,$3,$4,$5,$6,$7)',[...scope,JSON.stringify(body),now]);return {status:'registered',agent:body};
 },true);
}
async function heartbeatAgent(store,p,input,now=new Date().toISOString()){
 const b=validate(input,true),scope=[p.tenant,p.project,b.agentRef,b.environment,b.deploymentRef];
 return transaction(store,p,async query=>{const row=(await query('SELECT heartbeat_seq,heartbeat_at FROM governance_agents WHERE tenant=$1 AND project=$2 AND agent=$3 AND environment=$4 AND deployment=$5',scope))[0];if(!row)throw error(404,'Agent deployment not found');
  if(b.sequence<Number(row.heartbeat_seq))throw error(409,'Out-of-order heartbeat');if(b.sequence===Number(row.heartbeat_seq))return {status:'duplicate',receivedAt:row.heartbeat_at};
  await query('UPDATE governance_agents SET heartbeat_seq=$1,heartbeat_at=$2 WHERE tenant=$3 AND project=$4 AND agent=$5 AND environment=$6 AND deployment=$7',[b.sequence,now,...scope]);return {status:'accepted',receivedAt:now};
 },true);
}
async function listAgents(store,p,{limit=50,offset=0}={},now=new Date().toISOString()){
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>1000)throw error(400,'Invalid registry pagination');
 return transaction(store,p,async(query,pg)=>{
  const field=k=>pg?`e.body->>'${k}'`:`json_extract(e.body,'$.${k}')`;
  const deployment=pg?"e.body->'model'->>'deploymentRef'":"json_extract(e.body,'$.model.deploymentRef')";
  const table=pg?'governance_events':'events';
  const rows=await query(`SELECT a.*,(SELECT MAX(${field('receivedAt')}) FROM ${table} e WHERE e.tenant=a.tenant AND e.project=a.project AND ${field('agentRef')}=a.agent AND ${field('environment')}=a.environment AND ${deployment}=a.deployment) AS last_event_at FROM governance_agents a WHERE a.tenant=$1 AND a.project=$2 ORDER BY a.agent,a.environment,a.deployment LIMIT $3 OFFSET $4`,[p.tenant,p.project,limit+1,offset]);
  return {asOf:now,nextOffset:rows.length>limit?offset+limit:null,agents:rows.slice(0,limit).map(row=>{const body=typeof row.body==='string'?JSON.parse(row.body):row.body;return {...body,registeredAt:row.created,lastEventReceivedAt:row.last_event_at||null,lastHeartbeatAt:row.heartbeat_at||null,heartbeatStatus:!row.heartbeat_at?'not-observed':Date.parse(now)-Date.parse(row.heartbeat_at)<body.heartbeatTtlSeconds*1000?'fresh':'stale'};}),coverage:'Registered deployments only; heartbeat freshness is a customer-reported signal, not proof of a running or safe agent.'};
 });
}
module.exports={sqliteSchema,registerAgent,heartbeatAgent,listAgents,validate};
