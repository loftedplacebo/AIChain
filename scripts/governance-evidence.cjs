// Operator tooling: prepare signed batches, attach a submitted hash, or verify an export.
// Deliberately has no transaction broadcaster. Keys never enter the web application.
const fs=require('node:fs');const {Wallet}=require('ethers');
const {GovernanceStore}=require('../services/governance/store');
const {PostgresGovernanceStore}=require('../services/governance/postgres-store.cjs');
const {prepareBatch,attachTransaction}=require('../services/governance/evidence.cjs');
const {evidenceProvider}=require('../services/governance/evidence-provider.cjs');
async function main(){
 const [command,arg1,arg2,...extra]=process.argv.slice(2);
 if(command==='verify'){
  if(!arg1||arg2||extra.length)throw Error('Use verify <export.json>');
  const stat=fs.lstatSync(arg1);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>2*1024*1024)throw Error('Bounded regular evidence export required');
  const exported=require('../services/governance/server.cjs').parseStrictJson(fs.readFileSync(arg1,'utf8'));
  const result=await require('../services/governance/evidence-export-verifier.cjs').verifyExport(exported,{trustedSigners:JSON.parse(process.env.GOVERNANCE_RECEIPT_SIGNERS||'[]'),provider:process.env.GOVERNANCE_EVIDENCE_RPC_URL?evidenceProvider(process.env.GOVERNANCE_EVIDENCE_RPC_URL):null});
  console.log(JSON.stringify(result,null,2));process.exitCode=result.exitCode;return;
 }
 if(!['prepare','attach'].includes(command))throw new Error('Use prepare, attach <batchId> <txHash>, or verify <export.json>');
 const p={tenant:process.env.GOVERNANCE_TENANT,project:process.env.GOVERNANCE_PROJECT};if(!p.tenant||!p.project)throw new Error('Set explicit tenant and project');
 let store;if(process.env.GOVERNANCE_STORAGE==='postgres'){const {Pool}=require('pg');if(!process.env.GOVERNANCE_DATABASE_URL)throw new Error('Database URL required');store=new PostgresGovernanceStore(new Pool({connectionString:process.env.GOVERNANCE_DATABASE_URL}));await store.ready(process.env.GOVERNANCE_ENV||'test');}else{if(!process.env.GOVERNANCE_DB)throw new Error('Set explicit governance database path');store=new GovernanceStore(process.env.GOVERNANCE_DB);}
 try{
  let result;
  if(command==='prepare'){if(!process.env.GOVERNANCE_RECEIPT_KEY_FILE)throw new Error('Set the recording-service key file');const signer=new Wallet(fs.readFileSync(process.env.GOVERNANCE_RECEIPT_KEY_FILE,'utf8').trim());result=await prepareBatch(store,p,signer,{publisher:process.env.GOVERNANCE_PUBLISHER,limit:Number(process.env.GOVERNANCE_BATCH_LIMIT||100)});}
  else result=await attachTransaction(store,p,arg1,arg2);
  console.log(JSON.stringify(result,null,2));
 }finally{await store.close();}
}
main().catch(e=>{console.error(process.argv[2]==='verify'?'Evidence export verification failed; inspect the file and verifier configuration privately.':e.message);process.exitCode=1;});
