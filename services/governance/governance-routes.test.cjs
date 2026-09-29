const {test}=require('node:test'),assert=require('node:assert/strict');
const {GovernanceStore}=require('./store'),{createServer}=require('./server.cjs'),{passwordHash}=require('./auth.cjs');
const {DeliveryJournal}=require('./webhook-delivery.cjs'),{RuleEngine}=require('./governance-rules.cjs');
const {Client}=require('../../sdk/typescript/orvessian-ingest');
test('live workspace gateway enforces governance role, scoped preview and authenticated incident actors',async()=>{
 const {workspaceGateway}=await import('../../website/lib/workspace-gateway.js');
 const store=new GovernanceStore(':memory:'),journal=new DeliveryJournal(':memory:'),engine=new RuleEngine(journal),p={tenant:'tenant',project:'project'},password='synthetic-password-123',hash=passwordHash(password);
 const users=['governance-admin','reader','reviewer'].map((role,index)=>({id:`user-${index}`,email:`${index}@example.test`,passwordHash:hash,workspaces:[{id:'w',name:'Workspace',...p,role}]}));
 const bearer={...p,token:'x'.repeat(32),scopes:['read','write','manage-governance']};
 const server=createServer(store,[bearer],users,store.db,{}, {ruleEngine:engine,notificationDestinations:{approved:{...p,keyRef:'key-v1'},foreign:{tenant:'other',project:'project',keyRef:'key-v2'}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${server.address().port}`;
 const request=(action,cookie='',body,id='',origin='http://localhost:3001')=>workspaceGateway(new Request('http://localhost:3001/api/workspace?'+new URLSearchParams({action,workspace:'w',id}),{method:body?'POST':'GET',headers:{cookie,origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),{api});
 try{
  const cookies=[];for(const user of users){const response=await request('session','',{email:user.email,password});assert.equal(response.status,200);cookies.push(response.headers.get('set-cookie'));}
  const admin=cookies[0],rule={id:'failed-run',version:1,environment:'test',condition:'run-failed',severity:'high'};
  assert.equal((await request('rule',cookies[1],rule)).status,403);assert.equal((await request('rule',cookies[2],rule)).status,403);
  assert.equal((await fetch(api+'/v1/rules',{method:'POST',headers:{authorization:'Bearer '+bearer.token,'content-type':'application/json'},body:JSON.stringify(rule)})).status,403);
  assert.equal((await request('rule',admin,{...rule,destinationRef:'foreign'})).status,400);
  assert.equal((await request('rule',admin,{...rule,actorRef:'forged'})).status,400);
  assert.equal((await request('rule',admin,rule)).status,201);assert.equal((await request('rule',admin,rule)).status,200);
  assert.equal((await request('rule',admin,{...rule,severity:'critical'})).status,409);
  assert.equal((await request('rule',admin,rule,'','https://attacker.test')).status,403);
  const client=new Client({baseUrl:api,...bearer});const input=client.buildRun({eventId:'failed-event',streamRef:'s',sequence:1,occurredAt:new Date().toISOString(),runRef:'run',agentRef:'agent',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',taskClass:'task',status:'failed'});store.ingest(input,p);
  assert.equal((await fetch(api+'/v1/events',{method:'POST',headers:{authorization:'Bearer '+bearer.token,'content-type':'application/json'},body:JSON.stringify({...input,source:{...input.source,integrationVersion:'orvessian-rules-0.1.0-alpha'}})})).status,403);
  const preview=await request('rule-preview',admin,{rule,eventIds:[input.eventId]});assert.equal(preview.status,200);assert.equal((await preview.json()).results[0].assessment,'match');
  assert.equal((await request('rule-preview',admin,{rule,eventIds:['foreign-record']})).status,404);
  engine.scanStored(store,p);const list=await request('incidents',cookies[1]);assert.equal(list.status,200);const [incident]=(await list.json()).incidents;assert.ok(incident);
  const action={actionId:'ack',action:'acknowledge',reasonCode:'investigating',expectedRevision:0};
  assert.equal((await request('incident-action',cookies[1],action,incident.id)).status,403);
  assert.equal((await request('incident-action',admin,{...action,actorRef:'forged'},incident.id)).status,400);
  assert.equal((await request('incident-action',admin,action,incident.id)).status,200);
  assert.equal((await request('incident-action',admin,{...action,actionId:'stale'},incident.id)).status,409);
  const detail=await (await request('incident',admin,undefined,incident.id)).json();assert.match(detail.history[0].actorRef,/^workspace-[0-9a-f]{64}$/);assert.equal(detail.incident.state,'acknowledged');
  assert.equal((await request('incident',admin,undefined,'missing')).status,404);
  const active=await (await request('rules',cookies[1])).json();assert.equal(active.rules.length,1);assert.equal(active.rules[0].keyRef,undefined);
 }finally{await new Promise(r=>server.close(r));journal.close();store.close();}
});
