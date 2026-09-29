'use strict';
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const ref=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(value))throw fail(400,'Invalid reference');return value;};
const only=(input,keys)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!keys.includes(key)))throw fail(400,'Unsupported key operation');};
class ProjectKeys{
 constructor(db,{now=Date.now,authorize=null}={}){
  if(authorize!==null&&typeof authorize!=='function')throw Error('Synchronous key authorization required');
  this.db=db;this.now=now;this.authorize=authorize;
  db.exec(`CREATE TABLE IF NOT EXISTS project_api_keys(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,project TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,label TEXT NOT NULL,scopes TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER,last_used_at INTEGER,actor TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS project_keys_scope ON project_api_keys(tenant,project,created_at);
   CREATE TABLE IF NOT EXISTS project_key_actions(tenant TEXT NOT NULL,project TEXT NOT NULL,action_id TEXT NOT NULL,body TEXT NOT NULL,key_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(tenant,project,action_id));`);
 }
 #scope(p){ref(p.tenant);ref(p.project);}
 #actor(p){this.#scope(p);return ref(p.actorId);}
 #authorize(p,write=false){if(this.authorize){const result=this.authorize(p,{write});if(result?.then)throw Error('Synchronous key authorization required');}}
 #public(row,now=this.now()){return {id:row.id,label:row.label,scopes:JSON.parse(row.scopes),createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),revokedAt:row.revoked_at===null?null:new Date(row.revoked_at).toISOString(),lastUsedAt:row.last_used_at===null?null:new Date(row.last_used_at).toISOString(),status:row.revoked_at!==null&&row.revoked_at<=now?'revoked':row.expires_at<=now?'expired':'active'};}
 #get(p,id){return this.db.prepare('SELECT * FROM project_api_keys WHERE tenant=? AND project=? AND id=?').get(p.tenant,p.project,id);}
 list(p){return this.listPage(p,{limit:100}).keys;}
 listPage(p,options={}){
  this.#scope(p);const {keyListOptions,predicate,pageInfo}=require('./key-list.cjs'),page=keyListOptions(options),filter=predicate(page.state,':now');
  this.db.exec(this.authorize?'BEGIN IMMEDIATE':'BEGIN');try{
   this.#authorize(p);const now=this.now(),args={tenant:p.tenant,project:p.project,now};
   const total=this.db.prepare(`SELECT count(*) n FROM project_api_keys WHERE tenant=:tenant AND project=:project AND :now IS NOT NULL AND (${filter})`).get(args).n;
   const keys=this.db.prepare(`SELECT * FROM project_api_keys WHERE tenant=:tenant AND project=:project AND :now IS NOT NULL AND (${filter}) ORDER BY created_at DESC,id LIMIT :limit OFFSET :offset`).all({...args,limit:page.limit,offset:page.offset}).map(row=>this.#public(row,now));
   this.db.exec('COMMIT');return pageInfo(keys,total,page);
  }catch(e){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw e;}
 }
 create(p,input,{rotateId=null}={}){
  const actor=this.#actor(p);only(input,['actionId','label','scopes','expiresInDays','graceSeconds']);ref(input.actionId);
  if(typeof input.label!=='string'||!input.label.trim()||input.label.length>80||/[\x00-\x1f]/.test(input.label))throw fail(400,'Use a short key label');
  if(!Array.isArray(input.scopes)||input.scopes.length<1||input.scopes.length>2||new Set(input.scopes).size!==input.scopes.length||input.scopes.some(scope=>!['read','write'].includes(scope)))throw fail(400,'Only project read/write scopes are permitted');
  const days=input.expiresInDays??90,grace=input.graceSeconds??0;
  if(!Number.isInteger(days)||days<1||days>365||!Number.isInteger(grace)||grace<0||grace>86400||!rotateId&&grace!==0)throw fail(400,'Invalid key lifetime or rotation grace');
  if(rotateId)ref(rotateId);
  const body=JSON.stringify({operation:rotateId?'rotate':'create',rotateId,actor,label:input.label.trim(),scopes:[...input.scopes].sort(),days,grace});
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.#authorize(p,true);const now=this.now();
   const previous=this.db.prepare('SELECT body,key_id FROM project_key_actions WHERE tenant=? AND project=? AND action_id=?').get(p.tenant,p.project,input.actionId);
   if(previous){if(previous.body!==body)throw fail(409,'Key operation identity conflict');this.db.exec('COMMIT');return {status:'duplicate',key:this.#public(this.#get(p,previous.key_id)),secret:null,secretAvailable:false};}
   const old=rotateId?this.#get(p,rotateId):null;
   if(rotateId&&(!old||old.revoked_at!==null||old.expires_at<=now))throw fail(old?409:404,'Key is unavailable for rotation');
   const active=this.db.prepare('SELECT count(*) AS total FROM project_api_keys WHERE tenant=? AND project=? AND expires_at>? AND (revoked_at IS NULL OR revoked_at>?)').get(p.tenant,p.project,now,now).total;
   if(active>=100&&(!old||grace>0))throw fail(429,'Active API key limit reached');
   const id='key-'+randomUUID(),secret='ovk_'+randomBytes(32).toString('hex');
   this.db.prepare('INSERT INTO project_api_keys(id,tenant,project,token_hash,label,scopes,created_at,expires_at,actor) VALUES(?,?,?,?,?,?,?,?,?)').run(id,p.tenant,p.project,hash(secret),input.label.trim(),JSON.stringify([...input.scopes].sort()),now,now+days*86400000,actor);
   if(old)this.db.prepare('UPDATE project_api_keys SET revoked_at=? WHERE id=? AND tenant=? AND project=?').run(now+grace*1000,old.id,p.tenant,p.project);
   this.db.prepare('INSERT INTO project_key_actions VALUES(?,?,?,?,?,?)').run(p.tenant,p.project,input.actionId,body,id,now);
   this.db.exec('COMMIT');return {status:'created',key:this.#public(this.#get(p,id)),secret,secretAvailable:true};
  }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
 }
 revoke(p,id,{actionId}){
  const actor=this.#actor(p);ref(id);ref(actionId);const body=JSON.stringify({operation:'revoke',id,actor});
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.#authorize(p,true);const now=this.now();
   const previous=this.db.prepare('SELECT body FROM project_key_actions WHERE tenant=? AND project=? AND action_id=?').get(p.tenant,p.project,actionId);
   if(previous&&previous.body!==body)throw fail(409,'Key operation identity conflict');
   const key=this.#get(p,id);if(!key)throw fail(404,'Key not found');
   if(!previous){this.db.prepare('UPDATE project_api_keys SET revoked_at=MIN(COALESCE(revoked_at,?),?) WHERE id=? AND tenant=? AND project=?').run(now,now,id,p.tenant,p.project);this.db.prepare('INSERT INTO project_key_actions VALUES(?,?,?,?,?,?)').run(p.tenant,p.project,actionId,body,id,now);}
   this.db.exec('COMMIT');return {status:previous?'duplicate':'revoked',key:this.#public(this.#get(p,id))};
  }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
 }
 resolve(token){
  if(typeof token!=='string'||!/^ovk_[a-f0-9]{64}$/.test(token))return null;
  this.db.exec('BEGIN IMMEDIATE');try{
   const now=this.now(),row=this.db.prepare('SELECT * FROM project_api_keys WHERE token_hash=? AND expires_at>? AND (revoked_at IS NULL OR revoked_at>?)').get(hash(token),now,now);
   if(row)this.db.prepare('UPDATE project_api_keys SET last_used_at=? WHERE id=?').run(now,row.id);
   this.db.exec('COMMIT');return row?{tenant:row.tenant,project:row.project,scopes:JSON.parse(row.scopes),keyId:row.id}:null;
  }catch(e){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw e;}
 }
}
module.exports={ProjectKeys};
