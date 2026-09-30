const test=require('node:test'),assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
const {verifiedEvent}=require('./workos-webhook.cjs'),{parseStrictJson,createServer}=require('./server.cjs');
const secret='synthetic-webhook-secret-'.repeat(2),clientId='client_test';
const event=(id='event_test',sid='session_test',subject='user_alice')=>({id,event:'session.revoked',data:{object:'session',id:sid,user_id:subject},context:{client_id:clientId}});
const sign=(body,t=Date.now(),key=secret)=>'t='+t+', v1='+createHmac('sha256',key).update(t+'.'+body).digest('hex');
test('raw-body signatures bind timestamp, client, type, session and provider subject',()=>{
 const now=Date.now(),body=JSON.stringify(event());assert.equal(verifiedEvent(Buffer.from(body),sign(body,now),secret,clientId,parseStrictJson,now).sessionId,'session_test');
 for(const signature of [undefined,'bad',sign(body,now-300001),sign(body,now+300001),sign(body,now,'wrong')])assert.throws(()=>verifiedEvent(Buffer.from(body),signature,secret,clientId,parseStrictJson,now),e=>e.status===401);
 assert.throws(()=>verifiedEvent(Buffer.from(body+' '),sign(body,now),secret,clientId,parseStrictJson,now),e=>e.status===401);
 for(const value of [{...event(),context:{client_id:'client_other'}},{...event(),data:{object:'session',id:'session_test',user_id:'other'}},{...event(),event:'user.deleted'}]){const raw=JSON.stringify(value);assert.throws(()=>verifiedEvent(Buffer.from(raw),sign(raw,now),secret,clientId,parseStrictJson,now));}
});
test('provider-shaped session revocation requires explicit client context',()=>{
 const now=Date.now();
 const providerShape={
  id:'event_01HRZ9WAX5S5ZCBAN96EK8TQBA',event:'session.revoked',
  data:{object:'session',id:'session_01HR8QXN9ET2JP0JFDWHBHMR97',user_id:'user_01HR8QXMH4X8Q46349R6EQAD1D',organization_id:'org_01HR8QX01S2B4JDDMKM1KMQH7E',status:'revoked',auth_method:'password',expires_at:'2024-03-02T19:07:33.155Z'},
  created_at:'2024-03-02T19:07:33.155Z'
 };
 const clientBound={...providerShape,context:{client_id:clientId}};
 const boundBody=JSON.stringify(clientBound);
 assert.equal(verifiedEvent(Buffer.from(boundBody),sign(boundBody,now),secret,clientId,parseStrictJson,now).sessionId,providerShape.data.id);
 const unboundBody=JSON.stringify(providerShape);
 assert.throws(()=>verifiedEvent(Buffer.from(unboundBody),sign(unboundBody,now),secret,clientId,parseStrictJson,now),e=>e.status===400);
});
test('signed HTTP revocation clears access once, preserves unrelated sessions and rejects forged/replayed changes',async()=>{
 const store=new (require('./store').GovernanceStore)(':memory:'),directory=new (require('./customer-directory.cjs').CustomerDirectory)(store.db),auth=new (require('./auth.cjs').WorkspaceAuth)(store.db,[],Date.now,directory);
 const config={clientId,apiKey:'sk_synthetic',sealKey:Buffer.alloc(32,1),redirectUri:'http://localhost:3001/api/auth/callback',webhookSecret:secret};
 const user=directory.verifiedIdentity({provider:'workos:'+clientId,subject:'user_alice',email:'alice@example.test',emailVerified:true});
 const session=auth.loginVerified(user.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_test'}),other=auth.loginVerified(user.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_other'});
 store.db.prepare('INSERT INTO workspace_provider_refresh VALUES(?,?)').run(require('node:crypto').createHash('sha256').update(session.token).digest('hex'),'synthetic-encrypted');
 const server=createServer(store,[],[],store.db,{}, {directory,auth,workosConfig:config});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const call=(value,signature)=>{const body=typeof value==='string'?value:JSON.stringify(value);return fetch(base+'/v1/auth/workos-webhook',{method:'POST',headers:{'content-type':'application/json','workos-signature':signature||sign(body)},body});};
 try{
  assert.equal((await call(event(), 'bad')).status,401);assert.ok(auth.resolve(session.token));
  assert.equal((await call({...event(),context:{client_id:'client_other'}})).status,400);assert.ok(auth.resolve(session.token));
  const responses=await Promise.all(Array.from({length:12},()=>call(event())));assert.ok(responses.every(r=>r.status===200));const results=await Promise.all(responses.map(r=>r.json()));assert.equal(results.filter(r=>r.status==='applied').length,1);assert.equal(auth.resolve(session.token),null);assert.ok(auth.resolve(other.token));
  assert.equal(store.db.prepare('SELECT count(*) n FROM workspace_provider_refresh').get().n,0);assert.equal((await call(event('event_test','session_other'))).status,409);assert.ok(auth.resolve(other.token));
  assert.equal((await call(event('event_early','session_future'))).status,200);assert.throws(()=>auth.loginVerified(user.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_future',clientId,subject:'user_alice'}),e=>e.status===401);
  assert.equal((await fetch(base+'/v1/session',{headers:{'x-workspace-session':session.token}})).status,401);
  const oversized='x'.repeat(65537);assert.equal((await call(oversized)).status,413);
  assert.equal((await fetch(base+'/v1/auth/workos-webhook')).status,405);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
