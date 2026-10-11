'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {validatePlan}=require('./deployment-plan.cjs');
const file=path.resolve(__dirname,'../../deploy/governance/deployment-plan.example.json'),fixture=()=>JSON.parse(fs.readFileSync(file,'utf8'));
test('three-environment topology is reviewable but never release approval',()=>{
 assert.deepEqual(validatePlan(fixture()),{valid:true,releaseReady:false,errors:[]});
 const result=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/governance-deployment-plan.cjs'),file],{encoding:'utf8'});assert.equal(result.status,0);assert.equal(JSON.parse(result.stdout).releaseReady,false);
 for(const value of [null,{},[],{schemaVersion:6,environments:[]}])assert.equal(validatePlan(value).valid,false);
 const plan=fixture();plan.environments[2].stage='test';assert.equal(validatePlan(plan).valid,false);
});
test('cross-environment state, identity, keys, wallets and backups cannot be shared',()=>{
 const mutations=[p=>p.environments[2].database=p.environments[1].database,p=>p.environments[2].identity=p.environments[1].identity,p=>p.environments[2].secrets=p.environments[1].secrets,p=>p.environments[2].backup=p.environments[1].backup,p=>p.environments[2].hosting.appInstanceRef=p.environments[1].hosting.appInstanceRef];
 for(const mutate of mutations){const plan=fixture();mutate(plan);assert.equal(validatePlan(plan).valid,false);}
 const plan=fixture();plan.environments[1].evidence.relayerAddress=plan.environments[1].evidence.recordingAddress;assert.equal(validatePlan(plan).valid,false);
 const roles=fixture();roles.environments[2].database.workerRole=roles.environments[2].database.apiRole;assert.equal(validatePlan(roles).valid,false);
});
test('test and production clusters remain distinct',()=>{
 assert.equal(validatePlan(fixture()).valid,true);
 const mutations=[
  p=>p.environments[1].hosting.databaseTopology='shared-with-test',
  p=>p.environments[2].hosting.databaseTopology='unknown'
 ];
 for(const mutate of mutations){const plan=fixture();mutate(plan);assert.equal(validatePlan(plan).valid,false);}
 const reused=fixture();reused.environments[2].hosting.databaseClusterRef=reused.environments[1].hosting.databaseClusterRef;
 assert.equal(validatePlan(reused).valid,false);
});
test('hosted TLS, HTTPS, independent backup provider and bounded recovery objectives are required',()=>{
 const mutations=[e=>e.database.tls='local',e=>e.identity.callbackUrl='http://staging.example.test/callback',e=>e.identity.webhookUrl='https://user:password@staging.example.test/webhook',e=>e.identity.callbackUrl='https://staging.example.test/callback?token=private',e=>e.backup.custody='local-synthetic',e=>e.hosting.backupProvider=e.hosting.appProvider,e=>e.hosting.backupProvider=e.hosting.databaseProvider,e=>e.hosting.backupProvider=e.hosting.appProvider.toUpperCase(),e=>e.hosting.backupRegion='',e=>e.backup.rpoMinutes=0,e=>e.evidence.chainId=1,e=>e.evidence.relayerAddress='0x'+'0'.repeat(40)];
 for(const mutate of mutations){const plan=fixture();mutate(plan.environments[2]);assert.equal(validatePlan(plan).valid,false);}
 const plan=fixture();plan.environments[0].identity.callbackUrl='http://example.test/callback';assert.equal(validatePlan(plan).valid,false);
});
test('portal, API, callback and webhook origins form one exact isolated route plan',()=>{
 const mutations=[e=>e.portal.origin='http://staging.example.test',e=>e.portal.apiOrigin='https://user:password@api.staging.example.test',e=>e.portal.origin='https://staging.example.test/path',e=>e.portal.apiOrigin=e.portal.origin,e=>e.identity.callbackUrl=e.portal.apiOrigin+'/api/auth/callback',e=>e.identity.webhookUrl=e.portal.origin+'/v1/auth/workos-webhook'];
 for(const mutate of mutations){const plan=fixture();mutate(plan.environments[2]);assert.equal(validatePlan(plan).valid,false);}
 const shared=fixture();shared.environments[2].portal.apiOrigin=shared.environments[1].portal.apiOrigin;assert.equal(validatePlan(shared).valid,false);
 for(const version of [1,3,4]){const old=fixture();old.schemaVersion=version;assert.equal(validatePlan(old).valid,false);}
});
test('an HTTPS synthetic test pilot has hosted isolation and public DNS requirements',()=>{
 const hosted=fixture(),pilot=hosted.environments[1];
 assert.equal(validatePlan(hosted).valid,true);
 for(const mutate of [
  e=>e.portal.apiOrigin='https://127.0.0.2',
  e=>e.portal.apiOrigin='https://[::1]',
  e=>e.portal.apiOrigin='https://api.localhost',
  e=>e.database.host='127.0.0.2',
  e=>e.database.tls='verify-full',
  e=>e.backup.custody='local-synthetic',
  e=>e.hosting.backupProvider=e.hosting.appProvider
 ]){const plan=structuredClone(hosted);mutate(plan.environments[1]);assert.equal(validatePlan(plan).valid,false);}
});
test('unknown fields and inline credential objects are rejected without reflecting values',()=>{
 const plan=fixture();plan.environments[1].secrets.workosApi={value:'private-secret-value'};plan.environments[2].database.password='private-secret-value';const result=validatePlan(plan);assert.equal(result.valid,false);assert.ok(!JSON.stringify(result).includes('private-secret-value'));
 const unknown=fixture();unknown.approved=true;assert.equal(validatePlan(unknown).valid,false);
 const sharedBackup=fixture();sharedBackup.environments[2].hosting.backupAccountRef=sharedBackup.environments[1].hosting.backupAccountRef;assert.equal(validatePlan(sharedBackup).valid,false);
});
test('production evidence stays undecided until a separate chain and custody decision',()=>{
 const plan=fixture(),prod=plan.environments[2];assert.equal(validatePlan(plan).valid,true);
 prod.evidence.mode='base-mainnet';prod.evidence.chainId=8453;
 prod.evidence.recordingAddress='0x0000000000000000000000000000000000000007';
 prod.evidence.relayerAddress='0x0000000000000000000000000000000000000008';
 assert.equal(validatePlan(plan).valid,true);
 prod.evidence.chainId=84532;assert.equal(validatePlan(plan).valid,false);
 prod.evidence.chainId=8453;
 prod.evidence.recordingAddress=plan.environments[1].evidence.recordingAddress;
 assert.equal(validatePlan(plan).valid,false);
});
