'use strict';
const {migrations}=require('./postgres-migrate.cjs');
const {assertRecoveryApproved}=require('./environment.cjs');

// Runtime dependency readiness, not a production-release or provider-health claim.
// One outstanding probe per process prevents an unavailable pool from accumulating
// connection waiters under repeated health checks. Late completions are discarded.
function createReadiness({environment,sqlite=[],pool=null,runtimeProfile='pilot',timeoutMs=1500,cacheMs=1000}){
 if(!['pilot','api','evidence-worker'].includes(runtimeProfile)||!pool&&runtimeProfile!=='pilot')throw Error('Invalid readiness runtime profile');
 if(!['dev','test'].includes(environment)||!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>5000||!Number.isInteger(cacheMs)||cacheMs<0||cacheMs>5000)throw Error('Invalid readiness configuration');
 const databases=[...new Set(sqlite.filter(Boolean))],expected=pool?migrations():[];
 if(!pool&&!databases.length)throw Error('Readiness requires configured storage');
 let pending=null,cached=null,draining=false;
 const failed=()=>({status:'not-ready'});
 async function inspect(){
  for(const db of databases){
   const rows=db.prepare('SELECT name FROM governance_environment').all();
   if(rows.length!==1||rows[0].name!==environment)throw Error('Environment mismatch');
   assertRecoveryApproved(db);
  }
  if(pool){
   const client=await pool.connect();let broken=false;
   const query=(text,values=[])=>client.query({text,values,query_timeout:timeoutMs});
   try{
    await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)",[String(timeoutMs)]);
    if(runtimeProfile!=='pilot')await require('./postgres-runtime-profile.cjs').verifyProfile({query},runtimeProfile);
    const env=(await query('SELECT name FROM governance_environment')).rows;
    const gate=(await query('SELECT state FROM governance_recovery_gate')).rows;
    const applied=(await query('SELECT name,checksum FROM governance_migrations')).rows;
    const allowedGate=gate.length===1&&(runtimeProfile==='evidence-worker'?gate[0].state==='active':['active','customer-active'].includes(gate[0].state));
    if(env.length!==1||env[0].name!==environment||!allowedGate||applied.length!==expected.length||expected.some(m=>!applied.some(a=>a.name===m.name&&a.checksum===m.checksum)))throw Error('Storage readiness mismatch');
    await query('COMMIT');
   }catch(e){broken=true;throw e;}finally{client.release(broken);}
  }
  return {status:'ready'};
 }
 return {
  drain(){draining=true;cached=null;},
  async check(){
   if(draining)return failed();
   if(cached&&Date.now()-cached.at<cacheMs)return cached.value;
   if(!pending){
    const operation=Promise.resolve().then(inspect).catch(failed);
    pending=operation;
    operation.finally(()=>{if(pending===operation)pending=null;});
   }
   let timer,timedOut=false;
   const value=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>{timedOut=true;resolve(failed());},timeoutMs);})]).finally(()=>clearTimeout(timer));
   if(draining)return failed();
   if(!timedOut&&value.status==='ready')cached={at:Date.now(),value};
   return value;
  }
 };
}
module.exports={createReadiness};
