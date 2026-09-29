// Explicit, bounded live provider call against an isolated local governance API.
const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const {GovernanceStore}=require('../services/governance/store');
const {createServer}=require('../services/governance/server.cjs');
async function main(){
 if(process.argv[2]!=='--live')throw Error('Pass --live for one bounded provider request');
 const root=path.resolve(__dirname,'..'),runDir=fs.mkdtempSync(path.join(root,'build','provider-smoke-'));
 const store=new GovernanceStore(path.join(runDir,'governance.sqlite'));
 const principal={tenant:'provider-smoke',project:'synthetic-test',token:require('node:crypto').randomBytes(32).toString('hex'),scopes:['read','write']};
 const server=createServer(store,[principal]);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const python=process.env.ORVESSIAN_FRAMEWORK_PYTHON||path.join(root,'build','framework-venv','Scripts','python.exe');
  const result=await new Promise((resolve,reject)=>{const child=spawn(python,['examples/governance-openai.py','--live','--env-file',path.join(root,'build','provider-smoke.env')],{cwd:root,env:{...process.env,ORVESSIAN_API_URL:`http://127.0.0.1:${server.address().port}`,ORVESSIAN_TOKEN:principal.token,ORVESSIAN_TENANT:principal.tenant,ORVESSIAN_PROJECT:principal.project,ORVESSIAN_QUEUE_PATH:path.join(runDir,'queue.sqlite')}});let stdout='';child.stdout.on('data',b=>stdout+=b);child.stderr.resume();child.on('error',()=>reject(Error('Unable to start provider smoke test')));child.on('close',code=>{try{resolve(JSON.parse(stdout));}catch{reject(Error('Invalid smoke result'));}});});
  const event=store.get(principal,result.eventId);if(!event)throw Error('Provider record missing');
  const signer=require('ethers').Wallet.createRandom();const evidence=require('../services/governance/evidence.cjs');
  await evidence.prepareBatch(store,principal,signer,{publisher:signer.address,limit:1});
  const verified=await evidence.inspectEvidence(event,store.evidence(principal,result.eventId),{trustedSigners:[signer.address.toLowerCase()]});
  if(verified.state!=='batched')throw Error('Evidence verification failed');
  const report={...result,verification:verified.state,recordCommitment:verified.recordCommitment,batchMembership:verified.batchMembership,model:event.model.modelRef,decision:event.result.predictedLabel,externalAnchorSubmitted:false};
  fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!result.providerSucceeded)process.exitCode=1;
 }finally{await new Promise(r=>server.close(r));store.close();}
}
main().catch(()=>{console.error('Provider smoke did not complete. Check local key/model configuration; no secret or provider response is logged.');process.exitCode=1;});
