'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const {run}=require('../../scripts/governance-identity-replay.cjs');
const {CustomerDirectory}=require('./customer-directory.cjs'),{WorkspaceAuth}=require('./auth.cjs'),{SqliteProviderSessions}=require('./sqlite-provider-sessions.cjs');
test('one explicit private replay step revokes only the matching session and advances bounded coverage',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-replay-cli-')),database=path.join(root,'sessions.sqlite'),configFile=path.join(root,'replay.json'),keyFile=path.join(root,'workos-key.txt');
 const now=Date.now(),startAt=new Date(now-60000).toISOString(),clientId='client_test',key='sk_synthetic_only';
 const config={environment:'test',storage:'sqlite',clientId,startAt,apiKeyFile:keyFile,sessionDatabase:database};
 let db=new DatabaseSync(database),revoked,other;
 try{
  db.exec("CREATE TABLE governance_environment(name TEXT); INSERT INTO governance_environment VALUES('test')");
  const directory=new CustomerDirectory(db),auth=new WorkspaceAuth(db,[],()=>now,directory);new SqliteProviderSessions(db);
  const identity=directory.verifiedIdentity({provider:'workos:'+clientId,subject:'user_alice',email:'alice@example.test',emailVerified:true});
  revoked=auth.loginVerified(identity.id,'',{expiresAt:now+120000,providerSessionId:'session_revoked',clientId,subject:'user_alice'}).token;
  other=auth.loginVerified(identity.id,'',{expiresAt:now+120000,providerSessionId:'session_other',clientId,subject:'user_alice'}).token;
  db.close();db=null;
  fs.writeFileSync(configFile,JSON.stringify(config),{mode:0o600});fs.writeFileSync(keyFile,key+'\n',{mode:0o600});
  const event={object:'event',id:'event_revoked',event:'session.revoked',created_at:new Date(now-30000).toISOString(),data:{object:'session',id:'session_revoked',user_id:'user_alice'},context:{client_id:clientId}};
  let calls=0;const fetcher=async(url,options)=>{calls++;const target=new URL(url);assert.equal(target.origin,'https://api.workos.com');assert.equal(target.pathname,'/events');assert.equal(target.searchParams.get('range_start'),startAt);assert.equal(options.headers.Authorization,'Bearer '+key);return Response.json({object:'list',data:[event],list_metadata:{after:null}});};
  const result=await run(configFile,{fetcher,now:()=>now});assert.equal(result.status,'advanced');assert.equal(result.applied,1);assert.equal(result.events,1);assert.equal(calls,1);
  assert.ok(!JSON.stringify(result).includes(key));assert.ok(!JSON.stringify(result).includes('user_alice'));
  db=new DatabaseSync(database);const digest=token=>require('node:crypto').createHash('sha256').update(token).digest('hex');assert.equal(db.prepare('SELECT count(*) n FROM workspace_sessions WHERE hash=?').get(digest(revoked)).n,0);assert.equal(db.prepare('SELECT count(*) n FROM workspace_sessions WHERE hash=?').get(digest(other)).n,1);assert.equal(db.prepare('SELECT count(*) n FROM workspace_provider_sessions WHERE session_id=?').get('session_revoked').n,0);assert.equal(db.prepare('SELECT count(*) n FROM workspace_provider_sessions WHERE session_id=?').get('session_other').n,1);
  assert.equal(db.prepare('SELECT covered_until FROM workspace_provider_replay_progress').get().covered_until,now-5000);
  db.close();db=null;
  const idle=await run(configFile,{fetcher:async()=>{throw Error('No provider call due');},now:()=>now});assert.equal(idle.status,'not-due');
  fs.writeFileSync(configFile,JSON.stringify({...config,clientId:'client_idle',startAt:new Date(Date.now()).toISOString()}),{mode:0o600});
  const script=path.resolve(__dirname,'../../scripts/governance-identity-replay.cjs'),spawn=require('node:child_process').spawnSync;
  const child=spawn(process.execPath,[script,'--apply-revocations',configFile],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(child.status,0);assert.equal(JSON.parse(child.stdout).status,'not-due');for(const secret of [key,revoked,other,'user_alice'])assert.ok(!child.stdout.includes(secret)&&!child.stderr.includes(secret));
  const withoutFlag=spawn(process.execPath,[script,configFile],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(withoutFlag.status,1);assert.ok(!withoutFlag.stderr.includes(key));
  fs.writeFileSync(configFile,JSON.stringify(config),{mode:0o600});
  fs.writeFileSync(configFile,JSON.stringify({...config,environment:'dev'}),{mode:0o600});await assert.rejects(run(configFile,{fetcher,now:()=>now}),/environment mismatch/);
  fs.writeFileSync(configFile,JSON.stringify(config),{mode:0o600});db=new DatabaseSync(database);db.exec("CREATE TABLE governance_recovery_gate(state TEXT); INSERT INTO governance_recovery_gate VALUES('review-required')");db.close();db=null;
  await assert.rejects(run(configFile,{fetcher,now:()=>now}),/reviewed recovery/);
 }finally{db?.close();const resolved=fs.realpathSync(root);if(path.dirname(resolved)!==fs.realpathSync(os.tmpdir())||!path.basename(resolved).startsWith('synthetic-replay-cli-'))throw Error('Unsafe synthetic cleanup target');fs.rmSync(resolved,{recursive:true,force:true});}
});
