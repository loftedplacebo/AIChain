const test=require('node:test'),assert=require('node:assert/strict');
const {setImmediate}=require('node:timers/promises');
const {GovernanceStore}=require('./store'),{CustomerDirectory}=require('./customer-directory.cjs'),{WorkspaceAuth}=require('./auth.cjs'),{createServer}=require('./server.cjs');
// Real repositories behind delayed asynchronous boundaries: catches Promise
// truthiness, premature HTTP success and swallowed repository failures.
function asynchronous(target){return new Proxy(target,{get(object,key){const value=object[key];return typeof value==='function'?async(...args)=>{await setImmediate();return value.apply(object,args);}:value;}});}
test('HTTP customer onboarding awaits identity/session/directory results and retains role isolation',async()=>{
 const store=new GovernanceStore(':memory:'),directory=new CustomerDirectory(store.db),auth=new WorkspaceAuth(store.db,[],Date.now,directory);
 const identity=subject=>directory.verifiedIdentity({provider:'synthetic',subject,email:subject+'@example.test',emailVerified:true});
 const owner=identity('owner'),member=identity('member'),foreign=identity('foreign');
 const ownerSession=auth.loginVerified(owner.id),memberSession=auth.loginVerified(member.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_synthetic'}),foreignSession=auth.loginVerified(foreign.id);
 const asyncDirectory=asynchronous(directory),asyncAuth=asynchronous(auth);
 const server=createServer(store,[],[],store.db,{}, {directory:asyncDirectory,auth:asyncAuth});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=(url,token,{body,project,method}={})=>fetch(base+url,{method:method||(body?'POST':'GET'),headers:{'content-type':'application/json','x-workspace-session':token,...(project?{'x-workspace-id':project}:{})},body:body?JSON.stringify(body):undefined});
 try{
  assert.equal((await call('/v1/session','ab'.repeat(32))).status,401);
  assert.equal((await (await call('/v1/session',ownerSession.token)).json()).workspaces.length,0);
  const created=await call('/v1/workspaces',ownerSession.token,{body:{actionId:'workspace',name:'Customer',projectName:'Governance'}});assert.equal(created.status,201);const workspace=await created.json();assert.ok(workspace.workspaceId);assert.ok(workspace.projectId);
  const current=await (await call('/v1/session',ownerSession.token)).json();assert.equal(current.workspaces[0].role,'owner');
  const invitation=await call(`/v1/workspaces/${workspace.workspaceId}/invitations`,ownerSession.token,{body:{actionId:'invite',email:member.email,role:'workspace-admin'}});assert.equal(invitation.status,201);const invite=await invitation.json();assert.ok(invite.secret);
  const joined=await call('/v1/invitations/accept',memberSession.token,{body:{actionId:'join',secret:invite.secret}});assert.equal(joined.status,200);assert.equal((await joined.json()).workspaceId,workspace.workspaceId);
  const members=await (await call(`/v1/workspaces/${workspace.workspaceId}/members`,ownerSession.token)).json();assert.equal(members.members.length,2);
  const invitations=await (await call(`/v1/workspaces/${workspace.workspaceId}/invitations`,ownerSession.token)).json();assert.equal(invitations.invitations.length,1);assert.equal(JSON.stringify(invitations).includes(invite.secret),false);
  assert.equal((await call(`/v1/workspaces/${workspace.workspaceId}/members`,foreignSession.token)).status,404);
  const added=await call(`/v1/workspaces/${workspace.workspaceId}/projects`,memberSession.token,{body:{actionId:'project',name:'Production line'}});assert.equal(added.status,201);
  const key=await call('/v1/keys',memberSession.token,{project:workspace.projectId,body:{actionId:'key',label:'Recorder',scopes:['write']}});assert.equal(key.status,201);
  const changed=await call(`/v1/workspaces/${workspace.workspaceId}/members`,ownerSession.token,{body:{actionId:'demote',userId:member.id,role:'reader'}});assert.equal(changed.status,200);
  assert.equal((await call('/v1/keys',memberSession.token,{project:workspace.projectId})).status,403);
  assert.equal((await call(`/v1/workspaces/${workspace.workspaceId}/projects`,memberSession.token,{body:{actionId:'denied',name:'Denied'}})).status,403);
  assert.equal((await call(`/v1/workspaces/${workspace.workspaceId}/members`,ownerSession.token,{body:{actionId:'last-owner',userId:owner.id,role:null}})).status,409);
  assert.equal((await call(`/v1/workspaces/${workspace.workspaceId}/invitations/revoke`,ownerSession.token,{body:{actionId:'revoke',invitationId:invite.invitationId}})).status,200);
  const logout=await call('/v1/session',memberSession.token,{method:'DELETE'});assert.equal(logout.status,200);assert.match((await logout.json()).logoutUrl,/session_synthetic/);assert.equal(auth.resolve(memberSession.token),null);
  directory.disableIdentity(owner.id);assert.equal((await call('/v1/session',ownerSession.token)).status,401);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
test('asynchronous repository rejection fails HTTP requests without premature success',async()=>{
 const store=new GovernanceStore(':memory:'),directory=new CustomerDirectory(store.db),auth=new WorkspaceAuth(store.db,[],Date.now,directory);
 const owner=directory.verifiedIdentity({provider:'synthetic',subject:'owner',email:'owner@example.test',emailVerified:true}),session=auth.loginVerified(owner.id);
 const delayed=asynchronous(directory),failingDirectory=new Proxy(delayed,{get(target,key){return key==='createWorkspace'?async()=>{await setImmediate();throw Object.assign(Error('Customer storage busy'),{status:503});}:target[key];}});
 const server=createServer(store,[],[],store.db,{}, {directory:failingDirectory,auth:asynchronous(auth)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/workspaces`,{method:'POST',headers:{'content-type':'application/json','x-workspace-session':session.token},body:JSON.stringify({actionId:'workspace',name:'Customer',projectName:'Governance'})});
  assert.equal(response.status,503);assert.equal((await response.json()).error,'Customer storage busy');assert.equal(directory.projects(owner.id).length,0);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
