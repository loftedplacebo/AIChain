'use strict';
// Read-only preflight; prints no connection material.
const fs=require('node:fs');
const {Pool}=require('/opt/aichain/governance-pilot-api/node_modules/pg');
const env=Object.fromEntries(fs.readFileSync('/etc/aichain-governance-synthetic-api.env','utf8')
 .split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const uri=new URL(env.GOVERNANCE_DATABASE_URL);
const pool=new Pool({host:uri.hostname,port:Number(uri.port),database:uri.pathname.slice(1),
 user:decodeURIComponent(uri.username),password:decodeURIComponent(uri.password),
 ssl:{ca:fs.readFileSync(env.GOVERNANCE_DATABASE_CA_FILE,'utf8'),rejectUnauthorized:true,servername:uri.hostname}});
(async()=>{
 const row=(await pool.query(`SELECT pg_get_userbyid(c.relowner) owner,
  pg_has_role('doadmin',pg_get_userbyid(c.relowner),'MEMBER') doadmin_member,
  pg_has_role('doadmin',pg_get_userbyid(c.relowner),'USAGE') doadmin_usage
  FROM pg_class c WHERE c.oid='public.governance_customer_projects'::regclass`)).rows[0];
 console.log(JSON.stringify({owner:row?.owner,doadminMember:row?.doadmin_member,
  doadminUsage:row?.doadmin_usage}));
})().catch(()=>{console.error('Project table ownership preflight failed');process.exitCode=1;})
 .finally(()=>pool.end());
