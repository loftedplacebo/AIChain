'use strict';
// Isolated local simulation of managed PostgreSQL role attributes. No cleanup
// is automatic so a failed recovery test never deletes evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto'),{Pool}=require('pg');
const base=path.resolve(__dirname,'../build/postgres-native'),config=JSON.parse(fs.readFileSync(path.join(base,'cluster-access.json'),'utf8'));
if(config.host!=='127.0.0.1'||config.port!==55439||config.user!=='governance_test_admin'||!fs.existsSync(path.join(base,'LOCAL-SYNTHETIC-ONLY')))throw Error('Dedicated synthetic cluster required');
const {assertOfflineAdministrator}=require('../services/governance/postgres-offline-administrator.cjs'),{migrate}=require('../services/governance/postgres-migrate.cjs'),{createRestoreTarget}=require('../services/governance/postgres-recovery.cjs');
const id='m'+randomBytes(5).toString('hex'),role='gov_managed_'+id,runtime='gov_runtime_'+id,source='gov_test_'+id,target='gov_restore_'+id,password=randomBytes(24).toString('hex'),runtimePassword=randomBytes(24).toString('hex'),directory=path.join(base,id);
const admin=new Pool({...config,database:'postgres',max:2}),pools=[];
const pool=(database,user,secret)=>{const p=new Pool({...config,database,user,password:secret,max:2});pools.push(p);return p;};
async function main(){
 fs.mkdirSync(directory);
 await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER CREATEDB CREATEROLE NOINHERIT BYPASSRLS`);
 await admin.query(`CREATE ROLE ${runtime} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
 await admin.query(`CREATE DATABASE ${source} OWNER ${role}`);
 const owner=pool(source,role,password);await migrate(owner,{environment:'test'});
 assert.deepEqual(await assertOfflineAdministrator(owner),{superuser:false,managedAdministrator:true});
 const ordinary=pool(source,runtime,runtimePassword);await assert.rejects(assertOfflineAdministrator(ordinary),/offline database administrator/);
 const maintenance=pool('postgres',role,password),handle=await createRestoreTarget(maintenance,{sourceDatabase:source,targetDatabase:target,environment:'test'});
 assert.equal(handle.targetDatabase,target);assert.equal(handle.sourceDatabase,source);
 const restored=pool(target,role,password);assert.deepEqual(await assertOfflineAdministrator(restored),{superuser:false,managedAdministrator:true});
 console.log('PASS managed-like non-superuser owns source, migrates and creates an isolated restore target; runtime role denied');
 const backup=require('../services/governance/postgres-backup.cjs'),binaries=path.join(__dirname,'../build/postgres-runtime/pgsql/bin'),key=randomBytes(32),connection={host:config.host,port:config.port,database:source,user:role,password};
 const archive=await backup.createBackup({environment:'test',connection,binaries,outputRoot:path.join(directory,'backups'),key,consistency:'quiesced'});
 const recovery=await backup.restoreBackup({environment:'test',directory:archive.directory,key,connection:{...connection,database:'postgres'},binaries,targetDatabase:'gov_restore_archive_'+id,outputRoot:path.join(directory,'restores')});
 assert.equal(recovery.activation,'review-required');assert.equal(recovery.access,'revoked-and-disabled');
 assert.equal((await backup.reviewRestore({environment:'test',connection:{...connection,database:recovery.targetDatabase},binaries,directory:recovery.directory})).review,'passed');
 key.fill(0);
 console.log('PASS managed-like non-superuser captures encrypted PostgreSQL and restores to a fresh revoked target');
 console.log('Synthetic databases retained: '+source+', '+target+', '+recovery.targetDatabase);
}
main().catch(()=>{console.error('Managed-like offline administrator native acceptance failed');process.exitCode=1;}).finally(async()=>{await Promise.all(pools.map(p=>p.end()));await admin.end();});
