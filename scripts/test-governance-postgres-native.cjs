// Real PostgreSQL acceptance suite. Only connects to the dedicated local cluster.
// Creates isolated synthetic databases; never drops or overwrites a database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomBytes,createHash}=require('node:crypto');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');
const run=promisify(execFile);const {Pool}=require('pg');
const {migrate}=require('../services/governance/postgres-migrate.cjs');
const {PostgresGovernanceStore}=require('../services/governance/postgres-store.cjs');
const fixture=require('../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
const base=path.resolve(__dirname,'../build/postgres-native');
const config=JSON.parse(fs.readFileSync(path.join(base,'cluster-access.json'),'utf8'));
if(config.host!=='127.0.0.1'||config.port!==55439||config.user!=='governance_test_admin')throw new Error('Only the dedicated local test cluster is allowed');
const id='g'+randomBytes(6).toString('hex');
const databases={source:`gov_test_${id}`,restore:`gov_restore_${id}`};
const owner=`gov_owner_${id}`,app=`gov_app_${id}`,ownerPassword=randomBytes(24).toString('hex'),appPassword=randomBytes(24).toString('hex');
const directory=path.join(base,id);fs.mkdirSync(directory,{recursive:true});
const admin=new Pool({...config,database:'postgres',max:2});const pools=[];
const connection=(database,user,password)=>({host:config.host,port:config.port,database,user,password,max:10,connectionTimeoutMillis:5000});
const makeStore=async(database,limits)=>{const pool=new Pool(connection(database,app,appPassword));pools.push(pool);const store=new PostgresGovernanceStore(pool,limits);await store.ready('test');return store;};
const grants=`GRANT USAGE ON SCHEMA public TO ${app}; GRANT SELECT ON governance_migrations,governance_environment,governance_recovery_gate TO ${app}; GRANT SELECT,INSERT ON governance_events TO ${app}; GRANT SELECT,INSERT,UPDATE ON governance_outbox,governance_usage,governance_evidence TO ${app};`;
const results={runId:id,startedAt:new Date().toISOString(),engine:'standalone PostgreSQL over TCP',synthetic:true,checks:[]};
const check=(name,detail)=>{results.checks.push({name,status:'passed',...detail});console.log('PASS '+name);};
async function parallel(items,workers,fn){let cursor=0;const output=[];await Promise.all(Array.from({length:workers},async()=>{for(;;){const i=cursor++;if(i>=items.length)break;output[i]=await fn(items[i],i);}}));return output;}
function event(i,tenant='load-a',project='acceptance'){const e=structuredClone(fixture.events.find(e=>e.eventType==='ai.run.completed'));return {...e,tenantRef:tenant,projectRef:project,eventId:'load-'+i,streamRef:'load-stream-'+i,sequence:'1'};}
async function snapshot(pool){const data={};for(const table of ['governance_events','governance_outbox','governance_usage','governance_evidence'])data[table]=(await pool.query(`SELECT * FROM ${table} ORDER BY tenant,project,${table==='governance_usage'?'day':'id'}`)).rows;data.migrations=(await pool.query('SELECT name,checksum FROM governance_migrations ORDER BY name')).rows;data.environment=(await pool.query('SELECT * FROM governance_environment')).rows;return {counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')};}
async function main(){
 results.serverVersion=(await admin.query('SHOW server_version')).rows[0].server_version;
 await admin.query(`CREATE ROLE ${owner} LOGIN PASSWORD '${ownerPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
 await admin.query(`CREATE ROLE ${app} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
 await admin.query(`CREATE DATABASE ${databases.source} OWNER ${owner}`);await admin.query(`CREATE DATABASE ${databases.restore} OWNER ${owner}`);
 const ownerPool=new Pool(connection(databases.source,owner,ownerPassword));pools.push(ownerPool);
 // Two migration clients contend on the real advisory lock.
 await Promise.all([migrate(ownerPool),migrate(ownerPool)]);await ownerPool.query(grants);
 const store=await makeStore(databases.source);check('concurrent migrations and restricted runtime startup');
 const principal={tenant:'org-demo',project:'claims-governance-demo'};
 await parallel(fixture.events,16,e=>store.ingest(e,principal));
 assert.equal((await store.list(principal)).total,182);
 const accuracy=(await store.report(principal)).models.map(m=>m.accuracy).sort();assert.deepEqual(accuracy,[.7,.9]);
 check('fixture reconstructed through real PostgreSQL',{events:182,accuracy});
 const recorder=require('ethers').Wallet.createRandom();const {prepareBatch,inspectEvidence}=require('../services/governance/evidence.cjs');
 const evidenceBatch=await prepareBatch(store,principal,recorder,{publisher:'0x'+'aa'.repeat(20),limit:1000});
 assert.equal(evidenceBatch.leafCount,182);
 const eventId=fixture.events[0].eventId;
 assert.equal((await inspectEvidence(await store.get(principal,eventId),await store.evidence(principal,eventId),{trustedSigners:[recorder.address]})).state,'batched');
 assert.equal(await store.evidence({...principal,tenant:'foreign'},eventId),null);
 check('signed receipt and batch evidence persist in scoped PostgreSQL transactions');
 const duplicates=await parallel(Array.from({length:40},()=>event('duplicate')),20,e=>store.ingest(e,{tenant:'load-a',project:'acceptance'}));
 assert.equal(duplicates.filter(r=>r.status==='accepted').length,1);assert.equal(duplicates.filter(r=>r.status==='duplicate').length,39);
 check('40 simultaneous retries create one event and one outbox entry');
 const latencies=[],started=performance.now();
 await parallel(Array.from({length:600},(_,i)=>event(i,i%2?'load-a':'load-b')),24,async e=>{const t=performance.now();await store.ingest(e,{tenant:e.tenantRef,project:e.projectRef});latencies.push(performance.now()-t);});
 latencies.sort((a,b)=>a-b);const elapsed=performance.now()-started;
 check('600 unique submissions with 24 concurrent workers',{events:600,elapsedMs:Math.round(elapsed),eventsPerSecond:Number((600000/elapsed).toFixed(1)),p50Ms:Math.round(latencies[Math.ceil(latencies.length*.5)-1]),p95Ms:Math.round(latencies[Math.ceil(latencies.length*.95)-1]),note:'Local short-run storage baseline, not sustained capacity or an SLA'});
 await parallel(Array.from({length:60},(_,i)=>i),20,async i=>{const p={tenant:i%2?'load-a':'load-b',project:'acceptance'};const records=await store.list(p);assert.ok(records.events.every(e=>e.tenantRef===p.tenant));assert.equal(records.total,p.tenant==='load-a'?301:300);});
 assert.equal((await store.pool.query('SELECT * FROM governance_events')).rows.length,0);
 assert.equal((await store.list({tenant:'load-a',project:'foreign'})).total,0);
 check('pooled concurrent reads do not leak tenant or project context');
 const capped=await makeStore(databases.source,{maxEvents:10,maxDailyEvents:10});
 const outcomes=await parallel(Array.from({length:40},(_,i)=>event(i,'quota')),20,async e=>{try{return (await capped.ingest(e,{tenant:'quota',project:'acceptance'})).status;}catch(e){if(e.status===429)return 'limited';throw e;}});
 assert.equal(outcomes.filter(s=>s==='accepted').length,10);assert.equal(outcomes.filter(s=>s==='limited').length,30);
 check('concurrent quota enforcement accepts exactly 10 of 40 new events');
 const sourceAdmin=new Pool({...config,database:databases.source});pools.push(sourceAdmin);
 const counts=(await sourceAdmin.query('SELECT (SELECT count(*) FROM governance_events) AS events,(SELECT count(*) FROM governance_outbox) AS outbox,(SELECT sum(event_count) FROM governance_usage) AS metered')).rows[0];
 assert.equal(counts.events,counts.outbox);assert.equal(counts.events,counts.metered);
 assert.equal((await sourceAdmin.query('SELECT count(*) AS n FROM governance_outbox WHERE id=$1',['load-duplicate'])).rows[0].n,'1');
 check('event, outbox and metering counts reconcile',{counts});
 const {DatabaseSync}=require('node:sqlite');const sessionDb=new DatabaseSync(':memory:');
 const {createServer}=require('../services/governance/server.cjs');const {passwordHash}=require('../services/governance/auth.cjs');
 const {workspaceGateway}=await import('../website/lib/workspace-gateway.js');
 const password=randomBytes(24).toString('hex');
 const service=createServer(store,[],[{id:'native-reviewer',email:'native@example.test',passwordHash:passwordHash(password),workspaces:[{id:'fixture',name:'Native acceptance',...principal}]}],sessionDb,{trustedSigners:[recorder.address]});
 await new Promise(r=>service.listen(0,'127.0.0.1',r));
 try{
  const api=`http://127.0.0.1:${service.address().port}`;
  const login=await workspaceGateway(new Request('http://localhost:3001/api/workspace?action=session',{method:'POST',headers:{origin:'http://localhost:3001','content-type':'application/json'},body:JSON.stringify({email:'native@example.test',password})}),{api});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');
  const request=query=>workspaceGateway(new Request('http://localhost:3001/api/workspace?'+query,{headers:{cookie}}),{api});
  assert.equal((await (await request('action=report&workspace=fixture')).json()).kpis.runs,60);
  assert.equal((await (await request('action=events&workspace=fixture')).json()).total,182);
  assert.equal((await request('action=export&workspace=foreign')).status,404);
  const exported=await request('action=export&workspace=fixture');assert.equal(exported.status,200);assert.equal((await exported.json()).eventCount,182);
  const evidenceExport=await request('action=evidence-export&workspace=fixture&id='+eventId);assert.equal(evidenceExport.status,200);assert.equal((await evidenceExport.json()).verification.state,'batched');assert.equal((await request('action=evidence-export&workspace=foreign&id='+eventId)).status,404);
  check('authenticated website gateway reads and exports from native PostgreSQL with workspace isolation');
 }finally{await new Promise(r=>service.close(r));sessionDb.close();}
 const dashboardResult=await require('./governance-postgres-dashboard-load.cjs').dashboardLoad(store,ownerPool,{long:process.argv.includes('--long'),onProgress:sample=>{fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify(sample,null,2));}});
 check('dashboard reads overlap HTTP submissions above 10000 records',dashboardResult);
 const before=await snapshot(sourceAdmin);
 const backup=path.join(directory,'governance.dump');
 const env={...process.env,PGHOST:config.host,PGPORT:String(config.port),PGUSER:config.user,PGPASSWORD:config.password};
 const binaries=path.resolve(__dirname,'../build/postgres-runtime/pgsql/bin');
 const dumpStarted=performance.now();await run(path.join(binaries,'pg_dump.exe'),['--format=custom','--file',backup,'--dbname',databases.source],{env,windowsHide:true});
 const restoreStarted=performance.now();await run(path.join(binaries,'pg_restore.exe'),['--exit-on-error','--single-transaction','--no-owner','--no-acl','--role',owner,'--dbname',databases.restore,backup],{env,windowsHide:true});
 const restoreMs=Math.round(performance.now()-restoreStarted);
 const restoredOwner=new Pool(connection(databases.restore,owner,ownerPassword));pools.push(restoredOwner);await restoredOwner.query(grants);await restoredOwner.query('ANALYZE governance_events');
 const restoredAdmin=new Pool({...config,database:databases.restore});pools.push(restoredAdmin);
 assert.deepEqual(await snapshot(restoredAdmin),before);
 const restored=await makeStore(databases.restore);const report=await restored.report(principal);assert.deepEqual(report.models.map(m=>m.accuracy).sort(),accuracy);
 assert.equal((await inspectEvidence(await restored.get(principal,eventId),await restored.evidence(principal,eventId),{trustedSigners:[recorder.address]})).state,'batched');
 assert.equal((await restored.list({tenant:'unassigned',project:'acceptance'})).total,0);assert.equal((await restored.pool.query('SELECT * FROM governance_events')).rows.length,0);
 assert.equal((await restored.ingest(fixture.events[0],principal)).status,'duplicate');assert.deepEqual(await snapshot(restoredAdmin),before);
 check('native pg_dump/pg_restore preserves events, outbox, counters, migrations and reports',{snapshot:before,backupBytes:fs.statSync(backup).size,dumpMs:Math.round(restoreStarted-dumpStarted),restoreMs,restoredIsolation:true,duplicateReplayPreserved:true});
 fs.writeFileSync(path.join(directory,'private-run-access.json'),JSON.stringify({config,databases,app,appPassword,expectedSnapshot:before},null,2),{mode:0o600});
 results.completedAt=new Date().toISOString();results.status='passed';
 fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2));
 console.log('Results: '+path.join(directory,'results.json'));
}
main().catch(e=>{results.status='failed';results.failure={message:e.message,code:e.code};const progressFile=path.join(directory,'progress.json');if(fs.existsSync(progressFile))results.lastResourceSample=JSON.parse(fs.readFileSync(progressFile,'utf8'));fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2));console.error('Native acceptance failed: '+e.message);process.exitCode=1;}).finally(async()=>{await Promise.allSettled(pools.map(p=>p.end()));await admin.end();});
