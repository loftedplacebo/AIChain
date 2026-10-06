// Read one known synthetic pilot record with the API's least-privilege role.
// A root-only export may be independently verified on another machine.
'use strict';
const fs=require('node:fs');
const {Pool}=require('pg');
const {PostgresGovernanceStore}=require('../../services/governance/postgres-store.cjs');
const {connectionOptions}=require('../../services/governance/postgres-connection.cjs');
const principal={tenant:'org-831aa048-b268-4fce-98f3-455429034ef8',project:'prj-d9109260-1232-4561-ab4a-ab2e5c8f658f'};
const id='synthetic-first-d99e15cf63551a783a85b989229c99e9';
async function main(){
 const pool=new Pool(connectionOptions(process.env.GOVERNANCE_DATABASE_URL,{caFile:process.env.GOVERNANCE_DATABASE_CA_FILE}));
 const store=new PostgresGovernanceStore(pool,{runtimeProfile:'api'});
 try{
  await store.ready('test');
  const event=await store.get(principal,id);
  if(!event)throw Error('Synthetic event not found');
  const evidence=await store.evidence(principal,id);
  const pending=await store.pendingEvidence(principal,1000);
  console.log(JSON.stringify({eventId:id,environment:event.environment,evidence:evidence?'present':'pending',transactions:evidence?.bundle?.transactions?.length??0,pendingCount:pending.length,pendingEventIds:pending.map(item=>item.eventId)}));
  if(process.argv[2]==='--export'){
   const file='/var/lib/aichain-pilot-backup/hosted-synthetic-evidence-export.json';
   fs.writeFileSync(file,JSON.stringify({event,evidence:evidence?.bundle??null})+'\n',{mode:0o600,flag:'w'});
   console.log('Root-only synthetic evidence export written for independent verification.');
  }
 }finally{await store.close();}
}
main().catch(()=>{console.error('Hosted evidence inspection failed; no credentials printed.');process.exitCode=1;});
