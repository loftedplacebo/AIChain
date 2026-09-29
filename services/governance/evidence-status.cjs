'use strict';
function summarize(rows,now=Date.now()){
 const counts={pending:0,batched:0,submitted:0,other:0};let oldest=null,total=0;
 for(const row of rows){const count=Number(row.count);if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(total+count))throw Error('Invalid evidence inventory');total+=count;const state=Object.hasOwn(counts,row.status)?row.status:'other';counts[state]+=count;
  if(state==='pending'||state==='batched'){const time=row.oldestAcceptedAt instanceof Date?row.oldestAcceptedAt.getTime():Date.parse(row.oldestAcceptedAt);if(Number.isFinite(time)&&(oldest===null||time<oldest))oldest=time;}
 }
 return {asOf:new Date(now).toISOString(),total,counts,awaitingSubmission:counts.pending+counts.batched,oldestAwaitingAcceptedAt:oldest===null?null:new Date(oldest).toISOString(),oldestAwaitingAgeSeconds:oldest===null?null:Math.max(0,Math.floor((now-oldest)/1000)),verification:'not-evaluated',scope:'Selected project, all accepted records; submission is not Base confirmation'};
}
module.exports={summarize};
