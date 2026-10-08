'use strict';
// Check the named synthetic WorkOS account's local footprint; optionally disable its orphaned identity.
const {Pool}=require('pg');
const {PostgresCustomerDirectory}=require('../services/governance/postgres-customer-directory.cjs');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const provider='workos:client_01M415264WYTWS294EMP8CNJNT';
const subject='user_01M46KJQCNQWM2J61JP59B4KFS';
async function main(){
 if(process.argv.length>3||process.argv[2]&&process.argv[2]!=='--disable')throw Error('Use without arguments or with --disable');
 const pool=new Pool(connectionOptions(process.env.GOVERNANCE_DATABASE_URL,{caFile:process.env.GOVERNANCE_DATABASE_CA_FILE}));
 const directory=new PostgresCustomerDirectory(pool);
 try{
  await directory.ready('test');
  const row=await directory.tx({provider,subject},async client=>(await client.query('SELECT id,disabled FROM governance_customer_identities WHERE provider=$1 AND subject=$2',[provider,subject])).rows[0]);
  if(!row){console.log(JSON.stringify({localIdentity:'absent',workspaceMemberships:0,projects:0}));return;}
  const memberships=await directory.tx({actor:row.id},async client=>(await client.query('SELECT workspace,role FROM governance_customer_memberships WHERE user_id=$1',[row.id])).rows);
  const projects=await directory.projects(row.id);
  if(process.argv[2]==='--disable'&&!row.disabled){
   if(memberships.length||projects.length)throw Error('Pilot user still owns workspace access');
   await directory.disableIdentity(row.id);
  }
  console.log(JSON.stringify({localIdentity:process.argv[2]==='--disable'||row.disabled?'disabled':'active',workspaceMemberships:memberships.length,ownerMemberships:memberships.filter(item=>item.role==='owner').length,projects:projects.length}));
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Pilot user impact check failed; no account or database secret printed.');process.exitCode=1;});
