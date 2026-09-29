'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto'),{Worker}=require('node:worker_threads'),{once}=require('node:events');
const {GovernanceStore}=require('./store'),{CustomerDirectory}=require('./customer-directory.cjs'),{WorkspaceAuth}=require('./auth.cjs'),{createServer}=require('./server.cjs');
const digest=value=>createHash('sha256').update(value).digest('hex');
test('SQLite customer directory and session state cannot be split across databases',()=>{
 const a=new GovernanceStore(':memory:'),b=new GovernanceStore(':memory:');try{const directory=new CustomerDirectory(a.db),auth=new WorkspaceAuth(b.db,[],Date.now,directory);assert.throws(()=>createServer(b,[],[],b.db,{}, {directory,auth}),/co-located/);}finally{a.close();b.close();}
});
test('SQLite directory HTTP writes, reads and action replay reject logout committed during the transaction lock wait',async()=>{
 for(const scenario of ['workspace','workspace-replay','project','member','invite','revoke','accept','members-read','invitations-read']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ov-customer-session-')),file=path.join(root,'state.sqlite'),store=new GovernanceStore(file),db=store.db;db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000');
  const directory=new CustomerDirectory(db),auth=new WorkspaceAuth(db,[],Date.now,directory),identity=subject=>directory.verifiedIdentity({provider:'synthetic',subject,email:subject+'@example.test',emailVerified:true}),owner=identity('owner'),member=identity('member'),guest=identity('guest'),workspaceInput={actionId:'workspace',name:'Synthetic',projectName:'Test'},workspace=directory.createWorkspace(owner.id,workspaceInput);
  const invitation=directory.invite(owner.id,workspace.workspaceId,{actionId:'member-invite',email:member.email,role:'reader'});directory.acceptInvitation(member.id,{actionId:'member-join',secret:invitation.secret});
  const pendingInvite=directory.invite(owner.id,workspace.workspaceId,{actionId:'pending',email:'pending@example.test',role:'reader'}),guestInvite=directory.invite(owner.id,workspace.workspaceId,{actionId:'guest-invite',email:guest.email,role:'reader'}),session=auth.loginVerified(scenario==='accept'?guest.id:owner.id);
  const snapshot=()=>digest(JSON.stringify(['workspaces','projects','memberships','invitations','actions'].map(suffix=>db.prepare('SELECT * FROM customer_'+suffix).all().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))))),before=snapshot(),server=createServer(store,[],[],db,{}, {directory,auth});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const signal=new Int32Array(new SharedArrayBuffer(4)),worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads'),{DatabaseSync}=require('node:sqlite'),signal=new Int32Array(workerData.signal),db=new DatabaseSync(workerData.file);try{parentPort.postMessage('ready');while(Atomics.load(signal,0)!==1)if(Atomics.wait(signal,0,0,3000)==='timed-out')throw Error('Transaction test did not start');db.exec('BEGIN IMMEDIATE');Atomics.store(signal,0,2);Atomics.notify(signal,0);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,80);db.prepare('DELETE FROM workspace_sessions WHERE hash=?').run(workerData.hash);db.exec('COMMIT');}finally{db.close();}`,{eval:true,workerData:{file,hash:digest(session.token),signal:signal.buffer}}),exited=once(worker,'exit');await once(worker,'message');
  const original=db.exec.bind(db);let waited=false;db.exec=sql=>{if(sql==='BEGIN IMMEDIATE'&&!waited){waited=true;Atomics.store(signal,0,1);Atomics.notify(signal,0);while(Atomics.load(signal,0)!==2)if(Atomics.wait(signal,0,1,3000)==='timed-out')throw Error('Competing writer did not lock');}return original(sql);};
  try{
   const prefix='/v1/workspaces/'+workspace.workspaceId;let route,body;const reading=scenario.endsWith('read');
   if(scenario.startsWith('workspace')){route='/v1/workspaces';body=scenario.endsWith('replay')?workspaceInput:{...workspaceInput,actionId:'blocked-workspace'};}
   else if(scenario==='project'){route=prefix+'/projects';body={actionId:'blocked-project',name:'Blocked'};}
   else if(scenario.startsWith('member')){route=prefix+'/members';body={actionId:'blocked-member',userId:member.id,role:'reviewer'};}
   else if(scenario==='revoke'){route=prefix+'/invitations/revoke';body={actionId:'blocked-revoke',invitationId:pendingInvite.invitationId};}
   else if(scenario==='accept'){route='/v1/invitations/accept';body={actionId:'blocked-accept',secret:guestInvite.secret};}
   else{route=prefix+'/invitations';body={actionId:'blocked-invite',email:'blocked@example.test',role:'reader'};}
   const response=await fetch('http://127.0.0.1:'+server.address().port+route,{method:reading?'GET':'POST',headers:{'content-type':'application/json','x-workspace-session':session.token},body:reading?undefined:JSON.stringify(body)});assert.equal(response.status,401,scenario);assert.ok(waited);assert.equal((await exited)[0],0);assert.equal(snapshot(),before);assert.equal(db.isTransaction,false);assert.ok(!JSON.stringify(db.prepare('SELECT * FROM customer_actions').all()).includes(session.token));
  }finally{db.exec=original;await worker.terminate();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();for(const name of ['state.sqlite','state.sqlite-wal','state.sqlite-shm'])fs.rmSync(path.join(root,name),{force:true});fs.rmdirSync(root);}
 }
});
