'use strict';
// Read-only account-to-project check for the fresh pilot sign-up exercise.
const {Pool}=require('pg');
const {PostgresCustomerDirectory}=require('../services/governance/postgres-customer-directory.cjs');
const {PostgresProjectKeys}=require('../services/governance/postgres-project-keys.cjs');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const provider='workos:client_01M415264WYTWS294EMP8CNJNT';
const subject='user_01M4EFHKVGYG4XNDY9NRR10RW7';
async function main(){
 const pool=new Pool(connectionOptions(process.env.GOVERNANCE_DATABASE_URL,{caFile:process.env.GOVERNANCE_DATABASE_CA_FILE}));
 const directory=new PostgresCustomerDirectory(pool);
 try{
  await directory.ready('test');
  const row=await directory.tx({provider,subject},async client=>(await client.query('SELECT id,disabled FROM governance_customer_identities WHERE provider=$1 AND subject=$2',[provider,subject])).rows[0]);
  if(!row||row.disabled)throw Error('Fresh account identity unavailable');
  const identity=await directory.identity(row.id);
  const keys=new PostgresProjectKeys(pool);
  await keys.ready('test');
  const projects=[];
  for(const item of identity.workspaces){
   const acceptanceKeys=(await keys.list({tenant:item.tenant,project:item.project}))
    .filter(key=>key.label==='Fresh Signup Acceptance')
    .map(key=>({id:key.id,status:key.status,scopes:key.scopes,expiresAt:key.expiresAt}));
   projects.push({tenant:item.tenant,project:item.project,name:item.name,role:item.role,acceptanceKeys});
  }
  console.log(JSON.stringify({newIdentity:'active',projects}));
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Fresh-account read-back failed; no credentials printed.');process.exitCode=1;});
