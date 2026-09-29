const {test}=require('node:test'),assert=require('node:assert/strict');
const {Client}=require('./orvessian-ingest'),{mapLangfuseScorePage,LangfuseScoresClient,LangfuseReadError}=require('./orvessian-langfuse');
const client=new Client({baseUrl:'http://127.0.0.1',token:'x'.repeat(32),tenant:'t',project:'p'});
const options={environment:'test',evaluatorRef:'langfuse-evaluator',rubricVersion:'v1',vendorProjectId:'lf-project',scoreName:'correctness',labelMap:{correct:'yes',incorrect:'no'}};
const subject={kind:'observation',id:'obs-1',traceId:'trace-1'},links=[{subject,forEventId:'e',caseRef:'case-1'}];
const score={id:'score-1',projectId:'lf-project',name:'correctness',environment:'test',dataType:'CATEGORICAL',value:'correct',timestamp:'2026-09-28T00:00:00.000Z',subject,comment:'PRIVATE-SOURCE',metadata:{prompt:'PRIVATE-SOURCE'},authorUserId:'PRIVATE-SOURCE',source:'ANNOTATION'};

test('window import atomically checkpoints pages and resumes without storing vendor payloads',async()=>{
 const {importLangfuseWindow}=require('./orvessian-langfuse'),{DurableQueue}=require('./orvessian-queue');
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lf-checkpoint-')),file=path.join(dir,'queue.sqlite');let queue;
 const input={importId:'window-1',from:'2026-09-27T00:00:00.000Z',to:'2026-09-29T00:00:00.000Z',links,options,maxPages:1};
 const calls=[];const reader=new LangfuseScoresClient({baseUrl:'http://127.0.0.1',publicKey:'public-key',secretKey:'secret-key',scoreName:'correctness',environment:'test'},async url=>{const after=url.searchParams.get('cursor');calls.push(after);return Response.json({data:[{...score,id:after?'score-2':'score-1'}],meta:{cursor:after?null:'page2'}});});
 try{
  queue=new DurableQueue(client,file,{capacity:1});const first=await importLangfuseWindow(client,reader,queue,input);assert.deepEqual(first.checkpoint,{revision:1,cursor:'page2',complete:false});assert.equal(queue.size,1);
  await assert.rejects(importLangfuseWindow(client,reader,queue,input),/capacity/);assert.equal(queue.size,1);
  queue.close();queue=new DurableQueue(client,file,{capacity:3});
  await assert.rejects(importLangfuseWindow(client,reader,queue,{...input,options:{...options,rubricVersion:'v2'}}),/another source/);assert.equal(calls.length,2);
  const last=await importLangfuseWindow(client,reader,queue,input);assert.deepEqual(last.checkpoint,{revision:2,cursor:null,complete:true});assert.equal(queue.size,2);assert.deepEqual(calls,[null,'page2','page2']);
  assert.equal((await importLangfuseWindow(client,reader,queue,input)).pages,0);assert.equal(calls.length,3);
  queue.close();queue=null;const db=new DatabaseSync(file,{readOnly:true});try{const serialized=JSON.stringify({pending:db.prepare('SELECT * FROM pending').all(),checkpoints:db.prepare('SELECT * FROM import_checkpoint').all()});assert.doesNotMatch(serialized,/PRIVATE-SOURCE|secret-key|public-key|authorUserId|metadata/);}finally{db.close();}
 }finally{queue?.close();for(const name of ['queue.sqlite','queue.sqlite-wal','queue.sqlite-shm'])fs.rmSync(path.join(dir,name),{force:true});fs.rmdirSync(dir);}
});

