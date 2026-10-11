#!/usr/bin/env node
'use strict';
// Root-only post-cutover receipt check using the pilot API's restricted role.
const fs=require('node:fs');
const {Pool}=require('pg');
const {JsonRpcProvider}=require('ethers');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const {PostgresGovernanceStore}=require('../services/governance/postgres-store.cjs');
const {inspectEvidence}=require('../services/governance/evidence.cjs');
const STATE='/var/lib/aichain-pilot-db-migration/cutover-smoke-event.json';
const API_ENV='/etc/aichain-governance-synthetic-api.env';
let phase='startup';
function protectedConfig(){
 const stat=fs.lstatSync(API_ENV);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o077)||stat.size>65536)throw Error('Protected API settings required');
 const values={};
 for(const line of fs.readFileSync(API_ENV,'utf8').split(/\r?\n/)){
  if(!line||line.startsWith('#'))continue;
  const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if(!match||Object.hasOwn(values,match[1]))throw Error('Invalid protected API setting');
  values[match[1]]=match[2];
 }
 return values;
}
async function main(){
 phase='protected-event-reference';
 if(process.getuid()!==0)throw Error('Root-only cutover verification required');
 const st=fs.lstatSync(STATE);
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o077)||st.size>1024)throw Error('Protected event reference required');
 const state=JSON.parse(fs.readFileSync(STATE,'utf8'));
 if(state.tenant!=='org-61f98eac-1218-439d-9e93-f3717e1dfe37'||state.project!=='prj-1e8d2ecd-6bbf-4cb6-b49b-fb599ba9626c'||!/^contabo-cutover-smoke-[a-f0-9]{32}$/.test(state.eventId))throw Error('Unexpected acceptance event');
 phase='protected-api-binding';
 const config=protectedConfig();
 const url=new URL(config.GOVERNANCE_DATABASE_URL||'');
 phase='api-host';if(url.hostname!=='127.0.0.1')throw Error('Local restricted pilot API binding required');
 phase='api-port';if(url.port!=='5433')throw Error('Local restricted pilot API binding required');
 phase='api-database';if(url.pathname!=='/governance_test')throw Error('Local restricted pilot API binding required');
 phase='api-role';if(url.username!=='governance_api')throw Error('Local restricted pilot API binding required');
 phase='api-sslmode';if(url.searchParams.get('sslmode')!=='disable')throw Error('Local restricted pilot API binding required');
 phase='trusted-signers';
 const signers=JSON.parse(config.GOVERNANCE_RECEIPT_SIGNERS||'[]');
 if(!Array.isArray(signers)||!signers.length||!signers.every(s=>typeof s==='string'&&/^0x[a-fA-F0-9]{40}$/.test(s)))throw Error('Trusted pilot receipt signers required');
 const rpc=config.GOVERNANCE_EVIDENCE_RPC_URL;
 if(!rpc||!rpc.startsWith('https://'))throw Error('Read-only evidence RPC required');
 phase='database-connection';
 const pool=new Pool({...connectionOptions(config.GOVERNANCE_DATABASE_URL),max:1});
 const store=new PostgresGovernanceStore(pool,{runtimeProfile:'api'}),provider=new JsonRpcProvider(rpc);
 try{
  await store.ready('test');
  phase='accepted-event-and-evidence';
  const principal={tenant:state.tenant,project:state.project};
  const event=await store.get(principal,state.eventId);
  const stored=await store.evidence(principal,state.eventId);
  if(!event)throw Error('Fresh event is absent from local PostgreSQL');
  phase='receipt-and-chain-verification';
  const result=await inspectEvidence(event,stored,{provider,trustedSigners:signers,minimumConfirmations:12});
  console.log(JSON.stringify({eventId:state.eventId,state:result.state,signature:result.signature,recordCommitment:result.recordCommitment,batchMembership:result.batchMembership,trustedSigner:result.trustedSigner===true,confirmations:result.confirmations??null,minimumConfirmations:result.minimumConfirmations??12,chainId:result.chainId}));
  if(result.state!=='confirmed'||result.signature!=='valid'||result.recordCommitment!==true||result.batchMembership!==true||result.trustedSigner!==true||result.confirmations<12)process.exitCode=2;
 }finally{provider.destroy();await store.close();}
}
main().catch(()=>{console.error('Contabo cutover receipt verification failed at '+phase+'; no secrets printed');process.exitCode=1;});
