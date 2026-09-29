'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {replayRevocations}=require('./workos-revocation-replay.cjs');
const now=Date.now(),rangeStart=new Date(now-60000).toISOString(),rangeEnd=new Date(now).toISOString(),clientId='client_test';
const event=(id='event_test',sid='session_test',client=clientId)=>({object:'event',id,event:'session.revoked',created_at:new Date(now-30000).toISOString(),data:{object:'session',id:sid,user_id:'user_alice'},context:{client_id:client}});
const page=(data,after=null)=>Response.json({object:'list',data,list_metadata:{after}});
const options={clientId,apiKey:'sk_synthetic',rangeStart,rangeEnd,now:()=>now};
test('authenticated paginated replay clears missed sessions and credentials, deduplicates webhook events and preserves other clients',async()=>{
 const store=new(require('./store').GovernanceStore)(':memory:'),directory=new(require('./customer-directory.cjs').CustomerDirectory)(store.db),auth=new(require('./auth.cjs').WorkspaceAuth)(store.db,[],Date.now,directory);
 try{
  const user=directory.verifiedIdentity({provider:'workos:'+clientId,subject:'user_alice',email:'alice@example.test',emailVerified:true});
  const session=auth.loginVerified(user.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_test'}),other=auth.loginVerified(user.id,'',{expiresAt:Date.now()+120000,providerSessionId:'session_other'});
  const hash=require('node:crypto').createHash('sha256').update(session.token).digest('hex');store.db.prepare('INSERT INTO workspace_provider_refresh VALUES(?,?)').run(hash,'synthetic-encrypted');
  let calls=0;const config={clientId,apiKey:options.apiKey},provider=new(require('./workos-auth.cjs').WorkosAuth)(store.db,directory,auth,config,{now:()=>now,fetcher:async(url,init)=>{
   const parsed=new URL(url);assert.equal(parsed.origin,'https://api.workos.com');assert.equal(parsed.pathname,'/events');assert.equal(parsed.searchParams.get('events'),'session.revoked');assert.equal(parsed.searchParams.get('range_start'),rangeStart);assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer sk_synthetic');assert.ok(init.signal);
   calls++;return parsed.searchParams.has('after')?page([event('event_foreign','session_other','client_other')]):page([event()], 'event_test');
  }});
  const result=await provider.replayRevocations({rangeStart,rangeEnd});assert.equal(calls,2);assert.equal(result.applied,1);assert.equal(result.foreignClient,1);assert.equal(result.historicalCoverage,'not-proven');assert.equal(auth.resolve(session.token),null);assert.ok(auth.resolve(other.token));assert.equal(store.db.prepare('SELECT count(*) n FROM workspace_provider_refresh').get().n,0);
  const again=await provider.replayRevocations({rangeStart,rangeEnd});assert.equal(again.duplicate,1);assert.equal(again.applied,0);assert.ok(!JSON.stringify(again).includes('user_alice'));
  const normalized=require('./workos-webhook.cjs').normalizedRevocation(event(),clientId);assert.equal(provider.sessions.revocations.apply(clientId,normalized,now).status,'duplicate');
  await assert.rejects(provider.replayRevocations({rangeStart,rangeEnd,clientId:'client_other'}),/Invalid/);
  const coordinated=await provider.reconcileRevocations({startAt:rangeStart});assert.equal(coordinated.status,'advanced');assert.equal(coordinated.duplicate,1);assert.equal(coordinated.coveredUntil,new Date(now-5000).toISOString());
 }finally{store.close();}
});
test('malformed later pages, cursor loops, event conflicts and limits do not apply a partial window',async()=>{
 const cases=[
  {fetcher:async(url)=>new URL(url).searchParams.has('after')?Response.json({object:'bad'}):page([event()],'event_test')},
  {fetcher:async()=>page([event()],'event_test')},
  {fetcher:async(url)=>new URL(url).searchParams.has('after')?page([event('event_test','session_changed')]):page([event()],'event_test')},
  {maxPages:1,fetcher:async()=>page([event()],'event_test')},
  {maxEvents:1,fetcher:async()=>page([event(),event('event_second')])},
  {fetcher:async()=>page([{...event(),created_at:new Date(now+1).toISOString()}])},
  {fetcher:async()=>page([{...event(),context:{}}])},
  {fetcher:async()=>page([{...event(),data:{...event().data,user_id:'agent_alice'}}])}
 ];
 for(const scenario of cases){let writes=0;await assert.rejects(replayRevocations({...options,...scenario,repository:{apply:()=>{writes++;return {status:'applied'};}}}));assert.equal(writes,0);}
});
test('provider denial and oversized streaming response fail without changing sessions',async()=>{
 for(const response of [new Response('denied',{status:401}),new Response('x'.repeat(1048577))]){
  let writes=0;await assert.rejects(replayRevocations({...options,fetcher:async()=>response,repository:{apply:()=>{writes++;}}}));assert.equal(writes,0);
 }
 let calls=0;await assert.rejects(replayRevocations({...options,rangeStart:new Date(now-86400001).toISOString(),fetcher:async()=>{calls++;},repository:{apply(){}}}),/policy/);assert.equal(calls,0);
});
test('write failure can be retried without reapplying committed revocations',async()=>{
 const seen=new Set();let fail=true;
 const repository={apply:async(client,event)=>{if(event.eventId==='event_second'&&fail){fail=false;throw Error('synthetic database failure');}if(seen.has(event.eventId))return {status:'duplicate'};seen.add(event.eventId);return {status:'applied'};}};
 const policy={...options,repository,fetcher:async()=>page([event(),event('event_second','session_second')])};
 await assert.rejects(replayRevocations(policy),/database failure/);assert.equal(seen.size,1);
 const result=await replayRevocations(policy);assert.equal(result.duplicate,1);assert.equal(result.applied,1);assert.equal(seen.size,2);
});
