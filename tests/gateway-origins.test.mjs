import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceGateway} from '../lib/workspace-gateway.js';
import {workosGateway} from '../lib/workos-gateway.js';

const origin='https://portal.example.test';
const api='https://api.example.test';

test('hosted gateways refuse incomplete or unsafe origins before contacting the API',async()=>{
 const invalid=[
  {origin},
  {origin,api:origin},
  {origin,api:'http://127.0.0.1:8790'},
  {origin,api:'https://name:secret@api.example.test'},
  {origin,api:api+'/extra'},
  {origin,api:api+'?key=secret'},
  {origin,api:api+'#fragment'},
  {origin:origin+'/extra',api},
  {origin:origin+'?key=secret',api},
 ];
 let calls=0;
 const fetcher=async()=>{calls++;return Response.json({});};
 for(const config of invalid){
  const workspace=await workspaceGateway(new Request(origin+'/api/workspace'),config,fetcher);
  const signIn=await workosGateway(new Request(origin+'/api/auth/status'),config,fetcher);
  assert.equal(workspace.status,503,JSON.stringify(config));
  assert.equal(signIn.status,503,JSON.stringify(config));
 }
 assert.equal(calls,0);
});

test('hosted gateways use the configured API origin',async()=>{
 const seen=[];
 const fetcher=async url=>{seen.push(url.href);return Response.json({enabled:true,provider:'workos'});};
 const config={origin,api};
 assert.equal((await workspaceGateway(new Request(origin+'/api/workspace'),config,fetcher)).status,200);
 assert.equal((await workosGateway(new Request(origin+'/api/auth/status'),config,fetcher)).status,200);
 assert.deepEqual(seen,[api+'/v1/session',api+'/v1/auth/status']);
});
