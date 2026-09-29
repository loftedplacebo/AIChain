import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {workspaceGateway} from '../lib/workspace-gateway.js';
const source=await readFile(new URL('../app/workspace/account-sessions.tsx',import.meta.url),'utf8'),compiled=await transformWithEsbuild(source,'account-sessions.tsx',{loader:'tsx',jsx:'automatic'});
const code=compiled.code.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll('"react"',JSON.stringify(import.meta.resolve('react'))).replaceAll('"../../lib/workspace-response.js"',JSON.stringify(new URL('../lib/workspace-response.js',import.meta.url).href));
const {default:Panel}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('account panel explains app-only scope and does not invent device/location data',()=>{
 const html=renderToStaticMarkup(React.createElement(Panel));for(const text of ['Your app sessions','provider sign-in or project API keys','device names and locations are not collected','Refresh sessions','Loading app sessions'])assert.ok(html.includes(text));assert.doesNotMatch(html,/ovk_|session_[a-f0-9]/);
});
test('account gateway uses the authenticated cookie and preserves reauthentication while enforcing same-origin writes',async()=>{
 const token='ab'.repeat(32),origin='http://localhost:3001',config={origin,api:'http://127.0.0.1:8790'},calls=[];
 const fetcher=async(url,init)=>{calls.push({url:String(url),init});return Response.json({error:'Sign in again',code:'reauthentication-required'},{status:403});};
 const list=await workspaceGateway(new Request(origin+'/api/workspace?action=account-sessions&workspace=foreign&organization=foreign',{headers:{cookie:'workspace_session='+token}}),config,fetcher);assert.equal(list.status,403);assert.equal(new URL(calls[0].url).pathname,'/v1/account/sessions');assert.equal(calls[0].init.headers['x-workspace-session'],token);assert.equal(calls[0].init.headers['x-workspace-id'],undefined);
 const input={ref:'cd'.repeat(32)},write=new Request(origin+'/api/workspace?action=session-revoke',{method:'POST',headers:{cookie:'workspace_session='+token,origin,'content-type':'application/json'},body:JSON.stringify(input)}),response=await workspaceGateway(write,config,fetcher);assert.equal(response.status,403);assert.equal((await response.json()).code,'reauthentication-required');assert.equal(new URL(calls[1].url).pathname,'/v1/account/sessions/revoke');assert.equal(calls[1].init.body,JSON.stringify(input));
 const denied=await workspaceGateway(new Request(origin+'/api/workspace?action=session-revoke',{method:'POST',headers:{cookie:'workspace_session='+token,origin:'http://foreign.invalid','content-type':'application/json'},body:JSON.stringify(input)}),config,fetcher);assert.equal(denied.status,403);assert.equal(calls.length,2);
});
