'use strict';
// Read-only external acceptance for the explicitly configured synthetic test API.
const {validatePlan}=require('./deployment-plan.cjs');

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
  try{
   if(response.status!==expected)throw Error(`${path}: expected HTTP ${expected}, received ${response.status}`);
   observations.push({path,status:response.status});
  }finally{await response.body?.cancel();}
 }
 return {status:'passed',stage:'test',apiOrigin:origin,observations,scope:'Public HTTPS routing and unauthenticated response codes only; no identity, backup, receipt or release proof'};
}
module.exports={testOrigin,checkEdge};
