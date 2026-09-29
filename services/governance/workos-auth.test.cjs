const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {WorkosAuth,workosConfig}=require('./workos-auth.cjs'),{CustomerDirectory}=require('./customer-directory.cjs'),{WorkspaceAuth}=require('./auth.cjs');
const config=workosConfig({GOVERNANCE_IDENTITY_PROVIDER:'workos',WORKOS_CLIENT_ID:'client_test',WORKOS_API_KEY:'sk_synthetic_only',GOVERNANCE_IDENTITY_SEAL_KEY:'ab'.repeat(32),WORKOS_REDIRECT_URI:'http://localhost:3001/api/auth/callback'});
async function fixture({asyncStorage=false,file=':memory:'}={}){
 const jose=await import('jose'),{publicKey,privateKey}=await jose.generateKeyPair('RS256'),jwk=await jose.exportJWK(publicKey);jwk.kid='test-key';
 const db=new DatabaseSync(file);let now=Date.now(),calls=0,exchange=null,responseOverride=null;
 const directory=new CustomerDirectory(db,()=>now),auth=new WorkspaceAuth(db,[],()=>now,directory);
 const token=async(overrides={},key=privateKey)=>new jose.SignJWT({sub:'user_alice',sid:'session_test',iss:'https://api.workos.com/user_management/'+config.clientId,client_id:config.clientId,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+120,auth_time:Math.floor(now/1000),...overrides}).setProtectedHeader({alg:'RS256',kid:'test-key'}).sign(key);
 const delayed=target=>new Proxy(target,{get(object,key){const value=object[key];return typeof value==='function'?async(...args)=>{await require('node:timers/promises').setImmediate();return value.apply(object,args);}:value;}});
 const provider=new WorkosAuth(db,asyncStorage?delayed(directory):directory,asyncStorage?delayed(auth):auth,config,{now:()=>now,keySet:jose.createLocalJWKSet({keys:[jwk]}),fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.workos.com/user_management/authenticate');exchange=JSON.parse(options.body);return Response.json(responseOverride||{user:{id:'user_alice',email:'alice@example.test',email_verified:true},access_token:await token(),refresh_token:'not-retained'});}});
 const browser='cd'.repeat(32),start=async()=>{const url=new URL((await provider.start({browser})).url);return {state:url.searchParams.get('state'),browser,code:'synthetic-code',url};};
 return {db,auth,directory,provider,token,start,browser,get calls(){return calls;},get exchange(){return exchange;},advance(ms){now+=ms;},response(value){responseOverride=value;},close(){db.close();}};
}
test('WorkOS configuration is opt-in, complete and restricts redirect destinations',()=>{
 assert.equal(workosConfig({}),null);assert.throws(()=>workosConfig({GOVERNANCE_IDENTITY_PROVIDER:'unknown'}),/provider/);
 const env={GOVERNANCE_IDENTITY_PROVIDER:'workos',WORKOS_CLIENT_ID:config.clientId,WORKOS_API_KEY:config.apiKey,GOVERNANCE_IDENTITY_SEAL_KEY:'ab'.repeat(32)};
 for(const WORKOS_REDIRECT_URI of ['http://evil.test/api/auth/callback','https://example.test/other','https://user@example.test/api/auth/callback','https://example.test/api/auth/callback?next=evil'])assert.throws(()=>workosConfig({...env,WORKOS_REDIRECT_URI}));
 const hosted={...env,WORKOS_REDIRECT_URI:'https://example.test/api/auth/callback'};
 assert.throws(()=>workosConfig(hosted),/pilot admission list/);
 assert.deepEqual([...workosConfig({...hosted,WORKOS_PILOT_ALLOWED_EMAILS:' Alice@Example.test, bob@example.test '}).allowedEmails],['alice@example.test','bob@example.test']);
 for(const list of ['', 'alice@example.test,ALICE@example.test','*@example.test','alice@example.test,','not-an-email'])assert.throws(()=>workosConfig({...hosted,WORKOS_PILOT_ALLOWED_EMAILS:list}),/pilot admission list/);
});

test('pilot admission denies unknown verified accounts before identity or session creation',async()=>{
 const f=await fixture();try{
  f.provider.config={...config,allowedEmails:new Set(['partner@example.test'])};
  await assert.rejects(f.provider.callback(await f.start()),e=>e.status===403);
  assert.equal(f.db.prepare('SELECT count(*) n FROM customer_identities').get().n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_sessions').get().n,0);
  f.provider.config={...config,allowedEmails:new Set(['alice@example.test'])};
  const session=await f.provider.callback(await f.start());assert.ok(await f.provider.resolve(session.token));
  f.provider.config={...config,allowedEmails:new Set(['partner@example.test'])};
  assert.deepEqual(await Promise.all(Array.from({length:8},()=>f.provider.resolve(session.token))),Array(8).fill(null));
  assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_sessions').get().n,0);
 }finally{f.close();}
});

test('pilot admission rejects a changed provider email during renewal',async()=>{
 const f=await fixture();try{
  f.provider.config={...config,allowedEmails:new Set(['alice@example.test'])};
  const session=await f.provider.callback(await f.start());f.advance(100000);
  f.response({user:{id:'user_alice',email:'other@example.test',email_verified:true},access_token:await f.token(),refresh_token:'replacement-secret'});
  assert.equal(await f.provider.resolve(session.token),null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_sessions').get().n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_provider_refresh').get().n,0);
 }finally{f.close();}
});

test('start admission rejects excess before creating flow state but preserves a prior callback',async()=>{
 const f=await fixture();try{
  let checks=0;f.provider.startRequestLimits={consume:async client=>{assert.equal(client,config.clientId);return ++checks===1?{allowed:true}:{allowed:false,retryAfter:30};}};
  await assert.rejects(f.provider.start({browser:'invalid'}),e=>e.status===400);assert.equal(checks,0);
  const flow=await f.start(),before=f.db.prepare('SELECT count(*) n FROM workspace_auth_flows').get().n;
  await assert.rejects(f.provider.start({browser:'ef'.repeat(32),screen:'sign-up'}),e=>e.status===429&&e.code==='auth-start-limit'&&e.retryAfter===30);assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_auth_flows').get().n,before);assert.equal(f.calls,0);
  const result=await f.provider.callback(flow);assert.ok(await f.auth.resolve(result.token));assert.equal(checks,2);assert.equal(f.calls,1);
 }finally{f.close();}
});
test('encrypted refresh rotates once for concurrent requests and preserves session deadlines',async()=>{
 const f=await fixture();try{
  const session=await f.provider.callback(await f.start()),sessionHash=require('node:crypto').createHash('sha256').update(session.token).digest('hex');
  const original=f.db.prepare('SELECT * FROM workspace_sessions').get(),stored=f.db.prepare('SELECT credential FROM workspace_provider_refresh').get().credential;
  assert.equal(stored.includes('not-retained'),false);assert.throws(()=>f.provider.unseal(stored,'refresh:foreign'));
  f.advance(100000);f.response({user:{id:'user_alice',email:'alice@example.test',email_verified:true},access_token:await f.token(),refresh_token:'replacement-secret'});
  const users=await Promise.all(Array.from({length:12},()=>f.provider.resolve(session.token)));assert.ok(users.every(u=>u.id===session.user.id));assert.equal(f.calls,2);assert.equal(f.exchange.grant_type,'refresh_token');assert.equal(f.exchange.refresh_token,'not-retained');
  const rotated=f.db.prepare('SELECT credential FROM workspace_provider_refresh').get().credential;assert.notEqual(rotated,stored);assert.equal(f.provider.unseal(rotated,'refresh:'+sessionHash),'replacement-secret');assert.equal(f.db.prepare('SELECT created FROM workspace_sessions').get().created,original.created);
  f.advance(1800000);assert.equal(await f.provider.resolve(session.token),null);assert.equal(f.calls,2);assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_provider_refresh').get().n,0);
 }finally{f.close();}
});
test('revocation tombstones arriving before callback deny a later provider session',async()=>{
 const f=await fixture();try{
  f.provider.sessions.revocations.apply(config.clientId,{eventId:'event_early',sessionId:'session_test',subject:'user_alice',digest:'ab'.repeat(32)},Date.now());
  await assert.rejects(f.provider.callback(await f.start()),e=>e.status===401);
  assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_sessions').get().n,0);
 }finally{f.close();}
});
test('refresh never advances active-authentication freshness; same-customer reauthentication rotates the app session',async()=>{
 const f=await fixture();try{
  const session=await f.provider.callback(await f.start()),authenticatedAt=f.db.prepare('SELECT authenticated_at FROM workspace_active_auth').get().authenticated_at;
  assert.doesNotThrow(()=>f.auth.requireRecent(session.token));
  for(let i=0;i<3;i++){f.advance(100000);assert.ok(await f.provider.resolve(session.token));}
  assert.equal(f.db.prepare('SELECT authenticated_at FROM workspace_active_auth').get().authenticated_at,authenticatedAt);
  assert.throws(()=>f.auth.requireRecent(session.token),e=>e.status===403);
  const url=new URL((await f.provider.start({browser:f.browser,reauthenticate:true},session.token)).url);assert.equal(url.searchParams.get('max_age'),'0');
  const renewed=await f.provider.callback({browser:f.browser,state:url.searchParams.get('state'),code:'synthetic'});assert.equal(renewed.reauthenticated,true);assert.notEqual(renewed.token,session.token);assert.equal(f.auth.resolve(session.token),null);assert.doesNotThrow(()=>f.auth.requireRecent(renewed.token));
 }finally{f.close();}
});
test('reauthentication rejects stale active claims, swapped users and unauthenticated starts',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.provider.start({browser:f.browser,reauthenticate:true}),e=>e.status===401);
  const session=await f.provider.callback(await f.start());f.advance(100000);assert.ok(await f.provider.resolve(session.token));
  for(const mode of ['stale','user']){
   const url=new URL((await f.provider.start({browser:f.browser,reauthenticate:true},session.token)).url);
   f.response({user:{id:mode==='user'?'user_other':'user_alice',email:'alice@example.test',email_verified:true},access_token:await f.token(mode==='user'?{sub:'user_other'}:{auth_time:Math.floor(f.provider.now()/1000)-301}),refresh_token:'synthetic'});
   await assert.rejects(f.provider.callback({browser:f.browser,state:url.searchParams.get('state'),code:'synthetic'}),e=>e.status===401);
  }
  assert.equal(f.db.prepare('SELECT count(*) n FROM customer_identities').get().n,1);assert.ok(f.auth.resolve(session.token));
 }finally{f.close();}
});
test('hosted customer key and membership writes require recent sign-in while reads remain available',async()=>{
 const f=await fixture(),store=new (require('./store').GovernanceStore)(':memory:');
 const server=require('./server.cjs').createServer(store,[],[],f.db,{}, {directory:f.directory,auth:f.auth,workosConfig:config,workosOptions:{now:f.provider.now,keySet:f.provider.keySet,fetcher:f.provider.fetcher}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const api='http://127.0.0.1:'+server.address().port;
 try{
  const session=await f.provider.callback(await f.start()),workspace=f.directory.createWorkspace(session.user.id,{actionId:'workspace',name:'Customer',projectName:'Governance'}),headers={'content-type':'application/json','x-workspace-session':session.token,'x-workspace-id':workspace.projectId};
  assert.equal((await fetch(api+'/v1/keys',{method:'POST',headers,body:JSON.stringify({actionId:'fresh-key',label:'Recorder',scopes:['write']})})).status,201);
  for(let i=0;i<3;i++){f.advance(100000);assert.ok(await f.provider.resolve(session.token));}
  assert.equal((await fetch(api+'/v1/keys',{headers})).status,200);
  const denied=await fetch(api+'/v1/keys',{method:'POST',headers,body:JSON.stringify({actionId:'stale-key',label:'Denied',scopes:['write']})});assert.equal(denied.status,403);assert.equal((await denied.json()).code,'reauthentication-required');
  assert.equal((await fetch(api+'/v1/workspaces/'+workspace.workspaceId+'/members',{method:'POST',headers,body:JSON.stringify({actionId:'stale-owner',userId:session.user.id,role:null})})).status,403);
  assert.equal(f.db.prepare('SELECT count(*) n FROM project_api_keys').get().n,1);
 }finally{await new Promise(r=>server.close(r));store.close();f.close();}
});

test('key upload crossing active-authentication deadline is rejected before persistence',async()=>{
 const f=await fixture(),store=new (require('./store').GovernanceStore)(':memory:'),http=require('node:http');let seen;
 const principal=f.auth.principal.bind(f.auth);f.auth.principal=(...args)=>{const result=principal(...args);seen?.();seen=null;return result;};
 const server=require('./server.cjs').createServer(store,[],[],f.db,{}, {directory:f.directory,auth:f.auth,workosConfig:config,workosOptions:{now:f.provider.now,keySet:f.provider.keySet,fetcher:f.provider.fetcher}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const session=await f.provider.callback(await f.start()),workspace=f.directory.createWorkspace(session.user.id,{actionId:'workspace',name:'Upload customer',projectName:'Governance'}),api='http://127.0.0.1:'+server.address().port;
  let started;const checked=new Promise(r=>started=r);seen=started;
  const body=JSON.stringify({actionId:'upload-deadline',label:'Denied',scopes:['write']});
  const result=await new Promise((resolve,reject)=>{
   const request=http.request(api+'/v1/keys',{method:'POST',headers:{'content-type':'application/json','x-workspace-session':session.token,'x-workspace-id':workspace.projectId}},response=>{let bytes='';response.on('data',chunk=>bytes+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(bytes)}));});
   request.on('error',reject);request.setTimeout(3000,()=>request.destroy(Error('Synthetic upload timed out')));request.flushHeaders();request.write(body.slice(0,-1));checked.then(()=>{f.advance(300000);request.end(body.slice(-1));}).catch(reject);
  });
  assert.equal(result.status,403);assert.equal(result.body.code,'reauthentication-required');assert.equal(f.db.prepare('SELECT count(*) n FROM project_api_keys').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM project_key_actions').get().n,0);
  assert.equal((await fetch(api+'/v1/keys',{headers:{'x-workspace-session':session.token,'x-workspace-id':workspace.projectId}})).status,200);
 }finally{await new Promise(r=>server.close(r));store.close();f.close();}
});

test('workspace and invitation uploads recheck active authentication before directory writes',async()=>{
 for(const operation of ['workspace','member','invitation']){
  const f=await fixture(),store=new (require('./store').GovernanceStore)(':memory:'),http=require('node:http');let seen;
  const recent=f.auth.requireRecent.bind(f.auth);f.auth.requireRecent=(...args)=>{const result=recent(...args);seen?.();seen=null;return result;};
  const server=require('./server.cjs').createServer(store,[],[],f.db,{}, {directory:f.directory,auth:f.auth,workosConfig:config,workosOptions:{now:f.provider.now,keySet:f.provider.keySet,fetcher:f.provider.fetcher}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
   const session=await f.provider.callback(await f.start()),workspace=f.directory.createWorkspace(session.user.id,{actionId:'workspace',name:'Upload customer',projectName:'Governance'});
   let path='/v1/workspaces',input={actionId:'blocked-workspace',name:'Blocked',projectName:'Blocked'};
   if(operation==='member'){path+='/'+workspace.workspaceId+'/members';input={actionId:'blocked-member',userId:session.user.id,role:null};}
   if(operation==='invitation'){const invitation=f.directory.invite(session.user.id,workspace.workspaceId,{actionId:'invite-self',email:session.user.email,role:'reader'});path='/v1/invitations/accept';input={actionId:'blocked-accept',secret:invitation.secret};}
   const before=JSON.stringify(f.db.prepare('SELECT * FROM customer_actions').all()),body=JSON.stringify(input);let started;const checked=new Promise(r=>started=r);seen=started;
   const result=await new Promise((resolve,reject)=>{
    const request=http.request('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{'content-type':'application/json','x-workspace-session':session.token}},response=>{let bytes='';response.on('data',chunk=>bytes+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(bytes)}));});
    request.on('error',reject);request.setTimeout(3000,()=>request.destroy(Error('Synthetic upload timed out')));request.flushHeaders();request.write(body.slice(0,-1));checked.then(()=>setImmediate(()=>{f.advance(300000);request.end(body.slice(-1));})).catch(reject);
   });
   assert.equal(result.status,403);assert.equal(result.body.code,'reauthentication-required');assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM customer_actions').all()),before);assert.equal(f.db.prepare('SELECT count(*) n FROM customer_workspaces').get().n,1);
  }finally{await new Promise(r=>server.close(r));store.close();f.close();}
 }
});

test('independent SQLite connections coordinate rotating refresh and enforce claim ownership',async()=>{
 const fs=require('node:fs'),path=require('node:path'),dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'orvessian-renewal-')),file=path.join(dir,'sessions.sqlite');
 const f=await fixture({file}),db2=new DatabaseSync(file),directory2=new CustomerDirectory(db2,f.provider.now),auth2=new WorkspaceAuth(db2,[],f.provider.now,directory2);
 const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
 try{
  const session=await f.provider.callback(await f.start()),sessionHash=hash(session.token),originalCreated=f.db.prepare('SELECT created FROM workspace_sessions').get().created;
  f.advance(100000);let release,entered;
  const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r),fetcher=f.provider.fetcher;
  f.provider.fetcher=async(...args)=>{entered();await gate;return fetcher(...args);};
  const second=new WorkosAuth(db2,directory2,auth2,config,{now:f.provider.now,keySet:f.provider.keySet,fetcher:async()=>{throw Error('Second connection must never exchange');}});
  const first=f.provider.resolve(session.token);await started;
  const row=f.db.prepare('SELECT * FROM workspace_sessions').get();
  assert.throws(()=>second.sessions.complete(sessionHash,'foreign-owner',{version:row.version,sessionId:'session_test'},'wrong',f.provider.now()+120000,f.provider.now()),/Session ended/);
  const waiting=second.resolve(session.token);await require('node:timers/promises').setTimeout(75);
  assert.equal(db2.prepare('SELECT count(*) n FROM workspace_sessions').get().n,1);
  release();const users=await Promise.all([first,waiting]);assert.ok(users.every(u=>u?.id===session.user.id));assert.equal(f.calls,2);
  assert.equal(db2.prepare('SELECT count(*) n FROM workspace_refresh_claims').get().n,0);
  assert.equal(db2.prepare('SELECT created FROM workspace_sessions').get().created,originalCreated);
  // An abandoned durable claim expires without replaying the consumed token.
  f.advance(100000);assert.equal(second.sessions.claim(sessionHash,'crashed-owner',f.provider.now()).status,'acquired');
  f.advance(30001);assert.equal(await second.resolve(session.token),null);assert.equal(f.calls,2);
  assert.equal(db2.prepare('SELECT count(*) n FROM workspace_refresh_claims').get().n,0);
 }finally{db2.close();f.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('provider state awaits asynchronous persistence through callback and renewal',async()=>{
 const f=await fixture();try{
  const repository=f.provider.sessions,operations=new Set();
  f.provider.sessions=new Proxy(repository,{get(target,key){const fn=target[key];return typeof fn==='function'?async(...args)=>{await require('node:timers/promises').setImmediate();operations.add(key);return fn.apply(target,args);}:fn;}});
  const session=await f.provider.callback(await f.start());f.advance(100000);
  assert.ok(await f.provider.resolve(session.token));assert.equal(f.calls,2);
  assert.deepEqual([...operations].sort(),['claim','complete','consumeFlow','createFlow','read','storeCredential','subject']);
 }finally{f.close();}
});
test('uncertain exchange, revoked session and invalid refresh identity never resurrect access',async()=>{
 for(const mode of ['timeout','logout','identity','session','missing-refresh']){
  const f=await fixture();try{
   const session=await f.provider.callback(await f.start());f.advance(100000);const original=f.provider.fetcher;
   f.provider.fetcher=async(...args)=>{if(mode==='timeout')throw Error('Network uncertain');if(mode==='logout')f.auth.logout(session.token);return original(...args);};
   f.response({user:{id:'user_alice',email:'alice@example.test',email_verified:true},access_token:await f.token(mode==='identity'?{sub:'user_other'}:mode==='session'?{sid:'session_other'}:{}),...(mode!=='missing-refresh'?{refresh_token:'replacement'}:{})});
   assert.equal(await f.provider.resolve(session.token),null);assert.equal(f.auth.resolve(session.token),null);assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_provider_refresh').get().n,0);
  }finally{f.close();}
 }
});
test('restart renews encrypted credentials but consumed credentials and absolute deadline fail closed',async()=>{
 for(const mode of ['restart','consumed','absolute']){
  const f=await fixture();try{
   const session=await f.provider.callback(await f.start());f.advance(100000);
   f.response({user:{id:'user_alice',email:'alice@example.test',email_verified:true},access_token:await f.token(),refresh_token:'replacement'});
   if(mode==='consumed')f.db.exec('UPDATE workspace_provider_refresh SET credential=NULL');
   if(mode==='absolute')f.db.prepare('UPDATE workspace_sessions SET created=created-?,touched=?').run(28800000,Date.now()+100000);
   const restarted=new WorkosAuth(f.db,f.directory,f.auth,config,{now:f.provider.now,keySet:f.provider.keySet,fetcher:f.provider.fetcher});
   const result=await restarted.resolve(session.token);assert.equal(!!result,mode==='restart');assert.equal(f.calls,mode==='restart'?2:1);
  }finally{f.close();}
 }
});
test('documented WorkOS issuers succeed while other clients and impersonation claims fail closed',async()=>{
 const f=await fixture();try{
  for(const iss of ['https://api.workos.com','https://api.workos.com/user_management/'+config.clientId]){
   f.response({user:{id:'user_alice',email:'alice@example.test',email_verified:true},access_token:await f.token({iss}),refresh_token:'synthetic-refresh'});
   assert.ok(await f.provider.callback(await f.start()));
  }
  for(const overrides of [{iss:'https://api.workos.com/'},{iss:'https://api.workos.com/user_management/client_foreign'},{client_id:'client_foreign'},{act:{sub:'operator@example.test'}}]){
   f.response({user:{id:'user_alice',email:'alice@example.test',email_verified:true},access_token:await f.token(overrides)});
   await assert.rejects(f.provider.callback(await f.start()),e=>e.status===401);
  }
 }finally{f.close();}
});
test('human customer callbacks reject agent/machine profiles and non-user objects before provisioning',async()=>{
 const f=await fixture();try{
  const user={id:'user_alice',email:'alice@example.test',email_verified:true};
  for(const profile of ['ai_agent','machine',null,{},[]]){f.response({user,access_token:await f.token({sub_profile:profile})});await assert.rejects(f.provider.callback(await f.start()),e=>e.status===401);}
  for(const changed of [{...user,id:'agent_reg_synthetic'},{...user,object:'agent'},{...user,id:'user_alice/invalid'}]){f.response({user:changed,access_token:await f.token({sub:changed.id})});await assert.rejects(f.provider.callback(await f.start()),e=>e.status===401);}
  assert.equal(f.db.prepare('SELECT count(*) n FROM customer_identities').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_sessions').get().n,0);
  f.response({user:{...user,object:'user'},access_token:await f.token({sub_profile:'user'}),refresh_token:'synthetic'});assert.ok(await f.provider.callback(await f.start()));
 }finally{f.close();}
});
test('renewal cannot convert a human customer session into an agent session',async()=>{
 const f=await fixture();try{
  const session=await f.provider.callback(await f.start());f.advance(100000);
  f.response({user:{id:'user_alice',email:'alice@example.test',email_verified:true},access_token:await f.token({sub_profile:'ai_agent'}),refresh_token:'synthetic-agent-refresh'});
  assert.equal(await f.provider.resolve(session.token),null);assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_sessions').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_provider_refresh').get().n,0);
 }finally{f.close();}
});
test('browser-bound PKCE callback verifies JWT, creates scoped customer and expires session',async()=>{
 const f=await fixture();try{
  const flow=await f.start();assert.equal(flow.url.searchParams.get('code_challenge_method'),'S256');assert.equal(flow.url.searchParams.get('provider'),'authkit');
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM workspace_auth_flows').all()).includes(flow.state),false);
  await assert.rejects(f.provider.callback({...flow,browser:'ef'.repeat(32)}),e=>e.status===401);assert.equal(f.calls,0);
  const session=await f.provider.callback(flow);assert.equal(session.user.canCreateWorkspace,true);assert.equal(session.user.workspaces.length,0);
  assert.equal(f.exchange.code,flow.code);assert.ok(f.exchange.code_verifier);assert.equal(f.exchange.client_secret,config.apiKey);
  assert.equal(require('node:crypto').createHash('sha256').update(f.exchange.code_verifier).digest('base64url'),flow.url.searchParams.get('code_challenge'));
  assert.ok(f.auth.resolve(session.token));await assert.rejects(f.provider.callback(flow),e=>e.status===401);assert.equal(f.calls,1);
  const stored=JSON.stringify(f.db.prepare('SELECT * FROM workspace_sessions').all());assert.equal(stored.includes(session.token),false);assert.equal(stored.includes('not-retained'),false);
  f.advance(120000);assert.equal(f.auth.resolve(session.token),null);
 }finally{f.close();}
});
test('expired flows and concurrent replay cannot exchange code twice; sign-out supplies fixed provider URL',async()=>{
 const f=await fixture();try{
  const expired=await f.start();f.advance(300000);await assert.rejects(f.provider.callback(expired),e=>e.status===401);assert.equal(f.calls,0);
  const flow=await f.start(),results=await Promise.allSettled([f.provider.callback(flow),f.provider.callback(flow)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls,1);
  const session=results.find(r=>r.status==='fulfilled').value,logout=f.auth.logout(session.token);assert.match(logout.logoutUrl,/^https:\/\/api.workos.com\/user_management\/sessions\/logout\?session_id=session_test$/);assert.equal(f.auth.resolve(session.token),null);
 }finally{f.close();}
});
test('verified WorkOS callback awaits asynchronous identity/session writes and prior-session revocation',async()=>{
 const f=await fixture({asyncStorage:true});try{
  const previousUser=f.directory.verifiedIdentity({provider:'workos:'+config.clientId,subject:'user_alice',email:'alice@example.test',emailVerified:true}),previous=f.auth.loginVerified(previousUser.id);
  const url=new URL((await f.provider.start({browser:f.browser},previous.token)).url),flow={state:url.searchParams.get('state'),browser:f.browser,code:'synthetic-code'};
  const session=await f.provider.callback(flow);assert.equal(session.user.id,previousUser.id);assert.ok(f.auth.resolve(session.token));assert.equal(f.auth.resolve(previous.token),null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_sessions').get().n,1);await assert.rejects(f.provider.callback(flow),e=>e.status===401);assert.equal(f.calls,1);
 }finally{f.close();}
});
test('encrypted PKCE state survives restart and missing provider expiry metadata fails closed',async()=>{
 const f=await fixture();try{
  const flow=await f.start(),stored=f.db.prepare('SELECT * FROM workspace_auth_flows').get();
  assert.notEqual(stored.browser_hash,f.browser);assert.notEqual(stored.state_hash,flow.state);
  const verifier=f.provider.unseal(stored.verifier,stored.state_hash);assert.equal(JSON.stringify(stored).includes(verifier),false);
  assert.throws(()=>f.provider.unseal(stored.verifier,'different-state'));
  const restarted=new WorkosAuth(f.db,f.directory,f.auth,config,{fetcher:f.provider.fetcher,keySet:f.provider.keySet});const session=await restarted.callback(flow);
  f.db.prepare('DELETE FROM workspace_provider_sessions').run();assert.equal(f.auth.resolve(session.token),null);
 }finally{f.close();}
});
test('provider callback fails closed on unverified email, impersonation and wrong JWT identity/issuer/signature',async()=>{
 const f=await fixture();try{
  const goodUser={id:'user_alice',email:'alice@example.test',email_verified:true};
  const otherKey=(await (await import('jose')).generateKeyPair('RS256')).privateKey;
  const responses=[{user:{...goodUser,email_verified:false},access_token:await f.token()}, {user:goodUser,impersonator:{email:'operator@example.test'},access_token:await f.token()},...await Promise.all([{sub:'user_foreign'},{iss:'https://evil.test/'},{exp:1},{aud:'client_foreign'},{iat:Math.floor(Date.now()/1000)+600}].map(async p=>({user:goodUser,access_token:await f.token(p)}))),{user:goodUser,access_token:await f.token({},otherKey)}];
  for(const response of responses){f.response(response);const flow=await f.start();await assert.rejects(f.provider.callback(flow),e=>e.status===401);await assert.rejects(f.provider.callback(flow),e=>e.status===401);}
  assert.equal(f.db.prepare('SELECT count(*) n FROM customer_identities').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_sessions').get().n,0);
 }finally{f.close();}
});
test('real hosted-sign-in gateway binds browser cookies and never returns app tokens in response bodies',async()=>{
 const f=await fixture(),store=new (require('./store').GovernanceStore)(':memory:');
 const server=require('./server.cjs').createServer(store,[],[],f.db,{}, {directory:f.directory,auth:f.auth,workosConfig:config,workosOptions:{now:f.provider.now,keySet:f.provider.keySet,fetcher:f.provider.fetcher}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const api=`http://127.0.0.1:${server.address().port}`,{workosGateway}=await import('../../website/lib/workos-gateway.js');
 // The edge runtime supports follow/manual only. Never follow upstream redirects.
 const edgeFetch=(url,options)=>{assert.equal(options.redirect,'manual');return fetch(url,options);};
 const call=(path,cookie='',headers={})=>workosGateway(new Request('http://localhost:3001'+path,{headers:{cookie,...headers}}),{api},edgeFetch);
 try{
  assert.equal((await (await call('/api/auth/status')).json()).enabled,true);
  assert.equal((await call('/api/auth/start', '',{'sec-fetch-site':'cross-site'})).status,403);
  const start=await call('/api/auth/start?screen=sign-up');assert.equal(start.status,303);const location=new URL(start.headers.get('location')),flowCookie=start.headers.get('set-cookie');assert.match(flowCookie,/HttpOnly; SameSite=Lax/);
  const state=location.searchParams.get('state'),path='/api/auth/callback?'+new URLSearchParams({state,code:'synthetic-code'});
  const missing=await call(path);assert.match(missing.headers.get('location'),/signin=failed/);assert.equal(f.calls,0);
  const callback=await call(path,flowCookie);assert.equal(callback.status,303);assert.equal(await callback.text(),'');assert.equal(callback.headers.get('location'),'http://localhost:3001/workspace');
  assert.match(callback.headers.get('cache-control'),/no-store/);const cookies=callback.headers.getSetCookie();assert.equal(cookies.length,2);assert.ok(cookies.some(c=>c.startsWith('workspace_auth_flow=;')));
  const sessionCookie=cookies.find(c=>c.startsWith('workspace_session='));assert.match(sessionCookie,/HttpOnly; SameSite=Strict; Max-Age=28800/);
  const token=sessionCookie.match(/^workspace_session=([a-f0-9]{64})/)[1];assert.ok(f.auth.resolve(token));
  const replay=await call(path,flowCookie);assert.match(replay.headers.get('location'),/signin=failed/);assert.equal(f.calls,1);
  const session=await fetch(api+'/v1/session',{headers:{'x-workspace-session':token}});assert.equal((await session.json()).canCreateWorkspace,true);
  f.advance(100000);const renewed=await fetch(api+'/v1/session',{headers:{'x-workspace-session':token}});assert.equal(renewed.status,200);assert.equal((await renewed.json()).canCreateWorkspace,true);assert.equal(f.calls,2);assert.equal(f.exchange.grant_type,'refresh_token');
  const reauth=await call('/api/auth/start?screen=sign-in&reauth=1',sessionCookie),reauthUrl=new URL(reauth.headers.get('location'));assert.equal(reauthUrl.searchParams.get('max_age'),'0');
  const reauthenticated=await call('/api/auth/callback?'+new URLSearchParams({state:reauthUrl.searchParams.get('state'),code:'synthetic-code'}),reauth.headers.get('set-cookie'));assert.equal(reauthenticated.headers.get('location'),'http://localhost:3001/workspace?reauthenticated=1');assert.equal(await reauthenticated.text(),'');assert.equal(f.auth.resolve(token),null);
 }finally{await new Promise(r=>server.close(r));store.close();f.close();}
});
test('hosted-sign-in gateway rejects upstream redirects without following them',async()=>{
 const {workosGateway}=await import('../../website/lib/workos-gateway.js');
 let calls=0;const redirect=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://unexpected.example/'}});};
 for(const path of ['/api/auth/status','/api/auth/start']){
  const response=await workosGateway(new Request('http://localhost:3001'+path),{},redirect);
  assert.equal(response.status,503);assert.equal(response.headers.has('location'),false);
 }
 const state='a'.repeat(64),browser='b'.repeat(64);
 const response=await workosGateway(new Request('http://localhost:3001/api/auth/callback?state='+state+'&code=synthetic',{headers:{cookie:'workspace_auth_flow='+browser}}),{},redirect);
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'http://localhost:3001/workspace?signin=failed');assert.equal(calls,3);
});
