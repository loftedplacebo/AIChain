const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');const {Pool}=require('pg');
const {PostgresGovernanceStore}=require('../services/governance/postgres-store.cjs');
const id=process.argv[2];if(!/^g[0-9a-f]{12}$/.test(id||''))throw new Error('Supply the local acceptance run ID');
const directory=path.resolve(__dirname,'../build/postgres-native',id);
const access=JSON.parse(fs.readFileSync(path.join(directory,'private-run-access.json'),'utf8'));
if(access.config.host!=='127.0.0.1'||access.config.port!==55439)throw new Error('Only the dedicated local cluster may be verified');
async function main(){
 for(const database of Object.values(access.databases)){
  const admin=new Pool({...access.config,database});const app=new Pool({host:access.config.host,port:access.config.port,database,user:access.app,password:access.appPassword});
  try{
   const data={};for(const table of ['governance_events','governance_outbox','governance_usage','governance_evidence'])data[table]=(await admin.query(`SELECT * FROM ${table} ORDER BY tenant,project,${table==='governance_usage'?'day':'id'}`)).rows;
   data.migrations=(await admin.query('SELECT name,checksum FROM governance_migrations ORDER BY name')).rows;data.environment=(await admin.query('SELECT * FROM governance_environment')).rows;
   const snapshot={counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
   assert.deepEqual(snapshot,access.expectedSnapshot);
   const store=new PostgresGovernanceStore(app);await store.ready();assert.equal((await app.query('SELECT * FROM governance_events')).rows.length,0);
   assert.equal((await store.report({tenant:'org-demo',project:'claims-governance-demo'})).kpis.runs,60);
  }finally{await app.end();await admin.end();}
 }
 const file=path.join(directory,'results.json'),results=JSON.parse(fs.readFileSync(file,'utf8'));
 results.checks.push({name:'source and restored database preserve full snapshot and isolated reads after clean server restart',status:'passed',verifiedAt:new Date().toISOString()});
 fs.writeFileSync(file,JSON.stringify(results,null,2));console.log('PASS clean restart: source and restored snapshots, reports and row security');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
