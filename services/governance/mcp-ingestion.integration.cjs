const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GovernanceStore}=require('./store'),{createServer}=require('./server.cjs');
const {prepareBatch,inspectEvidence}=require('./evidence.cjs');
async function mcpIntegration(stdio=false){
 const python=process.env.ORVESSIAN_MCP_PYTHON;assert.ok(python,'Set ORVESSIAN_MCP_PYTHON with requirements-mcp.txt installed');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orvessian-mcp-')),store=new GovernanceStore(':memory:');
 const p={tenant:'mcp-tenant',project:'mcp-project',token:'synthetic-mcp-token-'.repeat(3),scopes:['read','write']},server=createServer(store,[p]);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const result=await new Promise((resolve,reject)=>{const child=spawn(python,['examples/governance-mcp.py',...(stdio?['--stdio-test']:[])],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,ORVESSIAN_API_URL:`http://127.0.0.1:${server.address().port}`,ORVESSIAN_TOKEN:p.token,ORVESSIAN_TENANT:p.tenant,ORVESSIAN_PROJECT:p.project,ORVESSIAN_QUEUE_PATH:path.join(dir,'queue.sqlite')}});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code?reject(Error(err)):resolve(JSON.parse(out)));});
  assert.equal(result.acknowledged,1);assert.equal(store.report(p).kpis.runs,1);const event=store.get(p,result.eventId);assert.deepEqual(event.activity.toolCalls,[{toolRef:'server-a.lookup',version:'v1',resultCode:'completed'}]);assert.doesNotMatch(JSON.stringify(event),/PRIVATE-MCP-CONTENT/);
  const signer=require('ethers').Wallet.createRandom();await prepareBatch(store,p,signer,{publisher:signer.address,limit:1});assert.equal((await inspectEvidence(event,store.evidence(p,event.eventId),{trustedSigners:[signer.address.toLowerCase()]})).state,'batched');
 }finally{await new Promise(r=>server.close(r));store.close();for(const name of ['queue.sqlite','queue.sqlite-wal','queue.sqlite-shm'])fs.rmSync(path.join(dir,name),{force:true});fs.rmdirSync(dir);}
}
test('real MCP tool metadata joins one agent-root record and its signed evidence',()=>mcpIntegration());
test('real MCP stdio subprocess tool reaches one root record and independently verified signed evidence',()=>mcpIntegration(true));
