'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{checkBindings}=require('./recovery-provider-review.cjs'),{digest}=require('./recovery-access-plan.cjs');
const snapshot={environment:'test',database:{name:'gov_restore_synthetic',oid:1},restoreId:'synthetic',identities:[{id:'local-user',provider:'workos:client_synthetic',subject:'user_synthetic',email:'owner@example.test',disabled:true,version:2}],workspaces:[{id:'workspace'}],memberships:[{workspace:'workspace',user_id:'local-user',role:'owner'}]};
const input={snapshotDigest:digest(snapshot),reviewReference:'synthetic-review',providerReviewReference:'synthetic-provider',ownershipReviewReference:'synthetic-owner',memberships:[{workspace:'workspace',userId:'local-user',role:'owner'}]},user={object:'user',id:'user_synthetic',email:'owner@example.test',email_verified:true};
const config={clientId:'client_synthetic',apiKey:'sk_synthetic'};
test('provider recovery uses only bounded read-only lookup and reports no personal data or activation',async()=>{
 let calls=0;const result=await checkBindings(snapshot,input,{...config,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.workos.com/user_management/users/user_synthetic');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.ok(options.signal);return Response.json(user);}});assert.equal(calls,1);assert.equal(result.providerBindings,'matched');assert.equal(result.activation,'review-required');assert.ok(!JSON.stringify(result).includes(user.email));assert.ok(!JSON.stringify(result).includes(config.apiKey));
});
test('missing/unverified/changed identities and provider failures cannot satisfy reconciliation',async()=>{
 for(const [response,field] of [[new Response(null,{status:404}),'missing'],[Response.json({...user,email_verified:false}),'unverified'],[Response.json({...user,id:'user_other'}),'bindingMismatch'],[Response.json({...user,email:'changed@example.test'}),'bindingMismatch'],[new Response(null,{status:429}),'unavailable'],[new Response('bad-json'),'unavailable'],[new Response('x'.repeat(65537)),'unavailable']]){const r=await checkBindings(snapshot,input,{...config,fetcher:async()=>response});assert.equal(r.counts[field],1);assert.equal(r.providerBindings,'review-required');}
 const outage=await checkBindings(snapshot,input,{...config,fetcher:async()=>{throw Error('synthetic sensitive provider error');}});assert.equal(outage.counts.unavailable,1);assert.ok(!JSON.stringify(outage).includes('sensitive'));
});
test('wrong provider realm and stale selections fail without provider requests',async()=>{
 let calls=0;const cfg={...config,fetcher:async()=>{calls++;throw Error('unexpected');}};
 const foreign=structuredClone(snapshot);foreign.identities[0].provider='workos:client_other';const foreignInput={...input,snapshotDigest:digest(foreign)};assert.equal((await checkBindings(foreign,foreignInput,cfg)).counts.unsupportedProvider,1);assert.equal(calls,0);
 await assert.rejects(checkBindings(snapshot,{...input,snapshotDigest:'bad'},cfg),/stale/);assert.equal(calls,0);
});
test('provider review refuses oversized selections and stops after outage with unchecked identities explicit',async()=>{
 const two=structuredClone(snapshot);two.identities.push({...two.identities[0],id:'second-user',subject:'user_second'});const selection={...input,snapshotDigest:digest(two),memberships:[...input.memberships,{workspace:'workspace',userId:'second-user',role:'reader'}]};let calls=0;
 const cfg={...config,fetcher:async()=>{calls++;return new Response(null,{status:503});}};
 await assert.rejects(checkBindings(two,selection,{...cfg,maxIdentities:1}),/bounded review limit/);assert.equal(calls,0);
 const r=await checkBindings(two,selection,cfg);assert.equal(calls,1);assert.equal(r.counts.unavailable,1);assert.equal(r.counts.unchecked,1);assert.equal(r.providerBindings,'review-required');
});
