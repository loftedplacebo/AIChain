const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {migrate}=require('./postgres-migrate.cjs');
const {PostgresProjectKeys}=require('./postgres-project-keys.cjs');
const {GovernanceStore}=require('./store');
const {createServer}=require('./server.cjs');
const {passwordHash}=require('./auth.cjs');
const p={tenant:'customer-a',project:'project-a',actorId:'owner'},input={actionId:'create',label:'SDK',scopes:['read','write']};
async function setup(){
 const db=new PGlite(),client={query:(sql,args)=>args?db.query(sql,args):db.exec(sql).then(r=>r.at(-1)||{rows:[]}),release(){}},pool={connect:async()=>client,query:client.query,end:()=>db.close()};
 await migrate(pool);
 await db.exec('CREATE ROLE key_app; GRANT USAGE ON SCHEMA public TO key_app; GRANT SELECT ON governance_migrations,governance_environment TO key_app; GRANT SELECT,INSERT,UPDATE ON governance_key_scopes,governance_project_keys,governance_key_actions TO key_app; SET ROLE key_app;');
 let now=Date.now();const keys=new PostgresProjectKeys(pool,{now:()=>now});await keys.ready('test');
 return {keys,db,pool,advance(ms){now+=ms;},close:()=>db.close()};
}
test('PostgreSQL key pagination finds old active credentials and isolates full history',async()=>{
 const s=await setup();try{await require('./key-pagination-checks.cjs')(s.keys,ms=>s.advance(ms));}finally{await s.close();}
});
test('PostgreSQL keys preserve scoped one-time creation, replay, rotation, expiry and revocation',async()=>{
 const s=await setup();try{
  const created=await s.keys.create(p,input);assert.match(created.secret,/^ovk_[a-f0-9]{64}$/);
  assert.equal((await s.keys.resolve(created.secret)).tenant,p.tenant);
  assert.equal((await new PostgresProjectKeys(s.pool).resolve(created.secret)).keyId,created.key.id);
  assert.equal((await s.keys.create(p,input)).secret,null);
  await assert.rejects(s.keys.create(p,{...input,label:'different'}),e=>e.status===409);
  const list=await s.keys.list(p);assert.equal(list.length,1);assert.ok(list[0].lastUsedAt);assert.equal(JSON.stringify(list).includes(created.secret),false);
  assert.equal((await s.keys.list({...p,tenant:'foreign'})).length,0);
  await assert.rejects(s.keys.revoke({...p,project:'foreign'},created.key.id,{actionId:'bad'}),e=>e.status===404);
  const rotated=await s.keys.create(p,{...input,actionId:'rotate',graceSeconds:60},{rotateId:created.key.id});
  assert.ok(await s.keys.resolve(created.secret));s.advance(60001);assert.equal(await s.keys.resolve(created.secret),null);assert.ok(await s.keys.resolve(rotated.secret));
  await s.keys.revoke(p,rotated.key.id,{actionId:'revoke'});assert.equal(await s.keys.resolve(rotated.secret),null);assert.equal((await s.keys.revoke(p,rotated.key.id,{actionId:'revoke'})).status,'duplicate');
  const expires=await s.keys.create(p,{...input,actionId:'expiring',expiresInDays:1});s.advance(86400001);assert.equal(await s.keys.resolve(expires.secret),null);
  assert.equal(await s.keys.resolve('bad'),null);
  await s.pool.query('RESET ROLE');const rows=(await s.pool.query('SELECT token_hash FROM governance_project_keys')).rows;assert.equal(rows.length,3);assert.ok(rows.every(r=>/^[a-f0-9]{64}$/.test(r.token_hash)&&!r.token_hash.includes(created.secret)));
 }finally{await s.close();}
});
test('PostgreSQL key RLS rejects unscoped/foreign writes and startup rejects incomplete privileges',async()=>{
 const s=await setup();try{
  await s.keys.create(p,input);
  for(const table of ['governance_project_keys','governance_key_actions','governance_key_scopes'])assert.equal((await s.pool.query('SELECT * FROM '+table)).rows.length,0);
  await assert.rejects(s.keys.transaction({...p,tenant:'foreign'},c=>c.query("INSERT INTO governance_key_scopes VALUES('customer-a','project-b')")),/row-level security/);
  await assert.rejects(s.keys.ready('dev'),/mismatch/);
  await s.pool.query('RESET ROLE');await assert.rejects(s.keys.ready('test'),/bypass/);
  await s.pool.query('REVOKE INSERT ON governance_key_actions FROM key_app');await s.pool.query('SET ROLE key_app');await assert.rejects(s.keys.ready('test'),/privileges/);
  await s.pool.query('RESET ROLE');await s.pool.query('GRANT INSERT ON governance_key_actions TO key_app');await s.pool.query('SET ROLE key_app');await s.keys.ready('test');
 }finally{await s.close();}
});
test('real HTTP key routes await shared storage and authentication never falls back to legacy keys',async()=>{
 const s=await setup(),store=new GovernanceStore(':memory:');
 const users=[{id:'owner',email:'owner@example.test',passwordHash:passwordHash('synthetic-password'),workspaces:[{id:'workspace',name:'Workspace',tenant:p.tenant,project:p.project,role:'workspace-admin'}]}];
 const server=createServer(store,[],users,store.db,{}, {projectKeys:s.keys});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const call=(url,{body,token,bearer}={})=>fetch(base+url,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{'x-workspace-session':token,'x-workspace-id':'workspace'}:{}),...(bearer?{authorization:'Bearer '+bearer}:{})},body:body?JSON.stringify(body):undefined});
 try{
  const session=await (await call('/v1/session',{body:{email:users[0].email,password:'synthetic-password'}})).json();
  const response=await call('/v1/keys',{token:session.token,body:input});assert.equal(response.status,201);const created=await response.json();
  assert.equal((await call('/v1/events',{bearer:created.secret})).status,200);
  assert.equal((await call('/v1/keys',{bearer:created.secret})).status,403);
  assert.equal((await (await call('/v1/keys',{token:session.token})).json()).keys.length,1);
  assert.equal((await call(`/v1/keys/${created.key.id}/revoke`,{token:session.token,body:{actionId:'revoke'}})).status,200);
  assert.equal((await call('/v1/events',{bearer:created.secret})).status,401);
 }finally{await new Promise(r=>server.close(r));store.close();await s.close();}
});
