'use strict';
const validate=(clientId,startAt,owner,now)=>{
 if(typeof clientId!=='string'||!/^client_[A-Za-z0-9]{1,121}$/.test(clientId)||!Number.isSafeInteger(startAt)||startAt<0||!Number.isSafeInteger(now)||now<startAt||typeof owner!=='string'||!/^[a-f0-9]{64}$/.test(owner))throw Error('Explicit replay baseline, client and lease required');
};
const map=row=>row&&Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['start_at','covered_until','lease_until','last_success','last_failure'].includes(key)&&value!==null?Number(value):value]));
function claimed(row,startAt,owner,now){
 if(row.start_at!==startAt)throw Error('Replay baseline cannot be replaced');
 if(row.lease_owner&&row.lease_until>now)return {status:'busy'};
 return {status:'acquired',coveredUntil:row.covered_until,owner};
}
class SqliteReplayProgress {
 constructor(db){this.db=db;db.exec(`CREATE TABLE IF NOT EXISTS workspace_provider_replay_progress(client_id TEXT PRIMARY KEY,start_at INTEGER NOT NULL,covered_until INTEGER NOT NULL,lease_owner TEXT,lease_until INTEGER NOT NULL DEFAULT 0,last_success INTEGER,last_failure INTEGER)`);}
 read(clientId){
  if(typeof clientId!=='string'||!/^client_[A-Za-z0-9]{1,121}$/.test(clientId))throw Error('Explicit replay client required');
  require('./environment.cjs').assertRecoveryApproved(this.db);
  return this.db.prepare('SELECT * FROM workspace_provider_replay_progress WHERE client_id=?').get(clientId)||null;
 }
 claim(clientId,startAt,owner,now){
  validate(clientId,startAt,owner,now);require('./environment.cjs').assertRecoveryApproved(this.db);this.db.exec('BEGIN IMMEDIATE');try{
   this.db.prepare('INSERT OR IGNORE INTO workspace_provider_replay_progress(client_id,start_at,covered_until) VALUES(?,?,?)').run(clientId,startAt,startAt);
   const row=this.db.prepare('SELECT * FROM workspace_provider_replay_progress WHERE client_id=?').get(clientId),result=claimed(row,startAt,owner,now);
   if(result.status==='acquired')this.db.prepare('UPDATE workspace_provider_replay_progress SET lease_owner=?,lease_until=? WHERE client_id=?').run(owner,now+60000,clientId);
   this.db.exec('COMMIT');return result;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 complete(clientId,claim,end,now){
  require('./environment.cjs').assertRecoveryApproved(this.db);
  if(!Number.isSafeInteger(end)||end<claim.coveredUntil||end>now)throw Error('Invalid replay checkpoint');
  const result=this.db.prepare('UPDATE workspace_provider_replay_progress SET covered_until=?,last_success=?,lease_owner=NULL,lease_until=0 WHERE client_id=? AND lease_owner=? AND lease_until>? AND covered_until=?').run(end,now,clientId,claim.owner,now,claim.coveredUntil);
  if(result.changes!==1)throw Error('Replay lease changed or expired');
 }
 fail(clientId,claim,now){this.db.prepare('UPDATE workspace_provider_replay_progress SET last_failure=?,lease_owner=NULL,lease_until=0 WHERE client_id=? AND lease_owner=?').run(now,clientId,claim.owner);}
 release(clientId,claim){this.db.prepare('UPDATE workspace_provider_replay_progress SET lease_owner=NULL,lease_until=0 WHERE client_id=? AND lease_owner=?').run(clientId,claim.owner);}
}
class PostgresReplayProgress {
 constructor(directory){this.directory=directory;}
 async ready(){
  const rows=(await this.directory.pool.query(`SELECT c.relrowsecurity,c.relforcerowsecurity,pg_has_role(current_user,c.relowner,'MEMBER') owner_access,
   (has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT') AND has_table_privilege(current_user,c.oid,'UPDATE')) allowed
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='governance_provider_replay_progress'`)).rows;
  if(rows.length!==1||!rows[0].relrowsecurity||!rows[0].relforcerowsecurity||rows[0].owner_access||!rows[0].allowed)throw Error('Replay progress runtime privileges or row security are invalid');
 }
 tx(clientId,fn){return this.directory.tx({},async c=>{await c.query("SELECT set_config('governance.replay_client',$1,true)",[clientId]);return fn(c);});}
 async read(clientId){
  if(typeof clientId!=='string'||!/^client_[A-Za-z0-9]{1,121}$/.test(clientId))throw Error('Explicit replay client required');
  return this.tx(clientId,async c=>map((await c.query('SELECT * FROM governance_provider_replay_progress WHERE client_id=$1',[clientId])).rows[0])||null);
 }
 async claim(clientId,startAt,owner,now){
  validate(clientId,startAt,owner,now);
  return this.tx(clientId,async c=>{
   await c.query('INSERT INTO governance_provider_replay_progress(client_id,start_at,covered_until) VALUES($1,$2,$2) ON CONFLICT DO NOTHING',[clientId,startAt]);
   const row=map((await c.query('SELECT * FROM governance_provider_replay_progress WHERE client_id=$1 FOR UPDATE',[clientId])).rows[0]);now=Math.max(now,Date.now());
   const result=claimed(row,startAt,owner,now);if(result.status==='acquired')await c.query('UPDATE governance_provider_replay_progress SET lease_owner=$2,lease_until=$3 WHERE client_id=$1',[clientId,owner,now+60000]);return result;
  });
 }
 async complete(clientId,claim,end,now){
  if(!Number.isSafeInteger(end)||end<claim.coveredUntil||end>now)throw Error('Invalid replay checkpoint');
  return this.tx(clientId,async c=>{
   const row=(await c.query('SELECT * FROM governance_provider_replay_progress WHERE client_id=$1 FOR UPDATE',[clientId])).rows[0];now=Math.max(now,Date.now());
   if(!row||row.lease_owner!==claim.owner||Number(row.lease_until)<=now||Number(row.covered_until)!==claim.coveredUntil)throw Error('Replay lease changed or expired');
   await c.query('UPDATE governance_provider_replay_progress SET covered_until=$2,last_success=$3,lease_owner=NULL,lease_until=0 WHERE client_id=$1',[clientId,end,now]);
  });
 }
 async fail(clientId,claim,now){return this.tx(clientId,c=>c.query('UPDATE governance_provider_replay_progress SET last_failure=$3,lease_owner=NULL,lease_until=0 WHERE client_id=$1 AND lease_owner=$2',[clientId,claim.owner,now]));}
 async release(clientId,claim){return this.tx(clientId,c=>c.query('UPDATE governance_provider_replay_progress SET lease_owner=NULL,lease_until=0 WHERE client_id=$1 AND lease_owner=$2',[clientId,claim.owner]));}
}
module.exports={SqliteReplayProgress,PostgresReplayProgress};
