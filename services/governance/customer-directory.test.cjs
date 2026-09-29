const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {CustomerDirectory}=require('./customer-directory.cjs');
const {WorkspaceAuth}=require('./auth.cjs');
function verified(directory,subject){return directory.verifiedIdentity({provider:'test-provider',subject,email:subject+'@example.test',emailVerified:true});}
test('membership action results preserve before/after roles and invitation provenance through replay',async()=>{
 const db=new DatabaseSync(':memory:');try{await require('./membership-audit-checks.cjs').checkMembershipAudit(new CustomerDirectory(db));}finally{db.close();}
});
test('invitation filters find older pending offers and page complete history without exposing tokens',async()=>{
 const db=new DatabaseSync(':memory:');try{await require('./invitation-pagination-checks.cjs').checkInvitations(new CustomerDirectory(db));}finally{db.close();}
});
test('verified identities use provider subjects, not email, and provisioning is atomic/idempotent',()=>{
 const db=new DatabaseSync(':memory:'),directory=new CustomerDirectory(db);
 try{
  assert.throws(()=>directory.verifiedIdentity({provider:'test-provider',subject:'alice',email:'alice@example.test',emailVerified:false}),e=>e.status===403);
  const alice=verified(directory,'alice');assert.equal(verified(directory,'alice').id,alice.id);
  const other=directory.verifiedIdentity({provider:'other-provider',subject:'alice',email:alice.email,emailVerified:true});assert.notEqual(other.id,alice.id);
  const input={actionId:'create-1',name:'Customer',projectName:'Support'};
  const result=directory.createWorkspace(alice.id,input);assert.equal(directory.projects(alice.id)[0].role,'owner');assert.equal(directory.projects(other.id).length,0);
  assert.equal(directory.createWorkspace(alice.id,input).workspaceId,result.workspaceId);
  assert.throws(()=>directory.createWorkspace(alice.id,{...input,name:'Changed'}),e=>e.status===409);
  assert.throws(()=>directory.createWorkspace(alice.id,{...input,tenant:'forged'}),e=>e.status===400);
  assert.throws(()=>directory.createProject(other.id,result.workspaceId,{actionId:'foreign',name:'Foreign'}),e=>e.status===404);
  const project=directory.createProject(alice.id,result.workspaceId,{actionId:'project-1',name:'Robotics'});assert.equal(directory.projects(alice.id).length,2);
  assert.notEqual(project.projectId,result.projectId);
  assert.throws(()=>directory.changeMember(alice.id,result.workspaceId,{actionId:'remove-owner',userId:alice.id,role:null}),e=>e.status===409);
  assert.equal(db.prepare('SELECT count(*) n FROM customer_actions').get().n,2);
 }finally{db.close();}
});
test('SQLite write-lock wait cannot provision or replay work for a newly disabled customer',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Worker}=require('node:worker_threads'),{once}=require('node:events');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ov-directory-lock-')),file=path.join(root,'customer.sqlite'),db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000');
 const directory=new CustomerDirectory(db),user=verified(directory,'waiting'),existing={actionId:'existing',name:'Team',projectName:'Governance'};directory.createWorkspace(user.id,existing);
 try{
  for(const input of [{actionId:'new-workspace',name:'New',projectName:'Blocked'},existing]){
   db.prepare('UPDATE customer_identities SET disabled=0 WHERE id=?').run(user.id);
   const signal=new Int32Array(new SharedArrayBuffer(4));
   const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads'),{DatabaseSync}=require('node:sqlite');const signal=new Int32Array(workerData.signal),db=new DatabaseSync(workerData.file);try{db.exec('BEGIN IMMEDIATE');parentPort.postMessage('locked');while(Atomics.load(signal,0)!==1){if(Atomics.wait(signal,0,0,2000)==='timed-out')throw Error('Synthetic lock handshake timed out');}db.prepare('UPDATE customer_identities SET disabled=1,version=version+1 WHERE id=?').run(workerData.id);db.exec('COMMIT');}finally{db.close();}`,{eval:true,workerData:{file,id:user.id,signal:signal.buffer}});
   const exited=once(worker,'exit');await once(worker,'message');
   const original=directory.identity.bind(directory);let checked=false;
   directory.identity=id=>{const result=original(id);if(!checked){checked=true;Atomics.store(signal,0,1);Atomics.notify(signal,0);}return result;};
   try{assert.throws(()=>directory.createWorkspace(user.id,input),e=>e.status===401);}finally{directory.identity=original;}
   assert.equal((await exited)[0],0);assert.equal(db.isTransaction,false);
   assert.equal(db.prepare('SELECT count(*) n FROM customer_workspaces').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM customer_actions').get().n,1);
  }
 }finally{db.close();for(const name of ['customer.sqlite','customer.sqlite-wal','customer.sqlite-shm'])fs.rmSync(path.join(root,name),{force:true});fs.rmdirSync(root);}
});

