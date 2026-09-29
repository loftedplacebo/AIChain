const test=require('node:test'),assert=require('node:assert/strict');
const {GovernanceStore}=require('./store');
const {WorkspaceAuth,passwordHash}=require('./auth.cjs');
const {createServer}=require('./server.cjs');
const fixture=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
const hash=passwordHash('test-password-only-123');
const users=[{id:'alice',email:'alice@example.test',passwordHash:hash,workspaces:[{id:'a',name:'A',tenant:'org-demo',project:'claims-governance-demo'}]},{id:'bob',email:'bob@example.test',passwordHash:hash,workspaces:[{id:'b',name:'B',tenant:'other',project:'other'}]}];
test('sessions expire, rotate, revoke on membership changes and never store bearer values',async()=>{
 const store=new GovernanceStore(':memory:');let now=1000000;const configured=structuredClone(users),auth=new WorkspaceAuth(store.db,configured,()=>now);
 try{const a=await auth.login(users[0].email,'test-password-only-123');assert.equal(auth.resolve(a.token).id,'alice');assert.notEqual(store.db.prepare('SELECT hash FROM workspace_sessions').get().hash,a.token);
 const b=await auth.login(users[0].email,'test-password-only-123',a.token);assert.equal(auth.resolve(a.token),null);
 configured[0].workspaces=[];assert.equal(auth.resolve(b.token),null);configured[0].workspaces=users[0].workspaces;
 const c=await auth.login(users[0].email,'test-password-only-123');now+=1800000;assert.equal(auth.resolve(c.token),null);
 const d=await auth.login(users[0].email,'test-password-only-123');auth.logout(d.token);assert.equal(auth.resolve(d.token),null);
 await assert.rejects(auth.login('missing@example.test','wrong'),e=>e.status===401);
 }finally{store.close();}
});
test('live gateway login, private reads, reports, exports and logout enforce workspace boundaries',async()=>{
 const {workspaceGateway}=await import('../../website/lib/workspace-gateway.js');
 const store=new GovernanceStore(':memory:');const principal={tenant:'org-demo',project:'claims-governance-demo'};
 for(const e of fixture.events)store.ingest(e,principal);
 store.ingest({...fixture.events[0],tenantRef:'other',projectRef:'other',eventId:'bob-only'}, {tenant:'other',project:'other'});
 const server=createServer(store,[],users);await new Promise(r=>server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${server.address().port}`;
 const request=(query,cookie='',method='GET',body,origin='http://localhost:3001')=>workspaceGateway(new Request('http://localhost:3001/api/workspace?'+query,{method,headers:{cookie,origin,'content-type':'application/json'},body:body&&JSON.stringify(body)}),{api});
 try{
  assert.equal((await request('action=report&workspace=a')).status,401);
  assert.equal((await request('action=session','','POST',{email:users[0].email,password:'test-password-only-123'},'https://attacker.test')).status,403);
  const login=await request('action=session','','POST',{email:users[0].email,password:'test-password-only-123'});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);const identity=await login.json();assert.equal(identity.token,undefined);assert.deepEqual(identity.workspaces,[{id:'a',name:'A'}]);
  const token=cookie.split(';')[0].split('=')[1];
  const write=await fetch(api+'/v1/events',{method:'POST',headers:{'x-workspace-session':token,'x-workspace-id':'a','content-type':'application/json'},body:JSON.stringify(fixture.events[0])});assert.equal(write.status,403);
  assert.equal((await request('action=report&workspace=a','workspace_session='+'f'.repeat(64))).status,401);
  assert.equal((await request('action=events&workspace=b',cookie)).status,404);
  const listing=await request('action=events&workspace=a&tenant=other&project=other',cookie);assert.equal(listing.status,200);assert.equal((await listing.json()).total,182);
  assert.equal((await request('action=event&workspace=a&id=bob-only',cookie)).status,404);
  assert.equal((await (await request('action=events&workspace=a&q=bob-only',cookie)).json()).total,0);
  assert.equal((await (await request('action=events&workspace=a&q='+fixture.events[0].eventId,cookie)).json()).total,1);
  const report=await request('action=report&workspace=a',cookie);assert.equal((await report.json()).kpis.runs,60);
  const exported=await request('action=export&workspace=a',cookie);assert.match(exported.headers.get('content-disposition'),/attachment/);assert.equal((await exported.json()).eventCount,182);assert.match(exported.headers.get('cache-control'),/no-store/);
  assert.equal((await request('action=export&workspace=b',cookie)).status,404);
  assert.equal((await request('action=events&workspace=a',cookie,'POST',{})).status,405);
  assert.equal((await request('action=session',cookie,'DELETE')).status,200);assert.equal((await request('action=report&workspace=a',cookie)).status,401);
  const bob=await request('action=session','','POST',{email:users[1].email,password:'test-password-only-123'}),bc=bob.headers.get('set-cookie');
  assert.equal((await request('action=events&workspace=a',bc)).status,404);assert.equal((await (await request('action=events&workspace=b',bc)).json()).total,1);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
test('secure gateway cookies and upstream redirects fail closed',async()=>{
 const {workspaceGateway}=await import('../../website/lib/workspace-gateway.js');
 const req=new Request('https://portal.example.test/api/workspace?action=session',{method:'POST',headers:{origin:'https://portal.example.test','content-type':'application/json'},body:'{}'});
 const response=await workspaceGateway(req,{origin:'https://portal.example.test',api:'https://private.example.test'},async()=>Response.json({token:'a'.repeat(64),user:{id:'test'}}));
 assert.match(response.headers.get('set-cookie'),/__Host-workspace_session/);assert.match(response.headers.get('set-cookie'),/; Secure/);
 const redirected=await workspaceGateway(new Request('http://localhost:3001/api/workspace'),{},async(_url,options)=>{assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://attacker.test'}});});assert.equal(redirected.status,503);
});
test('login throttling persists and does not reveal account existence',async()=>{
 const store=new GovernanceStore(':memory:');try{const auth=new WorkspaceAuth(store.db,users);store.db.prepare('INSERT INTO workspace_login_limits VALUES(?,?,?)').run(require('node:crypto').createHash('sha256').update(users[0].email).digest('hex'),Date.now(),10);
 await assert.rejects(auth.login(users[0].email,'test-password-only-123'),e=>e.status===429);
 }finally{store.close();}
});
