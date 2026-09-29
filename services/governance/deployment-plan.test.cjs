'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {validatePlan}=require('./deployment-plan.cjs');
const file=path.resolve(__dirname,'../../deploy/governance/deployment-plan.example.json'),fixture=()=>JSON.parse(fs.readFileSync(file,'utf8'));
test('four-environment topology is reviewable but never release approval',()=>{
 assert.deepEqual(validatePlan(fixture()),{valid:true,releaseReady:false,errors:[]});
 const result=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/governance-deployment-plan.cjs'),file],{encoding:'utf8'});assert.equal(result.status,0);assert.equal(JSON.parse(result.stdout).releaseReady,false);
 for(const value of [null,{},[],{schemaVersion:2,environments:[]}])assert.equal(validatePlan(value).valid,false);
 const plan=fixture();plan.environments[3].stage='test';assert.equal(validatePlan(plan).valid,false);
});
test('cross-environment state, identity, keys, wallets and backups cannot be shared',()=>{
 const mutations=[p=>p.environments[3].database=p.environments[2].database,p=>p.environments[3].identity=p.environments[2].identity,p=>p.environments[3].secrets=p.environments[2].secrets,p=>p.environments[3].evidence=p.environments[2].evidence,p=>p.environments[3].backup=p.environments[2].backup];
 for(const mutate of mutations){const plan=fixture();mutate(plan);assert.equal(validatePlan(plan).valid,false);}
 const plan=fixture();plan.environments[2].evidence.relayerAddress=plan.environments[2].evidence.recordingAddress;assert.equal(validatePlan(plan).valid,false);
 const roles=fixture();roles.environments[2].database.workerRole=roles.environments[2].database.apiRole;assert.equal(validatePlan(roles).valid,false);
});
test('hosted TLS, HTTPS, independent storage and bounded recovery objectives are required',()=>{
 const mutations=[e=>e.database.tls='local',e=>e.identity.callbackUrl='http://staging.example.test/callback',e=>e.identity.webhookUrl='https://user:password@staging.example.test/webhook',e=>e.identity.callbackUrl='https://staging.example.test/callback?token=private',e=>e.backup.custody='local-synthetic',e=>e.backup.rpoMinutes=0,e=>e.evidence.chainId=1,e=>e.evidence.relayerAddress='0x'+'0'.repeat(40)];
 for(const mutate of mutations){const plan=fixture();mutate(plan.environments[2]);assert.equal(validatePlan(plan).valid,false);}
 const plan=fixture();plan.environments[0].identity.callbackUrl='http://example.test/callback';assert.equal(validatePlan(plan).valid,false);
});
test('unknown fields and inline credential objects are rejected without reflecting values',()=>{
 const plan=fixture();plan.environments[2].secrets.workosApi={value:'private-secret-value'};plan.environments[3].database.password='private-secret-value';const result=validatePlan(plan);assert.equal(result.valid,false);assert.ok(!JSON.stringify(result).includes('private-secret-value'));
 const unknown=fixture();unknown.approved=true;assert.equal(validatePlan(unknown).valid,false);
});