test('checkpoint commits roll back collisions/capacity and reject stale writers',()=>{
 const {DurableQueue}=require('./orvessian-queue'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lf-atomic-')),file=path.join(dir,'q.sqlite'),binding='a'.repeat(64);const queue=new DurableQueue(client,file,{capacity:1});
 const event=mapLangfuseScorePage(client,{data:[score]},links,options).events[0],other=mapLangfuseScorePage(client,{data:[{...score,id:'other'}]},links,options).events[0];
 try{
  assert.throws(()=>queue.commitImportPage('i',binding,0,[event,other],'page2'),/capacity/);assert.equal(queue.size,0);assert.equal(queue.checkpoint('i',binding).revision,0);
  queue.commitImportPage('i',binding,0,[event],'page2');assert.throws(()=>queue.commitImportPage('i',binding,0,[],null),/changed/);
  assert.throws(()=>queue.commitImportPage('i',binding,1,[{...event,outcome:{...event.outcome,label:'no'}}],null),/collision/);assert.equal(queue.checkpoint('i',binding).revision,1);
  assert.throws(()=>queue.commitImportPage('i',binding,1,[],'page2'),/advance/);
  queue.commitImportPage('i',binding,1,[],null);assert.throws(()=>queue.commitImportPage('i',binding,2,[],null),/changed/);
 }finally{queue.close();for(const name of ['q.sqlite','q.sqlite-wal','q.sqlite-shm'])fs.rmSync(path.join(dir,name),{force:true});fs.rmdirSync(dir);}
});
test('Langfuse v3 categorical mapping is explicit, content-free and immutable across revisions',()=>{
 const result=mapLangfuseScorePage(client,{data:[score],meta:{cursor:'next_page'}},links,options);const event=result.events[0];assert.equal(result.nextCursor,'next_page');assert.equal(event.outcome.forEventId,'e');assert.equal(event.outcome.label,'yes');assert.equal(event.outcome.labelSource,'automated-evaluator');assert.equal(event.source.integrationVersion,'langfuse-scores-v3-0.1.0-alpha');assert.doesNotMatch(JSON.stringify(result),/PRIVATE-SOURCE|comment|authorUser/);
 assert.equal(mapLangfuseScorePage(client,{data:[{...score,value:'incorrect'}]},links,options).events[0].eventId,event.eventId);
 for(const mutation of [{projectId:'foreign'},{environment:'prod'},{dataType:'TEXT'},{value:'unknown'},{subject:{kind:'session',id:'s'}},{timestamp:'2026-02-30T00:00:00.000Z'}])assert.throws(()=>mapLangfuseScorePage(client,{data:[{...score,...mutation}]},links,options));
 assert.throws(()=>mapLangfuseScorePage(client,{data:[score]},[],options));assert.throws(()=>mapLangfuseScorePage(client,{data:[score]},[...links,...links],options));assert.throws(()=>mapLangfuseScorePage(client,{data:[score,score]},links,options));assert.throws(()=>mapLangfuseScorePage(client,{data:Array(101).fill(score)},links,options));
 const {GovernanceStore}=require('../../services/governance/store'),store=new GovernanceStore(':memory:');try{
  store.ingest(client.buildRun({eventId:'e',streamRef:'e',sequence:0,occurredAt:score.timestamp,runRef:'r',agentRef:'a',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',taskClass:'task',status:'completed',predictedLabel:'yes',caseRef:'case-1'}),{tenant:'t',project:'p'});store.ingest(event,{tenant:'t',project:'p'});assert.equal(store.report({tenant:'t',project:'p'}).kpis.reviewedLabels,0);
  assert.throws(()=>store.ingest(mapLangfuseScorePage(client,{data:[{...score,value:'incorrect'}]},links,options).events[0],{tenant:'t',project:'p'}),e=>e.status===409);
 }finally{store.close();}
});
test('read client requests only score core/subject with fixed filters and sanitized bounded failures',async()=>{
 let called=0;const config={baseUrl:'http://127.0.0.1',publicKey:'public-key',secretKey:'secret-key',scoreName:'correctness',environment:'test'};
 const read=new LangfuseScoresClient(config,async(url,init)=>{called++;assert.equal(url.pathname,'/api/public/v3/scores');assert.equal(url.searchParams.get('fields'),'subject');assert.equal(url.searchParams.get('dataType'),'CATEGORICAL');assert.equal(url.searchParams.get('limit'),'100');assert.equal(url.searchParams.get('cursor'),'next_page');assert.equal(init.redirect,'manual');return Response.json({data:[score],meta:{cursor:null}});});
 const window={from:'2026-09-27T00:00:00.000Z',to:'2026-09-28T00:00:00.000Z',after:'next_page'};assert.equal((await read.page(window)).data.length,1);assert.equal(called,1);
 for(const response of [new Response('PRIVATE-SOURCE',{status:302}),new Response('PRIVATE-SOURCE',{status:401}),new Response('x'.repeat(2097153)),Response.json({data:Array(101).fill(score)}),new Response('{broken')]){
  const bad=new LangfuseScoresClient(config,async()=>response);await assert.rejects(bad.page(window),e=>e instanceof LangfuseReadError&&!String(e).includes('PRIVATE-SOURCE')&&!String(e).includes('secret-key'));
 }
 for(const baseUrl of ['http://example.com','https://user:secret@example.com','https://example.com/path'])assert.throws(()=>new LangfuseScoresClient({...config,baseUrl}));
 await assert.rejects(read.page({...window,from:window.to}));assert.equal(called,1);
});

test('local Langfuse HTTP score page reaches durable queue, tenant API and signed evidence',async()=>{
 const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {GovernanceStore}=require('../../services/governance/store'),{createServer}=require('../../services/governance/server.cjs'),{DurableQueue}=require('./orvessian-queue');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orvessian-lf-')),store=new GovernanceStore(':memory:'),p={tenant:'t',project:'p',token:'x'.repeat(32),scopes:['read','write']};
 let requests=0,queue;
 const vendor=http.createServer((req,res)=>{requests++;assert.equal(new URL(req.url,'http://localhost').pathname,'/api/public/v3/scores');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[score],meta:{cursor:null}}));});
 const api=createServer(store,[p]);await new Promise(r=>vendor.listen(0,'127.0.0.1',r));await new Promise(r=>api.listen(0,'127.0.0.1',r));
 try{
  const c=new Client({baseUrl:`http://127.0.0.1:${api.address().port}`,...p});
  await c.recordRun({eventId:'e',streamRef:'e',sequence:0,occurredAt:score.timestamp,runRef:'r',agentRef:'a',environment:'test',deploymentRef:'d',providerRef:'synthetic',modelRef:'m',configVersion:'v1',taskClass:'task',status:'completed',predictedLabel:'yes',caseRef:'case-1'});
  const reader=new LangfuseScoresClient({baseUrl:`http://127.0.0.1:${vendor.address().port}`,publicKey:'synthetic-public',secretKey:'synthetic-secret',scoreName:'correctness',environment:'test'});
  const mapped=mapLangfuseScorePage(c,{data:[score]},links,options);queue=new DurableQueue(c,path.join(dir,'queue.sqlite'));const importedPage=await require('./orvessian-langfuse').importLangfuseWindow(c,reader,queue,{importId:'http-test',from:'2026-09-27T00:00:00.000Z',to:'2026-09-29T00:00:00.000Z',links,options});assert.equal(importedPage.checkpoint.complete,true);assert.equal((await queue.flush()).delivered,1);assert.equal(requests,1);
  const imported=store.get(p,mapped.events[0].eventId);assert.equal(imported.outcome.labelSource,'automated-evaluator');assert.doesNotMatch(JSON.stringify(imported),/PRIVATE-SOURCE/);assert.equal(store.report(p).kpis.reviewedLabels,0);
  const signer=require('ethers').Wallet.createRandom(),e=require('../../services/governance/evidence.cjs');await e.prepareBatch(store,p,signer,{publisher:signer.address,limit:10});assert.equal((await e.inspectEvidence(imported,store.evidence(p,imported.eventId),{trustedSigners:[signer.address.toLowerCase()]})).state,'batched');
 }finally{queue?.close();await new Promise(r=>vendor.close(r));await new Promise(r=>api.close(r));store.close();for(const name of ['queue.sqlite','queue.sqlite-wal','queue.sqlite-shm'])fs.rmSync(path.join(dir,name),{force:true});fs.rmdirSync(dir);}
});
