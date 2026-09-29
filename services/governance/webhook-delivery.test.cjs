const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DeliveryJournal,deliverOne,send,publicIPv4}=require('./webhook-delivery.cjs');
const {verify}=require('./webhook-signatures.cjs');
const p={tenant:'tenant',project:'project'},key=Buffer.alloc(32,7);
const body={schemaVersion:1,deliveryId:'delivery-1',tenantRef:p.tenant,projectRef:p.project,incidentRef:'incident-1',eventRef:'event-1',severity:'high'};
const binding={destinationRef:'endpoint-1',keyRef:'key-v1'};
test('signed local receiver, retry, restart, dedupe and tenant isolation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orvessian-webhook-')),file=path.join(dir,'jobs.sqlite');let journal=new DeliveryJournal(file),calls=0;
 const ids=new Set(),raws=[];
 const receiver=http.createServer((req,res)=>{
  const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{
   const raw=Buffer.concat(chunks);assert.equal(verify(raw,req.headers,key),true);raws.push(raw.toString());calls++;
   if(calls===1){res.writeHead(503);res.end('private-error');return;}
   const id=req.headers['x-orvessian-delivery'];if(!ids.has(id))ids.add(id);
   res.writeHead(204);res.end();
  });
 });await new Promise(r=>receiver.listen(0,'127.0.0.1',r));
 let now=Date.now(),lostAck=true;const options={destinations:{'endpoint-1':{...p,url:`http://127.0.0.1:${receiver.address().port}/hook`}},resolveKey:async()=>key,transport:async(url,signed)=>{const status=await send(url,signed,{testLoopback:true});if(status===204&&lostAck){lostAck=false;throw Error('Simulated lost acknowledgement');}return status;},now:()=>now};
 try{
  assert.equal(journal.enqueue(p,body,binding,now),true);assert.equal(journal.enqueue(p,body,binding,now),false);
  assert.throws(()=>journal.enqueue(p,{...body,severity:'critical'},binding,now),/conflict/);
  assert.throws(()=>journal.enqueue({...p,tenant:'other'},body,binding,now),/scope/);
  assert.equal((await deliverOne(journal,p,options)).state,'pending');assert.equal((await deliverOne(journal,p,options)).idle,true);
  assert.deepEqual(journal.list({...p,tenant:'other'}),[]);journal.close();journal=new DeliveryJournal(file);now+=1001;
  assert.equal((await deliverOne(journal,p,options)).state,'pending');assert.equal(ids.size,1);now+=2001;
  assert.equal((await deliverOne(journal,p,options)).state,'delivered');assert.equal(ids.size,1);assert.equal(raws[0],raws[1]);assert.equal(raws[1],raws[2]);
  assert.equal(journal.list(p)[0].attempts,3);assert.equal((await deliverOne(journal,p,options)).idle,true);
  assert.doesNotMatch(JSON.stringify(journal.list(p)),/private-error/);
 }finally{journal.close();await new Promise(r=>receiver.close(r));for(const name of ['jobs.sqlite','jobs.sqlite-wal','jobs.sqlite-shm'])fs.rmSync(path.join(dir,name),{force:true});fs.rmdirSync(dir);}
});
test('lease fencing, crash recovery, retry exhaustion, permanent rejection and scope configuration',async()=>{
 const journal=new DeliveryJournal(':memory:');let now=100000;const options={now:()=>now,destinations:{'endpoint-1':{...p,url:'https://example.com/hook'}},resolveKey:async()=>key,transport:async()=>503};
 try{
  journal.enqueue(p,body,binding,now);const first=journal.claim(p,now);assert.equal(journal.claim(p,now),null);now+=60000;const second=journal.claim(p,now);
  assert.equal(journal.finish(p,first,204,now).updated,false);assert.equal(journal.finish(p,second,503,now).state,'pending');
  for(let i=0;i<6;i++){now+=300001;await deliverOne(journal,p,options);}
  assert.equal(journal.list(p)[0].state,'dead');assert.equal(journal.list(p)[0].attempts,8);
  journal.enqueue(p,{...body,deliveryId:'delivery-2'},binding,now);assert.equal((await deliverOne(journal,p,{...options,transport:async()=>302})).state,'dead');
  let sent=0;journal.enqueue(p,{...body,deliveryId:'delivery-3'},binding,now);
  await deliverOne(journal,p,{...options,destinations:{'endpoint-1':{tenant:'other',project:p.project,url:'https://example.com'}},transport:async()=>{sent++;return 204;}});assert.equal(sent,0);
  const crashScope={tenant:'crash',project:'project'};journal.enqueue(crashScope,{...body,tenantRef:'crash'},binding,now);
  for(let i=0;i<8;i++){assert.ok(journal.claim(crashScope,now));now+=60001;}
  assert.equal(journal.claim(crashScope,now),null);assert.equal(journal.list(crashScope)[0].state,'dead');assert.equal(journal.list(crashScope)[0].attempts,8);
 }finally{journal.close();}
});
test('egress denies private, special, IPv6 and non-HTTPS destinations before sending',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','172.31.0.1','192.168.1.1','169.254.169.254','100.64.0.1','198.18.0.1','192.0.2.1','203.0.113.1','224.0.0.1','::1'])assert.equal(publicIPv4(ip),false,ip);
 assert.equal(publicIPv4('8.8.8.8'),true);
 for(const url of ['http://127.0.0.1/hook','https://user:secret@example.com','https://example.com:8443/hook','https://example.com/hook?secret=value','https://127.0.0.1/hook','https://[::1]/hook'])await assert.rejects(send(url,{body:Buffer.from('{}'),headers:{}}));
});
