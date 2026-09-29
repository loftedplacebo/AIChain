'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {summarize,revocationStatus}=require('./workos-revocation-status.cjs'),{SqliteReplayProgress}=require('./provider-replay-state.cjs');
test('replay observations distinguish no initialization, no success, stale coverage, failures and lease expiry without private bindings',()=>{
 const now=Date.now(),row={client_id:'client_private',start_at:now-120000,covered_until:now-5000,lease_owner:null,lease_until:0,last_success:now-1000,last_failure:null};
 assert.equal(summarize(null,{now}).status,'uninitialized');assert.equal(summarize({...row,last_success:null},{now}).status,'never-completed');assert.equal(summarize(row,{now}).status,'observed-fresh');assert.equal(summarize({...row,covered_until:now-60000},{now,maxLagSeconds:30}).status,'stalled');
 assert.equal(summarize({...row,last_failure:now},{now}).status,'failure-observed');assert.equal(summarize({...row,last_failure:row.last_success},{now}).status,'failure-observed');assert.equal(summarize({...row,last_failure:now-2000},{now}).status,'observed-fresh');
 const leased={...row,lease_owner:'ab'.repeat(32),lease_until:now+60000};assert.equal(summarize(leased,{now}).lease,'active');assert.equal(summarize({...leased,lease_until:now},{now}).status,'lease-expired');
 for(const invalid of [{...row,covered_until:now+1},{...row,last_success:now+1},{...row,lease_owner:'invalid',lease_until:now+1},{...row,covered_until:row.start_at-1}])assert.equal(summarize(invalid,{now}).status,'invalid-state');
 const text=JSON.stringify(summarize(leased,{now}));for(const secret of [row.client_id,leased.lease_owner,'lease_owner'])assert.ok(!text.includes(secret));assert.throws(()=>summarize(row,{now,maxLagSeconds:0}),/policy/);
});
test('actual SQLite state monitoring is read-only, client-scoped and denies restored gates',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const progress=new SqliteReplayProgress(db),now=Date.now(),clientId='client_test';assert.equal((await revocationStatus({progress,clientId,now:()=>now})).status,'uninitialized');
  const claim=progress.claim(clientId,now-60000,'ab'.repeat(32),now);progress.complete(clientId,claim,now-5000,now);
  const before=JSON.stringify(db.prepare('SELECT * FROM workspace_provider_replay_progress').all());assert.equal((await revocationStatus({progress,clientId,now:()=>now})).status,'observed-fresh');assert.equal((await revocationStatus({progress,clientId:'client_other',now:()=>now})).status,'uninitialized');assert.equal(JSON.stringify(db.prepare('SELECT * FROM workspace_provider_replay_progress').all()),before);
  db.exec("CREATE TABLE governance_recovery_gate(state TEXT); INSERT INTO governance_recovery_gate VALUES('review-required')");await assert.rejects(revocationStatus({progress,clientId,now:()=>now}),/reviewed recovery/);
 }finally{db.close();}
});
test('operator SQLite CLI reports missing/fresh coverage without modifying source bytes and refuses mismatched/restored state',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),execute=require('node:util').promisify(require('node:child_process').execFile),directory=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-status-review-')),file=path.join(directory,'sessions.sqlite'),configFile=path.join(directory,'status.json'),db=new DatabaseSync(file);
 try{
  db.exec("CREATE TABLE governance_environment(name TEXT); INSERT INTO governance_environment VALUES('test')");
  const config={environment:'test',storage:'sqlite',clientId:'client_test',sessionDatabase:file,maxLagSeconds:60},script=path.resolve(__dirname,'../../scripts/governance-identity-status.cjs'),run=()=>execute(process.execPath,[script,configFile],{windowsHide:true,timeout:15000});
  fs.writeFileSync(configFile,JSON.stringify(config),{mode:0o600});let before=fs.readFileSync(file);
  await assert.rejects(run(),e=>e.code===2&&JSON.parse(e.stdout).status==='uninitialized');assert.deepEqual(fs.readFileSync(file),before);
  const progress=new SqliteReplayProgress(db),now=Date.now(),claim=progress.claim(config.clientId,now-60000,'ab'.repeat(32),now);progress.complete(config.clientId,claim,now-5000,now);before=fs.readFileSync(file);
  const output=await run();assert.equal(JSON.parse(output.stdout).status,'observed-fresh');assert.ok(!output.stdout.includes('ab'.repeat(32)));assert.deepEqual(fs.readFileSync(file),before);
  fs.writeFileSync(configFile,JSON.stringify({...config,environment:'dev'}),{mode:0o600});await assert.rejects(run(),e=>e.code===1&&!e.stderr.includes(file));assert.deepEqual(fs.readFileSync(file),before);
  fs.writeFileSync(configFile,JSON.stringify(config),{mode:0o600});db.exec("CREATE TABLE governance_recovery_gate(state TEXT); INSERT INTO governance_recovery_gate VALUES('review-required')");before=fs.readFileSync(file);await assert.rejects(run(),e=>e.code===1);assert.deepEqual(fs.readFileSync(file),before);
 }finally{db.close();const resolved=fs.realpathSync(directory);if(path.dirname(resolved)!==fs.realpathSync(os.tmpdir())||!path.basename(resolved).startsWith('synthetic-status-review-'))throw Error('Unsafe synthetic cleanup target');fs.rmSync(resolved,{recursive:true,force:true});}
});
