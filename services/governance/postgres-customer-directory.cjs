'use strict';
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {ROLES}=require('./customer-directory.cjs'),{verify}=require('./postgres-migrate.cjs');
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=(status,message)=>Object.assign(Error(message),{status});
const ref=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v);
const name=v=>{if(typeof v!=='string'||!v.trim()||v.trim().length>100||/[\x00-\x1f\x7f]/.test(v))throw fail(400,'Invalid name');return v.trim();};
const strict=(v,fields)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!fields.includes(k)))throw fail(400,'Invalid customer operation');};
const email=v=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const tables=['identities','workspaces','projects','memberships','actions','invitations'].map(n=>'governance_customer_'+n);
class PostgresCustomerDirectory {
 constructor(pool,now=Date.now){this.pool=pool;this.now=now;}
 async ready(environment){
  if(!['dev','test'].includes(environment))throw Error('Shared customer storage requires dev/test');
  await verify(this.pool);
  await require('./postgres-recovery.cjs').assertActive(this.pool);
  const stage=(await this.pool.query('SELECT name FROM governance_environment')).rows;
  if(stage.length!==1||stage[0].name!==environment)throw Error('Database environment mismatch');
  const role=(await this.pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  const state=(await this.pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_has_role(current_user,c.relowner,'MEMBER') owner_access,
   (has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT') AND (c.relname IN ('governance_customer_projects','governance_customer_actions') OR has_table_privilege(current_user,c.oid,'UPDATE')) AND (c.relname<>'governance_customer_memberships' OR has_table_privilege(current_user,c.oid,'DELETE'))) allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[tables])).rows;
  if(!role||role.rolsuper||role.rolbypassrls||state.length!==tables.length||state.some(r=>r.owner_access||!r.relrowsecurity||!r.relforcerowsecurity||!r.allowed))throw Error('Customer runtime privileges or row security are invalid');
 }
 async context(c,{actor='',workspace='',provider='',subject='',invitation=''}={}){
  await c.query(`SELECT set_config('governance.customer_actor',$1,true),set_config('governance.customer_workspace',$2,true),set_config('governance.identity_provider',$3,true),set_config('governance.identity_subject',$4,true),set_config('governance.invitation_hash',$5,true)`,[actor,workspace,provider,subject,invitation]);
 }
 async tx(context,fn){
  const c=await this.pool.connect();try{
   await c.query('BEGIN');await require('./postgres-recovery.cjs').assertActive(c);await c.query("SELECT set_config('statement_timeout','10000',true),set_config('lock_timeout','5000',true)");await this.context(c,context);
   const result=await fn(c);await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK');if(['57014','55P03','40P01','40001'].includes(e.code))throw fail(503,'Customer storage busy; retry with the same action ID');if(e.code==='23505')throw fail(409,'Customer operation identity conflict');throw e;}finally{c.release();}
 }
 async projectsIn(c,id){return (await c.query(`SELECT p.id,p.workspace tenant,p.id project,p.name AS "projectName",w.name AS "workspaceName",m.role FROM governance_customer_projects p JOIN governance_customer_workspaces w ON w.id=p.workspace JOIN governance_customer_memberships m ON m.workspace=w.id WHERE m.user_id=$1 ORDER BY w.created,p.created,p.id`,[id])).rows.map(p=>({...p,name:p.workspaceName+' / '+p.projectName}));}
 async identityIn(c,id,{lock=false}={}){
  const row=(await c.query('SELECT id,email,version,disabled FROM governance_customer_identities WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
  return row&&!row.disabled?{id:row.id,email:row.email,identityVersion:row.version,customer:true,workspaces:await this.projectsIn(c,id)}:null;
 }
 async identity(id){if(!ref(id))return null;return this.tx({actor:id},c=>this.identityIn(c,id));}
 async projects(id){return (await this.identity(id))?.workspaces||[];}
 async verifiedIdentity({provider,subject,email:address,emailVerified}){
  if(!ref(provider)||!ref(subject)||emailVerified!==true||!email(address))throw fail(403,'Verified provider identity required');
  return this.tx({provider,subject},async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([provider,subject])]);
   const existing=(await c.query('SELECT id,disabled FROM governance_customer_identities WHERE provider=$1 AND subject=$2 FOR UPDATE',[provider,subject])).rows[0];
   if(existing?.disabled)throw fail(403,'Customer identity disabled');
   const id=existing?.id||'usr-'+randomUUID();
   if(existing)await c.query('UPDATE governance_customer_identities SET email=$2 WHERE id=$1',[id,address.toLowerCase()]);
   else await c.query('INSERT INTO governance_customer_identities(id,provider,subject,email) VALUES($1,$2,$3,$4)',[id,provider,subject,address.toLowerCase()]);
   await this.context(c,{actor:id});return this.identityIn(c,id);
  });
 }
 async disableIdentity(id){if(!ref(id))throw fail(400,'Invalid identity');return this.tx({actor:id},c=>c.query('UPDATE governance_customer_identities SET disabled=true,version=version+1 WHERE id=$1',[id]));}
 async memberIn(c,id,workspace){return (await c.query('SELECT role FROM governance_customer_memberships WHERE user_id=$1 AND workspace=$2',[id,workspace])).rows[0];}
 async member(id,workspace){return this.tx({actor:id},c=>this.memberIn(c,id,workspace));}
 async authorizeKeys(c,p){
  if(!ref(p?.actorId)||!ref(p?.tenant)||!ref(p?.project))throw fail(403,'Customer key administration required');
  await this.context(c,{actor:p.actorId});
  if(!await this.identityIn(c,p.actorId,{lock:true}))throw fail(401,'Verified customer identity required');
  await this.authorize(c,p.actorId,p.tenant);
  const project=(await c.query('SELECT id FROM governance_customer_projects WHERE id=$1 AND workspace=$2',[p.project,p.tenant])).rows[0];
  if(!project)throw fail(404,'Project not found');
 }
 async authorize(c,actor,workspace,owner=false){
  if(!ref(workspace))throw fail(404,'Workspace not found');
  // Lock before reading authority. Membership edits take this same lock, so a
  // concurrent revocation cannot commit between this check and the mutation.
  const row=(await c.query('SELECT id FROM governance_customer_workspaces WHERE id=$1 FOR UPDATE',[workspace])).rows[0];
  if(!row)throw fail(404,'Workspace not found');
  const member=await this.memberIn(c,actor,workspace);
  if(!member)throw fail(404,'Workspace not found');
  if(owner?member.role!=='owner':!['owner','workspace-admin'].includes(member.role))throw fail(403,owner?'Workspace owner permission required':'Workspace administrator permission required');
  await this.context(c,{actor,workspace});return member;
 }
 async operation(actor,input,operation,fn,{workspace='',owner=false,invitation='',authorizeSession=null,deferSession=false,authorize=null}={}){
  if(!ref(actor))throw fail(401,'Verified customer identity required');if(!ref(input.actionId))throw fail(400,'Action ID required');
  return this.tx({actor,invitation},async c=>{
   const user=await this.identityIn(c,actor,{lock:true});if(!user)throw fail(401,'Verified customer identity required');
   if(workspace)await this.authorize(c,actor,workspace,owner);
   await authorize?.(c);
   const body=JSON.stringify({operation,...input}),old=(await c.query('SELECT body,result FROM governance_customer_actions WHERE actor=$1 AND action_id=$2',[actor,input.actionId])).rows[0];
   if(!deferSession||old)await authorizeSession?.(c,actor);
   if(old){if(old.body!==body)throw fail(409,'Action ID already used with different data');return {...old.result,status:'duplicate'};}
   const result=await fn(c,user),stored={...result};if('secret' in stored){stored.secret=null;stored.secretAvailable=false;}
   await c.query('INSERT INTO governance_customer_actions VALUES($1,$2,$3,$4,$5)',[actor,input.actionId,body,JSON.stringify(stored),this.now()]);return result;
  });
 }
 async createWorkspace(actor,input,{authorizeSession=null}={}){
  strict(input,['actionId','name','projectName']);const normalized={actionId:input.actionId,name:name(input.name),projectName:name(input.projectName)};
  return this.operation(actor,normalized,'workspace-create',async c=>{
   if(Number((await c.query("SELECT count(*) n FROM governance_customer_memberships WHERE user_id=$1 AND role='owner'",[actor])).rows[0].n)>=20)throw fail(429,'Workspace limit reached');
   const workspaceId='org-'+randomUUID(),projectId='prj-'+randomUUID(),now=this.now();await this.context(c,{actor,workspace:workspaceId});
   await c.query('INSERT INTO governance_customer_workspaces VALUES($1,$2,$3)',[workspaceId,normalized.name,now]);
   await c.query('INSERT INTO governance_customer_projects VALUES($1,$2,$3,$4)',[projectId,workspaceId,normalized.projectName,now]);
   await c.query('INSERT INTO governance_customer_memberships VALUES($1,$2,$3)',[workspaceId,actor,'owner']);return {status:'created',workspaceId,projectId};
  },{authorizeSession});
 }
 async createProject(actor,workspace,input,{authorizeSession=null}={}){strict(input,['actionId','name']);const normalized={actionId:input.actionId,name:name(input.name),workspace};
  return this.operation(actor,normalized,'project-create',async c=>{
   if(Number((await c.query('SELECT count(*) n FROM governance_customer_projects WHERE workspace=$1',[workspace])).rows[0].n)>=100)throw fail(429,'Project limit reached');
   const projectId='prj-'+randomUUID();await c.query('INSERT INTO governance_customer_projects VALUES($1,$2,$3,$4)',[projectId,workspace,normalized.name,this.now()]);return {status:'created',workspaceId:workspace,projectId};
  },{workspace,authorizeSession});
 }
 async members(actor,workspace,{authorizeSession=null}={}){return this.tx({actor},async c=>{if(!await this.identityIn(c,actor,{lock:true}))throw fail(401,'Verified customer identity required');await this.authorize(c,actor,workspace);await authorizeSession?.(c,actor);return (await c.query('SELECT m.user_id id,i.email,m.role FROM governance_customer_memberships m JOIN governance_customer_identities i ON i.id=m.user_id WHERE m.workspace=$1 ORDER BY m.user_id',[workspace])).rows;});}
 async changeMember(actor,workspace,input,{authorizeSession=null}={}){strict(input,['actionId','userId','role']);if(!ref(input.userId)||!(input.role===null||ROLES.includes(input.role)))throw fail(400,'Invalid membership change');
  return this.operation(actor,{actionId:input.actionId,userId:input.userId,role:input.role,workspace},'member-change',async c=>{
   const target=await this.memberIn(c,input.userId,workspace);if(!target)throw fail(404,'Member not found');
   if(target.role==='owner'&&input.role!=='owner'&&Number((await c.query("SELECT count(*) n FROM governance_customer_memberships WHERE workspace=$1 AND role='owner'",[workspace])).rows[0].n)<=1)throw fail(409,'Cannot remove the last workspace owner');
   if(input.role===null)await c.query('DELETE FROM governance_customer_memberships WHERE workspace=$1 AND user_id=$2',[workspace,input.userId]);
   else await c.query('UPDATE governance_customer_memberships SET role=$3 WHERE workspace=$1 AND user_id=$2',[workspace,input.userId,input.role]);return {status:'updated',workspaceId:workspace,userId:input.userId,previousRole:target.role,role:input.role};
  },{workspace,owner:true,authorizeSession});
 }
 async invite(actor,workspace,input,{authorizeSession=null}={}){strict(input,['actionId','email','role']);if(!email(input.email)||!ROLES.includes(input.role)||input.role==='owner')throw fail(400,'Invalid invitation');
  return this.operation(actor,{actionId:input.actionId,email:input.email.toLowerCase(),role:input.role,workspace},'invite-create',async c=>{
   const now=this.now();if(Number((await c.query('SELECT count(*) n FROM governance_customer_invitations WHERE workspace=$1 AND accepted_by IS NULL AND revoked IS NULL AND expires>$2',[workspace,now])).rows[0].n)>=100)throw fail(429,'Pending invitation limit reached');
   const id='inv-'+randomUUID(),secret='ovi_'+randomBytes(32).toString('hex'),expiresAt=now+7*86400000;
   await c.query('INSERT INTO governance_customer_invitations VALUES($1,$2,$3,$4,$5,$6,NULL,NULL,$7)',[id,workspace,input.email.toLowerCase(),input.role,hash(secret),expiresAt,now]);return {status:'created',invitationId:id,workspaceId:workspace,email:input.email.toLowerCase(),role:input.role,expiresAt,secret,secretAvailable:true};
  },{workspace,owner:input.role==='workspace-admin',authorizeSession});
 }
 async invitations(actor,workspace,security={}){return (await this.invitationsPage(actor,workspace,{limit:100},security)).invitations;}
 async invitationsPage(actor,workspace,filters={}, {authorizeSession=null}={}){
  const list=require('./invitation-list.cjs'),opts=list.options(filters);
  return this.tx({actor},async c=>{if(!await this.identityIn(c,actor,{lock:true}))throw fail(401,'Verified customer identity required');await this.authorize(c,actor,workspace);await authorizeSession?.(c,actor);
   const row=(await c.query(`WITH clock AS (SELECT $2::bigint now), filtered AS (SELECT id,email,role,expires AS "expiresAt",revoked AS "revokedAt",accepted_by AS "acceptedBy",created FROM governance_customer_invitations CROSS JOIN clock WHERE workspace=$1 AND ${list.predicate(opts.state,'clock.now')}), page AS (SELECT * FROM filtered ORDER BY created DESC,id LIMIT $3 OFFSET $4) SELECT (SELECT count(*) FROM filtered) total,COALESCE((SELECT jsonb_agg(to_jsonb(page)-'created' ORDER BY created DESC,id) FROM page),'[]'::jsonb) invitations`,[workspace,this.now(),opts.limit,opts.offset])).rows[0];
   return list.page(row.invitations.map(r=>({...r,expiresAt:Number(r.expiresAt),revokedAt:r.revokedAt===null?null:Number(r.revokedAt)})),Number(row.total),opts);
  });
 }
 async revokeInvitation(actor,workspace,input,{authorizeSession=null}={}){strict(input,['actionId','invitationId']);if(!ref(input.invitationId))throw fail(400,'Invalid invitation');
  return this.operation(actor,{actionId:input.actionId,invitationId:input.invitationId,workspace},'invite-revoke',async c=>{
   await c.query('UPDATE governance_customer_invitations SET revoked=COALESCE(revoked,$2) WHERE id=$1',[input.invitationId,this.now()]);return {status:'revoked',invitationId:input.invitationId,workspaceId:workspace};
  },{workspace,authorizeSession,authorize:async c=>{const row=(await c.query('SELECT role FROM governance_customer_invitations WHERE id=$1 AND workspace=$2',[input.invitationId,workspace])).rows[0];if(!row)throw fail(404,'Invitation not found');if(row.role==='workspace-admin')await this.authorize(c,actor,workspace,true);}});
 }
 async acceptInvitation(actor,input,{authorizeSession=null}={}){strict(input,['actionId','secret']);if(typeof input.secret!=='string'||!/^ovi_[a-f0-9]{64}$/.test(input.secret))throw fail(404,'Invitation unavailable');const tokenHash=hash(input.secret);
  return this.operation(actor,{actionId:input.actionId,tokenHash},'invite-accept',async(c,user)=>{
   const invitation=(await c.query('SELECT * FROM governance_customer_invitations WHERE token_hash=$1',[tokenHash])).rows[0];if(!invitation||invitation.email!==user.email)throw fail(404,'Invitation unavailable');
   // Possession of a bound invitation is the only path into a new workspace.
   await this.context(c,{actor,workspace:invitation.workspace,invitation:tokenHash});await c.query('SELECT id FROM governance_customer_workspaces WHERE id=$1 FOR UPDATE',[invitation.workspace]);
   const row=(await c.query('SELECT * FROM governance_customer_invitations WHERE token_hash=$1 FOR UPDATE',[tokenHash])).rows[0];
   await authorizeSession?.(c,actor);
   if(!row||row.revoked!==null||Number(row.expires)<=this.now()||row.email!==user.email||row.accepted_by!==null)throw fail(404,'Invitation unavailable');
   if(await this.memberIn(c,actor,row.workspace))throw fail(409,'Already a workspace member');if(Number((await c.query('SELECT count(*) n FROM governance_customer_memberships WHERE workspace=$1',[row.workspace])).rows[0].n)>=100)throw fail(429,'Workspace member limit reached');
   await c.query('INSERT INTO governance_customer_memberships VALUES($1,$2,$3)',[row.workspace,actor,row.role]);await c.query('UPDATE governance_customer_invitations SET accepted_by=$2 WHERE id=$1',[row.id,actor]);return {status:'accepted',invitationId:row.id,workspaceId:row.workspace,role:row.role};
  },{invitation:tokenHash,authorizeSession,deferSession:true});
 }
}
module.exports={PostgresCustomerDirectory};
