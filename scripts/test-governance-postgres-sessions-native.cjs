'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomBytes,createHash}=require('node:crypto'),{Pool}=require('pg');
const {migrate}=require('../services/governance/postgres-migrate.cjs'),{PostgresCustomerDirectory}=require('../services/governance/postgres-customer-directory.cjs');
const {PostgresProviderSessions}=require('../services/governance/postgres-provider-sessions.cjs'),{PostgresWorkspaceAuth}=require('../services/governance/postgres-workspace-auth.cjs'),{WorkosAuth}=require('../services/governance/workos-auth.cjs');
const base=path.resolve(__dirname,'../build/postgres-native'),config=JSON.parse(fs.readFileSync(path.join(base,'cluster-access.json'),'utf8'));
if(config.host!=='127.0.0.1'||config.port!==55439||config.user!=='governance_test_admin'||!fs.existsSync(path.join(base,'LOCAL-SYNTHETIC-ONLY')))throw Error('Dedicated synthetic cluster required');
const id='s'+randomBytes(6).toString('hex'),database='gov_sessions_'+id,owner='gov_owner_'+id,app='gov_app_'+id,ownerPassword=randomBytes(24).toString('hex'),appPassword=randomBytes(24).toString('hex');
const directory=path.join(base,id);fs.mkdirSync(directory,{recursive:true});
const admin=new Pool({...config,database:'postgres',max:2}),pools=[],servers=[],results={runId:id,synthetic:true,engine:'native PostgreSQL over TCP',checks:[]};let service;
const poolFor=(user,password)=>{const p=new Pool({host:config.host,port:config.port,database,user,password,max:10,connectionTimeoutMillis:5000});pools.push(p);return p;};
const hash=v=>createHash('sha256').update(v).digest('hex'),pass=name=>{results.checks.push({name,status:'passed'});console.log('PASS '+name);};
async function main(){
 await admin.query(`CREATE ROLE ${owner} LOGIN PASSWORD '${ownerPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);await admin.query(`CREATE ROLE ${app} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);await admin.query(`CREATE DATABASE ${database} OWNER ${owner}`);
 const migrationPool=poolFor(owner,ownerPassword);await migrate(migrationPool);
 const tables=['identities','workspaces','projects','memberships','actions','invitations','sessions','auth_flows'].map(n=>'governance_customer_'+n);
 await migrationPool.query(require('../services/governance/postgres-runtime-profile.cjs').grantSql('api',app));
 const poolA=poolFor(app,appPassword),poolB=poolFor(app,appPassword);let now=Date.now(),calls=0,gate=null;
 const a=new PostgresCustomerDirectory(poolA,()=>now),b=new PostgresCustomerDirectory(poolB,()=>now),sa=new PostgresProviderSessions(poolA,a),sb=new PostgresProviderSessions(poolB,b),aa=new PostgresWorkspaceAuth(sa,a,()=>now),ab=new PostgresWorkspaceAuth(sb,b,()=>now);
 await sa.ready('test');await sb.ready('test');
 await migrationPool.query(`REVOKE UPDATE ON governance_customer_sessions FROM ${app}`);await assert.rejects(sa.ready('test'),/privileges/);await migrationPool.query(`GRANT UPDATE ON governance_customer_sessions TO ${app}`);
 pass('session startup verifies migrations, forced RLS and each runtime privilege');
 const jose=await import('jose'),{publicKey,privateKey}=await jose.generateKeyPair('RS256'),jwk=await jose.exportJWK(publicKey);jwk.kid='native';
 const identityConfig={clientId:'client_native',apiKey:'sk_synthetic_only',sealKey:randomBytes(32),redirectUri:'http://localhost:3001/api/auth/callback'};
 const keySet=jose.createLocalJWKSet({keys:[jwk]});
 let nextProfile,nextSid='session_native';
 const fetcher=async()=>{calls++;if(gate)await gate;const token=await new jose.SignJWT({sub:'user_native',sid:nextSid,sub_profile:nextProfile,iss:'https://api.workos.com',client_id:identityConfig.clientId,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+120,auth_time:Math.floor(now/1000)}).setProtectedHeader({alg:'RS256',kid:'native'}).sign(privateKey);return Response.json({user:{id:'user_native',email:'native@example.test',email_verified:true},access_token:token,refresh_token:'synthetic-refresh-'+calls});};
 const wa=new WorkosAuth(null,a,aa,identityConfig,{sessions:sa,now:()=>now,keySet,fetcher}),wb=new WorkosAuth(null,b,ab,identityConfig,{sessions:sb,now:()=>now,keySet,fetcher});
 const browser=randomBytes(32).toString('hex'),start=new URL((await wa.start({browser})).url),flow={browser,state:start.searchParams.get('state'),code:'synthetic'};
 await assert.rejects(wb.callback({...flow,browser:'ff'.repeat(32)}),e=>e.status===401);assert.equal(calls,0);
 const callbacks=await Promise.allSettled([wa.callback(flow),wb.callback(flow)]);assert.equal(callbacks.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);const session=callbacks.find(r=>r.status==='fulfilled').value,sessionHash=hash(session.token);
 assert.ok(await ab.resolve(session.token));assert.equal((await sb.read(sessionHash)).session.user_id,session.user.id);
 assert.equal((await poolB.query('SELECT * FROM governance_customer_sessions')).rows.length,0);assert.equal((await poolB.query('SELECT * FROM governance_customer_auth_flows')).rows.length,0);
 const stored=await sa.tx({hash:sessionHash},async c=>(await c.query('SELECT * FROM governance_customer_sessions WHERE hash=$1',[sessionHash])).rows[0]);assert.equal(JSON.stringify(stored).includes(session.token),false);assert.equal(JSON.stringify(stored).includes('synthetic-refresh-1'),false);
 pass('single-use browser-bound callback creates shared hashed session and encrypted refresh without secret leakage');
 const workspace=await a.createWorkspace(session.user.id,{actionId:'workspace',name:'Native workspace',projectName:'Governance'});
 assert.equal((await ab.publicUser(await ab.resolve(session.token))).workspaces[0].id,workspace.projectId);
 const created=(await sb.read(sessionHash)).session.created;now+=100000;
 let release;gate=new Promise(r=>release=r);
 const refreshing=wa.resolve(session.token);
 for(let i=0;i<100&&calls<2;i++)await new Promise(r=>setTimeout(r,10));assert.equal(calls,2);
 const other=wb.resolve(session.token);await new Promise(r=>setTimeout(r,75));assert.ok((await sb.read(sessionHash)).session);
 release();gate=null;const renewed=await Promise.all([refreshing,other]);assert.ok(renewed.every(u=>u?.id===session.user.id));assert.equal(calls,2);assert.equal((await sb.read(sessionHash)).session.created,created);
 pass('independent pools rotate refresh once and preserve absolute session start');
 const reopened=new PostgresProviderSessions(poolFor(app,appPassword),b),restarted=new WorkosAuth(null,b,new PostgresWorkspaceAuth(reopened,b,()=>now),identityConfig,{sessions:reopened,now:()=>now,keySet,fetcher});now+=100000;
 assert.ok(await restarted.resolve(session.token));assert.equal(calls,3);
 pass('renewal survives restarting provider/session repositories on a new pool');
 now+=100000;assert.equal((await sa.claim(sessionHash,'crashed-owner',now)).status,'acquired');now+=30001;assert.equal(await wb.resolve(session.token),null);assert.equal(calls,3);
 pass('abandoned consumed refresh expires without replay or session resurrection');
 const user=await a.verifiedIdentity({provider:'synthetic',subject:'logout',email:'logout@example.test',emailVerified:true}),local=await aa.loginVerified(user.id,'',{expiresAt:now+120000,providerSessionId:'session_logout'});
 await ab.logout(local.token);assert.equal(await aa.resolve(local.token),null);
 const disabled=await aa.loginVerified(user.id);await b.disableIdentity(user.id);assert.equal(await ab.resolve(disabled.token),null);
 pass('logout and identity disablement invalidate shared sessions on other pools');
 const expiryUser=await a.verifiedIdentity({provider:'synthetic',subject:'expiry',email:'expiry@example.test',emailVerified:true}),expiry=await aa.loginVerified(expiryUser.id);now+=1800000;assert.equal(await ab.resolve(expiry.token),null);
 pass('idle deadline remains enforced in shared storage');
 const absolute=await aa.loginVerified(expiryUser.id);
 await sa.tx({hash:hash(absolute.token),actor:expiryUser.id},c=>c.query('UPDATE governance_customer_sessions SET created=$2,touched=$3 WHERE hash=$1',[hash(absolute.token),now-28800000,now]));assert.equal(await ab.resolve(absolute.token),null);
 pass('absolute deadline cannot be extended by recent activity');
 const freshFlow=new URL((await wa.start({browser})).url),fresh=await wa.callback({browser,state:freshFlow.searchParams.get('state'),code:'synthetic'});now+=100000;
 let unblock;gate=new Promise(r=>unblock=r);const beforeLogoutCalls=calls,pending=wa.resolve(fresh.token);
 for(let i=0;i<100&&calls===beforeLogoutCalls;i++)await new Promise(r=>setTimeout(r,10));assert.equal(calls,beforeLogoutCalls+1);
 await ab.logout(fresh.token);unblock();gate=null;assert.equal(await pending,null);assert.equal(await ab.resolve(fresh.token),null);
 pass('logout on another pool during a provider exchange cannot restore session or refresh access');
 const revocationFlow=new URL((await wa.start({browser})).url);let revokedSession=await wa.callback({browser,state:revocationFlow.searchParams.get('state'),code:'synthetic'});
 await aa.requireRecent(revokedSession.token);now+=301000;assert.ok(await wa.resolve(revokedSession.token));await assert.rejects(ab.requireRecent(revokedSession.token),e=>e.status===403);
 const reauthUrl=new URL((await wa.start({browser,reauthenticate:true},revokedSession.token)).url);assert.equal(reauthUrl.searchParams.get('max_age'),'0');
 const previousReauthToken=revokedSession.token;revokedSession=await wb.callback({browser,state:reauthUrl.searchParams.get('state'),code:'synthetic'});assert.equal(revokedSession.reauthenticated,true);await aa.requireRecent(revokedSession.token);assert.equal(await ab.resolve(previousReauthToken),null);
 pass('shared active-authentication freshness is not renewed by refresh and bound reauthentication works across pools');
 const revocation={eventId:'event_native',sessionId:'session_native',subject:'user_native',digest:'ba'.repeat(32)};
 await sb.revocations.apply('client_foreign',revocation,now);assert.ok(await wb.resolve(revokedSession.token));
 const revocations=await Promise.all(Array.from({length:20},(_,i)=>(i%2?sa:sb).revocations.apply(identityConfig.clientId,revocation,now)));assert.equal(revocations.filter(r=>r.status==='applied').length,1);
 assert.equal(await wa.resolve(revokedSession.token),null);assert.equal(await wb.resolve(revokedSession.token),null);
 await assert.rejects(aa.loginVerified(session.user.id,'',{expiresAt:now+120000,providerSessionId:'session_native',clientId:identityConfig.clientId,subject:'user_native'}),e=>e.status===401);
 await assert.rejects(sb.revocations.apply(identityConfig.clientId,{...revocation,digest:'bb'.repeat(32)},now),e=>e.status===409);
 for(const table of ['governance_provider_revocations','governance_identity_events'])assert.equal((await poolB.query('SELECT * FROM '+table)).rows.length,0);
 pass('shared provider revocations are client-bound, replay-safe and deny later session creation');
 const rollbackSession=await aa.loginVerified(session.user.id,'',{expiresAt:now+120000,providerSessionId:'session_rollback',clientId:identityConfig.clientId,subject:'user_native'}),rollbackEvent={...revocation,eventId:'event_rollback',sessionId:'session_rollback'};
 await migrationPool.query(`REVOKE INSERT ON governance_identity_events FROM ${app}`);await assert.rejects(sb.revocations.apply(identityConfig.clientId,rollbackEvent,now),/permission denied/);assert.ok(await aa.resolve(rollbackSession.token));assert.equal(await sa.revocations.revoked(identityConfig.clientId,'session_rollback','user_native'),false);
 await migrationPool.query(`GRANT INSERT ON governance_identity_events TO ${app}`);await sa.revocations.apply(identityConfig.clientId,rollbackEvent,now);assert.equal(await ab.resolve(rollbackSession.token),null);
 pass('failed provider event persistence rolls back tombstone and session deletion together');
 const capUser=await a.verifiedIdentity({provider:'synthetic',subject:'session-cap',email:'cap@example.test',emailVerified:true});let capSession;
 for(let i=0;i<20;i++)capSession=await aa.loginVerified(capUser.id);
 await assert.rejects(ab.loginVerified(capUser.id),e=>e.status===429);const replacement=await ab.loginVerified(capUser.id,capSession.token);assert.ok(await aa.resolve(replacement.token));assert.equal(await aa.resolve(capSession.token),null);
 const hostedReplacement=await aa.loginVerified(capUser.id,'',{expiresAt:now+120000,providerSessionId:'session_cap',previousHash:hash(replacement.token)});assert.ok(await ab.resolve(hostedReplacement.token));assert.equal(await aa.resolve(replacement.token),null);
 pass('shared session cap is enforced and previous-session replacement remains usable at the cap');
 const url=new URL('postgresql://localhost');url.hostname=config.host;url.port=String(config.port);url.pathname='/'+database;url.username=app;url.password=appPassword;
 const env={GOVERNANCE_ENV:'test',GOVERNANCE_STORAGE:'postgres',GOVERNANCE_KEY_STORAGE:'postgres',GOVERNANCE_CONTROL_STORAGE:'postgres',GOVERNANCE_DATABASE_URL:url.href,GOVERNANCE_IDENTITY_PROVIDER:'workos',WORKOS_CLIENT_ID:identityConfig.clientId,WORKOS_API_KEY:identityConfig.apiKey,GOVERNANCE_IDENTITY_SEAL_KEY:identityConfig.sealKey.toString('hex'),WORKOS_REDIRECT_URI:identityConfig.redirectUri,WORKOS_WEBHOOK_SECRET:'synthetic-webhook-secret-'.repeat(2),GOVERNANCE_AUTH_START_REQUESTS_PER_MINUTE:'2',PORT:'0'};
 service=await require('../services/governance/start.cjs').start(env);if(!service.server.listening)await new Promise(r=>service.server.once('listening',r));const api='http://127.0.0.1:'+service.server.address().port;
 assert.ok(service.projectRequestLimits);await assert.rejects(require('../services/governance/start.cjs').start({...env,GOVERNANCE_PROJECT_READ_REQUESTS_PER_MINUTE:'0'}),/Project request limits/);
 assert.ok(service.customerRequestLimits);await assert.rejects(require('../services/governance/start.cjs').start({...env,GOVERNANCE_CUSTOMER_READ_REQUESTS_PER_MINUTE:'0'}),/Customer request limits/);await assert.rejects(require('../services/governance/start.cjs').start({...env,GOVERNANCE_CUSTOMER_WRITE_REQUESTS_PER_MINUTE:'1.5'}),/Customer request limits/);
 assert.ok(service.workosOptions.startRequestLimits);await assert.rejects(require('../services/governance/start.cjs').start({...env,GOVERNANCE_AUTH_START_REQUESTS_PER_MINUTE:'0'}),/Auth start limit/);
 const otherIdentityService=await require('../services/governance/start.cjs').start(env);
 try{
  if(!otherIdentityService.server.listening)await new Promise(r=>otherIdentityService.server.once('listening',r));const otherIdentityApi='http://127.0.0.1:'+otherIdentityService.server.address().port,signInBrowsers=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')],started=[];
  for(let index=0;index<2;index++){const response=await fetch((index?otherIdentityApi:api)+'/v1/auth/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({browser:signInBrowsers[index],screen:index?'sign-up':'sign-in'})});assert.equal(response.status,200);started.push(new URL((await response.json()).url));}
  const flowCount=async()=>Number((await service.workosOptions.sessions.tx({capacity:true},c=>c.query('SELECT count(*) n FROM governance_customer_auth_flows'))).rows[0].n),beforeDenied=await flowCount(),deniedStarts=await Promise.all([api,otherIdentityApi].map(endpoint=>fetch(endpoint+'/v1/auth/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({browser:randomBytes(32).toString('hex')})})));for(const response of deniedStarts){assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>=1);assert.equal((await response.json()).code,'auth-start-limit');}assert.equal(await flowCount(),beforeDenied);
  assert.ok(await service.workosOptions.sessions.consumeFlow(hash(started[0].searchParams.get('state')),hash(signInBrowsers[0]),Date.now()));assert.equal(await service.workosOptions.sessions.consumeFlow(hash(started[0].searchParams.get('state')),hash(signInBrowsers[0]),Date.now()),undefined);assert.equal((await migrationPool.query('SELECT * FROM governance_auth_start_limits')).rows.length,0);
 }finally{await otherIdentityService.stop();}
 pass('two shared-control HTTP servers install one configured-client sign-in start limit, deny new flows without writes and preserve consumption of a previously admitted callback');
 const liveUser=await service.directory.verifiedIdentity({provider:'synthetic',subject:'http',email:'http@example.test',emailVerified:true}),liveSession=await service.auth.loginVerified(liveUser.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_live',authenticatedAt:Date.now()}),headers={'content-type':'application/json','x-workspace-session':liveSession.token};
 assert.equal((await fetch(api+'/v1/session',{headers})).status,200);assert.equal((await fetch(api+'/v1/session',{method:'POST',headers,body:JSON.stringify({email:'http@example.test',password:'synthetic'})})).status,403);
 const createdResponse=await fetch(api+'/v1/workspaces',{method:'POST',headers,body:JSON.stringify({actionId:'http-workspace',name:'HTTP customer',projectName:'Governance'})});assert.equal(createdResponse.status,201);const project=await createdResponse.json();
 const keyResponse=await fetch(api+'/v1/keys',{method:'POST',headers:{...headers,'x-workspace-id':project.projectId},body:JSON.stringify({actionId:'http-key',label:'Recorder',scopes:['write']})});assert.equal(keyResponse.status,201);const key=await keyResponse.json();assert.ok(await service.projectKeys.resolve(key.secret));
 assert.equal((await service.store.transaction({tenant:project.workspaceId,project:project.projectId},c=>c.query("SELECT requests FROM governance_project_request_limits WHERE bucket='write'"),true)).rows[0].requests,'1');
 const installedCustomerWindows=(await service.directory.tx({actor:liveUser.id},c=>c.query('SELECT bucket,requests FROM governance_customer_request_limits ORDER BY bucket'))).rows;assert.deepEqual(installedCustomerWindows,[{bucket:'read',requests:1},{bucket:'write',requests:2}]);assert.equal((await migrationPool.query('SELECT * FROM governance_customer_request_limits')).rows.length,0);
 pass('shared-control launcher installs customer request windows before session/workspace/key routes, persists separate actor-scoped budgets and rejects invalid settings before startup');
 const raceUser=await service.directory.verifiedIdentity({provider:'workos:'+identityConfig.clientId,subject:'user_keyrace',email:'keyrace@example.test',emailVerified:true}),raceWorkspace=await service.directory.createWorkspace(raceUser.id,{actionId:'race-workspace',name:'Synthetic session race',projectName:'Governance'});
 const seedSession=await service.auth.loginVerified(raceUser.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_keyseed',authenticatedAt:Date.now()}),seedP={tenant:raceWorkspace.workspaceId,project:raceWorkspace.projectId,actorId:raceUser.id,sessionToken:seedSession.token},seedInput={actionId:'seed-key',label:'Synthetic race recorder',scopes:['write']},seedKey=await service.projectKeys.create(seedP,seedInput);
 const keyDigest=()=>service.projectKeys.transaction(seedP,async c=>hash(JSON.stringify({keys:(await c.query('SELECT * FROM governance_project_keys ORDER BY id')).rows,actions:(await c.query('SELECT * FROM governance_key_actions ORDER BY action_id')).rows})));
 for(const [index,scenario] of ['create-logout','replay-logout','rotate-webhook','revoke-logout','list-logout','create-freshness','create-expiry'].entries()){
  const providerSessionId='session_keyrace'+index,raceSession=await service.auth.loginVerified(raceUser.id,'',{expiresAt:Date.now()+120000,providerSessionId,authenticatedAt:Date.now()}),before=await keyDigest(),lock=await poolB.connect();let pending;
  try{
   await lock.query('BEGIN');await service.directory.context(lock,{actor:raceUser.id,workspace:raceWorkspace.workspaceId});await lock.query('SELECT id FROM governance_customer_workspaces WHERE id=$1 FOR UPDATE',[raceWorkspace.workspaceId]);
   const suffix=scenario.startsWith('rotate')?'/'+seedKey.key.id+'/rotate':scenario.startsWith('revoke')?'/'+seedKey.key.id+'/revoke':'',body=scenario.startsWith('replay')?seedInput:scenario.startsWith('revoke')?{actionId:'race-'+index}:{...seedInput,actionId:'race-'+index};
   pending=fetch(api+'/v1/keys'+suffix,{method:scenario.startsWith('list')?'GET':'POST',headers:{'content-type':'application/json','x-workspace-session':raceSession.token,'x-workspace-id':raceWorkspace.projectId},body:scenario.startsWith('list')?undefined:JSON.stringify(body)});
   let waiting=false;for(let attempt=0;attempt<150;attempt++){waiting=Number((await admin.query("SELECT count(*) n FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND wait_event_type='Lock' AND query LIKE '%governance_customer_workspaces%'",[database,app])).rows[0].n)>0;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,'key transaction must be waiting on workspace authority');
   if(scenario.endsWith('webhook'))await service.auth.sessions.revocations.apply(identityConfig.clientId,{eventId:'event_keyrace'+index,sessionId:providerSessionId,subject:'user_keyrace',digest:'cd'.repeat(32)},Date.now());
   else if(scenario.endsWith('freshness')||scenario.endsWith('expiry')){
    const writer=await poolB.connect();try{await writer.query('BEGIN');await service.directory.context(writer,{actor:raceUser.id});await writer.query("SELECT set_config('governance.session_hash',$1,true)",[hash(raceSession.token)]);await writer.query('UPDATE governance_customer_sessions SET '+(scenario.endsWith('freshness')?'authenticated_at':'expires')+'=$2 WHERE hash=$1',[hash(raceSession.token),Date.now()-301000]);await writer.query('COMMIT');}finally{writer.release();}
   }else await service.auth.logout(raceSession.token);
   await lock.query('COMMIT');const response=await pending,denied=await response.json();assert.equal(response.status,scenario.endsWith('freshness')?403:401,scenario);if(scenario.endsWith('freshness'))assert.equal(denied.code,'reauthentication-required');assert.equal(await keyDigest(),before);assert.ok(await service.projectKeys.resolve(seedKey.secret));
   if(scenario.endsWith('freshness'))assert.equal((await fetch(api+'/v1/keys',{headers:{'x-workspace-session':raceSession.token,'x-workspace-id':raceWorkspace.projectId}})).status,200);
  }finally{await lock.query('ROLLBACK');lock.release();await pending?.catch(()=>{});}
 }
 pass('key create/replay/rotate/revoke/list after workspace-lock waits reject logout, provider revocation, expired sessions and stale active authentication without key changes');
 const serialSession=await service.auth.loginVerified(raceUser.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_keyserial',authenticatedAt:Date.now()}),originalSessionGuard=service.projectKeys.authorizeSession;let enteredGuard,finishGuard;
 const guardEntered=new Promise(r=>enteredGuard=r),guardRelease=new Promise(r=>finishGuard=r);let committing,loggingOut;
 service.projectKeys.authorizeSession=async(c,p,options)=>{await originalSessionGuard(c,p,options);if(p.sessionToken===serialSession.token){enteredGuard();await guardRelease;}};
 try{
  committing=fetch(api+'/v1/keys',{method:'POST',headers:{'content-type':'application/json','x-workspace-session':serialSession.token,'x-workspace-id':raceWorkspace.projectId},body:JSON.stringify({...seedInput,actionId:'serialized-key'})});await guardEntered;
  loggingOut=service.auth.logout(serialSession.token);let waiting=false;
  for(let attempt=0;attempt<150;attempt++){waiting=Number((await admin.query("SELECT count(*) n FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND wait_event_type='Lock' AND query LIKE '%DELETE FROM governance_customer_sessions%'",[database,app])).rows[0].n)>0;if(waiting)break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(waiting,'logout must wait for the key transaction session lock');finishGuard();const response=await committing;assert.equal(response.status,201);const committed=await response.json();await loggingOut;assert.equal(await service.auth.resolve(serialSession.token),null);assert.ok(await service.projectKeys.resolve(committed.secret));
 }finally{finishGuard();service.projectKeys.authorizeSession=originalSessionGuard;await Promise.all([committing?.catch(()=>{}),loggingOut?.catch(()=>{})]);}
 pass('a key operation holding the verified session row commits before competing logout; later requests using that session are denied');
 const guest=await service.directory.verifiedIdentity({provider:'workos:'+identityConfig.clientId,subject:'user_dirguest',email:'dirguest@example.test',emailVerified:true}),member=await service.directory.verifiedIdentity({provider:'synthetic',subject:'dir-member',email:'dirmember@example.test',emailVerified:true});
 const memberInvite=await service.directory.invite(raceUser.id,raceWorkspace.workspaceId,{actionId:'dir-member-invite',email:member.email,role:'reader'});await service.directory.acceptInvitation(member.id,{actionId:'dir-member-join',secret:memberInvite.secret});
 const pendingInvite=await service.directory.invite(raceUser.id,raceWorkspace.workspaceId,{actionId:'dir-pending',email:'pending@example.test',role:'reader'}),guestInvite=await service.directory.invite(raceUser.id,raceWorkspace.workspaceId,{actionId:'dir-guest',email:guest.email,role:'reader'}),replayedProject={actionId:'dir-project-seed',name:'Existing'};await service.directory.createProject(raceUser.id,raceWorkspace.workspaceId,replayedProject);
 const reviewPool=poolFor(config.user,config.password),customerDigest=async()=>{const rows={};for(const suffix of ['workspaces','projects','memberships','invitations','actions'])rows[suffix]=(await reviewPool.query('SELECT * FROM governance_customer_'+suffix)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return hash(JSON.stringify(rows));};
 for(const [index,scenario] of ['project-logout','project-replay','member-webhook','invite-freshness','revoke-logout','members-read','invitations-read','accept-webhook','workspace-logout','workspace-replay'].entries()){
  const accepting=scenario.startsWith('accept'),actor=accepting?guest:raceUser,providerSessionId='session_dirrace'+index,session=await service.auth.loginVerified(actor.id,'',{expiresAt:Date.now()+120000,providerSessionId,authenticatedAt:Date.now()}),before=await customerDigest(),lock=await poolB.connect(),originalOperation=service.directory.operation;let pending;
  const workspaceCreation=scenario.startsWith('workspace');
  try{
   if(workspaceCreation){service.directory.operation=async(...args)=>{await lock.query('BEGIN');await service.directory.context(lock,{actor:actor.id});await lock.query('SELECT id FROM governance_customer_identities WHERE id=$1 FOR UPDATE',[actor.id]);return originalOperation.apply(service.directory,args);};}
   else{await lock.query('BEGIN');await service.directory.context(lock,{actor:raceUser.id,workspace:raceWorkspace.workspaceId});await lock.query('SELECT id FROM governance_customer_workspaces WHERE id=$1 FOR UPDATE',[raceWorkspace.workspaceId]);}
   const prefix='/v1/workspaces/'+raceWorkspace.workspaceId,reading=scenario.endsWith('read');let route,body;
   if(workspaceCreation){route='/v1/workspaces';body=scenario.endsWith('replay')?{actionId:'race-workspace',name:'Synthetic session race',projectName:'Governance'}:{actionId:'dir-'+index,name:'Blocked',projectName:'Blocked'};}
   else if(scenario.startsWith('project')){route=prefix+'/projects';body=scenario.endsWith('replay')?replayedProject:{actionId:'dir-'+index,name:'Blocked'};}
   else if(scenario.startsWith('member')){route=prefix+'/members';body={actionId:'dir-'+index,userId:member.id,role:'reviewer'};}
   else if(scenario.startsWith('revoke')){route=prefix+'/invitations/revoke';body={actionId:'dir-'+index,invitationId:pendingInvite.invitationId};}
   else if(accepting){route='/v1/invitations/accept';body={actionId:'dir-'+index,secret:guestInvite.secret};}
   else{route=prefix+'/invitations';body={actionId:'dir-'+index,email:'blocked@example.test',role:'reader'};}
   pending=fetch(api+route,{method:reading?'GET':'POST',headers:{'content-type':'application/json','x-workspace-session':session.token},body:reading?undefined:JSON.stringify(body)});
   let waiting=false;for(let attempt=0;attempt<150;attempt++){waiting=Number((await admin.query("SELECT count(*) n FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND wait_event_type='Lock' AND query LIKE $3",[database,app,workspaceCreation?'%governance_customer_identities%':'%governance_customer_workspaces%'])).rows[0].n)>0;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,scenario+' must wait inside the directory transaction');
   if(scenario.endsWith('webhook'))await service.auth.sessions.revocations.apply(identityConfig.clientId,{eventId:'event_dirrace'+index,sessionId:providerSessionId,subject:accepting?'user_dirguest':'user_keyrace',digest:'de'.repeat(32)},Date.now());
   else if(scenario.endsWith('freshness')){const writer=await reviewPool.connect();try{await writer.query('UPDATE governance_customer_sessions SET authenticated_at=$2 WHERE hash=$1',[hash(session.token),Date.now()-301000]);}finally{writer.release();}}
   else await service.auth.logout(session.token);
   await lock.query('COMMIT');const response=await pending,denied=await response.json();assert.equal(response.status,scenario.endsWith('freshness')?403:401,scenario);if(scenario.endsWith('freshness')){assert.equal(denied.code,'reauthentication-required');assert.equal((await fetch(api+prefix+'/members',{headers:{'x-workspace-session':session.token}})).status,200);}assert.equal(await customerDigest(),before);
  }finally{service.directory.operation=originalOperation;await lock.query('ROLLBACK');lock.release();await pending?.catch(()=>{});}
 }
 pass('all directory HTTP mutation/read paths and action replays reject session changes during authority waits without changing customer records');
 assert.equal((await fetch(api+'/v1/session',{method:'DELETE',headers})).status,200);assert.equal((await fetch(api+'/v1/session',{headers})).status,401);
 const webhookUser=await service.directory.verifiedIdentity({provider:'workos:'+identityConfig.clientId,subject:'user_http',email:'webhook@example.test',emailVerified:true}),webhookSession=await service.auth.loginVerified(webhookUser.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_http'});
 const raw=JSON.stringify({id:'event_http',event:'session.revoked',data:{object:'session',id:'session_http',user_id:'user_http'},context:{client_id:identityConfig.clientId}}),time=Date.now(),signature='t='+time+', v1='+require('node:crypto').createHmac('sha256',env.WORKOS_WEBHOOK_SECRET).update(time+'.'+raw).digest('hex');
 assert.equal((await fetch(api+'/v1/auth/workos-webhook',{method:'POST',headers:{'content-type':'application/json','workos-signature':signature},body:raw})).status,200);assert.equal(await service.auth.resolve(webhookSession.token),null);
 pass('generic PostgreSQL launcher accepts signed revocation HTTP and invalidates the matching customer session');
 assert.equal((await fetch(api+'/ready')).status,200);
 const readiness=require('../services/governance/readiness.cjs').createReadiness({environment:'test',pool:poolB,cacheMs:0,timeoutMs:300});
 assert.equal((await readiness.check()).status,'ready');
 await migrationPool.query("UPDATE governance_recovery_gate SET state='review-required'");
 assert.equal((await readiness.check()).status,'not-ready');
 await migrationPool.query("UPDATE governance_recovery_gate SET state='active'");
 const blocker=await migrationPool.connect();await blocker.query('BEGIN');await blocker.query('LOCK TABLE governance_recovery_gate IN ACCESS EXCLUSIVE MODE');
 const beforeProbe=Date.now();assert.equal((await readiness.check()).status,'not-ready');assert.ok(Date.now()-beforeProbe<2000);
 await blocker.query('ROLLBACK');blocker.release();
 await new Promise(r=>setTimeout(r,50));assert.equal((await readiness.check()).status,'ready');
 await migrationPool.query("UPDATE governance_environment SET name='dev'");assert.equal((await readiness.check()).status,'not-ready');await migrationPool.query("UPDATE governance_environment SET name='test'");
 await migrationPool.query("UPDATE governance_recovery_gate SET state='review-required'");await new Promise(r=>setTimeout(r,1050));assert.equal((await fetch(api+'/ready')).status,503);assert.equal((await fetch(api+'/health')).status,200);await migrationPool.query("UPDATE governance_recovery_gate SET state='active'");
 readiness.drain();assert.equal((await readiness.check()).status,'not-ready');
 pass('runtime readiness distinguishes liveness, environment mismatch, gated recovery, bounded lock waits and draining');
 const accountUser=await service.directory.verifiedIdentity({provider:'workos:'+identityConfig.clientId,subject:'user_account',email:'account@example.test',emailVerified:true}),otherAccount=await service.directory.verifiedIdentity({provider:'workos:'+identityConfig.clientId,subject:'user_otheraccount',email:'otheraccount@example.test',emailVerified:true});
 const accountLogin=sid=>service.auth.loginVerified(accountUser.id,'',{expiresAt:Date.now()+120000,providerSessionId:sid,authenticatedAt:Date.now()}),accountCurrent=await accountLogin('session_accountcurrent'),accountOther=await accountLogin('session_accountother'),foreignAccount=await service.auth.loginVerified(otherAccount.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_foreignaccount',authenticatedAt:Date.now()}),accountHeaders={'content-type':'application/json','x-workspace-session':accountCurrent.token};
 await service.auth.sessions.storeCredential(hash(accountOther.token),'synthetic-encrypted-account-refresh');const accountList=await service.auth.accountSessions(accountCurrent.token),accountTarget=accountList.sessions.find(s=>!s.current).ref,foreignRef=(await service.auth.accountSessions(foreignAccount.token)).sessions[0].ref;
 assert.equal(accountList.sessions.length,2);for(const secret of [accountCurrent.token,accountOther.token,hash(accountOther.token),'session_accountother'])assert.ok(!JSON.stringify(accountList).includes(secret));
 assert.equal((await fetch(api+'/v1/account/sessions/revoke',{method:'POST',headers:accountHeaders,body:JSON.stringify({ref:foreignRef})})).status,404);assert.ok(await service.auth.resolve(foreignAccount.token));
 assert.equal((await fetch(api+'/v1/account/sessions/revoke',{method:'POST',headers:accountHeaders,body:JSON.stringify({ref:accountTarget})})).status,200);assert.equal((await sb.read(hash(accountOther.token))).session,null);assert.ok(await service.auth.resolve(accountCurrent.token));
 const raceAccount=await accountLogin('session_accountblocked'),raceTarget=(await service.auth.accountSessions(accountCurrent.token)).sessions.find(s=>!s.current).ref,accountLock=await poolB.connect();let pendingAccount;
 try{
  await accountLock.query('BEGIN');await b.context(accountLock,{actor:accountUser.id});await accountLock.query('SELECT id FROM governance_customer_identities WHERE id=$1 FOR UPDATE',[accountUser.id]);pendingAccount=fetch(api+'/v1/account/sessions/revoke',{method:'POST',headers:accountHeaders,body:JSON.stringify({ref:raceTarget})});
  let waiting=false;for(let n=0;n<150;n++){waiting=Number((await admin.query("SELECT count(*) n FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND wait_event_type='Lock' AND query LIKE '%governance_customer_identities%'",[database,app])).rows[0].n)>0;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting);await service.auth.logout(accountCurrent.token);await accountLock.query('COMMIT');assert.equal((await pendingAccount).status,401);assert.ok(await service.auth.resolve(raceAccount.token));
 }finally{await accountLock.query('ROLLBACK');accountLock.release();await pendingAccount?.catch(()=>{});}
 pass('customer app-session HTTP list/revoke is identity-scoped, removes shared credentials, hides session secrets and denies stale authority after a native lock wait');
 await service.stop();service=null;
 await assert.rejects(require('../services/governance/start.cjs').start({...env,GOVERNANCE_SESSION_DB:path.join(directory,'forbidden.sqlite')}),/no configured accounts or SQLite/);assert.equal(fs.existsSync(path.join(directory,'forbidden.sqlite')),false);
 pass('shared-control launcher serves authenticated workspace/key HTTP flows without SQLite session state or password fallback');
 nextProfile='ai_agent';nextSid='session_humanProfile';const agentFlow=new URL((await wa.start({browser})).url);const sessionsBefore=(await migrationPool.query('SELECT count(*) n FROM governance_customer_sessions')).rows[0].n;await assert.rejects(wa.callback({browser,state:agentFlow.searchParams.get('state'),code:'synthetic'}),e=>e.status===401);assert.equal((await migrationPool.query('SELECT count(*) n FROM governance_customer_sessions')).rows[0].n,sessionsBefore);
 nextProfile='user';const humanFlow=new URL((await wa.start({browser})).url),humanSession=await wa.callback({browser,state:humanFlow.searchParams.get('state'),code:'synthetic'});now+=100000;nextProfile='ai_agent';assert.equal(await wb.resolve(humanSession.token),null);assert.equal(await aa.resolve(humanSession.token),null);nextProfile=undefined;
 pass('shared PostgreSQL callbacks reject agent tokens and renewal removes a human session if the provider changes its subject profile');
 const missed=await aa.loginVerified(session.user.id,'',{expiresAt:now+120000,providerSessionId:'session_missed',clientId:identityConfig.clientId,subject:'user_native'}),unrelated=await ab.loginVerified(session.user.id,'',{expiresAt:now+120000,providerSessionId:'session_unrelated',clientId:identityConfig.clientId,subject:'user_native'});
 await sa.storeCredential(hash(missed.token),wa.seal('synthetic-missed-refresh','refresh:'+hash(missed.token)));
 const missedEvent={object:'event',id:'event_missed',event:'session.revoked',created_at:new Date(now-30000).toISOString(),context:{client_id:identityConfig.clientId},data:{object:'session',id:'session_missed',user_id:'user_native'}};
 const replayPolicy={clientId:identityConfig.clientId,apiKey:identityConfig.apiKey,rangeStart:new Date(now-60000).toISOString(),rangeEnd:new Date(now).toISOString(),now:()=>now,repository:sb.revocations,fetcher:async()=>Response.json({object:'list',data:[missedEvent],list_metadata:{after:null}})};
 const replay=require('../services/governance/workos-revocation-replay.cjs').replayRevocations;
 assert.equal((await replay(replayPolicy)).applied,1);assert.equal(await aa.resolve(missed.token),null);assert.equal((await sa.read(hash(missed.token))).session,null);assert.ok(await aa.resolve(unrelated.token));
 assert.equal((await replay({...replayPolicy,repository:sa.revocations})).duplicate,1);assert.equal((await sb.revocations.apply(identityConfig.clientId,require('../services/governance/workos-webhook.cjs').normalizedRevocation(missedEvent,identityConfig.clientId),now)).status,'duplicate');
 assert.equal((await poolB.query('SELECT * FROM governance_customer_sessions')).rows.length,0);
 pass('missed revocation replay deletes shared session and encrypted refresh across pools, preserves unrelated access and deduplicates webhook delivery under strict API RLS');
 const replayStart=now-120000,replayOwner=randomBytes(32).toString('hex'),otherReplayOwner=randomBytes(32).toString('hex'),client='client_progress';
 const leaseResults=await Promise.all([sa.replayProgress.claim(client,replayStart,replayOwner,now),sb.replayProgress.claim(client,replayStart,otherReplayOwner,now)]);assert.equal(leaseResults.filter(r=>r.status==='acquired').length,1);assert.equal(leaseResults.filter(r=>r.status==='busy').length,1);
 const acquired=leaseResults.find(r=>r.status==='acquired');await sb.replayProgress.complete(client,acquired,now-5000,now);assert.equal((await poolB.query('SELECT * FROM governance_provider_replay_progress')).rows.length,0);
 const restartedProgress=new(require('../services/governance/provider-replay-state.cjs').PostgresReplayProgress)(b),nextLease=await restartedProgress.claim(client,replayStart,randomBytes(32).toString('hex'),now);assert.equal(nextLease.coveredUntil,now-5000);
 await assert.rejects(sa.replayProgress.claim(client,replayStart-1,randomBytes(32).toString('hex'),now),/baseline cannot/);await restartedProgress.fail(client,nextLease,now);
 const oldLease=await sa.replayProgress.claim(client,replayStart,randomBytes(32).toString('hex'),now),newLease=await sb.replayProgress.claim(client,replayStart,randomBytes(32).toString('hex'),now+61000);await assert.rejects(sa.replayProgress.complete(client,oldLease,now,now+61000),/lease changed/);await sa.replayProgress.fail(client,oldLease,now+61000);await sb.replayProgress.complete(client,newLease,now,now+61000);
 const originalFetcher=wa.fetcher;wa.fetcher=async()=>Response.json({object:'list',data:[],list_metadata:{after:null}});try{assert.equal((await wa.reconcileRevocations({startAt:new Date(now-60000).toISOString()})).status,'advanced');assert.equal((await wb.sessions.replayProgress.claim(identityConfig.clientId,now-60000,randomBytes(32).toString('hex'),now)).coveredUntil,now-5000);}finally{wa.fetcher=originalFetcher;}
 pass('durable replay progress coordinates independent PostgreSQL pools, persists restart coverage, rejects baseline replacement/stale leases and isolates unscoped reads');
 const replayBefore=await sa.replayProgress.read(identityConfig.clientId),replayStatus=await wa.revocationStatus({maxLagSeconds:30});assert.equal(replayStatus.status,'observed-fresh');assert.equal(replayStatus.lagSeconds,5);assert.deepEqual(await sb.replayProgress.read(identityConfig.clientId),replayBefore);assert.ok(!JSON.stringify(replayStatus).includes(identityConfig.clientId));assert.ok(!JSON.stringify(replayStatus).includes(replayBefore.lease_owner));
 const statusModule=require('../services/governance/workos-revocation-status.cjs');assert.equal((await statusModule.revocationStatus({progress:sa.replayProgress,clientId:identityConfig.clientId,now:()=>now+31000,maxLagSeconds:30})).status,'stalled');assert.equal((await statusModule.revocationStatus({progress:sb.replayProgress,clientId:'client_absent',now:()=>now})).status,'uninitialized');
 await migrationPool.query("UPDATE governance_recovery_gate SET state='review-required'");try{await assert.rejects(wa.revocationStatus(),/reviewed recovery/);}finally{await migrationPool.query("UPDATE governance_recovery_gate SET state='active'");}
 pass('operator replay status observes shared progress without writes or private bindings and rejects gated restored state');
 const statusUrl=new URL('postgresql://localhost');statusUrl.hostname=config.host;statusUrl.port=String(config.port);statusUrl.pathname='/'+database;statusUrl.username=app;statusUrl.password=appPassword;
 const statusUrlFile=path.join(directory,'private-status-url.txt'),statusConfigFile=path.join(directory,'private-status.json');fs.writeFileSync(statusUrlFile,statusUrl.href,{mode:0o600});fs.writeFileSync(statusConfigFile,JSON.stringify({environment:'test',storage:'postgres',clientId:identityConfig.clientId,maxLagSeconds:3600,databaseUrlFile:statusUrlFile}),{mode:0o600});
 // The synthetic session clock advances during deadline tests. Give this separate
 // real-clock CLI observation an independently initialized baseline.
 const cliTime=Date.now(),cliClaim=await sa.replayProgress.claim('client_cli',cliTime-60000,randomBytes(32).toString('hex'),cliTime);await sa.replayProgress.complete('client_cli',cliClaim,cliTime-5000,cliTime);
 fs.writeFileSync(statusConfigFile,JSON.stringify({environment:'test',storage:'postgres',clientId:'client_cli',maxLagSeconds:60,databaseUrlFile:statusUrlFile}),{mode:0o600});
 const execute=require('node:util').promisify(require('node:child_process').execFile);
 try{const output=await execute(process.execPath,[path.resolve(__dirname,'governance-identity-status.cjs'),statusConfigFile],{windowsHide:true,timeout:15000});assert.equal(JSON.parse(output.stdout).status,'observed-fresh');for(const secret of [appPassword,statusUrl.href,'client_cli'])assert.ok(!output.stdout.includes(secret));}finally{fs.unlinkSync(statusUrlFile);fs.unlinkSync(statusConfigFile);}
 pass('private-file operator status CLI reads actual strict-role PostgreSQL progress without provider calls, service startup or credential output');
 results.completedAt=new Date().toISOString();fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2));console.log('Evidence: '+path.join(directory,'results.json'));
}
main().catch(e=>{console.error('Native session acceptance failed: '+(e.code||e.name)+' '+e.message);process.exitCode=1;}).finally(async()=>{await service?.stop();for(const s of servers)await new Promise(r=>s.close(r));await Promise.all(pools.map(p=>p.ended?Promise.resolve():p.end()));await admin.end();});
