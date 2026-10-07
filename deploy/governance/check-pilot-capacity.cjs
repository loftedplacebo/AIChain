#!/usr/bin/env node
'use strict';
// Read-only pilot quota state; the API role can see only the aggregate counter.
const fs=require('node:fs');
const {Pool}=require('/opt/aichain/governance-pilot-api/node_modules/pg');
const env=Object.fromEntries(fs.readFileSync('/etc/aichain-governance-synthetic-api.env','utf8')
 .split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const pool=new Pool(require('/opt/aichain/governance-pilot-api/services/governance/postgres-connection.cjs')
 .connectionOptions(env.GOVERNANCE_DATABASE_URL,{caFile:env.GOVERNANCE_DATABASE_CA_FILE}));
(async()=>{
 const row=(await pool.query(`SELECT q.used,q.max_projects,t.tgenabled
  FROM public.governance_pilot_project_capacity q JOIN pg_trigger t
  ON t.tgrelid='public.governance_customer_projects'::regclass
  WHERE q.singleton AND t.tgname='governance_pilot_project_limit'`)).rows[0];
 if(!row||row.tgenabled!=='O')throw Error('Pilot project limit trigger unavailable');
 console.log(JSON.stringify({used:row.used,maxProjects:row.max_projects,triggerEnabled:true}));
})().catch(()=>{console.error('Pilot project capacity check failed');process.exitCode=1;})
 .finally(()=>pool.end());
