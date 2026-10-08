'use strict';
// Independent read-only verification of the fresh-account synthetic pilot event.
const {Pool}=require('pg');
const {PostgresGovernanceStore}=require('../services/governance/postgres-store.cjs');
const {PostgresProjectKeys}=require('../services/governance/postgres-project-keys.cjs');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const {verifyExport}=require('../services/governance/evidence-export-verifier.cjs');
const {evidenceProvider}=require('../services/governance/evidence-provider.cjs');

const principal={tenant:'org-2a00a025-c3e5-498f-9599-b7e290641baf',project:'prj-c5526c45-2b3b-4921-a58f-edf1a1b33cf3'};
const eventId='fresh-signup-acceptance-e68926a151e8b077dc503481f8379725';
const keyId='key-372e0130-9814-474c-b7f6-f1366a570e9a';

async function main(){
 const pool=new Pool(connectionOptions(process.env.GOVERNANCE_DATABASE_URL,{caFile:process.env.GOVERNANCE_DATABASE_CA_FILE}));
 const store=new PostgresGovernanceStore(pool,{runtimeProfile:'api'});
 try{
  await store.ready('test');
  const event=await store.get(principal,eventId);
  const evidence=await store.evidence(principal,eventId);
  if(!event||event.eventId!==eventId||event.tenantRef!==principal.tenant||event.projectRef!==principal.project||!evidence?.bundle)throw Error('Fresh-account event or evidence missing');
  const result=await verifyExport({event,evidence:evidence.bundle},{
   trustedSigners:JSON.parse(process.env.GOVERNANCE_RECEIPT_SIGNERS||'[]'),
   provider:evidenceProvider(process.env.GOVERNANCE_EVIDENCE_RPC_URL),
  });
  const keys=new PostgresProjectKeys(pool);
  await keys.ready('test');
  const key=(await keys.list(principal)).find(item=>item.id===keyId);
  console.log(JSON.stringify({eventId,exportVerification:result.exportVerification,state:result.state,signature:result.signature,trustedSigner:result.trustedSigner,recordCommitment:result.recordCommitment,batchMembership:result.batchMembership,confirmations:result.confirmations,minimumConfirmations:result.minimumConfirmations,acceptanceKeyStatus:key?.status??'missing'}));
  process.exitCode=result.exitCode;
 }finally{await store.close();}
}
main().catch(()=>{console.error('Fresh-signup evidence verification failed; no credentials printed.');process.exitCode=1;});
