const {randomUUID,randomBytes,createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const ROLES=['owner','workspace-admin','governance-admin','reviewer','reader'];
const reference=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value);
function name(value){if(typeof value!=='string'||!value.trim()||value.trim().length>100||/[\x00-\x1f\x7f]/.test(value))throw fail(400,'Invalid name');return value.trim();}
function strict(input,fields){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k)))throw fail(400,'Invalid customer operation');}
class CustomerDirectory {
 constructor(db,now=Date.now){this.db=db;this.now=now;db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS customer_identities(id TEXT PRIMARY KEY,provider TEXT NOT NULL,subject TEXT NOT NULL,email TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,UNIQUE(provider,subject));
  CREATE TABLE IF NOT EXISTS customer_workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS customer_projects(id TEXT PRIMARY KEY,workspace TEXT NOT NULL REFERENCES customer_workspaces(id),name TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS customer_memberships(workspace TEXT NOT NULL REFERENCES customer_workspaces(id),user_id TEXT NOT NULL REFERENCES customer_identities(id),role TEXT NOT NULL,PRIMARY KEY(workspace,user_id));
  CREATE TABLE IF NOT EXISTS customer_actions(actor TEXT NOT NULL,action_id TEXT NOT NULL,body TEXT NOT NULL,result TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(actor,action_id));
  CREATE TABLE IF NOT EXISTS customer_invitations(id TEXT PRIMARY KEY,workspace TEXT NOT NULL REFERENCES customer_workspaces(id),email TEXT NOT NULL,role TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL,revoked INTEGER,accepted_by TEXT REFERENCES customer_identities(id),created INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS customer_project_workspace ON customer_projects(workspace);
  CREATE INDEX IF NOT EXISTS customer_member_user ON customer_memberships(user_id);
 `);}
 // Trusted server integration only: never expose this method to request bodies.
 // The provider adapter must verify the identity/email before calling it.
 verifiedIdentity({provider,subject,email,emailVerified}){
  if(!reference(provider)||!reference(subject)||emailVerified!==true||typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(403,'Verified provider identity required');
  const existing=this.db.prepare('SELECT * FROM customer_identities WHERE provider=? AND subject=?').get(provider,subject);
  if(existing?.disabled)throw fail(403,'Customer identity disabled');
  if(existing){this.db.prepare('UPDATE customer_identities SET email=? WHERE id=?').run(email.toLowerCase(),existing.id);return this.identity(existing.id);}
  const id='usr-'+randomUUID();this.db.prepare('INSERT INTO customer_identities(id,provider,subject,email) VALUES(?,?,?,?)').run(id,provider,subject,email.toLowerCase());return this.identity(id);
 }
 identity(id){const row=this.db.prepare('SELECT id,email,version,disabled FROM customer_identities WHERE id=?').get(id);return row&&!row.disabled?{id:row.id,email:row.email,identityVersion:row.version,customer:true,workspaces:this.projects(id)}:null;}
 disableIdentity(id){this.db.prepare('UPDATE customer_identities SET disabled=1,version=version+1 WHERE id=?').run(id);}
 projects(userId){return this.db.prepare(`SELECT p.id,p.workspace tenant,p.id project,p.name projectName,w.name workspaceName,m.role FROM customer_projects p JOIN customer_workspaces w ON w.id=p.workspace JOIN customer_memberships m ON m.workspace=w.id WHERE m.user_id=? ORDER BY w.created,p.created,p.id`).all(userId).map(p=>({...p,name:p.workspaceName+' / '+p.projectName}));}
 member(userId,workspace){return this.db.prepare('SELECT role FROM customer_memberships WHERE user_id=? AND workspace=?').get(userId,workspace);}
 transaction(actor,input,operation,run,authorize=null,authorizeSession=null){
  if(!this.identity(actor))throw fail(401,'Verified customer identity required');
  if(!reference(input.actionId))throw fail(400,'Action ID required');
  const body=JSON.stringify({operation,...input});
  this.db.exec('BEGIN IMMEDIATE');
  try{
   // Recheck after acquiring the write lock: another connection may have
   // disabled the customer while this transaction was waiting to begin.
   if(!this.identity(actor))throw fail(401,'Verified customer identity required');
   authorize?.();
   this.sessionCheck(authorizeSession,actor);
   const previous=this.db.prepare('SELECT body,result FROM customer_actions WHERE actor=? AND action_id=?').get(actor,input.actionId);
   if(previous){if(previous.body!==body)throw fail(409,'Action ID already used with different data');this.db.exec('COMMIT');return {...JSON.parse(previous.result),status:'duplicate'};}
   const result=run(),stored={...result};if('secret' in stored){stored.secret=null;stored.secretAvailable=false;}this.db.prepare('INSERT INTO customer_actions VALUES(?,?,?,?,?)').run(actor,input.actionId,body,JSON.stringify(stored),this.now());this.db.exec('COMMIT');return result;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 createWorkspace(actor,input,{authorizeSession=null}={}){strict(input,['actionId','name','projectName']);const normalized={actionId:input.actionId,name:name(input.name),projectName:name(input.projectName)};
  return this.transaction(actor,normalized,'workspace-create',()=>{
   const count=this.db.prepare("SELECT count(*) n FROM customer_memberships WHERE user_id=? AND role='owner'").get(actor).n;if(count>=20)throw fail(429,'Workspace limit reached');
   const workspaceId='org-'+randomUUID(),projectId='prj-'+randomUUID(),now=this.now();
   this.db.prepare('INSERT INTO customer_workspaces VALUES(?,?,?)').run(workspaceId,normalized.name,now);
   this.db.prepare('INSERT INTO customer_projects VALUES(?,?,?,?)').run(projectId,workspaceId,normalized.projectName,now);
   this.db.prepare('INSERT INTO customer_memberships VALUES(?,?,?)').run(workspaceId,actor,'owner');
   return {status:'created',workspaceId,projectId};
  },null,authorizeSession);
 }
 requireAdmin(actor,workspace,owner=false){if(!this.identity(actor))throw fail(401,'Verified customer identity required');if(!reference(workspace))throw fail(404,'Workspace not found');const member=this.member(actor,workspace);if(!member)throw fail(404,'Workspace not found');if(owner?member.role!=='owner':!['owner','workspace-admin'].includes(member.role))throw fail(403,owner?'Workspace owner permission required':'Workspace administrator permission required');return member;}
 createProject(actor,workspace,input,{authorizeSession=null}={}){strict(input,['actionId','name']);this.requireAdmin(actor,workspace);const normalized={actionId:input.actionId,name:name(input.name),workspace};
  return this.transaction(actor,normalized,'project-create',()=>{
   this.requireAdmin(actor,workspace);if(this.db.prepare('SELECT count(*) n FROM customer_projects WHERE workspace=?').get(workspace).n>=100)throw fail(429,'Project limit reached');
   const projectId='prj-'+randomUUID();this.db.prepare('INSERT INTO customer_projects VALUES(?,?,?,?)').run(projectId,workspace,normalized.name,this.now());return {status:'created',workspaceId:workspace,projectId};
  },()=>this.requireAdmin(actor,workspace),authorizeSession);
 }
 sessionCheck(check,actor){if(check?.(this.db,actor)?.then)throw Error('Synchronous customer session authorization required');}
 read(actor,workspace,run,authorizeSession){this.db.exec('BEGIN IMMEDIATE');try{this.requireAdmin(actor,workspace);this.sessionCheck(authorizeSession,actor);const result=run();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 members(actor,workspace,{authorizeSession=null}={}){return this.read(actor,workspace,()=>this.db.prepare('SELECT m.user_id id,i.email,m.role FROM customer_memberships m JOIN customer_identities i ON i.id=m.user_id WHERE m.workspace=? ORDER BY m.user_id').all(workspace),authorizeSession);}
 changeMember(actor,workspace,input,{authorizeSession=null}={}){strict(input,['actionId','userId','role']);this.requireAdmin(actor,workspace,true);
  if(!reference(input.userId)||!(input.role===null||ROLES.includes(input.role)))throw fail(400,'Invalid membership change');
  const normalized={actionId:input.actionId,userId:input.userId,role:input.role,workspace};
  return this.transaction(actor,normalized,'member-change',()=>{
   this.requireAdmin(actor,workspace,true);
   const target=this.member(input.userId,workspace);if(!target)throw fail(404,'Member not found');
   if(target.role==='owner'&&input.role!=='owner'&&this.db.prepare("SELECT count(*) n FROM customer_memberships WHERE workspace=? AND role='owner'").get(workspace).n<=1)throw fail(409,'Cannot remove the last workspace owner');
   if(input.role===null)this.db.prepare('DELETE FROM customer_memberships WHERE workspace=? AND user_id=?').run(workspace,input.userId);
   else this.db.prepare('UPDATE customer_memberships SET role=? WHERE workspace=? AND user_id=?').run(input.role,workspace,input.userId);
   return {status:'updated',workspaceId:workspace,userId:input.userId,previousRole:target.role,role:input.role};
  },()=>this.requireAdmin(actor,workspace,true),authorizeSession);
 }
 invite(actor,workspace,input,{authorizeSession=null}={}){strict(input,['actionId','email','role']);const authority=this.requireAdmin(actor,workspace);
  if(typeof input.email!=='string'||input.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)||!ROLES.includes(input.role)||input.role==='owner'||(input.role==='workspace-admin'&&authority.role!=='owner'))throw fail(400,'Invalid invitation');
  const normalized={actionId:input.actionId,email:input.email.toLowerCase(),role:input.role,workspace};
  return this.transaction(actor,normalized,'invite-create',()=>{
   this.requireAdmin(actor,workspace,input.role==='workspace-admin');const now=this.now();
   if(this.db.prepare('SELECT count(*) n FROM customer_invitations WHERE workspace=? AND accepted_by IS NULL AND revoked IS NULL AND expires>?').get(workspace,now).n>=100)throw fail(429,'Pending invitation limit reached');
   const id='inv-'+randomUUID(),secret='ovi_'+randomBytes(32).toString('hex'),expiresAt=now+7*86400000;
   this.db.prepare('INSERT INTO customer_invitations VALUES(?,?,?,?,?,?,NULL,NULL,?)').run(id,workspace,normalized.email,input.role,hash(secret),expiresAt,now);
   return {status:'created',invitationId:id,workspaceId:workspace,email:normalized.email,role:input.role,expiresAt,secret,secretAvailable:true};
  },()=>this.requireAdmin(actor,workspace,input.role==='workspace-admin'),authorizeSession);
 }
 invitations(actor,workspace,security={}){return this.invitationsPage(actor,workspace,{limit:100},security).invitations;}
 invitationsPage(actor,workspace,filters={}, {authorizeSession=null}={}){
  const list=require('./invitation-list.cjs'),opts=list.options(filters);
  return this.read(actor,workspace,()=>{const where='workspace=? AND '+list.predicate(opts.state,'?'),params=[workspace,...(['pending','expired'].includes(opts.state)?[this.now()]:[])];const total=this.db.prepare('SELECT count(*) n FROM customer_invitations WHERE '+where).get(...params).n;
   const rows=this.db.prepare('SELECT id,email,role,expires expiresAt,revoked revokedAt,accepted_by acceptedBy FROM customer_invitations WHERE '+where+' ORDER BY created DESC,id LIMIT ? OFFSET ?').all(...params,opts.limit,opts.offset);return list.page(rows,total,opts);},authorizeSession);
 }
 revokeInvitation(actor,workspace,input,{authorizeSession=null}={}){strict(input,['actionId','invitationId']);this.requireAdmin(actor,workspace);if(!reference(input.invitationId))throw fail(400,'Invalid invitation');
  return this.transaction(actor,{actionId:input.actionId,invitationId:input.invitationId,workspace},'invite-revoke',()=>{
   this.requireAdmin(actor,workspace);const row=this.db.prepare('SELECT role FROM customer_invitations WHERE id=? AND workspace=?').get(input.invitationId,workspace);if(!row)throw fail(404,'Invitation not found');
   if(row.role==='workspace-admin')this.requireAdmin(actor,workspace,true);
   this.db.prepare('UPDATE customer_invitations SET revoked=COALESCE(revoked,?) WHERE id=?').run(this.now(),input.invitationId);return {status:'revoked',invitationId:input.invitationId,workspaceId:workspace};
  },()=>{this.requireAdmin(actor,workspace);const row=this.db.prepare('SELECT role FROM customer_invitations WHERE id=? AND workspace=?').get(input.invitationId,workspace);if(!row)throw fail(404,'Invitation not found');if(row.role==='workspace-admin')this.requireAdmin(actor,workspace,true);},authorizeSession);
 }
 acceptInvitation(actor,input,{authorizeSession=null}={}){strict(input,['actionId','secret']);const user=this.identity(actor);if(!user)throw fail(401,'Verified customer identity required');if(typeof input.secret!=='string'||!/^ovi_[a-f0-9]{64}$/.test(input.secret))throw fail(404,'Invitation unavailable');
  const tokenHash=hash(input.secret);
  return this.transaction(actor,{actionId:input.actionId,tokenHash},'invite-accept',()=>{
   const row=this.db.prepare('SELECT * FROM customer_invitations WHERE token_hash=?').get(tokenHash);
   if(!row||row.revoked!==null||row.expires<=this.now()||row.email!==this.identity(actor).email||row.accepted_by!==null)throw fail(404,'Invitation unavailable');
   if(this.member(actor,row.workspace))throw fail(409,'Already a workspace member');
   if(this.db.prepare('SELECT count(*) n FROM customer_memberships WHERE workspace=?').get(row.workspace).n>=100)throw fail(429,'Workspace member limit reached');
   this.db.prepare('INSERT INTO customer_memberships VALUES(?,?,?)').run(row.workspace,actor,row.role);this.db.prepare('UPDATE customer_invitations SET accepted_by=? WHERE id=?').run(actor,row.id);
   return {status:'accepted',invitationId:row.id,workspaceId:row.workspace,role:row.role};
  },null,authorizeSession);
 }
}
module.exports={CustomerDirectory,ROLES};
