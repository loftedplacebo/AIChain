'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const digest=v=>createHash('sha256').update(v).digest('hex');
function fixture(){
 const store=new(require('./store').GovernanceStore)(':memory:'),directory=new(require('./customer-directory.cjs').CustomerDirectory)(store.db);let now=Date.now();const auth=new(require('./auth.cjs').WorkspaceAuth)(store.db,[],()=>now,directory);
 const alice=directory.verifiedIdentity({provider:'workos:client_test',subject:'user_alice',email:'alice@example.test',emailVerified:true}),bob=directory.verifiedIdentity({provider:'workos:client_test',subject:'user_bob',email:'bob@example.test',emailVerified:true});
 const login=(user,sid)=>auth.loginVerified(user.id,'',{expiresAt:now+900000,providerSessionId:sid,authenticatedAt:now});
 return {store,directory,auth,alice,bob,login,advance:ms=>now+=ms};
}
test('customer session inventory is scoped, has opaque refs and atomically removes another session plus refresh/claim state',()=>{
 const f=fixture();try{
  const current=f.login(f.alice,'session_current'),other=f.login(f.alice,'session_other'),foreign=f.login(f.bob,'session_foreign'),h=digest(other.token);f.store.db.prepare('INSERT INTO workspace_provider_refresh VALUES(?,?)').run(h,'synthetic-encrypted');f.store.db.prepare('INSERT INTO workspace_refresh_claims VALUES(?,?,?)').run(h,'synthetic-lease',Date.now()+60000);
  const list=f.auth.accountSessions(current.token);assert.equal(list.sessions.length,2);assert.equal(list.sessions.filter(s=>s.current).length,1);const target=list.sessions.find(s=>!s.current),text=JSON.stringify(list);
  for(const secret of [other.token,current.token,foreign.token,h,'session_other','synthetic-encrypted','synthetic-lease','alice@example.test'])assert.ok(!text.includes(secret));
  const bobRef=f.auth.accountSessions(foreign.token).sessions[0].ref;assert.throws(()=>f.auth.accountSessions(current.token,bobRef),e=>e.status===404);assert.ok(f.auth.resolve(foreign.token));
  assert.throws(()=>f.auth.accountSessions(current.token,list.sessions.find(s=>s.current).ref),e=>e.status===400);
  assert.equal(f.auth.accountSessions(current.token,target.ref).ended,true);assert.equal(f.auth.resolve(other.token),null);assert.ok(f.auth.resolve(current.token));for(const table of ['workspace_provider_refresh','workspace_refresh_claims','workspace_active_auth','workspace_provider_sessions'])assert.equal(f.store.db.prepare('SELECT count(*) n FROM '+table+' WHERE hash=?').get(h).n,0);
  assert.throws(()=>f.auth.accountSessions(current.token,target.ref),e=>e.status===404);
 }finally{f.store.close();}
});
test('recent authentication is required for deletion and customer session cap is atomic',()=>{
 const f=fixture();try{
  const current=f.login(f.alice,'session_current'),other=f.login(f.alice,'session_other'),target=f.auth.accountSessions(current.token).sessions.find(s=>!s.current).ref;f.advance(301000);
  assert.equal(f.auth.accountSessions(current.token).sessions.length,2);assert.throws(()=>f.auth.accountSessions(current.token,target),e=>e.status===403&&e.code==='reauthentication-required');assert.ok(f.auth.resolve(other.token));
  for(let n=2;n<20;n++)f.login(f.alice,'session_cap'+n);assert.throws(()=>f.login(f.alice,'session_overcap'),e=>e.status===429);assert.equal(f.store.db.prepare('SELECT count(*) n FROM workspace_sessions WHERE user_id=?').get(f.alice.id).n,20);
 }finally{f.store.close();}
});
test('HTTP session operations reject bearer/foreign references and recheck freshness after body receipt',async()=>{
 const f=fixture(),current=f.login(f.alice,'session_current'),other=f.login(f.alice,'session_other'),server=require('./server.cjs').createServer(f.store,[],[],f.store.db,{}, {directory:f.directory,auth:f.auth});await new Promise(r=>server.listen(0,'127.0.0.1',r));const api='http://127.0.0.1:'+server.address().port,headers={'x-workspace-session':current.token,'content-type':'application/json'};
 try{
  assert.equal((await fetch(api+'/v1/account/sessions')).status,401);assert.equal((await fetch(api+'/v1/account/sessions',{headers:{Authorization:'Bearer '+current.token}})).status,401);
  const response=await fetch(api+'/v1/account/sessions',{headers});assert.equal(response.status,200);const target=(await response.json()).sessions.find(s=>!s.current).ref;
  const denied=await fetch(api+'/v1/account/sessions/revoke',{method:'POST',headers,body:JSON.stringify({ref:target,actor:'foreign'})});assert.equal(denied.status,400);assert.ok(f.auth.resolve(other.token));
  f.advance(301000);const stale=await fetch(api+'/v1/account/sessions/revoke',{method:'POST',headers,body:JSON.stringify({ref:target})});assert.equal(stale.status,403);assert.equal((await stale.json()).code,'reauthentication-required');assert.ok(f.auth.resolve(other.token));
 }finally{await new Promise(r=>server.close(r));f.store.close();}
});
