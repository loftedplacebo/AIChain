'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {render}=require('./production-exclusive-db-sql.cjs');

test('exclusive production bootstrap refuses retained pilot objects and restricts fresh roles',()=>{
 const files=render(),create=files['00-create-empty.sql'],bootstrap=files['01-bootstrap.sql'],verify=files['04-verify-exclusive.sql'];
 assert.deepEqual(Object.keys(files),['00-create-empty.sql','01-bootstrap.sql','02-api-grants.sql','03-worker-grants.sql','04-verify-exclusive.sql']);
 assert.match(create,/CREATE DATABASE governance_prod OWNER doadmin TEMPLATE template0;/);
 assert.match(create,/CREATE ROLE governance_prod_api NOLOGIN/);
 assert.match(create,/Managed cluster defaultdb administrator required/);
 assert.match(bootstrap,/current_database\(\)<>'governance_prod'/);
 assert.match(bootstrap,/Retained pilot database or role blocks exclusive production bootstrap/);
 assert.match(bootstrap,/REVOKE ALL ON DATABASE governance_prod FROM PUBLIC;/);
 assert.match(bootstrap,/GRANT CONNECT ON DATABASE governance_prod TO governance_prod_api, governance_prod_worker, governance_prod_migrations;/);
 assert.doesNotMatch(bootstrap,/GRANT CONNECT ON DATABASE governance_prod TO governance_api/);
 assert.match(verify,/Production roles must exist as restricted NOLOGIN roles/);
 assert.match(verify,/Production database still grants privileges to PUBLIC/);
 assert.match(files['02-api-grants.sql'],/GRANT SELECT ON governance_migrations TO governance_prod_api;/);
 assert.match(files['02-api-grants.sql'],/Production database required/);
 assert.match(files['03-worker-grants.sql'],/GRANT SELECT, UPDATE ON governance_outbox TO governance_prod_worker;/);
});
