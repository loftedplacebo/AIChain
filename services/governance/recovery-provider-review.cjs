'use strict';
const {createHash}=require('node:crypto');
const {prepareAccessReview}=require('./postgres-recovery.cjs');
const {compile}=require('./recovery-access-plan.cjs');
async function boundedJson(response){
 const reader=response.body?.getReader();if(!reader)throw Error('Missing provider response');let bytes=0,parts=[];
 try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>65536)throw Error('Provider response too large');parts.push(Buffer.from(next.value));}return JSON.parse(Buffer.concat(parts).toString('utf8'));}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
// Read-only WorkOS user lookup. Existence/email checks are not ownership, MFA,
// organisation membership, active-session or post-backup revocation proof.
async function checkBindings(snapshot,input,{clientId,apiKey,fetcher=fetch,maxIdentities=20}={}){
 if(!/^client_[A-Za-z0-9]+$/.test(clientId||'')||!/^sk_[A-Za-z0-9_]+$/.test(apiKey||'')||!Number.isInteger(maxIdentities)||maxIdentities<1||maxIdentities>100)throw Error('Explicit bounded WorkOS recovery configuration required');
 const plan=compile(snapshot,input),ids=[...new Set(plan.memberships.map(m=>m.userId))].sort();if(ids.length>maxIdentities)throw Error('Selected provider identities exceed bounded review limit');
 const identities=new Map(snapshot.identities.map(i=>[i.id,i])),counts={matched:0,missing:0,unverified:0,bindingMismatch:0,unsupportedProvider:0,unavailable:0,unchecked:0},deadline=Date.now()+30000;
 for(let index=0;index<ids.length;index++){
  const identity=identities.get(ids[index]);
  if(identity.provider!=='workos:'+clientId||!/^user_[A-Za-z0-9]+$/.test(identity.subject)){counts.unsupportedProvider++;continue;}
  if(Date.now()>=deadline){counts.unchecked+=ids.length-index;break;}
  try{
   const response=await fetcher('https://api.workos.com/user_management/users/'+identity.subject,{method:'GET',headers:{authorization:'Bearer '+apiKey},redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-Date.now())))});
   if(response.status===404){await response.body?.cancel();counts.missing++;continue;}
   if(!response.ok){await response.body?.cancel();counts.unavailable++;counts.unchecked+=ids.length-index-1;break;}
   const user=await boundedJson(response);
   if(user.object!=='user'||user.id!==identity.subject||typeof user.email!=='string'||user.email.length>320||user.email.trim().toLowerCase()!==identity.email){counts.bindingMismatch++;continue;}
   if(user.email_verified!==true){counts.unverified++;continue;}counts.matched++;
  }catch{counts.unavailable++;counts.unchecked+=ids.length-index-1;break;}
 }
 return {environment:snapshot.environment,restoreId:snapshot.restoreId,snapshotDigest:input.snapshotDigest,selectionDigest:createHash('sha256').update(JSON.stringify(plan.memberships)).digest('hex'),providerClientId:clientId,selectedIdentities:ids.length,counts,providerBindings:counts.matched===ids.length?'matched':'review-required',activation:'review-required',checkedAt:new Date().toISOString(),interpretation:'Point-in-time provider existence, verified email and subject/email matching only; independent ownership, MFA and revocation reconciliation remain required'};
}
async function reviewProviderBindings(pool,options,input,config){
 const before=await prepareAccessReview(pool,options),result=await checkBindings(before.snapshot,input,config);
 const after=await prepareAccessReview(pool,options);if(after.snapshotDigest!==before.snapshotDigest)throw Error('Recovery provider review is stale after provider lookup');return result;
}
module.exports={checkBindings,reviewProviderBindings};
