// Bounded synthetic acceptance helpers. Run only on the dedicated test VPS.
const {GovernanceStore}=require('../services/governance/store');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const directory='/var/lib/aichain-governance-worker',p={tenant:'northstar',project:'acceptance'};
async function main(){
 const store=new GovernanceStore(directory+'/events.sqlite');
 try{
  if(process.argv[2]==='seed'){
   const fixture=require('../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
   for(let i=1;i<=10;i++){
    const id='vps-worker-acceptance-'+String(i).padStart(3,'0');if(store.get(p,id))continue;
    const e=structuredClone(fixture.events[0]);Object.assign(e,{tenantRef:p.tenant,projectRef:p.project,eventId:id,streamRef:'vps-worker-acceptance',sequence:String(i),occurredAt:new Date().toISOString(),runRef:id+'-run',caseRef:id+'-case',agentRef:'synthetic-vps-worker-test'});store.ingest(e,p);
   }
   console.log(JSON.stringify({syntheticRecords:10,pending:store.pendingEvidence(p,1000).length}));return;
  }
  const db=new DatabaseSync(directory+'/worker.sqlite',{readOnly:true});
  const jobs=db.prepare('SELECT body FROM jobs').all().map(r=>{const j=JSON.parse(r.body);return {id:j.id,state:j.state,hash:j.hash,nonce:j.nonce,attempts:j.attempts,verification:j.verification};});db.close();
  const result={checkedAt:new Date().toISOString(),jobs,pending:store.pendingEvidence(p,1000).length};
  if(process.argv[2]==='verify'){
   const {inspectEvidence}=require('../services/governance/evidence.cjs'),{evidenceProvider}=require('../services/governance/evidence-provider.cjs');
   const event=store.get(p,'vps-worker-acceptance-001');if(!event)throw Error('No acceptance event');
   const evidence=store.evidence(p,event.eventId);result.verification=await inspectEvidence(event,evidence,{trustedSigners:['0xb4ab030ba5c5db6442c946d02439d77a7067908f'],provider:evidenceProvider('https://sepolia.base.org')});
   if(result.verification.state!=='confirmed')process.exitCode=1;
   fs.writeFileSync(directory+'/acceptance-result.json',JSON.stringify(result,null,2));
  }
  console.log(JSON.stringify(result,null,2));
 }finally{store.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
