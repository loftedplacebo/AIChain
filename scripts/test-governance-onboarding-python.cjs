'use strict';
const assert=require('node:assert/strict'),{promisify}=require('node:util'),execFile=promisify(require('node:child_process').execFile);
const {GovernanceStore}=require('../services/governance/store'),{createServer}=require('../services/governance/server.cjs');
async function main(){
 const {firstSubmissionPython}=await import('../website/lib/first-submission.js'),store=new GovernanceStore(':memory:'),principal={tenant:'synthetic-onboarding',project:'synthetic-project',actorId:'synthetic-owner'},keys=new(require('../services/governance/project-keys.cjs').ProjectKeys)(store.db),writeKey=keys.create(principal,{actionId:'synthetic-create-write',label:'Synthetic onboarding',scopes:['write'],expiresInDays:1}),readKey=keys.create(principal,{actionId:'synthetic-create-read',label:'Synthetic read-only',scopes:['read'],expiresInDays:1}),server=createServer(store,[]);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const python=process.env.GOVERNANCE_TEST_PYTHON||'python',env={...process.env,ORVESSIAN_API_URL:'http://127.0.0.1:'+server.address().port,ORVESSIAN_API_KEY:writeKey.secret};
 try{
  const code=firstSubmissionPython(principal.tenant,principal.project),retry='\nwith opener.open(request, timeout=10) as response:\n    print(response.status, response.read().decode("utf-8"))\n';
  const accepted=await execFile(python,['-c',code+retry],{env,windowsHide:true,timeout:15000,maxBuffer:65536});assert.match(accepted.stdout,/201.*accepted/);assert.match(accepted.stdout,/200.*duplicate/);assert.ok(!accepted.stdout.includes(writeKey.secret));assert.equal(store.list(principal).total,1);assert.equal(store.evidenceStatus(principal).counts.pending,1);
  await assert.rejects(execFile(python,['-c',firstSubmissionPython('foreign-tenant',principal.project)],{env,windowsHide:true,timeout:15000}),e=>e.code===1&&/403/.test(e.stderr));
  await assert.rejects(execFile(python,['-c',code],{env:{...env,ORVESSIAN_API_KEY:readKey.secret},windowsHide:true,timeout:15000}),e=>e.code===1&&/403/.test(e.stderr));assert.equal(store.list(principal).total,1);
  await assert.rejects(execFile(python,['-c',code],{env:{...env,ORVESSIAN_API_URL:'http://example.invalid'},windowsHide:true,timeout:15000}),e=>e.code===1&&/Use your supplied HTTPS API origin/.test(e.stderr));
  // Two actual loopback endpoints: the redirect target must receive no request.
  const http=require('node:http');let targetRequests=0,redirectStatus=302,oversized=false;
  const target=http.createServer((req,res)=>{targetRequests++;req.resume();res.end('unexpected');});
  const redirect=http.createServer((req,res)=>{req.resume();if(oversized){res.end('x'.repeat(65537));return;}res.writeHead(redirectStatus,{Location:'http://127.0.0.1:'+target.address().port+'/capture'});res.end();});
  await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));
  await new Promise(resolve=>redirect.listen(0,'127.0.0.1',resolve));
  try{
   const redirectEnv={...env,ORVESSIAN_API_URL:'http://127.0.0.1:'+redirect.address().port};
   for(const status of [301,302,303,307,308]){
    redirectStatus=status;
    await assert.rejects(execFile(python,['-c',code],{env:redirectEnv,windowsHide:true,timeout:15000}),e=>e.code===1&&e.stderr.includes('HTTP Error '+status)&&!e.stderr.includes(writeKey.secret));
    assert.equal(targetRequests,0,'redirect must not forward any request or credential');
   }
   oversized=true;
   await assert.rejects(execFile(python,['-c',code],{env:redirectEnv,windowsHide:true,timeout:15000}),e=>e.code===1&&/64 KiB limit/.test(e.stderr)&&!e.stderr.includes(writeKey.secret));
  }finally{await Promise.all([new Promise(resolve=>target.close(resolve)),new Promise(resolve=>redirect.close(resolve))]);}
  assert.equal(store.list(principal).total,1);
  keys.revoke(principal,writeKey.key.id,{actionId:'synthetic-revoke-write'});await assert.rejects(execFile(python,['-c',code],{env,windowsHide:true,timeout:15000}),e=>e.code===1&&/401/.test(e.stderr));assert.equal(store.list(principal).total,1);
  console.log('PASS generated Python example: scoped submission/retry, credential denial, no redirect forwarding (301/302/303/307/308), bounded response');
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
}
main().catch(e=>{console.error('Onboarding Python acceptance failed: '+(e.code||e.name));process.exitCode=1;});
