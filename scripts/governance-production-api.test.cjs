'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validate}=require('./governance-production-api.cjs');
const {environmentConfig}=require('../services/governance/environment.cjs');
const {PostgresCustomerDirectory}=require('../services/governance/postgres-customer-directory.cjs');
const {PostgresProjectKeys}=require('../services/governance/postgres-project-keys.cjs');

test('production directory and key stores reach migration checks while unknown stages fail closed',async()=>{
 const pool={query:async()=>{throw Error('synthetic database check reached');}};
 for(const store of [new PostgresCustomerDirectory(pool),new PostgresProjectKeys(pool)]){
  await assert.rejects(store.ready('prod'),/synthetic database check reached/);
  await assert.rejects(store.ready('staging'),/explicit environment/);
 }
});

test('production entry point requires isolated Contabo services and exclusive managed database',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orvessian-prod-guard-'));
 const ca=path.join(dir,'managed-ca.crt');
 fs.writeFileSync(ca,'-----BEGIN CERTIFICATE-----\nsynthetic-only\n-----END CERTIFICATE-----\n');
 const env={
  GOVERNANCE_ENV:'prod',GOVERNANCE_PRODUCTION_HOST:'contabo-shared',
  GOVERNANCE_STORAGE:'postgres',GOVERNANCE_KEY_STORAGE:'postgres',
  GOVERNANCE_CONTROL_STORAGE:'postgres',GOVERNANCE_IDENTITY_PROVIDER:'workos',
  GOVERNANCE_DATABASE_URL:'postgresql://governance_prod_api:synthetic-only@orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com:25060/governance_prod?sslmode=verify-full',
  GOVERNANCE_DATABASE_CA_FILE:ca,WORKOS_ADMISSION_MODE:'production-list',
  WORKOS_CLIENT_ID:'client_01M3MRQT8SN9VYRYGQBJWDXAP1',
  WORKOS_API_KEY:'sk_synthetic_only',GOVERNANCE_IDENTITY_SEAL_KEY:'ab'.repeat(32),
  WORKOS_REDIRECT_URI:'https://prod.orvessian.com/api/auth/callback',
  WORKOS_WEBHOOK_SECRET:'whsec_synthetic_only_123456789',
  WORKOS_PRODUCTION_ALLOWED_EMAILS:'founder@example.test',PORT:'8791',
 };
 try{
  assert.equal(environmentConfig(env).stage,'prod');
  assert.equal(validate(env).databaseHost,'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com');
  const anchor={chainId:8453,contract:'0x'+'11'.repeat(20),codeHash:'0x'+'22'.repeat(32)};
  assert.equal(validate({...env,GOVERNANCE_EVIDENCE_ANCHOR_JSON:JSON.stringify(anchor)}).stage,'prod');
  assert.throws(()=>validate({...env,GOVERNANCE_EVIDENCE_ANCHOR_JSON:JSON.stringify({...anchor,chainId:84532})}),/Base Sepolia anchor binding mismatch|Base mainnet/);
  assert.throws(()=>validate({...env,GOVERNANCE_EVIDENCE_ANCHOR_JSON:JSON.stringify({...anchor,codeHash:'0x'+'00'.repeat(32)})}),/Reviewed Base anchor binding/);
  const withoutWebhook={...env,WORKOS_WEBHOOK_SECRET:''};
  assert.equal(validate(withoutWebhook,{requireWebhook:false}).stage,'prod');
  assert.throws(()=>validate(withoutWebhook),/signed revocations/);
  for(const changes of [
   {GOVERNANCE_PRODUCTION_HOST:'dedicated-vm'},
   {GOVERNANCE_DATABASE_URL:env.GOVERNANCE_DATABASE_URL.replace('governance_prod_api','doadmin')},
   {GOVERNANCE_DATABASE_URL:env.GOVERNANCE_DATABASE_URL.replace('/governance_prod','/governance_test')},
   {GOVERNANCE_DATABASE_URL:env.GOVERNANCE_DATABASE_URL.replace('verify-full','disable')},
   {GOVERNANCE_IDENTITY_PROVIDER:'configured'},
   {WORKOS_ADMISSION_MODE:'open-pilot'},
   {WORKOS_WEBHOOK_SECRET:''},
   {WORKOS_PILOT_ALLOWED_EMAILS:'pilot@example.test'},
   {WORKOS_CLIENT_ID:'client_pilot'},
   {PORT:'8795'},
  ])assert.throws(()=>validate({...env,...changes}));
  assert.throws(()=>environmentConfig({...env,GOVERNANCE_STORAGE:'sqlite'}),/PostgreSQL/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
