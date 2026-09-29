const {randomBytes,createHash,scryptSync,scrypt,timingSafeEqual}=require('node:crypto');
const {promisify}=require('node:util');
const derive=promisify(scrypt);
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const options={N:32768,r:8,p:3,maxmem:64*1024*1024};
function passwordHash(password,salt=randomBytes(16).toString('hex')) {return salt+':'+scryptSync(password,salt,32,options).toString('hex');}
class WorkspaceAuth {
 constructor(db,users=[],now=Date.now,directory=null){
  this.db=db;this.users=users;this.now=now;this.directory=directory;
  require('./provider-revocations.cjs').sqliteSchema(db);
  for(const u of users) if(!u.id||!u.email||!/^\w{32}:[a-f0-9]{64}$/.test(u.passwordHash)||!Array.isArray(u.workspaces)||u.workspaces.some(w=>!w.id||!w.tenant||!w.project||!w.name||(w.role!==undefined&&!['reader','reviewer','governance-admin','workspace-admin'].includes(w.role))))throw new Error('Invalid workspace user configuration');
  if(new Set(users.map(u=>u.id)).size!==users.length||new Set(users.map(u=>u.email.toLowerCase())).size!==users.length)throw new Error('Duplicate workspace user');
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,version TEXT NOT NULL,created INTEGER NOT NULL,touched INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS workspace_login_limits(key TEXT PRIMARY KEY,started INTEGER NOT NULL,count INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS workspace_provider_sessions(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL,session_id TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS workspace_provider_refresh(hash TEXT PRIMARY KEY,credential TEXT);
   CREATE TABLE IF NOT EXISTS workspace_refresh_claims(hash TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS workspace_active_auth(hash TEXT PRIMARY KEY,authenticated_at INTEGER NOT NULL);`);
 }
 version(u){return u.customer?'customer:'+digest(JSON.stringify([u.id,u.identityVersion])):digest(JSON.stringify(u));}
 pruneSessions(now){this.db.prepare('DELETE FROM workspace_sessions WHERE created<? OR touched<? OR hash IN(SELECT hash FROM workspace_provider_sessions WHERE expires<=? AND hash NOT IN(SELECT hash FROM workspace_provider_refresh))').run(now-28800000,now-1800000,now);this.db.exec('DELETE FROM workspace_provider_sessions WHERE hash NOT IN(SELECT hash FROM workspace_sessions); DELETE FROM workspace_provider_refresh WHERE hash NOT IN(SELECT hash FROM workspace_sessions); DELETE FROM workspace_refresh_claims WHERE hash NOT IN(SELECT hash FROM workspace_sessions); DELETE FROM workspace_active_auth WHERE hash NOT IN(SELECT hash FROM workspace_sessions)');}
 // Called only after trusted provider verification. No HTTP route accepts a user ID.
 loginVerified(identityId,previousToken='',provider=null){
  const user=this.directory?.identity(identityId);if(!user)throw fail(401,'Verified customer identity required');
  const now=this.now();
  if(provider&&(!Number.isSafeInteger(provider.expiresAt)||provider.expiresAt<=now||!/^session_[A-Za-z0-9]+$/.test(provider.providerSessionId)))throw fail(401,'Invalid provider session');
  const token=randomBytes(32).toString('hex');this.db.exec('BEGIN IMMEDIATE');try{
  if(provider?.clientId&&this.db.prepare('SELECT session_id FROM workspace_provider_revocations WHERE client_id=? AND session_id=? AND subject=?').get(provider.clientId,provider.providerSessionId,provider.subject))throw fail(401,'Provider session revoked');
  this.logout(previousToken);this.pruneSessions(now);if(this.db.prepare('SELECT count(*) n FROM workspace_sessions WHERE user_id=?').get(user.id).n>=20)throw fail(429,'Active session limit reached; sign out an existing session');this.db.prepare('INSERT INTO workspace_sessions VALUES(?,?,?,?,?)').run(digest(token),user.id,(provider?'provider:':'')+this.version(user),now,now);
  if(provider)this.db.prepare('INSERT INTO workspace_provider_sessions VALUES(?,?,?)').run(digest(token),provider.expiresAt,provider.providerSessionId);
  if(Number.isSafeInteger(provider?.authenticatedAt)&&provider.authenticatedAt>=0&&provider.authenticatedAt<=now)this.db.prepare('INSERT INTO workspace_active_auth VALUES(?,?)').run(digest(token),provider.authenticatedAt);
  this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  return {token,user:this.publicUser(user)};
 }
 async login(email,password,previousToken=''){
  if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length>1024)throw fail(401,'Sign-in failed');
  const now=this.now(),key=digest(email.toLowerCase());
  this.db.prepare('DELETE FROM workspace_login_limits WHERE started<?').run(now-900000);
  for(const k of ['global',key]){
   const row=this.db.prepare('SELECT count FROM workspace_login_limits WHERE key=?').get(k);
   if(row?.count>=(k==='global'?100:10))throw fail(429,'Too many sign-in attempts; try again later');
   this.db.prepare('INSERT INTO workspace_login_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1').run(k,now);
  }
  const user=this.users.find(u=>u.email.toLowerCase()===email.toLowerCase()&&!u.disabled);
  const [salt,expected]=(user?.passwordHash||'0'.repeat(32)+':'+ '0'.repeat(64)).split(':');
  const actual=await derive(password,salt,32,options);
  if(!user||!timingSafeEqual(actual,Buffer.from(expected,'hex')))throw fail(401,'Sign-in failed');
  this.logout(previousToken);
  this.pruneSessions(now);
  const token=randomBytes(32).toString('hex');
  this.db.prepare('INSERT INTO workspace_sessions VALUES(?,?,?,?,?)').run(digest(token),user.id,this.version(user),now,now);
  return {token,user:this.publicUser(user)};
 }
 publicUser(u){if(u.customer)u=this.directory?.identity(u.id)||{...u,workspaces:[]};return {id:u.id,email:u.email,...(u.customer?{canCreateWorkspace:true}:{}),workspaces:u.workspaces.map(w=>({id:w.id,name:w.name,...(u.customer?{workspaceId:w.tenant,role:w.role,canManageMembers:['owner','workspace-admin'].includes(w.role)}:{}),...(['reviewer','owner'].includes(w.role)?{canReview:true}:{}),...(['governance-admin','workspace-admin','owner'].includes(w.role)?{canManageGovernance:true}:{}),...(['workspace-admin','owner'].includes(w.role)?{canManageKeys:true}:{})}))};}
 resolve(token){
  if(!/^[a-f0-9]{64}$/.test(token||''))return null;
  const row=this.db.prepare('SELECT * FROM workspace_sessions WHERE hash=?').get(digest(token));
  const provider=this.db.prepare('SELECT expires FROM workspace_provider_sessions WHERE hash=?').get(digest(token));
  const backed=row?.version.startsWith('provider:');
  const user=row&&((row.version.startsWith('customer:')||row.version.startsWith('provider:customer:'))?this.directory?.identity(row.user_id):this.users.find(u=>u.id===row.user_id&&!u.disabled));
  if(!user||row.version!==(backed?'provider:':'')+this.version(user)||backed&&!provider||provider&&provider.expires<=this.now()||this.now()-row.created>=28800000||this.now()-row.touched>=1800000){this.logout(token);return null;}
  this.db.prepare('UPDATE workspace_sessions SET touched=? WHERE hash=?').run(this.now(),digest(token));return user;
 }
 principal(user,id){if(user.customer)user=this.directory?.identity(user.id)||{...user,workspaces:[]};const w=user.workspaces.find(w=>w.id===id);if(!w)throw fail(404,'Workspace not found');return {tenant:w.tenant,project:w.project,scopes:w.role==='owner'?['read','review','manage-governance','manage-keys','manage-members']:w.role==='reviewer'?['read','review']:w.role==='workspace-admin'?['read','manage-governance','manage-keys','manage-members']:w.role==='governance-admin'?['read','manage-governance']:['read'],actorId:user.id};}
 requireRecent(token){const row=this.db.prepare('SELECT a.authenticated_at FROM workspace_active_auth a JOIN workspace_sessions s ON s.hash=a.hash JOIN workspace_provider_sessions p ON p.hash=s.hash WHERE s.hash=?').get(digest(token||''));if(!row||this.now()-row.authenticated_at>=300000||row.authenticated_at>this.now())throw fail(403,'Sign in again to manage keys and workspace access');}
 accountSessions(token,revokeRef=null){return require('./account-sessions.cjs').sqliteSessions(this,token,revokeRef);}
 logoutHash(hash){this.db.prepare('DELETE FROM workspace_active_auth WHERE hash=?').run(hash);const provider=this.db.prepare('SELECT session_id FROM workspace_provider_sessions WHERE hash=?').get(hash);this.db.prepare('DELETE FROM workspace_refresh_claims WHERE hash=?').run(hash);this.db.prepare('DELETE FROM workspace_provider_refresh WHERE hash=?').run(hash);this.db.prepare('DELETE FROM workspace_provider_sessions WHERE hash=?').run(hash);this.db.prepare('DELETE FROM workspace_sessions WHERE hash=?').run(hash);return provider?{logoutUrl:'https://api.workos.com/user_management/sessions/logout?'+new URLSearchParams({session_id:provider.session_id})}:{};}
 logout(token){return token?this.logoutHash(digest(token)):{};}
}
module.exports={WorkspaceAuth,passwordHash};
