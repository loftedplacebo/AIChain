const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GovernanceStore}=require('./store'),{createServer}=require('./server.cjs');
const {prepareBatch,inspectEvidence}=require('./evidence.cjs');
async function frameworkIntegration(sdkPath){
 const python=process.env.ORVESSIAN_FRAMEWORK_PYTHON;
 assert.ok(python,'Set ORVESSIAN_FRAMEWORK_PYTHON to the Python environment with requirements-langchain.txt installed');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orvessian-framework-'));
 const store=new GovernanceStore(':memory:');const p={tenant:'framework-tenant',project:'framework-project',token:'synthetic-framework-token-'.repeat(2),scopes:['read','write']};
 const server=createServer(store,[p]);await new Promise(r=>server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${server.address().port}`;
 try{
  const example=path.resolve(__dirname,'../../examples/governance-langgraph.py');
  // Installed mode runs a copied quickstart outside the checkout. No repository
  // SDK path is added, and module provenance is checked below.
  const script=sdkPath?path.join(dir,'quickstart.py'):example;
  if(sdkPath)fs.copyFileSync(example,script);
  const result=await new Promise((resolve,reject)=>{const child=spawn(python,[script,'--with-outcome',...(sdkPath?['--installed-sdk']:[])],{cwd:dir,env:{...process.env,...(sdkPath?{PYTHONPATH:sdkPath}:{}),ORVESSIAN_API_URL:api,ORVESSIAN_TOKEN:p.token,ORVESSIAN_TENANT:p.tenant,ORVESSIAN_PROJECT:p.project,ORVESSIAN_QUEUE_PATH:path.join(dir,'queue.sqlite')}});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code?reject(new Error(err)):resolve(JSON.parse(out)));});
  if(sdkPath){assert.equal(result.sdkVersion,'0.1.0a1');for(const file of Object.values(result.sdkModules)){const relative=path.relative(fs.realpathSync(sdkPath),fs.realpathSync(file));assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'SDK must load from installed artifact');}assert.equal(Object.keys(result.sdkModules).length,3);}
  assert.equal(result.acknowledged,2);assert.equal(result.pending,0);
  const event=store.get(p,result.eventId);assert.equal(event.runRef,result.runRef);assert.equal(event.result.status,'completed');
  assert.equal(event.source.integrationVersion,'langchain-python-0.1.0-alpha');
  assert.equal(event.result.predictedLabel,'review');assert.equal(event.caseRef,'synthetic-case-1');
  assert.deepEqual(event.activity.toolCalls,[{toolRef:'case-lookup',version:'v1',resultCode:'completed'}]);
  assert.doesNotMatch(JSON.stringify(event),/synthetic-source-content-not-exported|private_text/);
  assert.equal(store.list(p).total,2);assert.equal(store.get({...p,tenant:'other'},result.eventId),null);
  const registry=await require('./agents.cjs').listAgents(store,p);assert.equal(registry.agents[0].lastEventReceivedAt,event.receivedAt);
  const signer=require('ethers').Wallet.createRandom();await prepareBatch(store,p,signer,{publisher:signer.address,limit:2});
  const saved=store.evidence(p,result.eventId),options={trustedSigners:[signer.address.toLowerCase()]};
  const verified=await inspectEvidence(event,saved,options);assert.equal(verified.state,'batched');assert.equal(verified.recordCommitment,true);assert.equal(verified.batchMembership,true);
  assert.equal((await inspectEvidence({...event,agentRef:'tampered'},saved,options)).state,'invalid-evidence');
  assert.equal((await inspectEvidence({...event,activity:{...event.activity,toolCalls:[{toolRef:'case-lookup',version:'v1',resultCode:'failed'}]}},saved,options)).state,'invalid-evidence');
  const outcome=store.get(p,'review-'+result.runRef);
  assert.equal(outcome.outcome.forEventId,event.eventId);
  assert.equal((await inspectEvidence(outcome,store.evidence(p,outcome.eventId),options)).state,'batched');
  const {buildReport}=require('./report');
  assert.equal(buildReport([event,outcome]).models[0].excluded,1);
  const human={...outcome,outcome:{...outcome.outcome,labelSource:'human-adjudication'}};
  const report=buildReport([event,human]);assert.equal(report.models[0].labelled,1);assert.equal(report.models[0].correct,1);
  assert.equal(report.models[0].accuracy,null);assert.equal(report.models[0].accuracyStatus,'insufficient-sample');
  assert.equal(buildReport([event,{...human,caseRef:'other-case'}]).models[0].excluded,1);
 }finally{
  await new Promise(r=>server.close(r));store.close();
  // Delete only the known files made in this test-owned temporary directory.
  for(const name of ['queue.sqlite','queue.sqlite-wal','queue.sqlite-shm','quickstart.py'])fs.rmSync(path.join(dir,name),{force:true});fs.rmdirSync(dir);
 }
}
test('actual LangGraph to scoped API, durable event and independently checked signature/proof',()=>frameworkIntegration());
test('installed Python wheel quickstart runs outside checkout through real LangGraph/API/signed evidence',{skip:!process.env.ORVESSIAN_WHEEL_TARGET},()=>frameworkIntegration(path.resolve(process.env.ORVESSIAN_WHEEL_TARGET)));
