#!/usr/bin/env node
'use strict';
// Point-in-time, read-only PostgreSQL capacity observation via the existing
// restricted pilot API role. Does not establish a production workload limit.
const fs=require('node:fs');
const {Pool}=require('/opt/aichain/governance-pilot-api/node_modules/pg');
const {connectionOptions}=require('/opt/aichain/governance-pilot-api/services/governance/postgres-connection.cjs');

const ENV='/etc/aichain-governance-synthetic-api.env';
function configuration(){
 const st=fs.lstatSync(ENV);
 if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>16384||st.mode&0o077)throw Error('Protected API configuration required');
 const env=Object.fromEntries(fs.readFileSync(ENV,'utf8').split(/\r?\n/)
  .filter(line=>/^[A-Z_]+=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
 if(!env.GOVERNANCE_DATABASE_URL||!env.GOVERNANCE_DATABASE_CA_FILE)throw Error('Verified database configuration required');
 return connectionOptions(env.GOVERNANCE_DATABASE_URL,{caFile:env.GOVERNANCE_DATABASE_CA_FILE});
}
async function main(){
 const pool=new Pool({...configuration(),max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
 try{
  const settings=(await pool.query("SELECT current_database() AS database, current_setting('max_connections')::integer AS max_connections, current_setting('superuser_reserved_connections')::integer AS superuser_reserved_connections, pg_database_size(current_database())::bigint AS pilot_database_bytes")).rows[0];
  if(settings.database!=='governance_test')throw Error('Pilot database binding required');
  const observed=(await pool.query("SELECT datname,numbackends,deadlocks,temp_bytes FROM pg_stat_database WHERE datname IN ('governance_test','governance_prod') ORDER BY datname")).rows;
  const connections=Object.fromEntries(observed.map(row=>[row.datname==='governance_test'?'pilot':'production',Number(row.numbackends)]));
  const result={measurement:'point-in-time',throughputMeasured:false,maxConnections:Number(settings.max_connections),superuserReservedConnections:Number(settings.superuser_reserved_connections),pilotDatabaseBytes:Number(settings.pilot_database_bytes),connections,prodDatabaseObserved:observed.some(row=>row.datname==='governance_prod'),sampledAtUtc:new Date().toISOString()};
  if(!Object.values(result).every(value=>typeof value!=='number'||Number.isSafeInteger(value)&&value>=0))throw Error('Invalid database statistics');
  console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Shared-cluster capacity observation unavailable; no credentials printed.');process.exitCode=1;});
