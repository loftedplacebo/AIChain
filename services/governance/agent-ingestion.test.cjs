const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {GovernanceStore}=require('./store'),{createServer}=require('./server.cjs');
const {passwordHash}=require('./auth.cjs');
test('Python client to authenticated API, gateway, durable outbox and signed batch',async()=>{
 const python=process.env.ORVESSIAN_TEST_PYTHON||'python';
 const store=new GovernanceStore(':memory:');const p={tenant:'sdk-tenant',project:'sdk-project',token:'synthetic-test-token-only-'.repeat(2),scopes:['read','write']};
 const users=[{id:'sdk-user',email:'sdk@example.test',passwordHash:passwordHash('synthetic-password-123'),workspaces:[{id:'sdk',name:'SDK',tenant:p.tenant,project:p.project}]}];
 const server=createServer(store,[p],users);await new Promise(r=>server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${server.address().port}`;
 const run=()=>new Promise((resolve,reject)=>{const child=spawn(python,['examples/governance-agent.py'],{cwd:require('node:path').resolve(__dirname,'../..'),env:{...process.env,ORVESSIAN_API_URL:api,ORVESSIAN_TOKEN:p.token,ORVESSIAN_TENANT:p.tenant,ORVESSIAN_PROJECT:p.project}});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code?reject(new Error(err)):resolve(JSON.parse(out)));});
 try{
  const first=await run();assert.equal(first.registry.agents[0].heartbeatStatus,'fresh');assert.ok(first.registry.agents[0].lastEventReceivedAt);
  assert.equal((await run()).submission.status,'duplicate');assert.equal(store.list(p).total,1);
  const {workspaceGateway}=await import('../../website/lib/workspace-gateway.js');
  const request=(query,cookie='',method='GET',body)=>workspaceGateway(new Request('http://localhost:3001/api/workspace?'+query,{method,headers:{cookie,origin:'http://localhost:3001','content-type':'application/json'},body:body&&JSON.stringify(body)}),{api});
  assert.equal((await request('action=agents&workspace=sdk')).status,401);
  const login=await request('action=session','','POST',{email:users[0].email,password:'synthetic-password-123'});const cookie=login.headers.get('set-cookie');
  const registry=await request('action=agents&workspace=sdk&tenant=other',cookie);assert.equal(registry.status,200);assert.equal((await registry.json()).agents.length,1);
  assert.equal((await request('action=agents&workspace=foreign',cookie)).status,404);
  const token=cookie.split(';')[0].split('=')[1];
  assert.equal((await fetch(api+'/v1/agents',{method:'POST',headers:{'x-workspace-session':token,'x-workspace-id':'sdk','content-type':'application/json'},body:'{}'})).status,403);
  const signer=require('ethers').Wallet.createRandom();const batch=await require('./evidence.cjs').prepareBatch(store,p,signer,{publisher:signer.address,limit:1});assert.ok(batch.batchId);
  assert.ok(store.evidence(p,'sdk-example-1').bundle);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
