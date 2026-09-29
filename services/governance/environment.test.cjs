const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {environmentConfig,bindSqlite}=require('./environment.cjs');
test('environment defaults are repository-relative, isolated and hosted stages gated',()=>{
 const dev=environmentConfig({}),testing=environmentConfig({GOVERNANCE_ENV:'test',PORT:'0'});
 assert.equal(dev.eventPath,resolve(__dirname,'../../build/governance/dev/events.sqlite'));
 assert.notEqual(dev.eventPath,testing.eventPath);assert.notEqual(dev.sessionPath,testing.sessionPath);
 assert.equal(testing.port,0);assert.equal(environmentConfig({GOVERNANCE_DB:':memory:'}).eventPath,':memory:');
 for(const GOVERNANCE_ENV of ['staging','prod'])assert.throws(()=>environmentConfig({GOVERNANCE_ENV}),/startup is gated/);
 assert.throws(()=>environmentConfig({GOVERNANCE_ENV:'production'}),/Unknown environment/);
 for(const PORT of ['NaN','-1','65536','1.5'])assert.throws(()=>environmentConfig({PORT}),/port/);
 assert.throws(()=>environmentConfig({GOVERNANCE_ADOPT_UNBOUND_SQLITE:'yes'}),/adoption/);
 assert.equal(environmentConfig({GOVERNANCE_STORAGE:'postgres',GOVERNANCE_KEY_STORAGE:'postgres'}).keyDriver,'postgres');
 assert.throws(()=>environmentConfig({GOVERNANCE_KEY_STORAGE:'postgres'}),/require PostgreSQL/);
 assert.throws(()=>environmentConfig({GOVERNANCE_KEY_STORAGE:'unknown'}),/key storage/);
 assert.equal(environmentConfig({GOVERNANCE_STORAGE:'postgres',GOVERNANCE_KEY_STORAGE:'postgres',GOVERNANCE_CONTROL_STORAGE:'postgres'}).controlDriver,'postgres');
 assert.throws(()=>environmentConfig({GOVERNANCE_CONTROL_STORAGE:'postgres'}),/requires PostgreSQL/);
 assert.throws(()=>environmentConfig({GOVERNANCE_CONTROL_STORAGE:'unknown'}),/control storage/);
});
test('SQLite markers survive reopen and reject cross-environment reuse without changing data',()=>{
 const dir=mkdtempSync(join(tmpdir(),'governance-environment-')),file=join(dir,'state.sqlite');
 try{
  bindSqlite(file,'dev');bindSqlite(file,'dev');
  const db=new DatabaseSync(file);db.exec("CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES('retained')");db.close();
  assert.throws(()=>bindSqlite(file,'test',{adopt:true}),/mismatch/);
  const reopened=new DatabaseSync(file);
  assert.equal(reopened.prepare('SELECT name FROM governance_environment').get().name,'dev');
  assert.equal(reopened.prepare('SELECT value FROM evidence').get().value,'retained');reopened.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('existing unbound SQLite requires explicit adoption and launcher rejects wrong environment',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'governance-adoption-')),file=join(dir,'state.sqlite');
 try{
  const db=new DatabaseSync(file);db.exec("CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES('retained')");db.close();
  assert.throws(()=>bindSqlite(file,'test'),/reviewed adoption/);
  const untouched=new DatabaseSync(file);assert.equal(untouched.prepare("SELECT count(*) n FROM sqlite_master WHERE name='governance_environment'").get().n,0);untouched.close();
  bindSqlite(file,'test',{adopt:true});
  const {start}=require('./start.cjs');
  await assert.rejects(start({GOVERNANCE_DB:file,GOVERNANCE_ENV:'dev',PORT:'0'}),/mismatch/);
  const app=await start({GOVERNANCE_DB:file,GOVERNANCE_ENV:'test',PORT:'0'});await app.stop();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
