'use strict';

// Invoked by digitalocean-test-apply.sh on the Contabo VPS. The password is
// supplied for this one process through PG_SECRET and is never written to disk.
const {Pool}=require('pg');
const fs=require('node:fs');
const {connectionOptions}=require('./postgres-connection.cjs');
const {migrate,verify,migrations}=require('./postgres-migrate.cjs');
const {verifyProfile}=require('./postgres-runtime-profile.cjs');

const host='orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com';
const caFile='/etc/aichain/governance/digitalocean-ca.crt';
const modes={migrate:['governance_migrations',null],api:['governance_api','api'],worker:['governance_evidence_worker','evidence-worker']};

async function main(){
 const binding='/etc/aichain/pilot-database-binding.json';
 if(fs.existsSync(binding)){
  const stat=fs.lstatSync(binding);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o077)||
   JSON.parse(fs.readFileSync(binding,'utf8')).profile!=='managed')throw new Error('Managed test bootstrap disabled after Contabo cutover');
 }
 const mode=process.argv[2],selection=modes[mode],password=process.env.PG_SECRET;
 if(!selection||!password||password.length>1024)throw new Error('Expected one mode and its credential');
 const url=new URL(`postgresql://${selection[0]}@${host}:25060/governance_test?sslmode=verify-full`);
 url.password=password;
 delete process.env.PG_SECRET;
 const pool=new Pool(connectionOptions(url.toString(),{caFile}));
 try{
  if(mode==='migrate'){
   await migrate(pool,{environment:'test'});
   await verify(pool);
   const count=(await pool.query('SELECT count(*)::int AS n FROM governance_migrations')).rows[0].n;
   if(count!==migrations().length||count!==19)throw new Error('Migration count did not match the reviewed set');
   console.log(`Applied and verified ${count} test migrations`);
  }else{
   await verify(pool);
   await verifyProfile(pool,selection[1]);
   console.log(`${selection[1]} runtime privilege profile verified`);
  }
 }finally{await pool.end();}
}

main().catch(error=>{
 console.error(`Database setup check failed: ${error.code||error.message}`);
 process.exitCode=1;
});
