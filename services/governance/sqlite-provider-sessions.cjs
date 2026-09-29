'use strict';
// Provider state is isolated here so WorkosAuth does not depend on SQLite SQL.
// A consumed rotating credential is never retried after an uncertain exchange.
class SqliteProviderSessions {
 constructor(db){
  this.db=db;
  this.revocations=new (require('./provider-revocations.cjs').SqliteProviderRevocations)(db);
  this.replayProgress=new(require('./provider-replay-state.cjs').SqliteReplayProgress)(db);
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_auth_flows(state_hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL,previous_hash TEXT);
   CREATE TABLE IF NOT EXISTS workspace_refresh_claims(hash TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS workspace_auth_reauth(state_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL);`);
 }
 read(hash){
  return {session:this.db.prepare('SELECT * FROM workspace_sessions WHERE hash=?').get(hash),provider:this.db.prepare('SELECT * FROM workspace_provider_sessions WHERE hash=?').get(hash)};
 }
 subject(id){return this.db.prepare('SELECT subject FROM customer_identities WHERE id=?').get(id)?.subject;}
 storeCredential(hash,credential){this.db.prepare('INSERT INTO workspace_provider_refresh VALUES(?,?)').run(hash,credential);}
 createFlow(row,now){
  this.db.exec('BEGIN IMMEDIATE');try{
   this.db.prepare('DELETE FROM workspace_auth_flows WHERE expires<=?').run(now);this.db.exec('DELETE FROM workspace_auth_reauth WHERE state_hash NOT IN(SELECT state_hash FROM workspace_auth_flows)');
   if(this.db.prepare('SELECT count(*) n FROM workspace_auth_flows').get().n>=1000)throw Object.assign(Error('Sign-in capacity reached; try again later'),{status:429});
   this.db.prepare('INSERT INTO workspace_auth_flows VALUES(?,?,?,?,?)').run(row.state_hash,row.browser_hash,row.verifier,row.expires,row.previous_hash);
   if(row.reauth_user_id)this.db.prepare('INSERT INTO workspace_auth_reauth VALUES(?,?)').run(row.state_hash,row.reauth_user_id);
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 consumeFlow(state,browser,now){this.db.exec('BEGIN IMMEDIATE');try{const binding=this.db.prepare('SELECT user_id FROM workspace_auth_reauth WHERE state_hash=?').get(state);const row=this.db.prepare('DELETE FROM workspace_auth_flows WHERE state_hash=? AND browser_hash=? AND expires>? RETURNING *').get(state,browser,now);if(row)this.db.prepare('DELETE FROM workspace_auth_reauth WHERE state_hash=?').run(state);this.db.exec('COMMIT');return row?{...row,reauth_user_id:binding?.user_id}:undefined;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 claim(hash,owner,now){
  this.db.exec('BEGIN IMMEDIATE');try{
   const state=this.read(hash),lease=this.db.prepare('SELECT * FROM workspace_refresh_claims WHERE hash=?').get(hash);
   let result;
   if(!state.session||!state.provider)result={status:'missing'};
   else if(state.provider.expires>now+30000)result={status:'ready'};
   else if(lease)result={status:lease.expires>now?'busy':'expired'};
   else {
    const row=this.db.prepare('SELECT credential FROM workspace_provider_refresh WHERE hash=? AND credential IS NOT NULL').get(hash);
    if(!row)result={status:'missing'};
    else {
     this.db.prepare('UPDATE workspace_provider_refresh SET credential=NULL WHERE hash=?').run(hash);
     this.db.prepare('INSERT INTO workspace_refresh_claims VALUES(?,?,?)').run(hash,owner,now+30000);
     result={status:'acquired',credential:row.credential};
    }
   }
   this.db.exec('COMMIT');return result;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 complete(hash,owner,expected,credential,expires,now){
  this.db.exec('BEGIN IMMEDIATE');try{
   const {session,provider}=this.read(hash),lease=this.db.prepare('SELECT * FROM workspace_refresh_claims WHERE hash=?').get(hash);
   if(!session||session.version!==expected.version||!provider||provider.session_id!==expected.sessionId||!lease||lease.owner!==owner||lease.expires<=now||now-session.created>=28800000||now-session.touched>=1800000)throw Object.assign(Error('Session ended during renewal'),{status:401});
   const updated=this.db.prepare('UPDATE workspace_provider_refresh SET credential=? WHERE hash=? AND credential IS NULL').run(credential,hash);
   if(updated.changes!==1)throw Object.assign(Error('Session renewal unavailable'),{status:401});
   this.db.prepare('UPDATE workspace_provider_sessions SET expires=? WHERE hash=?').run(expires,hash);
   this.db.prepare('DELETE FROM workspace_refresh_claims WHERE hash=? AND owner=?').run(hash,owner);
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
module.exports={SqliteProviderSessions};
