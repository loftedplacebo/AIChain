'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {GovernanceStore}=require('./store'),{createServer}=require('./server.cjs'),{WorkspaceAuth,passwordHash}=require('./auth.cjs'),{defaults,limits}=require('./http-limits.cjs');
async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;}
test('HTTP limits are bounded and cannot be expanded through internal options',()=>{
 assert.equal(limits().uploadTimeoutMs,30000);for(const option of [{maxInFlight:0},{uploadTimeoutMs:defaults.uploadTimeoutMs+1},{maxHeaderSize:Infinity},{unknown:1},[]])assert.throws(()=>limits(option));
});
test('continuously trickling an incomplete key request times out without creating credentials',async()=>{
 const store=new GovernanceStore(':memory:'),user={id:'owner',email:'owner@example.test',passwordHash:passwordHash('synthetic-password'),workspaces:[{id:'w',name:'Synthetic',tenant:'t',project:'p',role:'workspace-admin'}]},auth=new WorkspaceAuth(store.db,[user]);
 const session=await auth.login(user.email,'synthetic-password'),server=createServer(store,[],[user],store.db,{}, {auth,httpLimits:{uploadTimeoutMs:180,headersTimeoutMs:100}}),base=await listen(server);let request,timer;
 try{
  const started=Date.now();const response=await new Promise((resolve,reject)=>{
   request=http.request(base+'/v1/keys',{method:'POST',headers:{'content-type':'application/json','x-workspace-session':session.token,'x-workspace-id':'w'}},res=>{clearInterval(timer);let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body,connection:res.headers.connection}));});
   request.on('error',reject);request.setTimeout(2000,()=>request.destroy(Error('Test upload failed to terminate')));request.write('{');timer=setInterval(()=>request.write(' '),15);
  });assert.equal(response.status,408);assert.equal(response.connection,'close');assert.ok(Date.now()-started<1500);assert.equal(store.db.prepare('SELECT count(*) n FROM project_api_keys').get().n,0);assert.equal(store.db.prepare('SELECT count(*) n FROM project_key_actions').get().n,0);
  assert.equal((await fetch(base+'/health')).status,200);
 }finally{clearInterval(timer);request?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
test('in-flight cap rejects excess requests and releases capacity after response completion',async()=>{
 const store=new GovernanceStore(':memory:');let enter,release;const entered=new Promise(r=>enter=r),blocked=new Promise(r=>release=r);store.report=async()=>{enter();await blocked;return {};};
 const server=createServer(store,[{token:'x'.repeat(32),tenant:'t',project:'p',scopes:['read']}],[],store.db,{}, {httpLimits:{maxInFlight:1}}),base=await listen(server);let first;
 try{
  first=fetch(base+'/v1/report',{headers:{authorization:'Bearer '+'x'.repeat(32)}});await entered;
  const denied=await fetch(base+'/health');assert.equal(denied.status,503);assert.equal(denied.headers.get('retry-after'),'1');assert.match((await denied.json()).error,/same operation identity/);
  release();assert.equal((await first).status,200);assert.equal((await fetch(base+'/health')).status,200);
 }finally{release();await first?.catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
test('early authentication denial closes an unfinished request body',async()=>{
 const store=new GovernanceStore(':memory:'),server=createServer(store,[]),base=await listen(server);let request;
 try{const response=await new Promise((resolve,reject)=>{request=http.request(base+'/v1/events',{method:'POST',headers:{'content-type':'application/json','content-length':'65536'}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,connection:res.headers.connection}));});request.on('error',reject);request.write('{');});assert.equal(response.status,401);assert.equal(response.connection,'close');assert.equal((await fetch(base+'/health')).status,200);}
 finally{request?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
test('disconnecting a client cannot free capacity while its database work is unfinished',async()=>{
 const store=new GovernanceStore(':memory:');let enter,release;const entered=new Promise(r=>enter=r),blocked=new Promise(r=>release=r);store.report=async()=>{enter();await blocked;return {};};
 const server=createServer(store,[{token:'x'.repeat(32),tenant:'t',project:'p',scopes:['read']}],[],store.db,{}, {httpLimits:{maxInFlight:1}}),base=await listen(server);let request;
 try{
  request=http.get(base+'/v1/report',{headers:{authorization:'Bearer '+'x'.repeat(32)}});request.on('error',()=>{});await entered;
  const closed=new Promise(r=>request.once('close',r));request.destroy();await closed;
  assert.equal((await fetch(base+'/health')).status,503);release();
  // The fulfilled handler releases its lease even though send skips the closed response.
  await new Promise(r=>setImmediate(r));assert.equal((await fetch(base+'/health')).status,200);
 }finally{release();request?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
test('finishing a key body after the timeout response cannot create a credential',async()=>{
 const net=require('node:net'),store=new GovernanceStore(':memory:'),user={id:'owner',email:'owner@example.test',passwordHash:passwordHash('synthetic-password'),workspaces:[{id:'w',name:'Synthetic',tenant:'t',project:'p',role:'workspace-admin'}]},auth=new WorkspaceAuth(store.db,[user]);
 const session=await auth.login(user.email,'synthetic-password'),server=createServer(store,[],[user],store.db,{}, {auth,httpLimits:{uploadTimeoutMs:180,headersTimeoutMs:100}});await listen(server);let socket;
 try{
  const body=JSON.stringify({actionId:'late-body',label:'Late key',scopes:['write'],expiresInDays:1});let response='',completed=false;
  await new Promise((resolve,reject)=>{
   socket=net.createConnection({host:'127.0.0.1',port:server.address().port,allowHalfOpen:true},()=>socket.write('POST /v1/keys HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: '+Buffer.byteLength(body)+'\r\nX-Workspace-Session: '+session.token+'\r\nX-Workspace-Id: w\r\n\r\n'+body.slice(0,-1)));
   socket.setTimeout(2000,()=>socket.destroy(Error('Late-body test did not close')));socket.on('error',error=>{if(!completed||error.code!=='ECONNRESET')reject(error);});socket.on('close',resolve);
   socket.on('data',chunk=>{response+=chunk;if(response.includes('408')&&!completed){completed=true;socket.end(body.slice(-1));}});
  });assert.match(response,/408/);assert.ok(completed);await new Promise(r=>setImmediate(r));assert.equal(store.db.prepare('SELECT count(*) n FROM project_api_keys').get().n,0);
  assert.equal(store.db.prepare('SELECT count(*) n FROM project_key_actions').get().n,0);
 }finally{socket?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
