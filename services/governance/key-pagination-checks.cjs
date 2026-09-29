'use strict';
const assert=require('node:assert/strict');
// Shared storage contract: historical credentials must never obscure active ones.
module.exports=async function check(keys,advance){
 const scope={tenant:'pagination-customer',project:'pagination-project',actorId:'owner'},input={label:'Synthetic',scopes:['write'],expiresInDays:365};
 const active=await keys.create(scope,{...input,actionId:'active'});
 const secrets=[active.secret];
 for(let i=0;i<105;i++){
  advance(1);const created=await keys.create(scope,{...input,actionId:'history-'+i});secrets.push(created.secret);
  await keys.revoke(scope,created.key.id,{actionId:'revoke-'+i});
 }
 const expiring=await keys.create(scope,{...input,expiresInDays:1,actionId:'expiry'});
 advance(86400001);
 const live=await keys.listPage(scope,{state:'active'});assert.equal(live.total,1);assert.equal(live.keys[0].id,active.key.id);assert.equal(live.nextOffset,null);
 const expired=await keys.listPage(scope,{state:'expired'});assert.equal(expired.total,1);assert.equal(expired.keys[0].id,expiring.key.id);
 assert.equal((await keys.listPage(scope,{state:'revoked'})).total,105);
 const ids=[];let offset=0;
 do{const page=await keys.listPage(scope,{limit:50,offset});assert.equal(page.total,107);assert.ok(page.keys.length<=50);assert.ok(page.keys.every(key=>!('secret' in key)&&!('token_hash' in key)));assert.ok(secrets.every(secret=>!JSON.stringify(page).includes(secret)));ids.push(...page.keys.map(key=>key.id));offset=page.nextOffset;}while(offset!==null);
 assert.equal(ids.length,107);assert.equal(new Set(ids).size,107);assert.ok(ids.includes(active.key.id));
 assert.equal((await keys.listPage(scope,{offset:200})).keys.length,0);
 for(const foreign of [{...scope,tenant:'foreign'},{...scope,project:'foreign'}])assert.equal((await keys.listPage(foreign)).total,0);
 for(const options of [{state:'unknown'},{limit:0},{limit:101},{offset:-1},{offset:1.5},{offset:Number.MAX_SAFE_INTEGER}])await assert.rejects(async()=>keys.listPage(scope,options),e=>e.status===400);
 // Scheduled revocation remains active through grace, then takes precedence over expiry.
 const grace=await keys.create(scope,{...input,actionId:'grace'});
 await keys.create(scope,{...input,actionId:'rotate-grace',graceSeconds:60},{rotateId:grace.key.id});
 assert.ok((await keys.listPage(scope,{state:'active'})).keys.some(key=>key.id===grace.key.id));advance(60000);
 assert.ok((await keys.listPage(scope,{state:'revoked',limit:100})).total===106);
};
