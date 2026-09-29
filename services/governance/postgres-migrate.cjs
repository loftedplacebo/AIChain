const {readFileSync,readdirSync}=require('node:fs');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const directory=join(__dirname,'migrations');
const migrations=()=>readdirSync(directory).filter(f=>/^\d+.*\.sql$/.test(f)).sort().map(name=>{const sql=readFileSync(join(directory,name),'utf8');return {name,sql,checksum:createHash('sha256').update(sql).digest('hex')};});
async function migrate(pool,{environment='test'}={}){
 if(!['dev','test'].includes(environment))throw new Error('Explicit dev or test database environment required');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(84532,20260927)');
  await client.query('CREATE TABLE IF NOT EXISTS governance_environment(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),name text NOT NULL)');
  await client.query('INSERT INTO governance_environment(singleton,name) VALUES(true,$1) ON CONFLICT DO NOTHING',[environment]);
  if((await client.query('SELECT name FROM governance_environment')).rows[0].name!==environment)throw new Error('Database environment mismatch');
  await client.query('CREATE TABLE IF NOT EXISTS governance_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const applied=(await client.query('SELECT name,checksum FROM governance_migrations')).rows;
  for(const row of applied)if(!migrations().some(m=>m.name===row.name&&m.checksum===row.checksum))throw new Error('Unknown or modified database migration');
  for(const m of migrations())if(!applied.some(a=>a.name===m.name)){await client.query(m.sql);await client.query('INSERT INTO governance_migrations(name,checksum) VALUES($1,$2)',[m.name,m.checksum]);}
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
async function verify(pool){const applied=(await pool.query('SELECT name,checksum FROM governance_migrations')).rows;const expected=migrations();if(applied.length!==expected.length||expected.some(m=>!applied.some(a=>a.name===m.name&&a.checksum===m.checksum)))throw new Error('Run reviewed governance migrations before serving');}
module.exports={migrate,verify,migrations};
if(require.main===module){const {Pool}=require('pg');if(!process.env.GOVERNANCE_MIGRATION_URL||!['dev','test'].includes(process.env.GOVERNANCE_ENV))throw new Error('Set GOVERNANCE_ENV and GOVERNANCE_MIGRATION_URL for the intended database');const pool=new Pool(require('./postgres-connection.cjs').connectionOptions(process.env.GOVERNANCE_MIGRATION_URL,{caFile:process.env.GOVERNANCE_DATABASE_CA_FILE}));migrate(pool,{environment:process.env.GOVERNANCE_ENV}).then(()=>console.log('Governance migrations complete')).catch(()=>{console.error('Migration failed; check database access, environment and migration history');process.exitCode=1;}).finally(()=>pool.end());}
