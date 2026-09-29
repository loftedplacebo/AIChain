'use strict';
const fail=message=>Object.assign(Error(message),{status:503});
function requestPolicy({readRequests=600,writeRequests=6000}={}){if([readRequests,writeRequests].some(n=>!Number.isInteger(n)||n<1||n>1000000))throw Error('Project request limits must be integers from 1 to 1000000 per minute');return {read:readRequests,write:writeRequests};}
class PostgresRequestLimits{
 constructor(store,{readRequests=600,writeRequests=6000,now=Date.now}={}){
  if(!store?.pool||typeof store.transaction!=='function'||typeof now!=='function')throw Error('Explicit PostgreSQL project request policy required');
  this.store=store;this.quotas=requestPolicy({readRequests,writeRequests});this.now=now;
 }
 async consume(principal,bucket){
  if(!Object.hasOwn(this.quotas,bucket))throw Error('Unknown project request bucket');const now=this.now();if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid request policy clock');const window=Math.floor(now/60000)*60000,quota=this.quotas[bucket];
  return this.store.transaction(principal,async c=>{
   const result=await c.query(`INSERT INTO governance_project_request_limits(tenant,project,bucket,window_start,requests,quota) VALUES($1,$2,$3,$4,1,$5)
    ON CONFLICT(tenant,project,bucket) DO UPDATE SET window_start=EXCLUDED.window_start,
    requests=CASE WHEN governance_project_request_limits.window_start<EXCLUDED.window_start THEN 1 ELSE governance_project_request_limits.requests+1 END,
    quota=EXCLUDED.quota WHERE governance_project_request_limits.window_start<EXCLUDED.window_start OR
    (governance_project_request_limits.window_start=EXCLUDED.window_start AND governance_project_request_limits.quota=EXCLUDED.quota AND governance_project_request_limits.requests<EXCLUDED.quota)
    RETURNING requests`,[principal.tenant,principal.project,bucket,window,quota]);
   if(result.rows.length)return {allowed:true};
   const row=(await c.query('SELECT window_start,quota FROM governance_project_request_limits WHERE tenant=$1 AND project=$2 AND bucket=$3',[principal.tenant,principal.project,bucket])).rows[0];
   if(!row||Number(row.window_start)!==window||Number(row.quota)!==quota)throw fail('Project request policy or clock differs across API processes; retry after configuration review');
   return {allowed:false,retryAfter:Math.max(1,Math.ceil((window+60000-now)/1000))};
  });
 }
}
module.exports={PostgresRequestLimits,requestPolicy};
