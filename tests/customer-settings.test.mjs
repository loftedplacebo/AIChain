import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';
import React from 'react';
import {workspaceGateway} from '../lib/workspace-gateway.js';
import {customerActionNotice} from '../lib/customer-action-notice.js';
import {renderToStaticMarkup} from 'react-dom/server';
const source=await readFile(new URL('../app/workspace/customer-settings.tsx',import.meta.url),'utf8');
const compiled=await transformWithEsbuild(source,'customer-settings.tsx',{loader:'tsx',jsx:'automatic'});
const code=compiled.code.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll('"react"',JSON.stringify(import.meta.resolve('react'))).replaceAll('"../../lib/workspace-response.js"',JSON.stringify(new URL('../lib/workspace-response.js',import.meta.url).href)).replaceAll('"../../lib/customer-action-notice.js"',JSON.stringify(new URL('../lib/customer-action-notice.js',import.meta.url).href));
const {default:Panel}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const render=projects=>renderToStaticMarkup(React.createElement(Panel,{projects,selected:projects[0]?.id||'',revision:0,onChanged:async()=>{}}));
test('membership notices distinguish historical replay from current access and omit secrets',()=>{
 assert.match(customerActionNotice('member-change',{status:'updated',previousRole:'reader',role:'reviewer'}),/Read-only → Reviewer/);
 assert.match(customerActionNotice('member-change',{status:'duplicate',previousRole:'reader',role:'reviewer'}),/Original access change:.*Refresh shows current access/);
 assert.match(customerActionNotice('member-change',{status:'updated',previousRole:'reader',role:null}),/Removed from workspace/);
 assert.match(customerActionNotice('member-change',{status:'duplicate',role:'reader'}),/already saved.*current settings/);
 assert.ok(!customerActionNotice('invitation-create',{secret:'private-token'}).includes('private-token'));
});
test('evidence delivery gateway uses authenticated selected project without forwarding tenant overrides',async()=>{
 const response=await workspaceGateway(new Request('http://localhost:3001/api/workspace?action=evidence-status&workspace=prj-fixture&tenant=foreign',{headers:{cookie:'workspace_session='+'a'.repeat(64)}}),{origin:'http://localhost:3001',api:'http://127.0.0.1:8790'},async(url,options)=>{assert.equal(url.pathname,'/v1/evidence-status');assert.equal(url.searchParams.has('tenant'),false);assert.equal(options.headers['x-workspace-id'],'prj-fixture');return Response.json({total:1,verification:'not-evaluated'});});assert.equal(response.status,200);assert.equal((await response.json()).verification,'not-evaluated');
});
test('first customer workspace presents creation, invitation acceptance and private source boundary',()=>{
 const html=render([]);for(const text of ['Welcome to Orvessian','Create workspace and project','verified email address','Accept invitation','source conversations and documents stay in your systems'])assert.ok(html.includes(text));
 assert.match(html,/<input(?=[^>]*name="secret")(?=[^>]*type="password")[^>]*>/);assert.doesNotMatch(html,/Add a project|Invite a member|ovi_[a-f0-9]{64}/);
});
test('read-only customer settings expose project references without administration controls',()=>{
 const html=render([{id:'prj-123',workspaceId:'org-123',name:'Support',role:'reader',canManageMembers:false}]);
 assert.match(html,/prj-123/);assert.match(html,/org-123/);assert.match(html,/owner changes existing member roles/);
 assert.doesNotMatch(html,/Add a project|Invite a member|Loading members/);
});
test('only owner settings offer administrator invitation role and manual sharing is disclosed',()=>{
 const project={id:'prj-123',workspaceId:'org-123',name:'Support',canManageMembers:true};
 const admin=render([{...project,role:'workspace-admin'}]),owner=render([{...project,role:'owner'}]);
 assert.match(admin,/Add a project|Invite a member/);assert.doesNotMatch(admin,/value="workspace-admin"/);
 assert.match(owner,/value="workspace-admin"/);assert.match(owner,/does not send an email/);assert.match(owner,/value="reader" selected/);
 assert.doesNotMatch(owner,/value="owner"/);
 assert.match(owner,/Invitation status/);assert.match(owner,/value="pending" selected/);assert.match(owner,/value="all"/);
});
test('invitation gateway preserves bounded history filters and rejects duplicate selectors',async()=>{
 const config={origin:'http://localhost:3001',api:'http://127.0.0.1:8790'},cookie='workspace_session='+'a'.repeat(64);let calls=0;
 const fetcher=async(url)=>{calls++;assert.equal(url.pathname,'/v1/workspaces/org-fixture/invitations');assert.equal(url.searchParams.get('state'),'pending');assert.equal(url.searchParams.get('offset'),'50');assert.equal(url.searchParams.get('limit'),'50');return Response.json({invitations:[],total:106,nextOffset:100});};
 const response=await workspaceGateway(new Request('http://localhost:3001/api/workspace?action=invitations&organization=org-fixture&state=pending&limit=50&offset=50',{headers:{cookie}}),config,fetcher);assert.equal(response.status,200);assert.equal((await response.json()).total,106);
 for(const key of ['state','limit','offset']){const response=await workspaceGateway(new Request('http://localhost:3001/api/workspace?action=invitations&organization=org-fixture&'+key+'=1&'+key+'=2',{headers:{cookie}}),config,fetcher);assert.equal(response.status,400);}assert.equal(calls,1);
});
