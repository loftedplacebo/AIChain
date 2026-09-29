'use strict';
const fail=(status,message)=>Object.assign(Error(message),{status});
const valid=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
class PostgresProviderSessions {
 constructor(pool,directory){this.pool=pool;this.directory=directory;this.revocations=new (require('./provider-revocations.cjs').PostgresProviderRevocations)(pool,directory);this.replayProgress=new(require('./provider-replay-state.cjs').PostgresReplayProgress)(directory);}
 async ready(environment){
  await this.directory.ready(environment);
  await this.revocations.ready(environment);
  await this.replayProgress.ready();
  const rows=(await this.pool.query(`SELECT c.relrowsecurity,c.relforcerowsecurity,pg_has_role(current_user,c.relowner,'MEMBER') owner_access,
   (has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT') AND has_table_privilege(current_user,c.oid,'UPDATE') AND has_table_privilege(current_user,c.oid,'DELETE')) allowed
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('governance_customer_sessions','governance_customer_auth_flows')`)).rows;
  if(rows.length!==2||rows.some(r=>!r.relrowsecurity||!r.relforcerowsecurity||r.owner_access||!r.allowed))throw Error('Session runtime privileges or row security are invalid');
 }
 async tx({hash='',actor='',state='',browser='',capacity=false}={},fn){
  return this.directory.tx({actor},async c=>{
   await c.query(`SELECT set_config('governance.session_hash',$1,true),set_config('governance.flow_state',$2,true),set_config('governance.flow_browser',$3,true),set_config('governance.flow_capacity',$4,true)`,[hash,state,browser,capacity?'true':'false']);
   return fn(c);
  });
 }
 map(row){return row?{session:{hash:row.hash,user_id:row.user_id,version:row.version,created:Number(row.created),touched:Number(row.touched)},provider:row.session_id?{expires:Number(row.expires),session_id:row.session_id}:null}:{session:null,provider:null};}
 async read(hash){if(!valid(hash))return this.map(null);return this.tx({hash},async c=>this.map((await c.query('SELECT * FROM governance_customer_sessions WHERE hash=$1',[hash])).rows[0]));}
 async subject(id){return this.directory.tx({actor:id},async c=>(await c.query('SELECT subject FROM governance_customer_identities WHERE id=$1',[id])).rows[0]?.subject);}
 async storeCredential(hash,credential){
  return this.tx({hash},async c=>{
   const row=(await c.query('SELECT user_id FROM governance_customer_sessions WHERE hash=$1',[hash])).rows[0];if(!row)throw fail(401,'Session ended');
   await this.directory.context(c,{actor:row.user_id});
   const result=await c.query('UPDATE governance_customer_sessions SET credential=$2 WHERE hash=$1 AND credential IS NULL AND claim_owner IS NULL',[hash,credential]);if(result.rowCount!==1)throw fail(401,'Session credential unavailable');
  });
 }
 async createFlow(row,now){
  return this.tx({state:row.state_hash,browser:row.browser_hash,capacity:true},async c=>{
   await c.query('SELECT pg_advisory_xact_lock(84532,20260929)');
   await c.query('DELETE FROM governance_customer_auth_flows WHERE expires<=$1',[now]);
   if(Number((await c.query('SELECT count(*) n FROM governance_customer_auth_flows')).rows[0].n)>=1000)throw fail(429,'Sign-in capacity reached; try again later');
   await c.query('INSERT INTO governance_customer_auth_flows(state_hash,browser_hash,verifier,expires,previous_hash,reauth_user_id) VALUES($1,$2,$3,$4,$5,$6)',[row.state_hash,row.browser_hash,row.verifier,row.expires,row.previous_hash,row.reauth_user_id||null]);
  });
 }
 async consumeFlow(state,browser,now){
  return this.tx({state,browser},async c=>(await c.query('DELETE FROM governance_customer_auth_flows WHERE state_hash=$1 AND browser_hash=$2 AND expires>GREATEST($3::bigint,floor(extract(epoch FROM clock_timestamp())*1000)::bigint) RETURNING *',[state,browser,now])).rows[0]);
 }
 async claim(hash,owner,now){
  return this.tx({hash},async c=>{
   const row=(await c.query('SELECT * FROM governance_customer_sessions WHERE hash=$1 FOR UPDATE',[hash])).rows[0];
   now=Math.max(now,Date.now());
   if(!row?.session_id)return {status:'missing'};
   if(Number(row.expires)>now+30000)return {status:'ready'};
   if(row.claim_owner)return {status:Number(row.claim_expires)>now?'busy':'expired'};
   if(!row.credential)return {status:'missing'};
   await this.directory.context(c,{actor:row.user_id});
   await c.query('UPDATE governance_customer_sessions SET credential=NULL,claim_owner=$2,claim_expires=$3 WHERE hash=$1',[hash,owner,now+30000]);
   return {status:'acquired',credential:row.credential};
  });
 }
 async complete(hash,owner,expected,credential,expires,now){
  return this.tx({hash},async c=>{
   const initial=(await c.query('SELECT user_id FROM governance_customer_sessions WHERE hash=$1',[hash])).rows[0];if(!initial)throw fail(401,'Session ended during renewal');
   await this.directory.context(c,{actor:initial.user_id});
   const identity=await this.directory.identityIn(c,initial.user_id,{lock:true});
   if(!identity||expected.version!=='provider:customer:'+require('node:crypto').createHash('sha256').update(JSON.stringify([identity.id,identity.identityVersion])).digest('hex'))throw fail(401,'Renewal identity changed');
   const row=(await c.query('SELECT * FROM governance_customer_sessions WHERE hash=$1 FOR UPDATE',[hash])).rows[0];
   now=Math.max(now,Date.now());
   if(!row||row.version!==expected.version||row.session_id!==expected.sessionId||row.claim_owner!==owner||Number(row.claim_expires)<=now||now-Number(row.created)>=28800000||now-Number(row.touched)>=1800000||row.credential!==null)throw fail(401,'Session ended during renewal');
   await c.query('UPDATE governance_customer_sessions SET credential=$2,expires=$3,claim_owner=NULL,claim_expires=NULL WHERE hash=$1',[hash,credential,expires]);
  });
 }
}
module.exports={PostgresProviderSessions};
