const {test}=require('node:test'),assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os'),{join}=require('node:path');
const {Client,IngestionError}=require('./orvessian-ingest'),{DurableQueue}=require('./orvessian-queue');
const config={baseUrl:'http://127.0.0.1',token:'x'.repeat(32),tenant:'t',project:'p',attempts:1};
const run={eventId:'e',streamRef:'s',sequence:'1',occurredAt:'2026-09-28T00:00:00.000Z',runRef:'r',agentRef:'a',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',taskClass:'classification',status:'completed'};
test('durable queue survives failures and restart; scope, collision and capacity fail closed',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'orvessian-queue-')),path=join(dir,'queue.sqlite');let queue;
 try{
  let succeed=false;const bodies=[];const c=new Client(config,async(_,options)=>{bodies.push(options.body);return succeed?Response.json({eventId:'e',status:'duplicate'}):new Response('',{status:503});});
  const event=c.buildRun(run);queue=new DurableQueue(c,path,{capacity:1});assert.equal(queue.enqueue(event),true);assert.equal(queue.enqueue(event),false);
  assert.throws(()=>queue.enqueue({...event,runRef:'other'}),/collision/);assert.throws(()=>queue.enqueue({...event,eventId:'f'}),/capacity/);
  await assert.rejects(queue.flush(),IngestionError);assert.equal(queue.size,1);queue.close();
  assert.throws(()=>new DurableQueue(new Client({...config,tenant:'foreign'}),path),/another project/);
  queue=new DurableQueue(c,path);assert.equal(queue.size,1);succeed=true;assert.deepEqual(await queue.flush(),{delivered:1,pending:0});assert.equal(bodies[0],bodies[1]);queue.close();
  queue=new DurableQueue(c,path);assert.equal(queue.size,0);
 }finally{queue?.close();rmSync(dir,{recursive:true,force:true});}
});
test('overlapping flush and close cannot remove pending records; malformed ack retains event',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'orvessian-queue-'));let release,queue;
 try{
  const c=new Client(config,()=>new Promise(resolve=>{release=()=>resolve(Response.json(null));}));queue=new DurableQueue(c,join(dir,'q.sqlite'));queue.enqueue(c.buildRun(run));
  const delivery=queue.flush();await assert.rejects(queue.flush(),/already running/);assert.throws(()=>queue.close(),/during delivery/);release();await assert.rejects(delivery,IngestionError);assert.equal(queue.size,1);
 }finally{queue?.close();rmSync(dir,{recursive:true,force:true});}
});
