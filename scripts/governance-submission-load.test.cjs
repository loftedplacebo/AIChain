const {test}=require('node:test'),assert=require('node:assert/strict');
const {run,options,percentiles}=require('./governance-submission-load.cjs');
test('bounded configuration and deterministic percentile calculation',()=>{
 for(const input of [{count:0},{rate:Infinity},{concurrency:101},{seconds:86401},{batchSample:1001}])assert.throws(()=>options(input));
 assert.deepEqual(percentiles([1,2,3,4,100]),{p50Ms:3,p95Ms:100,p99Ms:100});
});
test('real HTTP submissions survive acknowledgement loss, retries and disk reopen',async()=>{
 const r=await run({count:30,rate:100,concurrency:4,seconds:30,faults:true,batchSample:3});
 assert.equal(r.passed,true);assert.equal(r.reconciliation.stored,30);
 assert.ok(r.statuses[429]>0);assert.ok(r.statuses[503]>0);assert.ok(r.duplicates>0);
 assert.equal(r.reconciliation.replayed,20);assert.equal(r.batch.verified,3);assert.equal(r.reportProbe.status,200);
});
test('deadline stops an incomplete workload and marks it unsuccessful',async()=>{
 const r=await run({count:20,rate:1,concurrency:2,seconds:1,batchSample:0});
 assert.equal(r.passed,false);assert.ok(r.dispatched<20);assert.equal(r.reconciliation.missingAcknowledged,0);
});
