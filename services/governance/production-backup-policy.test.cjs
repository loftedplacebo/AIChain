'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {productionSource}=require('./postgres-backup.cjs');
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
