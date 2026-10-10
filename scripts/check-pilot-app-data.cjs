// Read-only hosted synthetic-project evidence and WorkOS replay coverage check.
// Run inside a transient unit with the protected pilot API EnvironmentFile.
'use strict';
const {Pool}=require('pg');
const {PostgresGovernanceStore}=require('../services/governance/postgres-store.cjs');
const {PostgresCustomerDirectory}=require('../services/governance/postgres-customer-directory.cjs');
const {PostgresReplayProgress}=require('../services/governance/provider-replay-state.cjs');
const {revocationStatus}=require('../services/governance/workos-revocation-status.cjs');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const {loadPilotWorkers}=require('../services/governance/pilot-worker-inventory.cjs');

async function main(){
 if(process.env.GOVERNANCE_ENV!=='test'||process.env.GOVERNANCE_IDENTITY_PROVIDER!=='workos'||
    process.env.WORKOS_CLIENT_ID!=='client_01M415264WYTWS294EMP8CNJNT'||
    !process.env.GOVERNANCE_DATABASE_URL)throw Error('Expected protected test API environment');
 const pool=new Pool({...connectionOptions(process.env.GOVERNANCE_DATABASE_URL,{caFile:process.env.GOVERNANCE_DATABASE_CA_FILE}),max:1,connectionTimeoutMillis:5000});
 try{
  const store=new PostgresGovernanceStore(pool,{runtimeProfile:'api'});
  await store.ready('test');
  const workers=loadPilotWorkers();
  const evidence=[];
  for(const worker of workers){
   const status=await store.evidenceStatus({tenant:worker.tenant,project:worker.project});
   evidence.push({role:worker.role,total:status.total,counts:status.counts,
    awaitingSubmission:status.awaitingSubmission,oldestAwaitingAgeSeconds:status.oldestAwaitingAgeSeconds});
  }
  const directory=new PostgresCustomerDirectory(pool);
  await directory.ready('test');
  const progress=new PostgresReplayProgress(directory);
  await progress.ready();
  const revocation=await revocationStatus({progress,clientId:process.env.WORKOS_CLIENT_ID,maxLagSeconds:300});
  const evidenceHealthy=evidence.every(item=>
   item.awaitingSubmission<=10&&
   (item.oldestAwaitingAgeSeconds===null||item.oldestAwaitingAgeSeconds<=1800));
  const revocationHealthy=revocation.status==='observed-fresh';
  console.log(JSON.stringify({healthy:evidenceHealthy&&revocationHealthy,evidenceHealthy,revocationHealthy,
   evidence:{projects:evidence},
   revocation:{status:revocation.status,lagSeconds:revocation.lagSeconds??null,
    maxLagSeconds:revocation.maxLagSeconds,coveredUntil:revocation.coveredUntil}}));
  if(!evidenceHealthy||!revocationHealthy)process.exitCode=1;
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Pilot app-data check failed; inspect private database readiness and access. No secrets printed.');process.exitCode=1;});
