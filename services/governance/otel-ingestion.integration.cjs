const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GovernanceStore}=require('./store'),{createServer}=require('./server.cjs');
const {prepareBatch,inspectEvidence}=require('./evidence.cjs');
test('actual OpenTelemetry root span reaches scoped API and independently checked signed evidence',async()=>{
 const python=process.env.ORVESSIAN_FRAMEWORK_PYTHON;assert.ok(python,'Set ORVESSIAN_FRAMEWORK_PYTHON with requirements-otel.txt installed');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orvessian-otel-')),store=new GovernanceStore(':memory:');
 const p={tenant:'otel-tenant',project:'otel-project',token:'synthetic-otel-token-'.repeat(3),scopes:['read','write']};
 const server=createServer(store,[p]);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const result=await new Promise((resolve,reject)=>{const child=spawn(python,['examples/governance-otel.py'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,ORVESSIAN_API_URL:`http://127.0.0.1:${server.address().port}`,ORVESSIAN_TOKEN:p.token,ORVESSIAN_TENANT:p.tenant,ORVESSIAN_PROJECT:p.project,ORVESSIAN_QUEUE_PATH:path.join(dir,'queue.sqlite')}});let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);child.on('error',reject);child.on('close',code=>code?reject(Error(errors)):resolve(JSON.parse(output)));});
  assert.equal(result.acknowledged,1);const event=store.get(p,result.eventId);assert.equal(event.source.integrationVersion,'otel-python-1.45.0-alpha');assert.equal(event.result.status,'completed');assert.match(event.runRef,/^trace-[0-9a-f]{32}$/);assert.doesNotMatch(JSON.stringify(event),/PRIVATE-OTEL-CONTENT/);
  assert.equal(store.get({...p,tenant:'foreign'},result.eventId),null);
  const signer=require('ethers').Wallet.createRandom();await prepareBatch(store,p,signer,{publisher:signer.address,limit:1});
  const evidence=store.evidence(p,result.eventId),options={trustedSigners:[signer.address.toLowerCase()]};assert.equal((await inspectEvidence(event,evidence,options)).state,'batched');
  assert.equal((await inspectEvidence({...event,activity:{...event.activity,latencyMs:(event.activity.latencyMs||0)+1}},evidence,options)).state,'invalid-evidence');
 }finally{await new Promise(r=>server.close(r));store.close();for(const name of ['queue.sqlite','queue.sqlite-wal','queue.sqlite-shm'])fs.rmSync(path.join(dir,name),{force:true});fs.rmdirSync(dir);}
});