test('SQLite replay checks current administrator role after acquiring the write lock',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Worker}=require('node:worker_threads'),{once}=require('node:events');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ov-directory-role-')),file=path.join(root,'customer.sqlite'),db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000');
 const directory=new CustomerDirectory(db),user=verified(directory,'owner'),workspace=directory.createWorkspace(user.id,{actionId:'workspace',name:'Team',projectName:'First'}),input={actionId:'existing-project',name:'Second'};directory.createProject(user.id,workspace.workspaceId,input);
 const signal=new Int32Array(new SharedArrayBuffer(4)),worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads'),{DatabaseSync}=require('node:sqlite'),signal=new Int32Array(workerData.signal),db=new DatabaseSync(workerData.file);try{db.exec('BEGIN IMMEDIATE');parentPort.postMessage('locked');while(Atomics.load(signal,0)!==1){if(Atomics.wait(signal,0,0,2000)==='timed-out')throw Error('Synthetic role handshake timed out');}db.prepare("UPDATE customer_memberships SET role='reader' WHERE user_id=?").run(workerData.id);db.exec('COMMIT');}finally{db.close();}`,{eval:true,workerData:{file,id:user.id,signal:signal.buffer}});
 const exited=once(worker,'exit');await once(worker,'message');const originalTransaction=directory.transaction.bind(directory),originalIdentity=directory.identity.bind(directory);
 directory.transaction=(...args)=>{let checked=false;directory.identity=id=>{const value=originalIdentity(id);if(!checked){checked=true;Atomics.store(signal,0,1);Atomics.notify(signal,0);}return value;};try{return originalTransaction(...args);}finally{directory.identity=originalIdentity;}};
 try{
  assert.throws(()=>directory.createProject(user.id,workspace.workspaceId,input),e=>e.status===403);assert.equal((await exited)[0],0);
  assert.equal(db.isTransaction,false);assert.equal(db.prepare('SELECT count(*) n FROM customer_projects').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM customer_actions').get().n,2);
 }finally{db.close();for(const name of ['customer.sqlite','customer.sqlite-wal','customer.sqlite-shm'])fs.rmSync(path.join(root,name),{force:true});fs.rmdirSync(root);}
});

