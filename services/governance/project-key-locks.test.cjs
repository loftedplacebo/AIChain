'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto'),{Worker}=require('node:worker_threads'),{once}=require('node:events'),{DatabaseSync}=require('node:sqlite');
const {GovernanceStore}=require('./store'),{CustomerDirectory}=require('./customer-directory.cjs'),{WorkspaceAuth}=require('./auth.cjs'),{ProjectKeys}=require('./project-keys.cjs'),{createServer}=require('./server.cjs');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ov-key-lock-')),file=path.join(root,'state.sqlite'),store=new GovernanceStore(file);store.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000');return {root,file,store,close(){store.close();for(const name of ['state.sqlite','state.sqlite-wal','state.sqlite-shm'])fs.rmSync(path.join(root,name),{force:true});fs.rmdirSync(root);}};}
const workerCode=`const {workerData,parentPort}=require('node:worker_threads'),{DatabaseSync}=require('node:sqlite'),signal=new Int32Array(workerData.signal),db=new DatabaseSync(workerData.file);try{
 if(workerData.armed){parentPort.postMessage('ready');while(Atomics.load(signal,0)!==1)if(Atomics.wait(signal,0,0,3000)==='timed-out')throw Error('Lock test did not start');}
 db.exec('BEGIN IMMEDIATE');Atomics.store(signal,0,2);Atomics.notify(signal,0);if(!workerData.armed)parentPort.postMessage('locked');
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);db.prepare(workerData.sql).run(...workerData.args);db.exec('COMMIT');
}finally{db.close();}`;
test('SQLite HTTP key changes and replay recheck authority after a competing connection commits',async()=>{
 for(const scenario of ['create-demoted','replay-demoted','rotate-disabled','revoke-logout','list-removed']){
  const f=fixture(),db=f.store.db,directory=new CustomerDirectory(db),auth=new WorkspaceAuth(db,[],Date.now,directory),user=directory.verifiedIdentity({provider:'synthetic',subject:'owner',email:'owner@example.test',emailVerified:true}),workspace=directory.createWorkspace(user.id,{actionId:'workspace',name:'Synthetic',projectName:'Test'}),session=auth.loginVerified(user.id),p={tenant:workspace.workspaceId,project:workspace.projectId,actorId:user.id},keys=new ProjectKeys(db),input={actionId:'existing',label:'Synthetic',scopes:['write'],expiresInDays:1},key=keys.create(p,input);
  const before=JSON.stringify({keys:db.prepare('SELECT * FROM project_api_keys').all(),actions:db.prepare('SELECT * FROM project_key_actions').all()}),server=createServer(f.store,[],[],db,{}, {auth,directory});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const signal=new Int32Array(new SharedArrayBuffer(4)),sql=scenario.endsWith('demoted')?"UPDATE customer_memberships SET role='reader' WHERE user_id=?":scenario.endsWith('disabled')?'UPDATE customer_identities SET disabled=1,version=version+1 WHERE id=?':scenario.endsWith('logout')?'DELETE FROM workspace_sessions WHERE hash=?':'DELETE FROM customer_memberships WHERE user_id=?',args=[scenario.endsWith('logout')?createHash('sha256').update(session.token).digest('hex'):user.id];
  const worker=new Worker(workerCode,{eval:true,workerData:{file:f.file,signal:signal.buffer,armed:true,sql,args}}),exit=once(worker,'exit');await once(worker,'message');const original=db.exec.bind(db);let intercepted=false;
  db.exec=sql=>{if(sql==='BEGIN IMMEDIATE'&&!intercepted){intercepted=true;Atomics.store(signal,0,1);Atomics.notify(signal,0);while(Atomics.load(signal,0)!==2)if(Atomics.wait(signal,0,1,3000)==='timed-out')throw Error('Competing lock not acquired');}return original(sql);};
  try{
   const route=scenario.startsWith('rotate')?'/v1/keys/'+key.key.id+'/rotate':scenario.startsWith('revoke')?'/v1/keys/'+key.key.id+'/revoke':'/v1/keys',body=scenario.startsWith('replay')?input:scenario.startsWith('revoke')?{actionId:'blocked-revoke'}:{...input,actionId:'blocked'};
   const response=await fetch('http://127.0.0.1:'+server.address().port+route,{method:scenario.startsWith('list')?'GET':'POST',headers:{'content-type':'application/json','x-workspace-session':session.token,'x-workspace-id':workspace.projectId},body:scenario.startsWith('list')?undefined:JSON.stringify(body)});assert.equal(response.status,scenario.endsWith('demoted')?403:scenario.endsWith('removed')?404:401,scenario);
   assert.ok(intercepted);assert.equal((await exit)[0],0);assert.equal(db.isTransaction,false);assert.equal(JSON.stringify({keys:db.prepare('SELECT * FROM project_api_keys').all(),actions:db.prepare('SELECT * FROM project_key_actions').all()}),before);assert.ok(keys.resolve(key.secret));
   assert.ok(!JSON.stringify(db.prepare('SELECT * FROM project_key_actions').all()).includes(session.token));
  }finally{db.exec=original;await worker.terminate();server.closeAllConnections();await new Promise(r=>server.close(r));f.close();}
 }
});
test('SQLite bearer authentication waiting for a write lock observes concurrent revocation',async()=>{
 const f=fixture(),db=f.store.db,keys=new ProjectKeys(db),p={tenant:'t',project:'p',actorId:'owner'},key=keys.create(p,{actionId:'key',label:'Synthetic',scopes:['write']});
 const signal=new Int32Array(new SharedArrayBuffer(4)),worker=new Worker(workerCode,{eval:true,workerData:{file:f.file,signal:signal.buffer,armed:false,sql:'UPDATE project_api_keys SET revoked_at=? WHERE id=?',args:[Date.now(),key.key.id]}}),exit=once(worker,'exit');await once(worker,'message');
 try{assert.equal(keys.resolve(key.secret),null);assert.equal((await exit)[0],0);assert.equal(db.prepare('SELECT last_used_at FROM project_api_keys WHERE id=?').get(key.key.id).last_used_at,null);assert.equal(db.isTransaction,false);}
 finally{await worker.terminate();f.close();}
});
