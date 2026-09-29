const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {createBackup,restoreBackup,reviewRestore}=require('./recovery.cjs'),{bindSqlite}=require('./environment.cjs');
function temporary(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ov-recovery-test-'));return {directory,file:path.join(directory,'source.sqlite'),output:path.join(directory,'backups'),restores:path.join(directory,'restores'),close(){fs.rmSync(directory,{recursive:true,force:true});}};}
test('encrypted recovery preserves governance evidence, control plane and journal while revoking stale access',async()=>{
 const t=temporary();let store,journal;
 try{
  bindSqlite(t.file,'test');store=new (require('./store').GovernanceStore)(t.file);
  const directory=new (require('./customer-directory.cjs').CustomerDirectory)(store.db),auth=new (require('./auth.cjs').WorkspaceAuth)(store.db,[],Date.now,directory),keys=new (require('./project-keys.cjs').ProjectKeys)(store.db);
  const user=directory.verifiedIdentity({provider:'fixture',subject:'owner',email:'owner@example.test',emailVerified:true}),provision=directory.createWorkspace(user.id,{actionId:'create',name:'Customer',projectName:'Governance'}),p={tenant:provision.workspaceId,project:provision.projectId,actorId:user.id};
  const session=auth.loginVerified(user.id),key=keys.create(p,{actionId:'key',label:'Recorder',scopes:['read','write']});
  store.db.prepare('INSERT INTO workspace_provider_refresh VALUES(?,?)').run(require('node:crypto').createHash('sha256').update(session.token).digest('hex'),'synthetic-encrypted-refresh');
  store.db.prepare('INSERT INTO workspace_active_auth VALUES(?,?)').run(require('node:crypto').createHash('sha256').update(session.token).digest('hex'),Date.now());
  store.db.prepare('INSERT INTO workspace_refresh_claims VALUES(?,?,?)').run(require('node:crypto').createHash('sha256').update(session.token).digest('hex'),'synthetic-claim-owner',Date.now()+30000);
  directory.invite(user.id,p.tenant,{actionId:'invite',email:'member@example.test',role:'reader'});
  const event={...require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json').events[0],tenantRef:p.tenant,projectRef:p.project};store.ingest(event,p);
  const signer=require('ethers').Wallet.createRandom();await require('./evidence.cjs').prepareBatch(store,p,signer,{publisher:signer.address,limit:1});const evidence=store.evidence(p,event.eventId),record=store.get(p,event.eventId);
  const rulesFile=path.join(t.directory,'rules.sqlite');bindSqlite(rulesFile,'test');journal=new (require('./webhook-delivery.cjs').DeliveryJournal)(rulesFile);
  journal.enqueue(p,{schemaVersion:1,deliveryId:'delivery-1',tenantRef:p.tenant,projectRef:p.project,incidentRef:'incident-1',eventRef:event.eventId,severity:'high'},{destinationRef:'endpoint-1',keyRef:'key-v1'});
  const expectedJobs=journal.db.prepare('SELECT * FROM webhook_jobs').all();journal.close();journal=null;store.close();store=null;
  const backupKey=randomBytes(32),created=await createBackup({environment:'test',files:[{role:'events',path:t.file},{role:'rules',path:rulesFile}],outputRoot:t.output,key:backupKey,consistency:'quiesced'});
  assert.deepEqual(fs.readdirSync(created.directory).sort(),['complete.json','events.gcm','manifest.gcm','rules.gcm']);assert.equal(fs.readFileSync(path.join(created.directory,'events.gcm')).includes(Buffer.from(user.email)),false);
  const restored=await restoreBackup({environment:'test',directory:created.directory,outputRoot:t.restores,key:backupKey});assert.equal(restored.activation,'review-required');
  const review=reviewRestore({environment:'test',directory:restored.directory});assert.equal(review.review,'passed');assert.equal(review.activation,'review-required');assert.equal(review.files.length,2);assert.equal(JSON.stringify(review).includes(user.email),false);
  assert.throws(()=>bindSqlite(path.join(restored.directory,'events.sqlite'),'test'),/reviewed recovery/);
  const recovered=new (require('./store').GovernanceStore)(path.join(restored.directory,'events.sqlite'));
  try{
   assert.throws(()=>require('./server.cjs').createServer(recovered,[]),/reviewed recovery/);
   assert.throws(()=>new (require('./worker.cjs').GovernanceWorker)({store:recovered,principal:p,recorder:signer,signer,provider:{},journal:path.join(t.directory,'blocked-worker.sqlite')}),/reviewed recovery/);
   assert.deepEqual(recovered.get(p,event.eventId),record);assert.deepEqual(recovered.evidence(p,event.eventId),evidence);assert.equal(recovered.ingest(event,p).status,'duplicate');
   assert.equal(recovered.list({...p,tenant:'foreign'}).total,0);
   assert.equal((await require('./evidence.cjs').inspectEvidence(record,evidence,{trustedSigners:[signer.address]})).state,'batched');
   const recoveredDirectory=new (require('./customer-directory.cjs').CustomerDirectory)(recovered.db),recoveredAuth=new (require('./auth.cjs').WorkspaceAuth)(recovered.db,[],Date.now,recoveredDirectory),recoveredKeys=new (require('./project-keys.cjs').ProjectKeys)(recovered.db);
   assert.equal(recoveredAuth.resolve(session.token),null);assert.equal(recoveredKeys.resolve(key.secret),null);assert.equal(recoveredDirectory.identity(user.id),null);
   assert.equal(recovered.db.prepare('SELECT count(*) n FROM workspace_provider_refresh').get().n,0);
   assert.equal(recovered.db.prepare('SELECT count(*) n FROM workspace_active_auth').get().n,0);
   assert.equal(recovered.db.prepare('SELECT count(*) n FROM workspace_refresh_claims').get().n,0);
   assert.equal(recovered.db.prepare('SELECT role FROM customer_memberships WHERE user_id=?').get(user.id).role,'owner');
   assert.ok(recovered.db.prepare('SELECT revoked FROM customer_invitations').get().revoked);
  }finally{recovered.close();}
  assert.throws(()=>new (require('./webhook-delivery.cjs').DeliveryJournal)(path.join(restored.directory,'rules.sqlite')),/reviewed recovery/);
  const restoredJobs=new DatabaseSync(path.join(restored.directory,'rules.sqlite'),{readOnly:true});assert.deepEqual(restoredJobs.prepare('SELECT * FROM webhook_jobs').all(),expectedJobs);restoredJobs.close();
  assert.notEqual(restored.directory,t.directory);assert.equal(fs.existsSync(t.file),true);
 }finally{journal?.close();store?.close();t.close();}
});
test('wrong keys, environment and ciphertext corruption fail without releasing a restored database',async()=>{
 const t=temporary();try{
  bindSqlite(t.file,'test');const db=new DatabaseSync(t.file);db.exec("CREATE TABLE facts(value TEXT); INSERT INTO facts VALUES('preserved')");db.close();
  const key=randomBytes(32),created=await createBackup({environment:'test',files:[{role:'events',path:t.file}],outputRoot:t.output,key,consistency:'quiesced'});
  await assert.rejects(restoreBackup({environment:'dev',directory:created.directory,outputRoot:t.restores,key}),/mismatch/);
  await assert.rejects(restoreBackup({environment:'test',directory:created.directory,outputRoot:t.restores,key:randomBytes(32)}));assert.equal(fs.readdirSync(t.restores).length,0);
  const file=path.join(created.directory,'events.gcm'),bytes=fs.readFileSync(file);bytes[30]^=1;fs.writeFileSync(file,bytes);
  await assert.rejects(restoreBackup({environment:'test',directory:created.directory,outputRoot:t.restores,key}));assert.equal(fs.readdirSync(t.restores).length,0);
  const source=new DatabaseSync(t.file,{readOnly:true});assert.equal(source.prepare('SELECT value FROM facts').get().value,'preserved');source.close();
 }finally{t.close();}
});
test('capture refuses unbound/wrong-environment state, live capture claims and unsafe role names',async()=>{
 const t=temporary();try{
  const db=new DatabaseSync(t.file);db.exec('CREATE TABLE facts(value TEXT)');db.close();const options={environment:'test',files:[{role:'events',path:t.file}],outputRoot:t.output,key:randomBytes(32),consistency:'quiesced'};
  await assert.rejects(createBackup(options));assert.equal(fs.readdirSync(t.output).length,0);
  bindSqlite(t.file,'dev',{adopt:true});await assert.rejects(createBackup(options),/mismatch/);
  await assert.rejects(createBackup({...options,consistency:'live'}),/Stop all writers/);
  await assert.rejects(createBackup({...options,files:[{role:'../escape',path:t.file}]}),/roles/);
  await assert.rejects(createBackup({...options,environment:'prod'}),/gated/);
 }finally{t.close();}
});
test('operator CLI completes encrypted capture/restore without printing encryption keys or stored data',async()=>{
 const t=temporary();try{
  bindSqlite(t.file,'test');const db=new DatabaseSync(t.file);db.exec("CREATE TABLE facts(value TEXT); INSERT INTO facts VALUES('private-recovery-fixture')");db.close();
  const key=randomBytes(32).toString('hex'),keyFile=path.join(t.directory,'backup.key');fs.writeFileSync(keyFile,key,{mode:0o600});
  const configFile=path.join(t.directory,'backup.json');fs.writeFileSync(configFile,JSON.stringify({environment:'test',files:[{role:'events',path:t.file}],outputRoot:t.output,keyFile,consistency:'quiesced'}));
  const run=require('node:util').promisify(require('node:child_process').execFile),script=path.resolve(__dirname,'../../scripts/governance-recovery.cjs');
  const captured=await run(process.execPath,[script,'backup',configFile],{windowsHide:true});assert.equal(captured.stdout.includes(key),false);assert.equal(captured.stdout.includes('private-recovery-fixture'),false);const result=JSON.parse(captured.stdout);
  const restoreFile=path.join(t.directory,'restore.json');fs.writeFileSync(restoreFile,JSON.stringify({environment:'test',directory:result.directory,outputRoot:t.restores,keyFile}));
  const restored=await run(process.execPath,[script,'restore',restoreFile],{windowsHide:true});assert.equal(restored.stdout.includes(key),false);const recovery=JSON.parse(restored.stdout);assert.equal(recovery.activation,'review-required');
  const reviewFile=path.join(t.directory,'review.json');fs.writeFileSync(reviewFile,JSON.stringify({environment:'test',directory:recovery.directory}));
  const reviewed=await run(process.execPath,[script,'review',reviewFile],{windowsHide:true});assert.equal(JSON.parse(reviewed.stdout).review,'passed');assert.equal(reviewed.stdout.includes('private-recovery-fixture'),false);
  const restoredDb=new DatabaseSync(path.join(recovery.directory,'events.sqlite'),{readOnly:true});assert.equal(restoredDb.prepare('SELECT value FROM facts').get().value,'private-recovery-fixture');restoredDb.close();
 }finally{t.close();}
});
test('read-only recovery review rejects restored access, gate changes and unexpected files',async()=>{
 const t=temporary();try{
  bindSqlite(t.file,'test');const db=new DatabaseSync(t.file);
  new (require('./customer-directory.cjs').CustomerDirectory)(db);new (require('./project-keys.cjs').ProjectKeys)(db);
  db.exec("INSERT INTO customer_identities VALUES('user','fixture','subject','private@example.test',0,1); INSERT INTO project_api_keys VALUES('key','tenant','project','hash','private-label','[]',1,9999999999999,NULL,NULL,'user')");db.close();
  const key=randomBytes(32),backup=await createBackup({environment:'test',files:[{role:'control',path:t.file}],outputRoot:t.output,key,consistency:'quiesced'}),restored=await restoreBackup({environment:'test',directory:backup.directory,outputRoot:t.restores,key});
  const options={environment:'test',directory:restored.directory},file=path.join(restored.directory,'control.sqlite');
  const before=fs.readFileSync(file);assert.equal(reviewRestore(options).review,'passed');assert.deepEqual(fs.readFileSync(file),before);
  assert.throws(()=>reviewRestore({...options,environment:'dev'}),/marker/);
  fs.writeFileSync(path.join(restored.directory,'unexpected.txt'),'extra');assert.throws(()=>reviewRestore(options),/unexpected/);fs.unlinkSync(path.join(restored.directory,'unexpected.txt'));
  const changed=new DatabaseSync(file);
  changed.exec('UPDATE customer_identities SET disabled=0');assert.throws(()=>reviewRestore(options),/identities/);changed.exec('UPDATE customer_identities SET disabled=1');
  changed.prepare('UPDATE project_api_keys SET revoked_at=?').run(Date.now()+60000);assert.throws(()=>reviewRestore(options),/API keys/);changed.prepare('UPDATE project_api_keys SET revoked_at=?').run(Date.now());
  changed.exec("UPDATE governance_recovery_gate SET state='approved'");assert.throws(()=>reviewRestore(options),/gate changed/);changed.close();
 }finally{t.close();}
});
