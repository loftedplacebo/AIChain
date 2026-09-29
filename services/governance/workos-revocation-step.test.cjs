'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {SqliteReplayProgress}=require('./provider-replay-state.cjs'),{revocationStep}=require('./workos-revocation-step.cjs');
const result=input=>({...input,window:'replayed',applied:0,duplicate:0});
test('coordinated windows persist success, overlap coverage and keep failed windows unchanged across repository restart',async()=>{
 const db=new DatabaseSync(':memory:');try{
  let now=Date.now(),progress=new SqliteReplayProgress(db);const startAt=new Date(now-120000).toISOString(),policy={clientId:'client_test',startAt,progress,now:()=>now,replay:async input=>result(input)};
  const first=await revocationStep(policy);assert.equal(first.status,'advanced');assert.equal(first.coveredUntil,new Date(now-5000).toISOString());assert.equal(first.coverage,'selected-baseline-only');
  progress=new SqliteReplayProgress(db);now+=30000;let window;
  const second=await revocationStep({...policy,progress,replay:async input=>{window=input;return result(input);}});assert.equal(window.rangeStart,new Date(Date.parse(first.coveredUntil)-60000).toISOString());
  now+=30000;await assert.rejects(revocationStep({...policy,progress,replay:async()=>{throw Error('outage');}}),/outage/);assert.equal(db.prepare('SELECT covered_until FROM workspace_provider_replay_progress').get().covered_until,Date.parse(second.coveredUntil));
  const retry=await revocationStep({...policy,progress});assert.equal(retry.status,'advanced');assert.equal(retry.coveredUntil,new Date(now-5000).toISOString());
  await assert.rejects(revocationStep({...policy,progress,startAt:new Date(Date.parse(startAt)-1).toISOString()}),/baseline cannot/);
 }finally{db.close();}
});
test('competing steps, expired leases and stale owners cannot skip or overwrite coverage',async()=>{
 const db=new DatabaseSync(':memory:');try{
  let now=Date.now(),release;const progress=new SqliteReplayProgress(db),start=now-120000,startAt=new Date(start).toISOString(),policy={clientId:'client_test',startAt,progress,now:()=>now};
  const waiting=new Promise(r=>release=r),first=revocationStep({...policy,replay:async input=>{await waiting;return result(input);}});
  await new Promise(r=>setImmediate(r));assert.equal((await revocationStep({...policy,replay:async input=>result(input)})).status,'busy');
  now+=61000;const next=await revocationStep({...policy,replay:async input=>result(input)});release();await assert.rejects(first,/lease changed/);assert.equal(db.prepare('SELECT covered_until FROM workspace_provider_replay_progress').get().covered_until,Date.parse(next.coveredUntil));
  const acquired=progress.claim('client_test',start,'aa'.repeat(32),now);now+=61000;assert.throws(()=>progress.complete('client_test',acquired,now-5000,now),/lease changed/);progress.fail('client_test',acquired,now);
 }finally{db.close();}
});
test('bounded catch-up advances at most a day and incomplete replies never advance; idle is not a failure',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const now=Date.now(),progress=new SqliteReplayProgress(db),start=now-3*86400000,startAt=new Date(start).toISOString(),policy={clientId:'client_test',startAt,progress,now:()=>now};
  const next=await revocationStep({...policy,replay:async input=>result(input)});assert.equal(Date.parse(next.coveredUntil)-start,86400000);
  await assert.rejects(revocationStep({...policy,replay:async input=>({...result(input),rangeEnd:new Date(now).toISOString()})}),/exact replay window/);assert.equal(db.prepare('SELECT covered_until FROM workspace_provider_replay_progress').get().covered_until,Date.parse(next.coveredUntil));
  const idlePolicy={...policy,clientId:'client_idle',startAt:new Date(now-1000).toISOString()};assert.equal((await revocationStep({...idlePolicy,replay:async()=>{throw Error('must not request');}})).status,'not-due');assert.equal(db.prepare('SELECT last_failure FROM workspace_provider_replay_progress WHERE client_id=?').get('client_idle').last_failure,null);
 }finally{db.close();}
});
