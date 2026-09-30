'use strict';
// Read-only external acceptance for the explicitly configured synthetic test API.
const {validatePlan}=require('./deployment-plan.cjs');
const SESSION_BODY_LIMIT=256;

function testOrigin(plan){
 const review=validatePlan(plan);
 if(!review.valid)throw Error('Deployment plan failed offline review');
 const stage=plan.environments.find(environment=>environment.stage==='test');
 const url=new URL(stage.portal.apiOrigin);
 if(url.protocol!=='https:'||stage.database.tls!=='verify-full'||stage.backup.custody!=='independent-storage')throw Error('Synthetic test stage is not configured for hosted acceptance');
 return url.origin;
}

async function checkEdge(plan,fetchImpl=fetch){
 const origin=testOrigin(plan);
 const observations=[];
 for(const [path,expected] of [['/v1/session',401],['/health',404],['/ready',404]]){
  const url=origin+path;
  const response=await fetchImpl(url,{method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(response.status!==expected){await response.body?.cancel();throw Error(`${path}: expected HTTP ${expected}, received ${response.status}`);}
  if(path==='/v1/session')await verifyAnonymousSession(response);
  else await response.body?.cancel();
  observations.push({path,status:response.status});
 }
 const webhookPath='/v1/auth/workos-webhook';
 const webhook=await fetchImpl(origin+webhookPath,{method:'POST',headers:{'content-type':'application/json'},body:'{}',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(webhook.status!==401){await webhook.body?.cancel();throw Error(`${webhookPath}: expected HTTP 401, received ${webhook.status}`);}
 await verifyApiError(webhook,webhookPath,'Webhook signature required');
 observations.push({path:webhookPath,status:webhook.status});
 return {status:'passed',stage:'test',apiOrigin:origin,observations,scope:'Public HTTPS routing, anonymous session and unsigned webhook denial only; no signed delivery, identity, backup, receipt or release proof'};
}
async function verifyAnonymousSession(response){
 await verifyApiError(response,'/v1/session','Sign in required');
}
async function verifyApiError(response,path,expectedError){
 if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||'')||!/(?:^|,)\s*no-store(?:,|$)/i.test(response.headers.get('cache-control')||'')||response.headers.get('x-content-type-options')!=='nosniff'){
  await response.body?.cancel();throw Error(`${path}: API JSON, no-store and nosniff headers required`);
 }
 const length=Number(response.headers.get('content-length'));
 if(Number.isFinite(length)&&length>SESSION_BODY_LIMIT){await response.body?.cancel();throw Error(`${path}: response body exceeds limit`);}
 if(!response.body)throw Error(`${path}: missing API response body`);
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>SESSION_BODY_LIMIT)throw Error(`${path}: response body exceeds limit`);
   chunks.push(value);
  }
 }finally{await reader.cancel();}
 let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw Error(`${path}: invalid API JSON`);}
 if(!body||typeof body!=='object'||Array.isArray(body)||body.error!==expectedError)throw Error(`${path}: expected governance API error response`);
}
module.exports={testOrigin,checkEdge};
