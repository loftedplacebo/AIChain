'use strict';
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {verify}=require('./postgres-migrate.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const ref=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(value))throw fail(400,'Invalid reference');return value;};
class PostgresProjectKeys{
 constructor(pool,{now=Date.now,authorize=null,authorizeSession=null}={}){this.pool=pool;this.now=now;this.authorize=authorize;this.authorizeSession=authorizeSession;}
 async ready(environment){
  if(!['dev','test'].includes(environment))throw Error('Shared keys require a dev/test environment');
  await verify(this.pool);
  await require('./postgres-recovery.cjs').assertActive(this.pool);
  const stage=(await this.pool.query('SELECT name FROM governance_environment')).rows;
  if(stage.length!==1||stage[0].name!==environment)throw Error('Database environment mismatch');
  const role=(await this.pool.query(`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`)).rows[0];
  if(!role||role.rolsuper||role.rolbypassrls)throw Error('Key runtime must not bypass row security');
  const tables=(await this.pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
   pg_has_role(current_user,c.relowner,'MEMBER') AS owner_access,
   (has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT') AND (c.relname='governance_key_actions' OR has_table_privilege(current_user,c.oid,'UPDATE'))) AS allowed
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('governance_project_keys','governance_key_actions','governance_key_scopes')`)).rows;
  if(tables.length!==3||tables.some(t=>!t.relrowsecurity||!t.relforcerowsecurity||t.owner_access||!t.allowed))throw Error('Key runtime privileges or row security are invalid');
 }
 scope(p){ref(p?.tenant);ref(p?.project);}
 public(row,now=this.now()){return {id:row.id,label:row.label,scopes:row.scopes,createdAt:new Date(Number(row.created_at)).toISOString(),expiresAt:new Date(Number(row.expires_at)).toISOString(),revokedAt:row.revoked_at===null?null:new Date(Number(row.revoked_at)).toISOString(),lastUsedAt:row.last_used_at===null?null:new Date(Number(row.last_used_at)).toISOString(),status:row.revoked_at!==null&&Number(row.revoked_at)<=now?'revoked':Number(row.expires_at)<=now?'expired':'active'};}
 async transaction(p,fn,{write=false,keyHash=''}={}){
  if(p)this.scope(p);
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   await require('./postgres-recovery.cjs').assertActive(client);
   await client.query("SELECT set_config('governance.tenant',$1,true),set_config('governance.project',$2,true),set_config('governance.key_hash',$3,true),set_config('statement_timeout','10000',true),set_config('lock_timeout','5000',true)",[p?.tenant||'',p?.project||'',keyHash]);
   if(p&&this.authorize)await this.authorize(client,p);
   if(write){
    await client.query('INSERT INTO governance_key_scopes VALUES($1,$2) ON CONFLICT DO NOTHING',[p.tenant,p.project]);
    await client.query('SELECT tenant FROM governance_key_scopes WHERE tenant=$1 AND project=$2 FOR UPDATE',[p.tenant,p.project]);
   }
   if(p&&this.authorizeSession)await this.authorizeSession(client,p,{write});
   const result=await fn(client);await client.query('COMMIT');return result;
  }catch(e){await client.query('ROLLBACK');if(['57014','55P03','40P01'].includes(e.code))throw fail(503,'Key storage busy; retry with the same action ID');if(e.code==='23505')throw fail(409,'Key operation identity conflict');throw e;}finally{client.release();}
 }
 async get(c,p,id){return (await c.query('SELECT * FROM governance_project_keys WHERE tenant=$1 AND project=$2 AND id=$3',[p.tenant,p.project,id])).rows[0];}
 async list(p){return this.transaction(p,async c=>(await c.query('SELECT * FROM governance_project_keys WHERE tenant=$1 AND project=$2 ORDER BY created_at DESC,id LIMIT 100',[p.tenant,p.project])).rows.map(row=>this.public(row)));}
 async listPage(p,options={}){
  const {keyListOptions,predicate,pageInfo}=require('./key-list.cjs'),page=keyListOptions(options);
  return this.transaction(p,async c=>{
   const now=this.now();const row=(await c.query(`WITH filtered AS (SELECT * FROM governance_project_keys WHERE tenant=$1 AND project=$2 AND $3::bigint IS NOT NULL AND (${predicate(page.state,'$3::bigint')})),
    page AS (SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT $4 OFFSET $5)
    SELECT (SELECT count(*) FROM filtered) total,COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id) FROM page),'[]'::jsonb) keys`,[p.tenant,p.project,now,page.limit,page.offset])).rows[0];
   return pageInfo(row.keys.map(key=>this.public(key,now)),Number(row.total),page);
  });
 }
 async create(p,input,{rotateId=null}={}){
  this.scope(p);const actor=ref(p.actorId);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['actionId','label','scopes','expiresInDays','graceSeconds'].includes(k)))throw fail(400,'Unsupported key operation');
  ref(input.actionId);
  if(typeof input.label!=='string'||!input.label.trim()||input.label.length>80||/[\x00-\x1f]/.test(input.label))throw fail(400,'Use a short key label');
  if(!Array.isArray(input.scopes)||input.scopes.length<1||input.scopes.length>2||new Set(input.scopes).size!==input.scopes.length||input.scopes.some(s=>!['read','write'].includes(s)))throw fail(400,'Only project read/write scopes are permitted');
  const days=input.expiresInDays??90,grace=input.graceSeconds??0;
  if(!Number.isInteger(days)||days<1||days>365||!Number.isInteger(grace)||grace<0||grace>86400||!rotateId&&grace!==0)throw fail(400,'Invalid key lifetime or rotation grace');
  if(rotateId)ref(rotateId);
  const scopes=[...input.scopes].sort(),label=input.label.trim(),body=JSON.stringify({operation:rotateId?'rotate':'create',rotateId,actor,label,scopes,days,grace});
  return this.transaction(p,async c=>{
   const now=this.now(),args=[p.tenant,p.project,input.actionId];
   const previous=(await c.query('SELECT body,key_id FROM governance_key_actions WHERE tenant=$1 AND project=$2 AND action_id=$3',args)).rows[0];
   if(previous){if(previous.body!==body)throw fail(409,'Key operation identity conflict');return {status:'duplicate',key:this.public(await this.get(c,p,previous.key_id)),secret:null,secretAvailable:false};}
   const old=rotateId?await this.get(c,p,rotateId):null;
   if(rotateId&&(!old||old.revoked_at!==null||Number(old.expires_at)<=now))throw fail(old?409:404,'Key is unavailable for rotation');
   const active=Number((await c.query('SELECT count(*) n FROM governance_project_keys WHERE tenant=$1 AND project=$2 AND expires_at>$3 AND (revoked_at IS NULL OR revoked_at>$3)',[p.tenant,p.project,now])).rows[0].n);
   if(active>=100&&(!old||grace>0))throw fail(429,'Active API key limit reached');
   const id='key-'+randomUUID(),secret='ovk_'+randomBytes(32).toString('hex');
   await c.query('INSERT INTO governance_project_keys(id,tenant,project,token_hash,label,scopes,created_at,expires_at,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,p.tenant,p.project,hash(secret),label,JSON.stringify(scopes),now,now+days*86400000,actor]);
   if(old)await c.query('UPDATE governance_project_keys SET revoked_at=$4 WHERE tenant=$1 AND project=$2 AND id=$3',[p.tenant,p.project,old.id,now+grace*1000]);
   await c.query('INSERT INTO governance_key_actions VALUES($1,$2,$3,$4,$5,$6)',[...args,body,id,now]);
   return {status:'created',key:this.public(await this.get(c,p,id)),secret,secretAvailable:true};
  },{write:true});
 }
 async revoke(p,id,{actionId}){
  this.scope(p);const actor=ref(p.actorId);ref(id);ref(actionId);const body=JSON.stringify({operation:'revoke',id,actor});
  return this.transaction(p,async c=>{
   const args=[p.tenant,p.project,actionId],now=this.now(),previous=(await c.query('SELECT body FROM governance_key_actions WHERE tenant=$1 AND project=$2 AND action_id=$3',args)).rows[0];
   if(previous&&previous.body!==body)throw fail(409,'Key operation identity conflict');
   const key=await this.get(c,p,id);if(!key)throw fail(404,'Key not found');
   if(!previous){await c.query('UPDATE governance_project_keys SET revoked_at=LEAST(COALESCE(revoked_at,$4),$4) WHERE tenant=$1 AND project=$2 AND id=$3',[p.tenant,p.project,id,now]);await c.query('INSERT INTO governance_key_actions VALUES($1,$2,$3,$4,$5,$6)',[...args,body,id,now]);}
   return {status:previous?'duplicate':'revoked',key:this.public(await this.get(c,p,id))};
  },{write:true});
 }
 async resolve(token){
  if(typeof token!=='string'||!/^ovk_[a-f0-9]{64}$/.test(token))return null;
  const tokenHash=hash(token);
  return this.transaction(null,async c=>{
   const row=(await c.query('SELECT tenant,project,id FROM governance_project_keys WHERE token_hash=$1',[tokenHash])).rows[0];if(!row)return null;
   await c.query("SELECT set_config('governance.tenant',$1,true),set_config('governance.project',$2,true)",[row.tenant,row.project]);
   // Recheck validity during the update after any concurrent revocation commits.
   // clock_timestamp(), unlike transaction_timestamp(), advances while waiting.
   // Keep the injected clock as a lower bound for deterministic expiry tests.
   const now=this.now(),valid=(await c.query(`UPDATE governance_project_keys SET last_used_at=GREATEST(COALESCE(last_used_at,0),$2::bigint)
    WHERE token_hash=$1 AND expires_at>GREATEST($2::bigint,floor(extract(epoch FROM clock_timestamp())*1000)::bigint)
    AND (revoked_at IS NULL OR revoked_at>GREATEST($2::bigint,floor(extract(epoch FROM clock_timestamp())*1000)::bigint))
    RETURNING tenant,project,scopes,id`,[tokenHash,now])).rows[0];
   return valid?{tenant:valid.tenant,project:valid.project,scopes:valid.scopes,keyId:valid.id}:null;
  },{keyHash:tokenHash});
 }
}
module.exports={PostgresProjectKeys};