test('persistent customer sessions recheck membership roles and identity disablement',()=>{
 const db=new DatabaseSync(':memory:'),directory=new CustomerDirectory(db),auth=new WorkspaceAuth(db,[],Date.now,directory);
 try{
  const owner=verified(directory,'owner'),member=verified(directory,'member');
  const {workspaceId,projectId}=directory.createWorkspace(owner.id,{actionId:'w',name:'Team',projectName:'Production'});
  const invite=directory.invite(owner.id,workspaceId,{actionId:'invite-member',email:member.email,role:'workspace-admin'});
  directory.acceptInvitation(member.id,{actionId:'join',secret:invite.secret});
  const login=auth.loginVerified(member.id);assert.ok(auth.principal(auth.resolve(login.token),projectId).scopes.includes('manage-keys'));
  assert.throws(()=>directory.changeMember(member.id,workspaceId,{actionId:'escalate',userId:member.id,role:'owner'}),e=>e.status===403);
  directory.changeMember(owner.id,workspaceId,{actionId:'demote',userId:member.id,role:'reader'});
  assert.deepEqual(auth.principal(auth.resolve(login.token),projectId).scopes,['read']);
  directory.changeMember(owner.id,workspaceId,{actionId:'remove',userId:member.id,role:null});
  assert.equal(auth.publicUser(auth.resolve(login.token)).workspaces.length,0);
  assert.throws(()=>auth.principal(auth.resolve(login.token),projectId),e=>e.status===404);
  directory.disableIdentity(member.id);assert.equal(auth.resolve(login.token),null);
  assert.throws(()=>auth.loginVerified(member.id),e=>e.status===401);
  assert.throws(()=>verified(directory,'member'),e=>e.status===403);
 }finally{db.close();}
});
test('real customer API permits first workspace/key and denies forged identity or revoked roles',async()=>{
 const {GovernanceStore}=require('./store'),store=new GovernanceStore(':memory:'),directory=new CustomerDirectory(store.db),auth=new WorkspaceAuth(store.db,[],Date.now,directory);
 const owner=verified(directory,'owner'),outsider=verified(directory,'outsider'),member=verified(directory,'member');
 const ownerToken=auth.loginVerified(owner.id).token,outsiderToken=auth.loginVerified(outsider.id).token;
 const server=require('./server.cjs').createServer(store,[],[],store.db,{}, {directory,auth});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=(token,path,body,project)=>fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-workspace-session':token,...(project?{'x-workspace-id':project}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await call('', '/v1/workspaces',{actionId:'fake',name:'No',projectName:'No',emailVerified:true})).status,401);
  assert.equal((await call(ownerToken,'/v1/workspaces',{actionId:'fake',name:'No',projectName:'No',userId:outsider.id})).status,400);
  const response=await call(ownerToken,'/v1/workspaces',{actionId:'create',name:'Customer',projectName:'Agent governance'});assert.equal(response.status,201);
  const {workspaceId,projectId}=await response.json();const session=await (await call(ownerToken,'/v1/session')).json();assert.equal(session.workspaces[0].id,projectId);assert.equal(session.workspaces[0].canManageKeys,true);
  assert.equal((await call(outsiderToken,`/v1/workspaces/${workspaceId}/members`)).status,404);
  assert.equal((await call(ownerToken,'/v1/keys',{actionId:'key',label:'Ingestion',scopes:['write']},projectId)).status,201);
  const invitationResponse=await call(ownerToken,`/v1/workspaces/${workspaceId}/invitations`,{actionId:'invite',email:member.email,role:'workspace-admin'});assert.equal(invitationResponse.status,201);const invitation=await invitationResponse.json();
  const invitationPage=await call(ownerToken,`/v1/workspaces/${workspaceId}/invitations?state=pending&limit=1&offset=0`);assert.equal(invitationPage.status,200);const page=await invitationPage.json();assert.equal(page.total,1);assert.equal(page.invitations[0].id,invitation.invitationId);assert.equal(JSON.stringify(page).includes(invitation.secret),false);
  for(const query of ['state=unknown','limit=101','offset=-1','state=pending&state=all'])assert.equal((await call(ownerToken,`/v1/workspaces/${workspaceId}/invitations?${query}`)).status,400);
  const memberToken=auth.loginVerified(member.id).token;
  assert.equal((await call(outsiderToken,'/v1/invitations/accept',{actionId:'steal',secret:invitation.secret})).status,404);
  assert.equal((await call(memberToken,'/v1/invitations/accept',{actionId:'accept',secret:invitation.secret})).status,200);
  assert.equal((await call(memberToken,'/v1/keys',null,projectId)).status,200);
  assert.equal((await call(memberToken,`/v1/workspaces/${workspaceId}/members`,{actionId:'take-over',userId:member.id,role:'owner'})).status,403);
  assert.equal((await call(ownerToken,`/v1/workspaces/${workspaceId}/members`,{actionId:'demote',userId:member.id,role:'reader'})).status,200);
  assert.equal((await call(memberToken,'/v1/keys',null,projectId)).status,403);
  assert.equal((await call(ownerToken,`/v1/workspaces/${workspaceId}/members`,{actionId:'last-owner',userId:owner.id,role:null})).status,409);
  directory.disableIdentity(owner.id);assert.equal((await call(ownerToken,'/v1/session')).status,401);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
test('invitations bind verified email, store hashes only, expire and reject privilege escalation',()=>{
 const db=new DatabaseSync(':memory:');let now=1000;const directory=new CustomerDirectory(db,()=>now);
 try{
  const owner=verified(directory,'owner'),alice=verified(directory,'alice'),bob=verified(directory,'bob');
  const {workspaceId}=directory.createWorkspace(owner.id,{actionId:'create',name:'Team',projectName:'Project'});
  assert.throws(()=>directory.invite(owner.id,workspaceId,{actionId:'bad-owner',email:alice.email,role:'owner'}),e=>e.status===400);
  const body={actionId:'invite-alice',email:alice.email,role:'workspace-admin'},invite=directory.invite(owner.id,workspaceId,body);
  assert.equal(directory.invite(owner.id,workspaceId,body).secret,null);
  assert.equal(JSON.stringify(directory.invitations(owner.id,workspaceId)).includes(invite.secret),false);
  const audit=JSON.stringify(db.prepare('SELECT * FROM customer_actions').all());assert.equal(audit.includes(invite.secret),false);
  assert.notEqual(db.prepare('SELECT token_hash FROM customer_invitations').get().token_hash,invite.secret);
  assert.throws(()=>directory.acceptInvitation(bob.id,{actionId:'wrong-email',secret:invite.secret}),e=>e.status===404);
  const accept={actionId:'join',secret:invite.secret};assert.equal(directory.acceptInvitation(alice.id,accept).status,'accepted');assert.equal(directory.acceptInvitation(alice.id,accept).status,'duplicate');
  assert.throws(()=>directory.acceptInvitation(alice.id,{...accept,actionId:'reuse'}),e=>e.status===404);
  assert.throws(()=>directory.invite(alice.id,workspaceId,{actionId:'escalate',email:bob.email,role:'workspace-admin'}),e=>e.status===400);
  const expires=directory.invite(alice.id,workspaceId,{actionId:'expiry',email:bob.email,role:'reader'});now=expires.expiresAt;
  assert.throws(()=>directory.acceptInvitation(bob.id,{actionId:'expired',secret:expires.secret}),e=>e.status===404);
  const revoked=directory.invite(owner.id,workspaceId,{actionId:'revoke-target',email:bob.email,role:'reader'});
  directory.revokeInvitation(owner.id,workspaceId,{actionId:'revoke',invitationId:revoked.invitationId});
  assert.throws(()=>directory.acceptInvitation(bob.id,{actionId:'revoked',secret:revoked.secret}),e=>e.status===404);
 }finally{db.close();}
});
test('customer directory and sessions survive reopening; gateway preserves role and origin checks',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ov-customers-')),file=path.join(dir,'control.sqlite');let db=new DatabaseSync(file);
 let server,store;
 try{
  let directory=new CustomerDirectory(db),auth=new WorkspaceAuth(db,[],Date.now,directory);const owner=verified(directory,'owner'),member=verified(directory,'member');
  const ownerToken=auth.loginVerified(owner.id).token,memberToken=auth.loginVerified(member.id).token;
  const body={actionId:'workspace',name:'Team',projectName:'Project'},created=directory.createWorkspace(owner.id,body);db.close();db=new DatabaseSync(file);
  directory=new CustomerDirectory(db);auth=new WorkspaceAuth(db,[],Date.now,directory);
  assert.equal(auth.resolve(ownerToken).workspaces[0].id,created.projectId);assert.equal(directory.createWorkspace(owner.id,body).workspaceId,created.workspaceId);
  store=new (require('./store').GovernanceStore)(':memory:');server=require('./server.cjs').createServer(store,[],[],db,{}, {directory,auth});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {workspaceGateway}=await import('../../website/lib/workspace-gateway.js'),api=`http://127.0.0.1:${server.address().port}`;
  const request=(action,token,input,organization=created.workspaceId,origin='http://localhost:3001')=>workspaceGateway(new Request('http://localhost:3001/api/workspace?'+new URLSearchParams({action,organization}),{method:input?'POST':'GET',headers:{cookie:`workspace_session=${token}`,origin,'content-type':'application/json'},...(input?{body:JSON.stringify(input)}:{})}),{api});
  assert.equal((await request('project-create',ownerToken,{actionId:'blocked',name:'No'},created.workspaceId,'https://foreign.test')).status,403);
  assert.equal((await request('project-create',memberToken,{actionId:'foreign',name:'No'})).status,404);
  const invitationBody={actionId:'invite',email:member.email,role:'reader'};
  const response=await request('invitation-create',ownerToken,invitationBody);assert.equal(response.status,201);assert.match(response.headers.get('cache-control'),/no-store/);const invitation=await response.json();
  assert.equal((await (await request('invitation-create',ownerToken,invitationBody)).json()).secret,null);
  assert.equal((await (await request('invitations',ownerToken)).text()).includes(invitation.secret),false);
  assert.equal((await request('invitation-accept',memberToken,{actionId:'accept',secret:invitation.secret})).status,200);
  assert.equal((await request('members',memberToken)).status,403);
  assert.equal((await (await request('members',ownerToken)).json()).members.length,2);
  assert.equal((await request('member-change',ownerToken,{actionId:'remove',userId:member.id,role:null})).status,200);
  assert.equal(auth.resolve(memberToken).workspaces.length,0);
 }finally{if(server)await new Promise(r=>server.close(r));store?.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
