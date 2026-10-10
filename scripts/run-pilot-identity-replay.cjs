// One bounded WorkOS revocation replay step using the existing protected API environment.
'use strict';
const {Pool}=require('pg');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const {PostgresCustomerDirectory}=require('../services/governance/postgres-customer-directory.cjs');
const {PostgresProviderSessions}=require('../services/governance/postgres-provider-sessions.cjs');
const {revocationStep}=require('../services/governance/workos-revocation-step.cjs');
const {replayRevocations}=require('../services/governance/workos-revocation-replay.cjs');

const clientId='client_01M415264WYTWS294EMP8CNJNT';
const startAt='2026-10-04T00:00:00.000Z';
async function main(){
 const env=process.env;
 if(env.GOVERNANCE_ENV!=='test'||env.GOVERNANCE_IDENTITY_PROVIDER!=='workos'||
    env.WORKOS_CLIENT_ID!==clientId||!/^sk_[A-Za-z0-9_]+$/.test(env.WORKOS_API_KEY||'')||
    !env.GOVERNANCE_DATABASE_URL)throw Error('Protected pilot API environment required');
 const pool=new Pool({...connectionOptions(env.GOVERNANCE_DATABASE_URL,{caFile:env.GOVERNANCE_DATABASE_CA_FILE}),max:1,connectionTimeoutMillis:5000});
 try{
  const directory=new PostgresCustomerDirectory(pool);
  const sessions=new PostgresProviderSessions(pool,directory);
  await sessions.ready('test');
  const result=await revocationStep({clientId,startAt,progress:sessions.replayProgress,
   replay:input=>replayRevocations({...input,clientId,apiKey:env.WORKOS_API_KEY,repository:sessions.revocations})});
  console.log(JSON.stringify({status:result.status,coveredUntil:result.coveredUntil||null,
   events:result.events??0,applied:result.applied??0,duplicate:result.duplicate??0,
   coverage:'selected pilot baseline only'}));
  if(!['advanced','not-due'].includes(result.status))process.exitCode=1;
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Pilot revocation replay failed; no credentials printed. Check provider, database and recovery gate.');process.exitCode=1;});
