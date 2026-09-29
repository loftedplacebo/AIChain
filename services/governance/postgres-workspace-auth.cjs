'use strict';
const {randomBytes,createHash}=require('node:crypto');
const digest=v=>createHash('sha256').update(v).digest('hex'),valid=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(status,message)=>Object.assign(Error(message),{status});
class PostgresWorkspaceAuth {
 constructor(sessions,directory,now=Date.now){this.sessions=sessions;this.directory=directory;this.now=now;}
 version(user){return 'customer:'+digest(JSON.stringify([user.id,user.identityVersion]));}
 async login(){throw fail(403,'Hosted customer sign-in required');}
 async loginVerified(identityId,previousToken='',provider=null){
  const now=this.now();if(provider&&(!Number.isSafeInteger(provider.expiresAt)||provider.expiresAt<=now||!/^session_[A-Za-z0-9]+$/.test(provider.providerSessionId)))throw fail(401,'Invalid provider session');
  const token=randomBytes(32).toString('hex'),hash=digest(token);
  const user=await this.sessions.tx({hash,actor:identityId},async c=>{
   if(provider?.clientId){
    await this.sessions.revocations.context(c,provider.clientId,provider.providerSessionId);
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['provider-session',provider.clientId,provider.providerSessionId])]);
    if((await c.query('SELECT session_id FROM governance_provider_revocations WHERE client_id=$1 AND session_id=$2 AND subject=$3',[provider.clientId,provider.providerSessionId,provider.subject])).rows[0])throw fail(401,'Provider session revoked');
   }
   const user=await this.directory.identityIn(c,identityId,{lock:true});if(!user)throw fail(401,'Verified customer identity required');
   await c.query('DELETE FROM governance_customer_sessions WHERE user_id=$1 AND (created<=$2 OR touched<=$3)',[identityId,now-28800000,now-1800000]);
   const previousHash=valid(previousToken)?digest(previousToken):valid(provider?.previousHash)?provider.previousHash:null;
   if(previousHash)await c.query('DELETE FROM governance_customer_sessions WHERE user_id=$1 AND hash=$2',[identityId,previousHash]);
   if(Number((await c.query('SELECT count(*) n FROM governance_customer_sessions WHERE user_id=$1',[identityId])).rows[0].n)>=20)throw fail(429,'Active session limit reached; sign out an existing session');
   const authenticatedAt=Number.isSafeInteger(provider?.authenticatedAt)&&provider.authenticatedAt>=0&&provider.authenticatedAt<=now?provider.authenticatedAt:null;
   await c.query('INSERT INTO governance_customer_sessions(hash,user_id,version,created,touched,expires,session_id,authenticated_at) VALUES($1,$2,$3,$4,$4,$5,$6,$7)',[hash,user.id,(provider?'provider:':'')+this.version(user),now,provider?.expiresAt??null,provider?.providerSessionId??null,authenticatedAt]);return user;
  });
  try{if(previousToken)await this.logout(previousToken);}catch(e){await this.logout(token);throw e;}
  try{return {token,user:await this.publicUser(user)};}catch(e){await this.logout(token);throw e;}
 }
 async resolve(token){
  if(!valid(token))return null;const hash=digest(token),now=this.now();
  return this.sessions.tx({hash},async c=>{
   const initial=(await c.query('SELECT user_id FROM governance_customer_sessions WHERE hash=$1',[hash])).rows[0];if(!initial)return null;
   await this.directory.context(c,{actor:initial.user_id});
   // Identity before session is the shared lock order for login/renew/resolve.
   const user=await this.directory.identityIn(c,initial.user_id,{lock:true});
   const row=(await c.query('SELECT * FROM governance_customer_sessions WHERE hash=$1 FOR UPDATE',[hash])).rows[0];
   const checkedNow=Math.max(now,this.now());
   const backed=row?.version.startsWith('provider:');
   if(!row||!user||row.version!==(backed?'provider:':'')+this.version(user)||backed&&(!row.session_id||Number(row.expires)<=checkedNow)||checkedNow-Number(row.created)>=28800000||checkedNow-Number(row.touched)>=1800000){await c.query('DELETE FROM governance_customer_sessions WHERE hash=$1',[hash]);return null;}
   await c.query('UPDATE governance_customer_sessions SET touched=$2 WHERE hash=$1',[hash,checkedNow]);return user;
  });
 }
 async publicUser(user){
  const u=await this.directory.identity(user.id);if(!u)throw fail(401,'Verified customer identity required');
  return {id:u.id,email:u.email,canCreateWorkspace:true,workspaces:u.workspaces.map(w=>({id:w.id,name:w.name,workspaceId:w.tenant,role:w.role,canManageMembers:['owner','workspace-admin'].includes(w.role),...(['owner','reviewer'].includes(w.role)?{canReview:true}:{}),...(['owner','workspace-admin','governance-admin'].includes(w.role)?{canManageGovernance:true}:{}),...(['owner','workspace-admin'].includes(w.role)?{canManageKeys:true}:{})}))};
 }
 async principal(user,id){
  const current=await this.directory.identity(user.id),w=current?.workspaces.find(w=>w.id===id);if(!w)throw fail(404,'Workspace not found');
  return {tenant:w.tenant,project:w.project,actorId:user.id,scopes:w.role==='owner'?['read','review','manage-governance','manage-keys','manage-members']:w.role==='workspace-admin'?['read','manage-governance','manage-keys','manage-members']:w.role==='governance-admin'?['read','manage-governance']:w.role==='reviewer'?['read','review']:['read']};
 }
 async requireRecent(token){
  if(!valid(token))throw fail(403,'Sign in again to manage keys and workspace access');
  return this.sessions.tx({hash:digest(token)},async c=>{const row=(await c.query('SELECT authenticated_at,session_id FROM governance_customer_sessions WHERE hash=$1',[digest(token)])).rows[0];if(!row?.session_id||row.authenticated_at===null||this.now()-Number(row.authenticated_at)>=300000||Number(row.authenticated_at)>this.now())throw fail(403,'Sign in again to manage keys and workspace access');});
 }
 // Called on the control transaction's client after identity/authority locks.
 // Keep the session row locked through commit so logout and
 // signed provider revocation serialize with the operation.
 async authorizeKeySession(c,p,{write=false}={}){
  return this.authorizeSessionIn(c,p,{write});
 }
 async authorizeSessionIn(c,p,{write=false}={}){
  if(!valid(p?.sessionToken))throw fail(401,'Sign in required');
  const hash=digest(p.sessionToken);
  await c.query("SELECT set_config('governance.session_hash',$1,true)",[hash]);
  const user=await this.directory.identityIn(c,p.actorId,{lock:true});
  const row=(await c.query('SELECT * FROM governance_customer_sessions WHERE hash=$1 AND user_id=$2 FOR UPDATE',[hash,p.actorId])).rows[0];
  const now=this.now(),backed=row?.version.startsWith('provider:');
  if(!row||!user||row.version!==(backed?'provider:':'')+this.version(user)||backed&&(!row.session_id||Number(row.expires)<=now)||now-Number(row.created)>=28800000||now-Number(row.touched)>=1800000)throw fail(401,'Sign in required');
  if(write&&(!row.session_id||row.authenticated_at===null||now-Number(row.authenticated_at)>=300000||Number(row.authenticated_at)>now))throw Object.assign(fail(403,'Sign in again to manage keys and workspace access'),{code:'reauthentication-required'});
 }
 async logoutHash(hash){if(!valid(hash))return {};return this.sessions.tx({hash},async c=>{
  const row=(await c.query('DELETE FROM governance_customer_sessions WHERE hash=$1 RETURNING session_id',[hash])).rows[0];
  return row?.session_id?{logoutUrl:'https://api.workos.com/user_management/sessions/logout?'+new URLSearchParams({session_id:row.session_id})}:{};
 });}
 async logout(token){return valid(token)?this.logoutHash(digest(token)):{};}
 async accountSessions(token,revokeRef=null){return require('./account-sessions.cjs').postgresSessions(this,token,revokeRef);}
}
module.exports={PostgresWorkspaceAuth};
