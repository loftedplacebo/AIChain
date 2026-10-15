'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {configuration,journalMarker}=require('./governance-production-worker.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');

const tenant='org-11111111-2222-4333-8444-555555555555';
const project='prj-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const baseline={
 GOVERNANCE_ENV:'prod',GOVERNANCE_PRODUCTION_HOST:'contabo-shared',
 GOVERNANCE_STORAGE:'postgres',GOVERNANCE_WORKER_ENABLED:'false',
 GOVERNANCE_TENANT:tenant,GOVERNANCE_PROJECT:project,
 GOVERNANCE_WORKER_JOURNAL:'/var/lib/orvessian-production-workers/'+'a'.repeat(24)+'/worker.sqlite',
 GOVERNANCE_MAINNET_RPC_URL:'https://mainnet.base.org/',
 GOVERNANCE_MAINNET_ANCHOR:JSON.stringify({chainId:8453,contract:'0x'+'11'.repeat(20),codeHash:'0x'+'22'.repeat(32)}),
 GOVERNANCE_EXPECTED_RELAYER:'0x'+'33'.repeat(20),
 GOVERNANCE_EXPECTED_RECORDER:'0x'+'44'.repeat(20),
 GOVERNANCE_DATABASE_CA_FILE:'/etc/aichain/governance/digitalocean-ca.crt',
 GOVERNANCE_DATABASE_URL:'synthetic-protected-url',
 GOVERNANCE_WORKER_POLICY:JSON.stringify({batchSize:10,maxTransactionsPerHour:2,
  maxGasPriceWei:'1000000000',dailyReservationWei:'1000000000000000',l1AllowanceWei:'10000000000000'}),
 GOVERNANCE_RECEIPT_KEY_FILE:'/synthetic/recorder.key',
 GOVERNANCE_RELAYER_KEY_FILE:'/synthetic/relayer.key',
};
const database=()=>({host:'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com',
 port:25060,database:'governance_prod',user:'governance_prod_worker',ssl:{}});

test('reviewed Production configuration stays paused and bound to Base mainnet',()=>{
 const result=configuration(baseline,database);
 assert.equal(result.policy.paused,true);
 assert.equal(result.anchor.chainId,8453);
 assert.equal(result.database.database,'governance_prod');
 assert.equal(configuration({...baseline,GOVERNANCE_WORKER_ENABLED:'true'},database).policy.paused,false);
});
test('wrong chain, scope, database or policy refuses Production startup',()=>{
 const reject=change=>assert.throws(()=>configuration({...baseline,...change},database));
 reject({GOVERNANCE_ENV:'test'});
 reject({GOVERNANCE_MAINNET_ANCHOR:JSON.stringify({chainId:84532,contract:'0x'+'11'.repeat(20),codeHash:'0x'+'22'.repeat(32)})});
 reject({GOVERNANCE_TENANT:project});
 reject({GOVERNANCE_WORKER_JOURNAL:'/tmp/worker.sqlite'});
 reject({GOVERNANCE_EXPECTED_RECORDER:baseline.GOVERNANCE_EXPECTED_RELAYER});
 reject({GOVERNANCE_MAINNET_RPC_URL:'http://mainnet.base.org/'});
 reject({GOVERNANCE_WORKER_POLICY:JSON.stringify({batchSize:10,maxTransactionsPerHour:2,maxGasPriceWei:'1000000000',dailyReservationWei:'10000000000000000000',l1AllowanceWei:'10000000000000'})});
 assert.throws(()=>configuration(baseline,()=>({...database(),database:'governance_test'})));
});
test('Production journal marker must exist and match the environment',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'production-worker-marker-'));
 const file=path.join(directory,'worker.sqlite');
 try{
  const db=new DatabaseSync(file);
  db.exec("CREATE TABLE governance_environment(name TEXT); INSERT INTO governance_environment VALUES('prod')");
  db.close();
  journalMarker(file,()=>file);
  const changed=new DatabaseSync(file);
  changed.exec("UPDATE governance_environment SET name='test'");
  changed.close();
  assert.throws(()=>journalMarker(file,()=>file),/Production journal marker/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
