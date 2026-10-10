#!/usr/bin/env node
'use strict';
// Offline root-only comparison of the privileged project catalog with every
// configured evidence worker. The API role cannot enumerate other tenants.
const fs=require('node:fs'),{Pool}=require('pg');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const {loadPilotWorkers}=require('../services/governance/pilot-worker-inventory.cjs');
const {assertOfflineAdministrator}=require('../services/governance/postgres-offline-administrator.cjs');
const PASSWORD='/etc/aichain/pilot-backup/database-password';
function compareProjects(rows,workers){
 const registered=new Set(workers.map(w=>w.tenant+'\0'+w.project)),present=new Set(rows.map(r=>r.tenant+'\0'+r.project));
 const missingProjects=rows.filter(r=>!registered.has(r.tenant+'\0'+r.project));
 const staleWorkers=workers.filter(w=>!present.has(w.tenant+'\0'+w.project)).map(w=>w.role);
 return {healthy:!missingProjects.length&&!staleWorkers.length,projects:rows.length,workers:workers.length,missingProjects,staleWorkers};
}
async function main(){
 if(process.platform!=='linux'||process.getuid()!==0)throw Error('Root-only pilot inventory check');
 const stat=fs.lstatSync(PASSWORD);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o077)||stat.size<1||stat.size>1025)throw Error('Protected database credential required');
 const password=fs.readFileSync(PASSWORD,'utf8').replace(/\r?\n$/,''),url=new URL('postgresql://doadmin@orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com:25060/governance_test?sslmode=verify-full');url.password=password;
 const pool=new Pool({...connectionOptions(url.toString(),{caFile:'/etc/aichain/governance/digitalocean-ca.crt'}),max:1});
 try{
  await assertOfflineAdministrator(pool);
  const environment=(await pool.query('SELECT name FROM governance_environment')).rows;
  if(environment.length!==1||environment[0].name!=='test')throw Error('Pilot database environment mismatch');
  const rows=(await pool.query('SELECT workspace AS tenant,id AS project FROM governance_customer_projects ORDER BY workspace,id')).rows;
  const result=compareProjects(rows,loadPilotWorkers());
  console.log(JSON.stringify(result));
  if(!result.healthy)process.exitCode=1;
 }finally{await pool.end();}
}
if(require.main===module)main().catch(()=>{console.error('Pilot project inventory check failed; inspect protected database and registry configuration.');process.exitCode=1;});
module.exports={compareProjects};
