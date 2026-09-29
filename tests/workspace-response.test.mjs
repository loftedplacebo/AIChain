import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorkspaceResponse,mutationErrorMessage} from '../lib/workspace-response.js';
import {workspaceGateway} from '../lib/workspace-gateway.js';
import {workosGateway} from '../lib/workos-gateway.js';
test('gateway preserves reauthentication rejection and read cookie; client signals once without automatic replay',async()=>{
 const token='ab'.repeat(32);let upstreamCalls=0,prompts=0;
 const response=await workspaceGateway(new Request('http://localhost:3001/api/workspace?action=key-create&workspace=prj-test',{method:'POST',headers:{origin:'http://localhost:3001','content-type':'application/json',cookie:'workspace_session='+token},body:JSON.stringify({actionId:'same-id',label:'Test',scopes:['write']})}),{},async()=>{upstreamCalls++;return Response.json({error:'Sign in again to manage keys and workspace access',code:'reauthentication-required'},{status:403});});
 assert.equal(response.status,403);assert.equal(response.headers.get('set-cookie'),null);
 await assert.rejects(readWorkspaceResponse(response,{onReauthenticationRequired:()=>prompts++}),e=>{assert.equal(e.code,'reauthentication-required');assert.equal(mutationErrorMessage(e,' Retry now'),e.message);return true;});
 assert.equal(prompts,1);assert.equal(upstreamCalls,1);
});
test('ordinary permission denials and service failures never claim reauthentication',async()=>{
 for(const status of [401,403,503]){let prompts=0;
  await assert.rejects(readWorkspaceResponse(Response.json({error:'Denied',code:'another-code'},{status}),{onReauthenticationRequired:()=>prompts++}),e=>{assert.equal(e.code,undefined);assert.equal(mutationErrorMessage(e,' Check original action'),'Denied Check original action');return true;});assert.equal(prompts,0);
 }
 let prompts=0;await assert.rejects(readWorkspaceResponse(Response.json({error:'Wrong status',code:'reauthentication-required'},{status:503}),{onReauthenticationRequired:()=>prompts++}));assert.equal(prompts,0);
});
test('aborted stale responses cannot prompt or expose returned secrets',async()=>{
 const controller=new AbortController();controller.abort();let prompts=0;
 await assert.rejects(readWorkspaceResponse(Response.json({error:'Stale',code:'reauthentication-required',secret:'synthetic-only'},{status:403}),{signal:controller.signal,onReauthenticationRequired:()=>prompts++}),e=>e.name==='AbortError');assert.equal(prompts,0);
});

test('gateway and client preserve bounded rate-limit guidance without clearing the session or replaying writes',async()=>{
 let calls=0,prompts=0;const token='ab'.repeat(32),response=await workspaceGateway(new Request('http://localhost:3001/api/workspace?action=workspace-create',{method:'POST',headers:{origin:'http://localhost:3001','content-type':'application/json',cookie:'workspace_session='+token},body:JSON.stringify({actionId:'same-action',name:'Synthetic',projectName:'Governance'})}),{},async()=>{calls++;return Response.json({error:'Customer request limit reached',code:'customer-request-limit',retryAfter:30},{status:429,headers:{'retry-after':'30'}});});
 assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'30');assert.equal(response.headers.get('set-cookie'),null);
 await assert.rejects(readWorkspaceResponse(response,{onReauthenticationRequired:()=>prompts++}),error=>{assert.equal(error.code,'request-limit');assert.equal(error.retryAfter,30);assert.match(error.message,/Try again in 30 seconds/);assert.equal(mutationErrorMessage(error,' Retry now'),error.message);return true;});assert.equal(calls,1);assert.equal(prompts,0);
});

test('invalid rate-limit delays are not trusted or forwarded',async()=>{
 for(const retry of ['999999','0','-1','tomorrow']){
  const response=await workspaceGateway(new Request('http://localhost:3001/api/workspace',{headers:{cookie:'workspace_session='+'ab'.repeat(32)}}),{},async()=>Response.json({error:'Limited',retryAfter:999999},{status:429,headers:{'retry-after':retry}}));assert.equal(response.headers.get('retry-after'),null);
  await assert.rejects(readWorkspaceResponse(response),error=>{assert.equal(error.retryAfter,undefined);assert.match(error.message,/Please wait/);assert.doesNotMatch(error.message,/999999/);return true;});
 }
});

test('sign-in gateway preserves aggregate-capacity retry guidance without replacing cookies or retrying',async()=>{
 for(const retry of ['30','999999']){let calls=0;const response=await workosGateway(new Request('http://localhost:3001/api/auth/start',{headers:{cookie:'workspace_auth_flow='+'ab'.repeat(32)}}),{},async()=>{calls++;return Response.json({error:'private upstream detail'},{status:429,headers:{'retry-after':retry}});});assert.equal(response.status,429);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('retry-after'),retry==='30'?'30':null);const data=await response.json();assert.equal(data.code,'auth-start-limit');assert.doesNotMatch(data.error,/private upstream detail/);assert.equal(calls,1);}
});
