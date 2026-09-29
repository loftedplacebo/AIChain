#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {parseStrictJson}=require('../services/governance/server.cjs');
function privateFile(file,max){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Absolute private file required');
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max||process.platform!=='win32'&&(stat.mode&0o077))throw Error('Private regular file required');
 return fs.readFileSync(file,'utf8');
}
async function main(){
 const [file,...extra]=process.argv.slice(2);if(!file||extra.length)throw Error('Private status configuration required');
 const config=parseStrictJson(privateFile(path.resolve(file),8192));
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!['environment','storage','clientId','maxLagSeconds','databaseUrlFile','caFile','sessionDatabase'].includes(k))||!['dev','test'].includes(config.environment)||!['sqlite','postgres'].includes(config.storage)||typeof config.clientId!=='string'||!/^client_[A-Za-z0-9]{1,121}$/.test(config.clientId))throw Error('Explicit status environment, storage and client required');
 let close,progress;
 try{
  if(config.storage==='postgres'){
   if(config.sessionDatabase)throw Error('Mixed status storage forbidden');
   const url=privateFile(config.databaseUrlFile,4096).trim(),{Pool}=require('pg');
   const pool=new Pool({...require('../services/governance/postgres-connection.cjs').connectionOptions(url,{caFile:config.caFile}),max:1,connectionTimeoutMillis:5000});close=()=>pool.end();
   await require('../services/governance/postgres-runtime-profile.cjs').verifyProfile(pool,'api');
   const directory=new(require('../services/governance/postgres-customer-directory.cjs').PostgresCustomerDirectory)(pool);await directory.ready(config.environment);
   progress=new(require('../services/governance/provider-replay-state.cjs').PostgresReplayProgress)(directory);await progress.ready();
  }else{
   if(config.databaseUrlFile||config.caFile||typeof config.sessionDatabase!=='string'||!path.isAbsolute(config.sessionDatabase))throw Error('Explicit SQLite status path required');
   const stat=fs.lstatSync(config.sessionDatabase);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Regular existing session database required');
   const db=new(require('node:sqlite').DatabaseSync)(config.sessionDatabase,{readOnly:true});close=()=>db.close();
   const environments=db.prepare('SELECT name FROM governance_environment').all();if(environments.length!==1||environments[0].name!==config.environment)throw Error('Status environment mismatch');
   require('../services/governance/environment.cjs').assertRecoveryApproved(db);
   const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workspace_provider_replay_progress'").get();
   progress={read:client=>exists?db.prepare('SELECT * FROM workspace_provider_replay_progress WHERE client_id=?').get(client)||null:null};
  }
  const result=await require('../services/governance/workos-revocation-status.cjs').revocationStatus({progress,clientId:config.clientId,maxLagSeconds:config.maxLagSeconds});
  console.log(JSON.stringify({environment:config.environment,...result},null,2));if(result.status!=='observed-fresh')process.exitCode=2;
 }finally{await close?.();}
}
if(require.main===module)main().catch(()=>{console.error('Identity replay status failed; check private configuration, environment, migrations, permissions and recovery gate. No service or replay job was started.');process.exitCode=1;});
module.exports={main};
