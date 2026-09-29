'use strict';
// Persistent local development only; deliberately separate from synthetic fixtures.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'build/governance/dev/postgres');
const data=path.join(directory,'cluster'),access=path.join(directory,'access.json');
const marker=path.join(directory,'LOCAL-DEVELOPMENT-ONLY'),bin=path.join(root,'build/postgres-runtime/pgsql/bin');
const host='127.0.0.1',port=55440,user='governance_dev_admin';
function checkedDirectory(){
 for(const p of [path.join(root,'build'),path.join(root,'build/governance'),path.join(root,'build/governance/dev'),directory]){
  if(fs.existsSync(p)&&(!fs.lstatSync(p).isDirectory()||fs.lstatSync(p).isSymbolicLink()))throw Error('Unsafe development directory');
 }
 fs.mkdirSync(directory,{recursive:true});
 require('../services/governance/recovery.cjs').recoveryFiles.privateDirectory(directory);
}
function write(file,value){fs.writeFileSync(file,value,{flag:'wx',mode:0o600});}
function run(name,args){
 const executable=path.join(bin,name+'.exe');
 if(!fs.existsSync(executable))throw Error('Portable PostgreSQL runtime required');
 // A detached PostgreSQL child must not inherit a pipe owned by this launcher.
 const result=spawnSync(executable,args,{windowsHide:true,stdio:'ignore',timeout:60000});
 if(result.error||result.status!==0)throw Error('PostgreSQL operation failed; inspect the protected local log');
}
function readAccess(){
 if(!fs.existsSync(marker)||fs.lstatSync(marker).isSymbolicLink()||fs.lstatSync(access).isSymbolicLink())throw Error('Development marker or credentials unavailable');
 const settings=JSON.parse(fs.readFileSync(access,'utf8'));
 if(settings.host!==host||settings.port!==port||settings.user!==user||typeof settings.password!=='string'||!/^[a-f0-9]{64}$/.test(settings.password))throw Error('Development cluster binding mismatch');
 return settings;
}
async function provision(){
 const settings=readAccess(),{Pool}=require('pg');
 const admin=new Pool({...settings,database:'postgres',max:1,connectionTimeoutMillis:5000});
 let ownerPool,apiPool,workerPool;
 try{
  const actual=(await admin.query('SHOW data_directory')).rows[0].data_directory;
  if(path.resolve(actual).toLowerCase()!==data.toLowerCase())throw Error('Connected to another database cluster');
  const database='governance_dev',roles=['governance_dev_owner','governance_dev_api','governance_dev_worker'];
  const existing=await admin.query('SELECT 1 FROM pg_database WHERE datname=$1 UNION ALL SELECT 1 FROM pg_roles WHERE rolname=ANY($2::text[])',[database,roles]);
  if(existing.rowCount||fs.existsSync(path.join(directory,'runtime-access.json')))throw Error('Provisioning requires fresh development roles and database; no existing state is replaced');
  const passwords=roles.map(()=>randomBytes(32).toString('hex'));
  const url=(role,password)=>{const u=new URL('postgresql://127.0.0.1:'+port+'/'+database);u.username=role;u.password=password;return u.href;};
  // Retain private recovery information even if later provisioning fails. Retry is manual.
  write(path.join(directory,'runtime-access.json'),JSON.stringify({environment:'dev',database,owner:url(roles[0],passwords[0]),api:url(roles[1],passwords[1]),worker:url(roles[2],passwords[2])},null,2));
  for(let i=0;i<roles.length;i++)await admin.query(`CREATE ROLE ${roles[i]} LOGIN PASSWORD '${passwords[i]}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await admin.query(`CREATE DATABASE ${database} OWNER ${roles[0]}`);
  ownerPool=new Pool({connectionString:url(roles[0],passwords[0]),max:1});
  await require('../services/governance/postgres-migrate.cjs').migrate(ownerPool,{environment:'dev'});
  const profiles=require('../services/governance/postgres-runtime-profile.cjs');
  await ownerPool.query(profiles.grantSql('api',roles[1]));
  await ownerPool.query(profiles.grantSql('evidence-worker',roles[2]));
  apiPool=new Pool({connectionString:url(roles[1],passwords[1]),max:1});
  workerPool=new Pool({connectionString:url(roles[2],passwords[2]),max:1});
  await profiles.verifyProfile(apiPool,'api');await profiles.verifyProfile(workerPool,'evidence-worker');
  write(path.join(directory,'provisioned.json'),JSON.stringify({environment:'dev',port,database,migrations:require('../services/governance/postgres-migrate.cjs').migrations().length,profiles:['api','evidence-worker'],customerAcceptance:false},null,2));
 }finally{await Promise.all([admin,ownerPool,apiPool,workerPool].filter(Boolean).map(p=>p.end()));}
}
async function main(action){
 if(!['init','start','stop','status','provision'].includes(action))throw Error('Use init, start, stop, status or provision');
 checkedDirectory();
 if(action==='init'){
  if(fs.existsSync(data)||fs.existsSync(access)||fs.existsSync(marker))throw Error('Existing development cluster is never overwritten');
  write(access,JSON.stringify({host,port,user,password:randomBytes(32).toString('hex')},null,2));
  const passwordFile=path.join(directory,'init-password.txt');
  write(passwordFile,JSON.parse(fs.readFileSync(access,'utf8')).password);
  try{run('initdb',['-D',data,'-U',user,'--pwfile='+passwordFile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C']);}
  finally{fs.unlinkSync(passwordFile);}
  write(marker,'Persistent local development; never use the synthetic cluster or production data.');
 }else{
  readAccess();
  if(action==='provision')await provision();
  else run('pg_ctl',action==='start'?['-D',data,'-l',path.join(directory,'postgres.log'),'-o',`-h ${host} -p ${port} -c max_connections=50 -c shared_buffers=64MB`,'-w','start']:action==='stop'?['-D',data,'-m','fast','-w','stop']:['-D',data,'status']);
 }
 console.log(JSON.stringify({operation:action,environment:'dev',host,port,status:'complete',customerAcceptance:false}));
}
module.exports={main};
if(require.main===module)main(process.argv[2]).catch(()=>{console.error('Local development PostgreSQL operation failed. Existing state and private credentials are retained; review the protected files before retrying.');process.exitCode=1;});
