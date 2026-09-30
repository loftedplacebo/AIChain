'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {promisify}=require('node:util'),execFile=promisify(require('node:child_process').execFile);
const {GovernanceStore}=require('../services/governance/store'),{ProjectKeys}=require('../services/governance/project-keys.cjs'),{createServer}=require('../services/governance/server.cjs');
const {validateGovernanceEvent}=require('../sdk/typescript/governance-event');
const example=path.resolve(__dirname,'../examples/design-partner-synthetic-set.py'),python=process.env.GOVERNANCE_TEST_PYTHON||'python';
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const close=server=>new Promise(resolve=>server.close(resolve));
async function main(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'orvessian-pilot-set-')),file=path.join(directory,'set.json');
 const store=new GovernanceStore(':memory:'),principal={tenant:'synthetic-partner',project:'synthetic-project',actorId:'pilot-owner'},keys=new ProjectKeys(store.db);
 const write=keys.create(principal,{actionId:'pilot-write',label:'Pilot write',scopes:['write'],expiresInDays:1});
 const read=keys.create(principal,{actionId:'pilot-read',label:'Pilot read',scopes:['read'],expiresInDays:1});
 const server=createServer(store,[]);await listen(server);
 const env={...process.env,ORVESSIAN_TENANT:principal.tenant,ORVESSIAN_PROJECT:principal.project,ORVESSIAN_API_URL:'http://127.0.0.1:'+server.address().port,ORVESSIAN_API_KEY:write.secret};
 const run=(action,options={})=>execFile(python,[example,action,file],{env:{...env,...options},windowsHide:true,timeout:20000,maxBuffer:65536});
 try{
  await run('prepare');const original=fs.readFileSync(file,'utf8'),manifest=JSON.parse(original);
  assert.equal(manifest.kind,'orvessian-pilot-synthetic-set');assert.equal(manifest.events.length,3);
  for(const event of manifest.events)assert.equal(validateGovernanceEvent(event).valid,true);
  assert.deepEqual(manifest.events.map(event=>event.eventType),['ai.run.completed','ai.run.completed','ai.monitor.alerted']);
  assert.deepEqual(manifest.events[2].parentEventRefs,[manifest.events[1].eventId]);
  await assert.rejects(run('prepare'),error=>error.code===1&&/File exists/.test(error.stderr));
  const altered=structuredClone(manifest);altered.events[0].prompt='must never leave this file';fs.writeFileSync(file,JSON.stringify(altered));
  await assert.rejects(run('submit'),error=>error.code===1&&/Synthetic set was changed/.test(error.stderr));
  assert.equal(store.list(principal).total,0);fs.writeFileSync(file,original);
  const first=await run('submit');assert.equal((first.stdout.match(/ accepted/g)||[]).length,3);assert.equal(store.list(principal).total,3);
  const retry=await run('submit');assert.equal((retry.stdout.match(/ duplicate/g)||[]).length,3);assert.equal(store.list(principal).total,3);
  await assert.rejects(run('submit',{ORVESSIAN_TENANT:'foreign-partner'}),error=>error.code===1&&/scope does not match/.test(error.stderr));
  await assert.rejects(run('submit',{ORVESSIAN_API_KEY:read.secret}),error=>error.code===1&&/HTTP 403/.test(error.stderr));
  assert.equal(store.list(principal).total,3);
  let forwarded=0;const target=http.createServer((req,res)=>{forwarded++;req.resume();res.end('unexpected');});await listen(target);
  const redirect=http.createServer((req,res)=>{req.resume();res.writeHead(307,{Location:'http://127.0.0.1:'+target.address().port+'/capture'});res.end();});await listen(redirect);
  try{await assert.rejects(run('submit',{ORVESSIAN_API_URL:'http://127.0.0.1:'+redirect.address().port}),error=>error.code===1&&/HTTP 307/.test(error.stderr));assert.equal(forwarded,0);}finally{await Promise.all([close(target),close(redirect)]);}
  console.log('PASS pilot synthetic set: three valid events, exact replay, scope and key denial, no redirect forwarding');
 }finally{await close(server);store.close();if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(directory);}
}
main().catch(error=>{console.error('Pilot synthetic set acceptance failed: '+(error.code||error.message));process.exitCode=1;});
