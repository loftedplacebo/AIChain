'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {productionSource,productionRestore}=require('./postgres-backup.cjs');
const {validateTransferPolicy}=require('./backup-object-storage.cjs');

const approved={host:'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com',
 port:25060,database:'governance_prod',user:'doadmin',sslmode:'verify-full',
 caFile:'/etc/aichain/governance/digitalocean-ca.crt'};

test('production backup source is bound to the exclusive managed database',()=>{
 assert.doesNotThrow(()=>productionSource(approved));
 for(const change of [
  {database:'governance_test'}, {user:'governance_prod_api'},
  {host:'localhost'}, {port:5433}, {sslmode:'disable'}, {caFile:'relative.crt'},
  {caFile:'/etc/aichain/pilot-backup/ca.crt'},
 ])assert.throws(()=>productionSource({...approved,...change}));
});

test('production archive transfer cannot target the pilot bucket or prefix',()=>{
 const base={environment:'prod',bucket:'orvessian-prod-backups-2026',
  prefix:'orvessian-production',key:Buffer.alloc(32,7),client:{send(){}}};
 assert.doesNotThrow(()=>validateTransferPolicy(base));
 assert.doesNotThrow(()=>validateTransferPolicy({...base,prefix:'orvessian-production/prod/archive'}));
 for(const change of [{bucket:'orvessian-pilot-test-backups'},
  {prefix:'orvessian-pilot'}, {prefix:'orvessian-production/test/archive'}])
  assert.throws(()=>validateTransferPolicy({...base,...change}));
});

test('production restore targets only the separate closed loopback cluster',()=>{
 const closed={host:'127.0.0.1',port:5441,database:'postgres',user:'postgres',
  password:'synthetic-only'};
 const target='gov_restore_prod_123456789abc';
 assert.doesNotThrow(()=>productionRestore(closed,target));
 assert.doesNotThrow(()=>productionRestore({...closed,database:target},target,{review:true}));
 for(const change of [{host:'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'},
  {port:5433}, {database:'governance_prod'}, {user:'doadmin'},
  {sslmode:'disable'}])assert.throws(()=>productionRestore({...closed,...change},target));
 assert.throws(()=>productionRestore(closed,'governance_prod'));
});

test('production restore database names and source are explicitly bounded',async()=>{
 const {createRestoreTarget}=require('./postgres-recovery.cjs');
 const forbidden=[
  {sourceDatabase:'governance_test',targetDatabase:'gov_restore_prod_123456789abc'},
  {sourceDatabase:'governance_prod',targetDatabase:'gov_restore_123456789abc'},
  {sourceDatabase:'governance_prod',targetDatabase:'gov_restore_prod_123456789abc',sourceMayBeAbsent:false},
 ];
 for(const entry of forbidden)await assert.rejects(
  createRestoreTarget(null,{environment:'prod',sourceMayBeAbsent:true,...entry}));
});
