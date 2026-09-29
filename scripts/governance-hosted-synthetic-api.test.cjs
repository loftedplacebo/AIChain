'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validate}=require('./governance-hosted-synthetic-api.cjs');

test('hosted synthetic launcher requires the restricted remote shared-PostgreSQL path',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'governance-hosted-config-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const ca=path.join(directory,'database-ca.pem');
 fs.writeFileSync(ca,'-----BEGIN CERTIFICATE-----\nsynthetic test CA\n-----END CERTIFICATE-----\n');
 const env={
  GOVERNANCE_ENV:'test',GOVERNANCE_STORAGE:'postgres',GOVERNANCE_KEY_STORAGE:'postgres',GOVERNANCE_CONTROL_STORAGE:'postgres',
  GOVERNANCE_DATABASE_URL:'postgresql://governance_api:synthetic-password@managed-db.example.test:25060/governance_test?sslmode=verify-full',
  GOVERNANCE_DATABASE_CA_FILE:ca,GOVERNANCE_IDENTITY_PROVIDER:'workos',WORKOS_API_KEY:'sk_synthetic',WORKOS_CLIENT_ID:'client_synthetic',
  WORKOS_REDIRECT_URI:'https://portal.example.test/api/auth/callback',WORKOS_PILOT_ALLOWED_EMAILS:'partner@example.test',
  WORKOS_WEBHOOK_SECRET:'synthetic-webhook-secret-'.repeat(2),GOVERNANCE_IDENTITY_SEAL_KEY:'ab'.repeat(32),PORT:'8796'
 };
 assert.deepEqual(validate(env),{databaseHost:'managed-db.example.test',portalOrigin:'https://portal.example.test',port:8796});
 const rejects=[
  [{GOVERNANCE_ENV:'staging'},/test-stage/],
  [{GOVERNANCE_CONTROL_STORAGE:'sqlite'},/shared PostgreSQL/],
  [{GOVERNANCE_DATABASE_URL:env.GOVERNANCE_DATABASE_URL.replace('verify-full','require')},/verified PostgreSQL TLS/],
  [{GOVERNANCE_DATABASE_URL:env.GOVERNANCE_DATABASE_URL.replace('managed-db.example.test','127.0.0.1')},/remote restricted/],
  [{GOVERNANCE_DATABASE_URL:env.GOVERNANCE_DATABASE_URL.replace('managed-db.example.test','127.0.0.2')},/remote restricted/],
  [{GOVERNANCE_DATABASE_URL:env.GOVERNANCE_DATABASE_URL.replace('governance_api','doadmin')},/remote restricted/],
  [{WORKOS_REDIRECT_URI:'http://localhost:3001/api/auth/callback'},/HTTPS portal/],
  [{WORKOS_REDIRECT_URI:'https://portal.localhost/api/auth/callback'},/HTTPS portal/],
  [{WORKOS_PILOT_ALLOWED_EMAILS:''},/named admission/],
  [{WORKOS_WEBHOOK_SECRET:''},/webhook verification/],
  [{GOVERNANCE_USERS:'[]'},/seeded accounts/],
  [{GOVERNANCE_RULES_DB:'/tmp/rules.sqlite'},/SQLite/],
  [{PORT:undefined},/explicit loopback service port/]
 ];
 for(const [change,message] of rejects)assert.throws(()=>validate({...env,...change}),message);
});
