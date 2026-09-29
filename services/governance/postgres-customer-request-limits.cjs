'use strict';
function customerRequestPolicy({readRequests=300,writeRequests=60}={}){
 if([readRequests,writeRequests].some(n=>!Number.isInteger(n)||n<1||n>1000000))throw Error('Customer request limits must be integers from 1 to 1000000 per minute');return {read:readRequests,write:writeRequests};
}
class PostgresCustomerRequestLimits{
 constructor(directory,{readRequests=300,writeRequests=60,now=Date.now}={}){
  if(!directory?.pool||typeof directory.tx!=='function'||typeof directory.identityIn!=='function'||typeof now!=='function')throw Error('Explicit shared customer request policy required');
  this.directory=directory;this.quotas=customerRequestPolicy({readRequests,writeRequests});this.now=now;
 }
 async consume(actor,bucket){
  if(typeof actor!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(actor)||!Object.hasOwn(this.quotas,bucket))throw Error('Verified customer request scope required');
  const now=this.now();if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid customer request clock');const window=Math.floor(now/60000)*60000,quota=this.quotas[bucket];
  return this.directory.tx({actor},async c=>{
   if(!await this.directory.identityIn(c,actor))throw Object.assign(Error('Verified customer identity required'),{status:401});
   const result=await c.query(`INSERT INTO governance_customer_request_limits(actor,bucket,window_start,requests,quota) VALUES($1,$2,$3,1,$4)
    ON CONFLICT(actor,bucket) DO UPDATE SET window_start=EXCLUDED.window_start,
    requests=CASE WHEN governance_customer_request_limits.window_start<EXCLUDED.window_start THEN 1 ELSE governance_customer_request_limits.requests+1 END,
    quota=EXCLUDED.quota WHERE governance_customer_request_limits.window_start<EXCLUDED.window_start OR
    (governance_customer_request_limits.window_start=EXCLUDED.window_start AND governance_customer_request_limits.quota=EXCLUDED.quota AND governance_customer_request_limits.requests<EXCLUDED.quota)
    RETURNING requests`,[actor,bucket,window,quota]);
   if(result.rows.length)return {allowed:true};
   const row=(await c.query('SELECT window_start,quota FROM governance_customer_request_limits WHERE actor=$1 AND bucket=$2',[actor,bucket])).rows[0];
   if(!row||Number(row.window_start)!==window||Number(row.quota)!==quota)throw Object.assign(Error('Customer request policy or clock differs across API processes; configuration review required'),{status:503});
   return {allowed:false,retryAfter:Math.max(1,Math.ceil((window+60000-now)/1000))};
  });
 }
}
module.exports={PostgresCustomerRequestLimits,customerRequestPolicy};
