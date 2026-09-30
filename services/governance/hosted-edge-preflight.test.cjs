'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {testOrigin,checkEdge}=require('./hosted-edge-preflight.cjs');
const fixture=()=>JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../deploy/governance/deployment-plan.example.json'),'utf8'));
function hosted(){
 const plan=fixture(),stage=plan.environments.find(environment=>environment.stage==='test');
 stage.portal={origin:'https://pilot.example.test',apiOrigin:'https://api.pilot.example.test'};
 stage.identity.callbackUrl=stage.portal.origin+'/api/auth/callback';
 stage.identity.webhookUrl=stage.portal.apiOrigin+'/v1/auth/workos-webhook';
 stage.database.tls='verify-full';
 stage.backup.custody='independent-storage';
 stage.hosting.backupProvider='separate-object-provider';
 return plan;
}
test('hosted test edge checks exact unauthenticated and internal route statuses without credentials',async()=>{
 const calls=[],statuses=[401,404,404],plan=hosted();
 const result=await checkEdge(plan,async(url,options)=>{calls.push({url,options});return new Response('',{status:statuses.shift()});});
 assert.equal(result.status,'passed');
 assert.deepEqual(result.observations.map(item=>item.path),['/v1/session','/health','/ready']);
 assert.deepEqual(calls.map(call=>call.url),['https://api.pilot.example.test/v1/session','https://api.pilot.example.test/health','https://api.pilot.example.test/ready']);
 assert.ok(calls.every(call=>call.options.method==='GET'&&call.options.redirect==='manual'&&!call.options.headers));
});
test('unhosted or invalid plan never makes an external request',async()=>{
 let calls=0;
 await assert.rejects(checkEdge(fixture(),async()=>{calls++;throw Error('unreachable');}),/not configured for hosted acceptance/);
 const plan=hosted();plan.environments[1].hosting.backupProvider=plan.environments[1].hosting.appProvider;
 await assert.rejects(checkEdge(plan,async()=>{calls++;throw Error('unreachable');}),/failed offline review/);
 assert.equal(calls,0);
 assert.equal(testOrigin(hosted()),'https://api.pilot.example.test');
});
test('a leaked health route, redirect or successful anonymous session fails acceptance',async()=>{
 for(const statuses of [[401,200,404],[302,404,404],[200,404,404]]){
  let index=0;
  await assert.rejects(checkEdge(hosted(),async()=>new Response('',{status:statuses[index++]})),/expected HTTP/);
 }
});
