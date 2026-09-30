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
 const calls=[],statuses=[401,404,404,401],plan=hosted();
 const result=await checkEdge(plan,async(url,options)=>{calls.push({url,options});const status=statuses.shift();return url.endsWith('/v1/session')?anonymousSession():url.endsWith('/v1/auth/workos-webhook')?unsignedWebhook():new Response('',{status});});
 assert.equal(result.status,'passed');
 assert.deepEqual(result.observations.map(item=>item.path),['/v1/session','/health','/ready','/v1/auth/workos-webhook']);
 assert.deepEqual(calls.map(call=>call.url),['https://api.pilot.example.test/v1/session','https://api.pilot.example.test/health','https://api.pilot.example.test/ready','https://api.pilot.example.test/v1/auth/workos-webhook']);
 assert.ok(calls.slice(0,3).every(call=>call.options.method==='GET'&&call.options.redirect==='manual'&&!call.options.headers));
 assert.deepEqual({method:calls[3].options.method,headers:calls[3].options.headers,body:calls[3].options.body,redirect:calls[3].options.redirect},{method:'POST',headers:{'content-type':'application/json'},body:'{}',redirect:'manual'});
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
  await assert.rejects(checkEdge(hosted(),async()=>{const status=statuses[index++];return status===401?anonymousSession():new Response('',{status});}),/expected HTTP/);
 }
});
function anonymousSession(body=JSON.stringify({error:'Sign in required'}),headers={}){
 return new Response(body,{status:401,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
}
function unsignedWebhook(){return anonymousSession(JSON.stringify({error:'Webhook signature required'}));}
test('a generic proxy denial or oversized response cannot impersonate the API',async()=>{
 for(const response of [
  new Response('Denied',{status:401}),
  anonymousSession(JSON.stringify({error:'Forbidden'})),
  anonymousSession('x'.repeat(257)),
  anonymousSession('{invalid json'),
  anonymousSession(undefined,{'cache-control':'public'})
 ])await assert.rejects(checkEdge(hosted(),async()=>response),/\/v1\/session/);
});
test('webhook probe rejects missing configuration, proxy denial and redirects',async()=>{
 for(const bad of [new Response('',{status:503}),new Response('Denied',{status:401}),anonymousSession(),new Response('',{status:302})]){
  await assert.rejects(checkEdge(hosted(),async(url)=>url.endsWith('/v1/session')?anonymousSession():url.endsWith('/v1/auth/workos-webhook')?bad:new Response('',{status:404})),/\/v1\/auth\/workos-webhook/);
 }
});
