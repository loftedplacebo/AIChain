'use strict';
// Read and independently verify the fixed internal pilot acceptance event.
const {Pool}=require('pg');
const {PostgresGovernanceStore}=require('../services/governance/postgres-store.cjs');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const {verifyExport}=require('../services/governance/evidence-export-verifier.cjs');
const {evidenceProvider}=require('../services/governance/evidence-provider.cjs');

const principal={tenant:'org-61f98eac-1218-439d-9e93-f3717e1dfe37',project:'prj-2e7bb2dd-b180-49f6-9083-22b84b402b66'};
const eventId='self-service-acceptance-6490f75f73587f9bdf0b2b8bac555ccc';

async function main(){
 const pool=new Pool(connectionOptions(process.env.GOVERNANCE_DATABASE_URL,{caFile:process.env.GOVERNANCE_DATABASE_CA_FILE}));
 const store=new PostgresGovernanceStore(pool,{runtimeProfile:'api'});
 try{
  await store.ready('test');
  const event=await store.get(principal,eventId);
  const evidence=await store.evidence(principal,eventId);
  if(!event||event.eventId!==eventId||event.tenantRef!==principal.tenant||event.projectRef!==principal.project||!evidence?.bundle)throw Error('Acceptance event or evidence missing');
  const result=await verifyExport({event,evidence:evidence.bundle},{
   trustedSigners:JSON.parse(process.env.GOVERNANCE_RECEIPT_SIGNERS||'[]'),
   provider:evidenceProvider(process.env.GOVERNANCE_EVIDENCE_RPC_URL),
  });
  console.log(JSON.stringify({eventId,exportVerification:result.exportVerification,state:result.state,signature:result.signature,trustedSigner:result.trustedSigner,recordCommitment:result.recordCommitment,batchMembership:result.batchMembership,confirmations:result.confirmations,minimumConfirmations:result.minimumConfirmations}));
  process.exitCode=result.exitCode;
 }finally{await store.close();}
}
main().catch(()=>{console.error('Independent acceptance verification failed; no credentials printed.');process.exitCode=1;});
