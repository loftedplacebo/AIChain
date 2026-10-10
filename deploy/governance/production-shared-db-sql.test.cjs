'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {render}=require('./production-shared-db-sql.cjs');

test('production grants track the reviewed pilot privileges with only recipient roles changed',()=>{
 const files=render();
 for(const [source,target,oldRole,newRole] of [
  ['postgres-api-grants.sql','02-api-grants.sql','governance_api','governance_prod_api'],
  ['postgres-evidence-worker-grants.sql','03-worker-grants.sql','governance_evidence_worker','governance_prod_worker']
 ]){
  const sourceGrants=fs.readFileSync(path.join(__dirname,source),'utf8').split(/\r?\n/).filter(line=>line.startsWith('GRANT '));
  const renderedGrants=files[target].split('\n').filter(line=>line.startsWith('GRANT '));
  assert.deepEqual(renderedGrants,sourceGrants.map(line=>line.replace(` TO ${oldRole};`,` TO ${newRole};`)));
 }
 assert.match(files['02-api-grants.sql'],/GRANT SELECT ON governance_migrations TO governance_prod_api;/);
});

test('bootstrap and verification require bidirectional database isolation',()=>{
 const files=render(),bootstrap=files['01-bootstrap.sql'],verify=files['04-verify-isolation.sql'];
 assert.match(bootstrap,/REVOKE ALL ON DATABASE governance_prod FROM PUBLIC;/);
 assert.match(bootstrap,/REVOKE ALL ON DATABASE governance_test FROM governance_prod_api, governance_prod_worker, governance_prod_migrations;/);
 assert.match(bootstrap,/GRANT CONNECT ON DATABASE governance_prod TO governance_prod_api, governance_prod_worker, governance_prod_migrations;/);
 assert.doesNotMatch(bootstrap,/GRANT CONNECT ON DATABASE governance_prod TO governance_api/);
 assert.equal((verify.match(/has_database_privilege\(/g)||[]).length,6);
 assert.match(verify,/RAISE EXCEPTION/);
 assert.equal(Object.keys(files).length,4);
});
