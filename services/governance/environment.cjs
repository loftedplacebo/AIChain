const {DatabaseSync}=require('node:sqlite');
const {mkdirSync}=require('node:fs');
const {resolve,dirname}=require('node:path');
const STAGES=['dev','test','staging','prod'];
function environmentConfig(env){
 const stage=env.GOVERNANCE_ENV||'dev';
 if(!STAGES.includes(stage))throw new Error('Unknown environment');
 // Both hosted stages require managed identity and operational release evidence.
 if(stage==='prod'||stage==='staging')throw new Error(`${stage==='prod'?'Production':'Staging'} startup is gated until identity and operational readiness are approved`);
 const driver=env.GOVERNANCE_STORAGE||'sqlite';
 if(!['sqlite','postgres'].includes(driver))throw new Error('Unknown storage driver');
 const keyDriver=env.GOVERNANCE_KEY_STORAGE||'sqlite';
 if(!['sqlite','postgres'].includes(keyDriver))throw new Error('Unknown key storage driver');
 if(keyDriver==='postgres'&&driver!=='postgres')throw new Error('PostgreSQL keys require PostgreSQL event storage');
 const controlDriver=env.GOVERNANCE_CONTROL_STORAGE||'sqlite';
 if(!['sqlite','postgres'].includes(controlDriver))throw new Error('Unknown customer control storage driver');
 if(controlDriver==='postgres'&&(driver!=='postgres'||keyDriver!=='postgres'))throw new Error('PostgreSQL control storage requires PostgreSQL events and keys');
 const port=Number(env.PORT??8790);
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid service port');
 if(env.GOVERNANCE_ADOPT_UNBOUND_SQLITE&&!['true','false'].includes(env.GOVERNANCE_ADOPT_UNBOUND_SQLITE))throw new Error('Invalid database adoption flag');
 const root=resolve(__dirname,'../..');
 const path=(value,fallback)=>value===':memory:'?value:resolve(root,value||fallback);
 return {stage,driver,keyDriver,controlDriver,port,adopt:env.GOVERNANCE_ADOPT_UNBOUND_SQLITE==='true',
  eventPath:path(env.GOVERNANCE_DB,`build/governance/${stage}/events.sqlite`),
  sessionPath:path(env.GOVERNANCE_SESSION_DB,`build/governance/${stage}/sessions.sqlite`),
  rulesPath:env.GOVERNANCE_RULES_DB?path(env.GOVERNANCE_RULES_DB):null};
}
// Run before constructors create tables. A marker never authorises production.
function bindSqlite(filename,stage,{adopt=false}={}){
 if(!['dev','test'].includes(stage))throw new Error('SQLite is limited to dev/test');
 if(filename!==':memory:')mkdirSync(dirname(filename),{recursive:true});
 const db=new DatabaseSync(filename);
 try{
  db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const bound=tables.some(t=>t.name==='governance_environment');
  assertRecoveryApproved(db);
  if(bound){
   const rows=db.prepare('SELECT name FROM governance_environment').all();
   if(rows.length!==1||rows[0].name!==stage)throw new Error('Database environment mismatch');
  }else{
   if(tables.length&&!adopt)throw new Error('Unbound existing SQLite database requires reviewed adoption');
   db.exec('CREATE TABLE governance_environment(singleton INTEGER PRIMARY KEY CHECK(singleton=1),name TEXT NOT NULL)');
   db.prepare('INSERT INTO governance_environment VALUES(1,?)').run(stage);
  }
  db.exec('COMMIT');
 }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}finally{db.close();}
}
function assertRecoveryApproved(db){if(!db)return;if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='governance_recovery_gate'").get()){const recovery=db.prepare('SELECT state FROM governance_recovery_gate').all();if(recovery.length!==1||recovery[0].state!=='approved')throw new Error('Restored database requires reviewed recovery before startup');}}
module.exports={environmentConfig,bindSqlite,assertRecoveryApproved};
