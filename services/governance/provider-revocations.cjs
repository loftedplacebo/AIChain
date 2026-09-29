'use strict';
const fail=(status,message)=>Object.assign(Error(message),{status});
function sqliteSchema(db){db.exec(`CREATE TABLE IF NOT EXISTS workspace_provider_revocations(client_id TEXT NOT NULL,session_id TEXT NOT NULL,subject TEXT NOT NULL,received INTEGER NOT NULL,PRIMARY KEY(client_id,session_id));
 CREATE TABLE IF NOT EXISTS workspace_identity_events(client_id TEXT NOT NULL,event_id TEXT NOT NULL,digest TEXT NOT NULL,received INTEGER NOT NULL,PRIMARY KEY(client_id,event_id));`);}
class SqliteProviderRevocations {
 constructor(db){this.db=db;sqliteSchema(db);}
 revoked(clientId,sessionId,subject){return !!this.db.prepare('SELECT session_id FROM workspace_provider_revocations WHERE client_id=? AND session_id=? AND subject=?').get(clientId,sessionId,subject);}
 apply(clientId,event,now){
  this.db.exec('BEGIN IMMEDIATE');try{
   const previous=this.db.prepare('SELECT digest FROM workspace_identity_events WHERE client_id=? AND event_id=?').get(clientId,event.eventId);
   if(previous){if(previous.digest!==event.digest)throw fail(409,'Provider event identity conflict');this.db.exec('COMMIT');return {status:'duplicate'};}
   const tomb=this.db.prepare('SELECT subject FROM workspace_provider_revocations WHERE client_id=? AND session_id=?').get(clientId,event.sessionId);if(tomb&&tomb.subject!==event.subject)throw fail(409,'Provider session identity conflict');
   this.db.prepare('INSERT OR IGNORE INTO workspace_provider_revocations VALUES(?,?,?,?)').run(clientId,event.sessionId,event.subject,now);
   const sessions=this.db.prepare(`SELECT s.hash FROM workspace_sessions s JOIN workspace_provider_sessions p ON p.hash=s.hash JOIN customer_identities i ON i.id=s.user_id WHERE p.session_id=? AND i.provider=? AND i.subject=?`).all(event.sessionId,'workos:'+clientId,event.subject);
   for(const {hash} of sessions)for(const table of ['workspace_active_auth','workspace_refresh_claims','workspace_provider_refresh','workspace_provider_sessions','workspace_sessions'])this.db.prepare('DELETE FROM '+table+' WHERE hash=?').run(hash);
   this.db.prepare('INSERT INTO workspace_identity_events VALUES(?,?,?,?)').run(clientId,event.eventId,event.digest,now);this.db.exec('COMMIT');return {status:'applied'};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
class PostgresProviderRevocations {
 constructor(pool,directory){this.pool=pool;this.directory=directory;}
 async ready(environment){
  await this.directory.ready(environment);
  const rows=(await this.pool.query(`SELECT c.relrowsecurity,c.relforcerowsecurity,pg_has_role(current_user,c.relowner,'MEMBER') owner_access,
   (has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT')) allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('governance_provider_revocations','governance_identity_events')`)).rows;
  if(rows.length!==2||rows.some(r=>!r.relrowsecurity||!r.relforcerowsecurity||r.owner_access||!r.allowed))throw Error('Provider event runtime privileges or row security are invalid');
 }
 async context(c,clientId,sessionId,eventId=''){await c.query("SELECT set_config('governance.revocation_client',$1,true),set_config('governance.revocation_session',$2,true),set_config('governance.revocation_event',$3,true)",[clientId,sessionId,eventId]);}
 async revoked(clientId,sessionId,subject){return this.directory.tx({},async c=>{await this.context(c,clientId,sessionId);return !!(await c.query('SELECT session_id FROM governance_provider_revocations WHERE client_id=$1 AND session_id=$2 AND subject=$3',[clientId,sessionId,subject])).rows[0];});}
 async apply(clientId,event,now){
  return this.directory.tx({provider:'workos:'+clientId,subject:event.subject},async c=>{
   await this.context(c,clientId,event.sessionId,event.eventId);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['provider-session',clientId,event.sessionId])]);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['provider-event',clientId,event.eventId])]);
   const previous=(await c.query('SELECT digest FROM governance_identity_events WHERE client_id=$1 AND event_id=$2',[clientId,event.eventId])).rows[0];
   if(previous){if(previous.digest!==event.digest)throw fail(409,'Provider event identity conflict');return {status:'duplicate'};}
   const tomb=(await c.query('SELECT subject FROM governance_provider_revocations WHERE client_id=$1 AND session_id=$2',[clientId,event.sessionId])).rows[0];if(tomb&&tomb.subject!==event.subject)throw fail(409,'Provider session identity conflict');
   await c.query('INSERT INTO governance_provider_revocations VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[clientId,event.sessionId,event.subject,now]);
   await c.query('DELETE FROM governance_customer_sessions WHERE session_id=$1',[event.sessionId]);
   await c.query('INSERT INTO governance_identity_events VALUES($1,$2,$3,$4)',[clientId,event.eventId,event.digest,now]);return {status:'applied'};
  });
 }
}
module.exports={SqliteProviderRevocations,PostgresProviderRevocations,sqliteSchema};
