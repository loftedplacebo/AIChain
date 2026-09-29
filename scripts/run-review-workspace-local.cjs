// Isolated synthetic review preview. Never deploy these known demo credentials.
const {GovernanceStore}=require('../services/governance/store');
const {createServer}=require('../services/governance/server.cjs');
const {passwordHash}=require('../services/governance/auth.cjs');
const path=require('node:path');
const p={tenant:'review-demo',project:'synthetic'};
const store=new GovernanceStore(path.resolve(__dirname,'../build/review-workspace/events.sqlite'));
const password='Local-review-demo-only-123';
const users=['reviewer','reader'].map(role=>({id:role,email:role+'@example.test',passwordHash:passwordHash(password),workspaces:[{id:'review-demo',name:'Review workflow · synthetic local data',...p,role}]}));
if(!store.list(p).total){
 const runs=require('../fixtures/governance/paired-model-comparison-v0.1.0-draft.json').events.filter(e=>e.eventType==='ai.run.completed').slice(0,8);
 for(const [i,item] of runs.entries()){
  const event={...item,tenantRef:p.tenant,projectRef:p.project,occurredAt:new Date(Date.now()-(i+1)*3600000).toISOString()};
  if(i===7){delete event.caseRef;event.result={status:'completed'};}store.ingest(event,p);
 }
}
const signer=require('ethers').Wallet.createRandom();
async function main(){
 await require('../services/governance/evidence.cjs').prepareBatch(store,p,signer,{publisher:signer.address,limit:100});
 const server=createServer(store,[],users,store.db,{trustedSigners:[signer.address.toLowerCase()]});
 server.listen(Number(process.env.PORT||8796),'127.0.0.1',()=>console.log('Synthetic review API ready on loopback. No blockchain broadcasts.'));
 process.on('SIGINT',()=>server.close(()=>store.close()));
}
main().catch(()=>{store.close();process.exitCode=1;});
