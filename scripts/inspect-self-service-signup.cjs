'use strict';
// Read-only account-to-project check for the fresh pilot sign-up exercise.
const {Pool}=require('pg');
const {PostgresCustomerDirectory}=require('../services/governance/postgres-customer-directory.cjs');
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
  console.log(JSON.stringify({newIdentity:'active',projects:identity.workspaces.map(item=>({tenant:item.tenant,project:item.project,name:item.name,role:item.role}))}));
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Fresh-account read-back failed; no credentials printed.');process.exitCode=1;});
