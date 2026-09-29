'use strict';
const {randomBytes}=require('node:crypto');
// One coordinated bounded step; installation/scheduling remains operator work.
async function revocationStep({clientId,startAt,progress,replay,now=Date.now,overlapMs=60000}){
 const baseline=Date.parse(startAt),time=now();
 if(typeof startAt!=='string'||!Number.isSafeInteger(baseline)||baseline<0||new Date(baseline).toISOString()!==startAt||baseline>time||!Number.isInteger(overlapMs)||overlapMs<1000||overlapMs>300000||!progress||typeof replay!=='function')throw Error('Explicit bounded revocation baseline and overlap required');
 const claim=await progress.claim(clientId,baseline,randomBytes(32).toString('hex'),time);if(claim.status==='busy')return {status:'busy',scheduler:'not-installed'};
 if(claim.status!=='acquired')throw Error('Replay lease unavailable');
 try{
  const start=Math.max(baseline,claim.coveredUntil-overlapMs),end=Math.min(time-5000,start+86400000);
  if(end<=claim.coveredUntil){await progress.release(clientId,claim);return {status:'not-due',coveredUntil:new Date(claim.coveredUntil).toISOString(),scheduler:'not-installed'};}
  const result=await replay({rangeStart:new Date(start).toISOString(),rangeEnd:new Date(end).toISOString()});
  if(result?.window!=='replayed'||result.rangeStart!==new Date(start).toISOString()||result.rangeEnd!==new Date(end).toISOString())throw Error('Complete exact replay window required');
  await progress.complete(clientId,claim,end,now());
  return {...result,status:'advanced',startAt,coveredUntil:new Date(end).toISOString(),coverage:'selected-baseline-only',scheduler:'not-installed'};
 }catch(e){await progress.fail(clientId,claim,now());throw e;}
}
module.exports={revocationStep};
