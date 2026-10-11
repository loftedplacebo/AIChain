'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {productionSource}=require('./postgres-backup.cjs');

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
