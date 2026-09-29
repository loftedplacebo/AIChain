const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {ProjectKeys}=require('./project-keys.cjs'),{GovernanceStore}=require('./store'),{createServer}=require('./server.cjs'),{passwordHash}=require('./auth.cjs');
const p={tenant:'t',project:'p',actorId:'owner'},input={actionId:'create-1',label:'Agent ingestion',scopes:['write'],expiresInDays:1};
test('SQLite key pagination finds old active credentials and isolates full history',async()=>{
 const db=new DatabaseSync(':memory:');let now=Date.now();try{await require('./key-pagination-checks.cjs')(new ProjectKeys(db,{now:()=>now}),ms=>now+=ms);}finally{db.close();}
});
test('hashed key lifecycle, one-time secret, action replay and scoped rotation/expiry',()=>{
 const db=new DatabaseSync(':memory:');let now=Date.now();const keys=new ProjectKeys(db,{now:()=>now});
 try{
  const created=keys.create(p,input);assert.match(created.secret,/^ovk_[a-f0-9]{64}$/);assert.deepEqual(keys.resolve(created.secret).scopes,['write']);
  const serialized=JSON.stringify({keys:db.prepare('SELECT * FROM project_api_keys').all(),actions:db.prepare('SELECT * FROM project_key_actions').all()});assert.ok(!serialized.includes(created.secret));assert.ok(!JSON.stringify(keys.list(p)).includes('token_hash'));
  const replay=keys.create(p,input);assert.equal(replay.key.id,created.key.id);assert.equal(replay.secret,null);assert.equal(replay.secretAvailable,false);
  assert.throws(()=>keys.create(p,{...input,label:'Changed'}),e=>e.status===409);
  for(const scopes of [['manage-keys'],[],['read','read']])assert.throws(()=>keys.create(p,{...input,scopes}),e=>e.status===400);
  assert.deepEqual(keys.list({...p,project:'foreign'}),[]);assert.throws(()=>keys.revoke({...p,project:'foreign'},created.key.id,{actionId:'revoke'}),e=>e.status===404);
  const rotated=keys.create(p,{...input,actionId:'rotate-1',graceSeconds:60},{rotateId:created.key.id});assert.ok(keys.resolve(created.secret));assert.ok(keys.resolve(rotated.secret));
  now+=60000;assert.equal(keys.resolve(created.secret),null);assert.equal(keys.list(p).find(key=>key.id===created.key.id).status,'revoked');
  keys.revoke(p,rotated.key.id,{actionId:'revoke-1'});assert.equal(keys.resolve(rotated.secret),null);assert.equal(keys.revoke(p,rotated.key.id,{actionId:'revoke-1'}).status,'duplicate');
  const expiry=keys.create(p,{...input,actionId:'expiry'});now+=86400000;assert.equal(keys.resolve(expiry.secret),null);assert.equal(keys.list(p).find(key=>key.id===expiry.key.id).status,'expired');
 }finally{db.close();}
});
test('key storage survives restart with original hashes and action identities',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ov-keys-')),file=path.join(dir,'keys.sqlite');let db=new DatabaseSync(file);
 try{let keys=new ProjectKeys(db);const created=keys.create(p,input);db.close();db=new DatabaseSync(file);keys=new ProjectKeys(db);assert.equal(keys.resolve(created.secret).keyId,created.key.id);assert.equal(keys.create(p,input).secret,null);keys.revoke(p,created.key.id,{actionId:'revoke'});assert.equal(keys.resolve(created.secret),null);}
 finally{db.close();for(const name of ['keys.sqlite','keys.sqlite-wal','keys.sqlite-shm'])fs.rmSync(path.join(dir,name),{force:true});fs.rmdirSync(dir);}
});
test('key mutations recheck session and authority after a delayed body upload',async()=>{
 const http=require('node:http'),{WorkspaceAuth}=require('./auth.cjs');
 const store=new GovernanceStore(':memory:'),user={id:'owner',email:'owner@example.test',passwordHash:passwordHash('synthetic-password'),workspaces:[{id:'w',name:'Workspace',tenant:'t',project:'p',role:'workspace-admin'}]},auth=new WorkspaceAuth(store.db,[user]);
 let observed;const originalPrincipal=auth.principal.bind(auth);auth.principal=(...args)=>{const result=originalPrincipal(...args);observed?.();observed=null;return result;};
 const server=createServer(store,[],[user],store.db,{}, {auth});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 async function delayed(path,token,body,change){
  const encoded=JSON.stringify(body);let started;const principalRead=new Promise(r=>started=r);observed=started;
  const result=new Promise((resolve,reject)=>{
   const request=http.request(origin+path,{method:'POST',headers:{'content-type':'application/json','x-workspace-session':token,'x-workspace-id':'w'}},response=>{let data='';response.on('data',chunk=>data+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(data)}));});
   request.on('error',reject);request.setTimeout(3000,()=>request.destroy(Error('Synthetic delayed upload timed out')));
   request.flushHeaders();request.write(encoded.slice(0,-1));
   principalRead.then(()=>{change();request.end(encoded.slice(-1));}).catch(reject);
  });return result;
 }
 try{
  let session=await auth.login(user.email,'synthetic-password');
  const denied=await delayed('/v1/keys',session.token,input,()=>user.workspaces[0].role='reader');assert.equal(denied.status,401);assert.equal(store.db.prepare('SELECT count(*) n FROM project_api_keys').get().n,0);
  user.workspaces[0].role='workspace-admin';session=await auth.login(user.email,'synthetic-password');const keys=new ProjectKeys(store.db),existing=keys.create(p,input),before=JSON.stringify(store.db.prepare('SELECT * FROM project_key_actions').all());
  const rotation=await delayed('/v1/keys/'+existing.key.id+'/rotate',session.token,{...input,actionId:'delayed-rotation'},()=>auth.logout(session.token));assert.equal(rotation.status,401);assert.ok(keys.resolve(existing.secret));
  session=await auth.login(user.email,'synthetic-password');const revocation=await delayed('/v1/keys/'+existing.key.id+'/revoke',session.token,{actionId:'delayed-revocation'},()=>user.disabled=true);assert.equal(revocation.status,401);assert.ok(keys.resolve(existing.secret));
  assert.equal(store.db.prepare('SELECT count(*) n FROM project_api_keys').get().n,1);assert.equal(JSON.stringify(store.db.prepare('SELECT * FROM project_key_actions').all()),before);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
test('authenticated key API enforces administration, scope and revocation on subsequent requests',async()=>{
 const store=new GovernanceStore(':memory:'),hash=passwordHash('synthetic-test-password'),users=['workspace-admin','reader','reviewer','governance-admin'].map((role,index)=>({id:'u'+index,email:'u'+index+'@example.test',passwordHash:hash,workspaces:[{id:'w',name:'Workspace',tenant:'t',project:'p',role}]}));
 const credentials=[{tenant:'t',project:'p',token:'x'.repeat(32),scopes:['read','write','manage-keys']}],server=createServer(store,credentials,users);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,{session,bearer,body,workspace='w'}={})=>{const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-workspace-id':workspace,...(session?{'x-workspace-session':session}:{}),...(bearer?{authorization:'Bearer '+bearer}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};};
 try{
  const sessions=[];for(const user of users)sessions.push((await request('/v1/session',{body:{email:user.email,password:'synthetic-test-password'}})).body.token);
  for(const session of sessions.slice(1))assert.equal((await request('/v1/keys',{session})).status,403);
  assert.equal((await request('/v1/keys',{bearer:credentials[0].token})).status,403);
  assert.equal((await request('/v1/keys',{session:sessions[0],workspace:'foreign'})).status,404);
  assert.equal((await request('/v1/keys',{session:sessions[0],body:{...input,tenant:'foreign'}})).status,400);
  const created=await request('/v1/keys',{session:sessions[0],body:{...input,scopes:['read','write']}});assert.equal(created.status,201);
  assert.equal((await request('/v1/keys',{session:sessions[0],body:{...input,scopes:['read','write']}})).body.secret,null);
  const key=created.body;assert.equal((await request('/v1/report',{bearer:key.secret})).status,200);assert.equal((await request('/v1/keys',{bearer:key.secret})).status,403);
  for(const query of ['state=unknown','limit=101','offset=-1','state=active&state=revoked','limit=1&limit=2'])assert.equal((await request('/v1/keys?'+query,{session:sessions[0]})).status,400);
  const page=(await request('/v1/keys?state=active&limit=1&offset=0',{session:sessions[0]})).body;assert.equal(page.total,1);assert.equal(page.limit,1);assert.equal(page.state,'active');assert.equal(page.nextOffset,null);
  const client=new (require('../../sdk/typescript/orvessian-ingest').Client)({baseUrl:origin,token:key.secret,tenant:'t',project:'p'});
  const event=client.buildRun({eventId:'first-event',streamRef:'first-event',sequence:0,occurredAt:new Date().toISOString(),runRef:'run',agentRef:'agent',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',taskClass:'task',status:'completed'});
  assert.equal((await client.submit(event)).status,'accepted');assert.equal((await client.submit(event)).status,'duplicate');
  assert.equal((await request('/v1/events',{bearer:key.secret,body:{...event,tenantRef:'foreign'}})).status,403);assert.equal(store.list({tenant:'t',project:'p'}).total,1);
  assert.equal((await request('/v1/keys/'+key.key.id+'/rotate',{session:sessions[0],body:{...input,actionId:'rotate'}})).status,201);
  credentials.push({tenant:'t',project:'p',token:key.secret,scopes:['read','write']});assert.equal((await request('/v1/report',{bearer:key.secret})).status,401);
  await assert.rejects(client.submit(event),error=>error.status===401);
  const list=(await request('/v1/keys',{session:sessions[0]})).body.keys;assert.equal(list.length,2);assert.ok(list.every(item=>!('secret' in item)&&!('token_hash' in item)));assert.ok(list.find(item=>item.id===key.key.id).lastUsedAt);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
test('customer key gateway enforces same origin, session scope and one-time secret response',async()=>{
 const {workspaceGateway}=await import('../../website/lib/workspace-gateway.js');const store=new GovernanceStore(':memory:'),users=[{id:'owner',email:'owner@example.test',passwordHash:passwordHash('synthetic-password'),workspaces:[{id:'w',name:'Workspace',tenant:'t',project:'p',role:'workspace-admin'}]}],server=createServer(store,[],users);await new Promise(r=>server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${server.address().port}`;
 const request=(action,cookie='',body,id='',origin='http://localhost:3001',workspace='w')=>workspaceGateway(new Request('http://localhost:3001/api/workspace?'+new URLSearchParams({action,workspace,id}),{method:body?'POST':'GET',headers:{cookie,origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),{api});
 try{
  assert.equal((await request('key-create','',input)).status,401);
  const login=await request('session','',{email:users[0].email,password:'synthetic-password'});const cookie=login.headers.get('set-cookie');assert.ok((await login.json()).workspaces[0].canManageKeys);
  assert.equal((await request('key-create',cookie,input,'','https://foreign.example')).status,403);
  assert.equal((await request('keys',cookie,undefined,'','http://localhost:3001','foreign')).status,404);
  const response=await request('key-create',cookie,input);assert.equal(response.status,201);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('set-cookie'),null);const created=await response.json();assert.ok(created.secret);
  const replay=await request('key-create',cookie,input);assert.equal((await replay.json()).secret,null);
  const list=await request('keys',cookie);assert.ok(!(await list.text()).includes(created.secret));
  const filtered=await workspaceGateway(new Request('http://localhost:3001/api/workspace?action=keys&workspace=w&state=active&limit=1&offset=1',{headers:{cookie}}),{api});const filteredPage=await filtered.json();assert.equal(filteredPage.total,1);assert.equal(filteredPage.offset,1);assert.equal(filteredPage.keys.length,0);assert.equal(filteredPage.state,'active');
  assert.equal((await workspaceGateway(new Request('http://localhost:3001/api/workspace?action=keys&workspace=w&state=active&state=revoked',{headers:{cookie}}),{api})).status,400);
  const rotation=await request('key-rotate',cookie,{...input,actionId:'rotation',graceSeconds:0},created.key.id);assert.equal(rotation.status,201);const replacement=await rotation.json();assert.notEqual(replacement.secret,created.secret);
  const revoked=await request('key-revoke',cookie,{actionId:'revocation'},replacement.key.id);assert.equal(revoked.status,200);assert.equal((await revoked.json()).key.status,'revoked');
 }finally{await new Promise(r=>server.close(r));store.close();}
});
