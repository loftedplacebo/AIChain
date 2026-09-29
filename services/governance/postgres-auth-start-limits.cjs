'use strict';
function authStartPolicy(requests=120){if(!Number.isInteger(requests)||requests<1||requests>1000000)throw Error('Auth start limit must be an integer from 1 to 1000000 per minute');return requests;}
class PostgresAuthStartLimits{
 constructor(directory,{requests=120,now=Date.now}={}){if(!directory?.pool||typeof directory.tx!=='function'||typeof now!=='function')throw Error('Explicit shared sign-in start policy required');this.directory=directory;this.requests=authStartPolicy(requests);this.now=now;}
 async consume(clientId){
  if(typeof clientId!=='string'||!/^client_[A-Za-z0-9]{1,128}$/.test(clientId))throw Error('Configured WorkOS client required');const now=this.now();if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid sign-in request clock');const window=Math.floor(now/60000)*60000,provider='workos:'+clientId;
  return this.directory.tx({provider},async c=>{
   const result=await c.query(`INSERT INTO governance_auth_start_limits(provider,window_start,requests,quota) VALUES($1,$2,1,$3)
    ON CONFLICT(provider) DO UPDATE SET window_start=EXCLUDED.window_start,
    requests=CASE WHEN governance_auth_start_limits.window_start<EXCLUDED.window_start THEN 1 ELSE governance_auth_start_limits.requests+1 END,
    quota=EXCLUDED.quota WHERE governance_auth_start_limits.window_start<EXCLUDED.window_start OR
    (governance_auth_start_limits.window_start=EXCLUDED.window_start AND governance_auth_start_limits.quota=EXCLUDED.quota AND governance_auth_start_limits.requests<EXCLUDED.quota)
    RETURNING requests`,[provider,window,this.requests]);
   if(result.rows.length)return {allowed:true};const row=(await c.query('SELECT window_start,quota FROM governance_auth_start_limits WHERE provider=$1',[provider])).rows[0];
   if(!row||Number(row.window_start)!==window||Number(row.quota)!==this.requests)throw Object.assign(Error('Sign-in request policy or clock differs across API processes'),{status:503});
   return {allowed:false,retryAfter:Math.max(1,Math.ceil((window+60000-now)/1000))};
  });
 }
}
module.exports={PostgresAuthStartLimits,authStartPolicy};
