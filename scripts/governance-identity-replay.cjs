#!/usr/bin/env node
'use strict';
// One explicit provider replay step. No timer, public route or release approval.
const fs=require('node:fs'),path=require('node:path');
const {parseStrictJson}=require('../services/governance/server.cjs');
function privateFile(file,max){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Absolute private file required');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max||process.platform!=='win32'&&(stat.mode&0o077))throw Error('Private regular file required');
 return fs.readFileSync(file,'utf8');
}
async function run(file,{fetcher=fetch,now=Date.now}={}){
 const config=parseStrictJson(privateFile(file,8192));
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!['environment','storage','clientId','startAt','apiKeyFile','databaseUrlFile','caFile','sessionDatabase'].includes(k))||!['dev','test'].includes(config.environment)||!['sqlite','postgres'].includes(config.storage)||typeof config.clientId!=='string'||!/^client_[A-Za-z0-9]{1,121}$/.test(config.clientId)||typeof config.startAt!=='string'||!Number.isFinite(Date.parse(config.startAt))||new Date(config.startAt).toISOString()!==config.startAt||Date.parse(config.startAt)>now())throw Error('Explicit replay scope and baseline required');
 const apiKey=privateFile(config.apiKeyFile,512).trim();if(!/^sk_[A-Za-z0-9_]{1,252}$/.test(apiKey))throw Error('Private provider credential required');
 let close,progress,repository;
 try{
  if(config.storage==='postgres'){
   if(Object.hasOwn(config,'sessionDatabase'))throw Error('Mixed replay storage forbidden');
   const url=privateFile(config.databaseUrlFile,4096).trim(),{Pool}=require('pg');
   const pool=new Pool({...require('../services/governance/postgres-connection.cjs').connectionOptions(url,{caFile:config.caFile}),max:1,connectionTimeoutMillis:5000});close=()=>pool.end();
   await require('../services/governance/postgres-runtime-profile.cjs').verifyProfile(pool,'api');
   const directory=new(require('../services/governance/postgres-customer-directory.cjs').PostgresCustomerDirectory)(pool);
   const sessions=new(require('../services/governance/postgres-provider-sessions.cjs').PostgresProviderSessions)(pool,directory);
   await sessions.ready(config.environment);progress=sessions.replayProgress;repository=sessions.revocations;
  }else{
   if(Object.hasOwn(config,'databaseUrlFile')||Object.hasOwn(config,'caFile')||typeof config.sessionDatabase!=='string'||!path.isAbsolute(config.sessionDatabase))throw Error('Explicit SQLite replay path required');
   const stat=fs.lstatSync(config.sessionDatabase);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Regular existing session database required');
   const db=new(require('node:sqlite').DatabaseSync)(config.sessionDatabase);close=()=>db.close();
   const environments=db.prepare('SELECT name FROM governance_environment').all();if(environments.length!==1||environments[0].name!==config.environment)throw Error('Replay environment mismatch');
   require('../services/governance/environment.cjs').assertRecoveryApproved(db);
   const required=['customer_identities','workspace_sessions','workspace_provider_sessions','workspace_provider_refresh','workspace_active_auth','workspace_refresh_claims','workspace_provider_revocations','workspace_identity_events','workspace_provider_replay_progress'];
   const existing=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
   if(required.some(name=>!existing.has(name)))throw Error('Existing customer session and replay schema required');
   repository=new(require('../services/governance/provider-revocations.cjs').SqliteProviderRevocations)(db);
   progress=new(require('../services/governance/provider-replay-state.cjs').SqliteReplayProgress)(db);
  }
  const result=await require('../services/governance/workos-revocation-step.cjs').revocationStep({clientId:config.clientId,startAt:config.startAt,progress,now,replay:input=>require('../services/governance/workos-revocation-replay.cjs').replayRevocations({...input,clientId:config.clientId,apiKey,repository,fetcher,now})});
  return {environment:config.environment,...result};
 }finally{await close?.();}
}
async function main(){
 const [flag,file,...extra]=process.argv.slice(2);
 if(flag!=='--apply-revocations'||!file||extra.length)throw Error('Explicit replay flag and private configuration required');
 const result=await run(file);console.log(JSON.stringify(result,null,2));if(result.status==='busy')process.exitCode=2;
}
if(require.main===module)main().catch(()=>{console.error('Identity replay step failed; inspect private configuration, provider access, schema, permissions and recovery gate. No coverage advancement is claimed.');process.exitCode=1;});
module.exports={run,main};
