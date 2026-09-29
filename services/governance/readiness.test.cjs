'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createReadiness}=require('./readiness.cjs');
const {migrations}=require('./postgres-migrate.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('readiness rejects mismatched environments, gated restores and closed SQLite storage',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE governance_environment(name TEXT); INSERT INTO governance_environment VALUES('test')");
 const probe=createReadiness({environment:'test',sqlite:[db],cacheMs:0});
 assert.deepEqual(await probe.check(),{status:'ready'});
 db.exec("UPDATE governance_environment SET name='dev'");assert.equal((await probe.check()).status,'not-ready');
 db.exec("UPDATE governance_environment SET name='test'; CREATE TABLE governance_recovery_gate(state TEXT); INSERT INTO governance_recovery_gate VALUES('review-required')");
 assert.equal((await probe.check()).status,'not-ready');
 db.exec("UPDATE governance_recovery_gate SET state='approved'");assert.equal((await probe.check()).status,'ready');
 db.close();assert.equal((await probe.check()).status,'not-ready');
});
test('hung pool acquisition is bounded without creating repeated connection waiters',async()=>{
 let calls=0,releaseConnection;
 const pool={connect(){calls++;return new Promise(resolve=>releaseConnection=resolve);}};
 const probe=createReadiness({environment:'test',pool,timeoutMs:20,cacheMs:0});
 const values=await Promise.all(Array.from({length:25},()=>probe.check()));
 assert.ok(values.every(v=>v.status==='not-ready'));assert.equal(calls,1);
 assert.equal((await probe.check()).status,'not-ready');assert.equal(calls,1);
 let released=false;
 releaseConnection({async query(){throw Error('secret connection detail');},release(broken){assert.equal(broken,true);released=true;}});
 await sleep(5);assert.equal(released,true);
 assert.equal((await probe.check()).status,'not-ready');assert.equal(calls,2);
 releaseConnection({async query(){throw Error('secret');},release(){}});await sleep(5);
});
test('draining immediately invalidates cached readiness and hides dependency errors over HTTP',async()=>{
 const {GovernanceStore}=require('./store'),{createServer}=require('./server.cjs');
 const store=new GovernanceStore(':memory:');store.db.exec("CREATE TABLE governance_environment(name TEXT); INSERT INTO governance_environment VALUES('test')");
 const readiness=createReadiness({environment:'test',sqlite:[store.db]});
 const server=createServer(store,[],[],store.db,{}, {readiness,environment:'test'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  const ready=await fetch(url+'/ready');assert.equal(ready.status,200);assert.deepEqual(await ready.json(),{status:'ready'});assert.equal(ready.headers.get('cache-control'),'no-store');
  readiness.drain();const stopped=await fetch(url+'/ready');assert.equal(stopped.status,503);assert.deepEqual(await stopped.json(),{status:'not-ready'});
  const health=await fetch(url+'/health');assert.equal(health.status,200);assert.equal((await health.json()).mode,'synthetic-test');
 }finally{await new Promise(r=>server.close(r));store.close();}
});
test('PostgreSQL probe uses readonly transaction, verifies migrations and destroys failed clients',async()=>{
 let wrong=false,releases=[];const queries=[];
 const pool={async connect(){return {async query(q){queries.push(q);if(q.text==='SELECT name FROM governance_environment')return {rows:[{name:'test'}]};if(q.text==='SELECT state FROM governance_recovery_gate')return {rows:[{state:wrong?'review-required':'active'}]};if(q.text==='SELECT name,checksum FROM governance_migrations')return {rows:migrations()};return {rows:[]};},release(broken){releases.push(broken);}};}};
 const readiness=createReadiness({environment:'test',pool,cacheMs:0});
 assert.equal((await readiness.check()).status,'ready');assert.equal(queries[0].text,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.ok(queries.every(q=>q.query_timeout===1500));assert.deepEqual(releases,[false]);
 wrong=true;assert.equal((await readiness.check()).status,'not-ready');assert.deepEqual(releases,[false,true]);
});
