'use strict';
const integer=v=>Number.isSafeInteger(v)&&v>=0;
function summarize(row,{now=Date.now(),maxLagSeconds=300}={}){
 if(!integer(now)||!Number.isInteger(maxLagSeconds)||maxLagSeconds<10||maxLagSeconds>86400)throw Error('Explicit bounded replay monitoring policy required');
 const base={asOf:new Date(now).toISOString(),maxLagSeconds,scope:'Selected provider replay baseline only; no complete event-history, webhook-delivery, MFA or release proof'};
 if(!row)return {...base,status:'uninitialized',coveredUntil:null,lagSeconds:null,lease:'none',failureObserved:false};
 const valid=integer(row.start_at)&&integer(row.covered_until)&&row.covered_until>=row.start_at&&row.covered_until<=now&&integer(row.lease_until)&&((row.lease_owner===null&&row.lease_until===0)||(typeof row.lease_owner==='string'&&/^[a-f0-9]{64}$/.test(row.lease_owner)&&row.lease_until>0))&&[row.last_success,row.last_failure].every(v=>v===null||integer(v)&&v<=now);
 if(!valid)return {...base,status:'invalid-state',coveredUntil:null,lagSeconds:null,lease:'unknown',failureObserved:null};
 const lagSeconds=Math.floor((now-row.covered_until)/1000),lease=row.lease_owner?(row.lease_until>now?'active':'expired'):'none',failureObserved=row.last_failure!==null&&(row.last_success===null||row.last_failure>=row.last_success);
 const status=failureObserved?'failure-observed':lease==='expired'?'lease-expired':row.last_success===null?'never-completed':lagSeconds>maxLagSeconds?'stalled':'observed-fresh';
 return {...base,status,startAt:new Date(row.start_at).toISOString(),coveredUntil:new Date(row.covered_until).toISOString(),lagSeconds,lease,failureObserved,lastSuccessAt:row.last_success===null?null:new Date(row.last_success).toISOString(),lastFailureAt:row.last_failure===null?null:new Date(row.last_failure).toISOString()};
}
async function revocationStatus({progress,clientId,now=Date.now,maxLagSeconds=300}){
 if(!progress||typeof progress.read!=='function')throw Error('Configured replay progress repository required');
 return summarize(await progress.read(clientId),{now:now(),maxLagSeconds});
}
module.exports={summarize,revocationStatus};
