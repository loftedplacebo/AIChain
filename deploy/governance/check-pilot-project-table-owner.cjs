'use strict';
// Read-only local pilot ownership preflight; prints no connection material.
const fs=require('node:fs');
const {Pool}=require('/opt/aichain/governance-pilot-api/node_modules/pg');
const {connectionOptions}=require('/opt/aichain/governance-pilot-api/services/governance/postgres-connection.cjs');
const file='/etc/aichain-governance-synthetic-api.env',stat=fs.lstatSync(file);
if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o077)||stat.size>65536)throw Error('Protected pilot API settings required');
const env=Object.fromEntries(fs.readFileSync(file,'utf8')
 .split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const uri=new URL(env.GOVERNANCE_DATABASE_URL||'');
if(uri.hostname!=='127.0.0.1'||uri.port!=='5433'||uri.pathname!=='/governance_test'||
 uri.username!=='governance_api'||uri.searchParams.get('sslmode')!=='disable')throw Error('Local restricted API binding required');
const pool=new Pool({...connectionOptions(env.GOVERNANCE_DATABASE_URL),max:1});
(async()=>{
 const row=(await pool.query(`SELECT current_user runtime_role, current_database() database,
  pg_get_userbyid(c.relowner) owner,
  has_table_privilege(current_user,c.oid,'SELECT') api_select
  FROM pg_class c WHERE c.oid='public.governance_customer_projects'::regclass`)).rows[0];
 const passed=row?.runtime_role==='governance_api'&&row?.database==='governance_test'&&
  row?.owner==='governance_migrations'&&row?.api_select===true;
 console.log(JSON.stringify({owner:row?.owner,runtimeRole:row?.runtime_role,
  runtimeSelect:row?.api_select===true,localPilotOwnership:passed}));
 if(!passed)process.exitCode=2;
})().catch(()=>{console.error('Project table ownership preflight failed');process.exitCode=1;})
 .finally(()=>pool.end());
