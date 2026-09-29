'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto'),{Pool}=require('pg');
const run=require('node:util').promisify(require('node:child_process').execFile);
const sqlite=require('./recovery.cjs'),files=sqlite.recoveryFiles,pg=require('./postgres-recovery.cjs'),{verify}=require('./postgres-migrate.cjs');
const roles=['worker','rules','indexer','relayer'],ref=v=>typeof v==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(v);
function configuration(environment,connection,binaries){
 if(!['dev','test'].includes(environment))throw Error('PostgreSQL backup tooling is limited to dev/test');
 if(!connection||Object.keys(connection).some(k=>!['host','port','database','user','password'].includes(k))||!['127.0.0.1','localhost'].includes(connection.host)||!Number.isInteger(connection.port)||connection.port<1||connection.port>65535||!ref(connection.database)||!ref(connection.user)||typeof connection.password!=='string'||!connection.password)throw Error('Explicit local database connection required');
 if(typeof binaries!=='string'||!path.isAbsolute(binaries))throw Error('Explicit absolute PostgreSQL binary directory required');
 for(const binary of ['pg_dump','pg_restore'])files.regular(path.join(binaries,binary+(process.platform==='win32'?'.exe':'')));
}
function binary(binaries,name){return path.join(binaries,name+(process.platform==='win32'?'.exe':''));}
function nativeEnv(c){const env={...process.env};for(const name of Object.keys(env))if(name.startsWith('PG'))delete env[name];return {...env,PGHOST:c.host,PGPORT:String(c.port),PGUSER:c.user,PGPASSWORD:c.password,PGDATABASE:c.database,PGCONNECT_TIMEOUT:'5',PGOPTIONS:'-c statement_timeout=120000'};}
async function native(exe,args,connection){try{await run(exe,args,{env:nativeEnv(connection),windowsHide:true,timeout:120000,maxBuffer:65536});}catch{throw Error('Native PostgreSQL backup/restore failed; destination remains offline');}}
function marker(directory,name){const file=path.join(directory,name);files.regular(file);if(fs.statSync(file).size>65536)throw Error('Recovery marker too large');return JSON.parse(fs.readFileSync(file,'utf8'));}
async function sourceCheck(pool,environment){
 await verify(pool);await pg.assertActive(pool);
 const row=(await pool.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0],stage=(await pool.query('SELECT name FROM governance_environment')).rows;
 if(!row?.rolsuper||stage.length!==1||stage[0].name!==environment)throw Error('Offline dev/test database administrator and matching environment required');
}
async function createBackup({environment,connection,binaries,journals=[],outputRoot,key,consistency}){
 configuration(environment,connection,binaries);files.keyCheck(key);
 if(consistency!=='quiesced')throw Error('Stop every API/worker/delivery writer and acknowledge quiesced capture');
 if(!Array.isArray(journals)||journals.some(j=>!roles.includes(j.role))||new Set(journals.map(j=>j.role)).size!==journals.length)throw Error('Only unique explicit worker/rules/indexer/relayer journal roles are allowed');
 const pool=new Pool({...connection,max:2,connectionTimeoutMillis:5000}),destination=files.freshDirectory(outputRoot,'pg-backup-'),scratch=files.freshDirectory(os.tmpdir(),'ov-pg-backup-');let success=false,locker;
 try{
  await sourceCheck(pool,environment);locker=await pool.connect();await locker.query('BEGIN');await locker.query("SET LOCAL lock_timeout='5000'");
  const tables=(await locker.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
  if(tables.some(t=>!ref(t)))throw Error('Unexpected database table name');
  await locker.query('LOCK TABLE '+tables.map(t=>'public."'+t+'"').join(',')+' IN SHARE MODE');
  const id=randomUUID(),createdAt=new Date().toISOString(),dump=path.join(scratch.directory,'postgres.dump');
  await native(binary(binaries,'pg_dump'),['--format=custom','--file',dump,'--dbname',connection.database],connection);
  const bytes=fs.statSync(dump).size;if(bytes>files.MAX_BYTES)throw Error('Recovery size limit exceeded');
  const manifest={version:1,kind:'postgres-coordinated',id,environment,createdAt,consistency,database:connection.database,postgres:{bytes,sha256:await files.digestFile(dump)},journals:[]};
  await files.encryptFile(dump,path.join(destination.directory,'postgres.gcm'),key,id+':'+environment+':postgres');
  if(journals.length){
   const bundle=await sqlite.createBackup({environment,files:journals,outputRoot:scratch.directory,key,consistency});
   const journalDir=path.join(destination.directory,'journals');fs.mkdirSync(journalDir);
   for(const entry of fs.readdirSync(bundle.directory).sort()){
    const source=path.join(bundle.directory,entry),target=path.join(journalDir,entry);files.regular(source);fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);files.durable(target);
    manifest.journals.push({file:entry,bytes:fs.statSync(source).size,sha256:await files.digestFile(source)});
   }
  }
  await locker.query('COMMIT');locker.release();locker=null;
  const manifestFile=path.join(scratch.directory,'manifest.json');fs.writeFileSync(manifestFile,JSON.stringify(manifest),{flag:'wx',mode:0o600});
  await files.encryptFile(manifestFile,path.join(destination.directory,'manifest.gcm'),key,id+':'+environment+':manifest');
  fs.writeFileSync(path.join(destination.directory,'complete.json'),JSON.stringify({version:1,kind:manifest.kind,id,environment,createdAt}),{flag:'wx',mode:0o600});files.durable(path.join(destination.directory,'complete.json'));success=true;
  return {directory:destination.directory,id,environment,createdAt,consistency,journalRoles:journals.map(j=>j.role)};
 }finally{try{if(locker){try{await locker.query('ROLLBACK');}finally{locker.release();}}await pool.end();}finally{try{files.clean(scratch);}finally{if(!success)files.clean(destination);}}}
}
async function readArchive({environment,directory,key,scratchDirectory,journalOutputRoot}){
 if(!['dev','test'].includes(environment))throw Error('Explicit dev/test archive environment required');files.keyCheck(key);
 const header=marker(directory,'complete.json');if(header.version!==1||header.kind!=='postgres-coordinated'||header.environment!==environment||typeof header.id!=='string'||!/^[a-f0-9-]{36}$/.test(header.id))throw Error('Backup marker mismatch');
  const manifestFile=path.join(scratchDirectory,'manifest.json');await files.decryptFile(path.join(directory,'manifest.gcm'),manifestFile,key,header.id+':'+environment+':manifest',65536);const manifest=marker(scratchDirectory,'manifest.json');
  if(manifest.version!==1||manifest.kind!==header.kind||manifest.id!==header.id||manifest.environment!==environment||manifest.consistency!=='quiesced'||!ref(manifest.database)||!Array.isArray(manifest.journals)||manifest.journals.length>6||!Number.isSafeInteger(manifest.postgres?.bytes)||manifest.postgres.bytes<1||manifest.postgres.bytes>files.MAX_BYTES||!/^[a-f0-9]{64}$/.test(manifest.postgres.sha256))throw Error('Invalid authenticated PostgreSQL manifest');
  const created=Date.parse(manifest.createdAt);if(!Number.isFinite(created)||new Date(created).toISOString()!==manifest.createdAt||manifest.createdAt!==header.createdAt||created>Date.now()+300000)throw Error('Invalid authenticated backup timestamp');
  const expected=['complete.json','manifest.gcm','postgres.gcm',...(manifest.journals.length?['journals']:[])].sort();if(JSON.stringify(fs.readdirSync(directory).sort())!==JSON.stringify(expected))throw Error('Unexpected backup files');
  const dump=path.join(scratchDirectory,'postgres.dump');await files.decryptFile(path.join(directory,'postgres.gcm'),dump,key,header.id+':'+environment+':postgres');
  if(fs.statSync(dump).size!==manifest.postgres.bytes||await files.digestFile(dump)!==manifest.postgres.sha256)throw Error('PostgreSQL dump does not match authenticated manifest');
  let journalRestore;
  if(manifest.journals.length){
   const names=manifest.journals.map(e=>e.file);if(new Set(names).size!==names.length||!names.includes('complete.json')||!names.includes('manifest.gcm')||names.some(n=>!['complete.json','manifest.gcm',...roles.map(r=>r+'.gcm')].includes(n))||JSON.stringify(fs.readdirSync(path.join(directory,'journals')).sort())!==JSON.stringify([...names].sort()))throw Error('Invalid journal manifest');
   for(const entry of manifest.journals){
    if(!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>files.MAX_BYTES+33||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid journal entry');const file=path.join(directory,'journals',entry.file);files.regular(file);
    if(fs.statSync(file).size!==entry.bytes||await files.digestFile(file)!==entry.sha256)throw Error('Journal does not match authenticated manifest');
   }
   journalRestore=await sqlite.restoreBackup({environment,directory:path.join(directory,'journals'),outputRoot:journalOutputRoot,key});
   if(journalRestore.files.some(r=>!roles.includes(r)))throw Error('Unexpected restored journal role');
  }
  return {header,manifest,dump,journalRestore};
}
async function inspectBackup({environment,directory,key,maxAgeHours=24}){
 if(!Number.isInteger(maxAgeHours)||maxAgeHours<1||maxAgeHours>720)throw Error('Backup freshness window must be 1 to 720 hours');
 const scratch=files.freshDirectory(os.tmpdir(),'ov-pg-inspect-');
 try{
  const {header,manifest,journalRestore}=await readArchive({environment,directory,key,scratchDirectory:scratch.directory,journalOutputRoot:scratch.directory});
  if(journalRestore)sqlite.reviewRestore({environment,directory:journalRestore.directory});
  const ageSeconds=Math.max(0,Math.floor((Date.now()-Date.parse(manifest.createdAt))/1000));
  return {id:header.id,environment,createdAt:manifest.createdAt,integrity:'verified',freshness:ageSeconds>=maxAgeHours*3600?'stale':'fresh',ageSeconds,maxAgeHours,postgresBytes:manifest.postgres.bytes,journalRoles:journalRestore?.files||[]};
 }finally{files.clean(scratch);}
}
async function restoreBackup({environment,connection,binaries,directory,outputRoot,key,targetDatabase,approvedMigrations=[]}){
 configuration(environment,connection,binaries);files.keyCheck(key);
 if(connection.database!=='postgres')throw Error('Restore operator must connect to the maintenance database');
 const scratch=files.freshDirectory(os.tmpdir(),'ov-pg-restore-'),destination=files.freshDirectory(outputRoot,'pg-restore-');let success=false,targetPool,handle;
 const admin=new Pool({...connection,max:2,connectionTimeoutMillis:5000});
 try{
  const {header,manifest,dump,journalRestore}=await readArchive({environment,directory,key,scratchDirectory:scratch.directory,journalOutputRoot:destination.directory});
  // Decrypt/validate every part before any destination database is created.
  // An authenticated archive remains usable after loss of the source database.
  // Absence never permits reuse of an existing target or matching source name.
  handle=await pg.createRestoreTarget(admin,{sourceDatabase:manifest.database,targetDatabase,environment,sourceMayBeAbsent:true});targetPool=new Pool({...connection,database:targetDatabase,max:2,connectionTimeoutMillis:5000});
  await native(binary(binaries,'pg_restore'),['--exit-on-error','--single-transaction','--no-owner','--no-acl','--dbname',targetDatabase,dump],connection);
  const invalidated=await pg.invalidateRestore(targetPool,handle,{approvedMigrations});await pg.reviewRestore(targetPool,{environment,restoreId:invalidated.restoreId});
  const result={version:1,kind:'postgres-coordinated',backupId:header.id,environment,targetDatabase,restoreId:invalidated.restoreId,journalsDirectory:journalRestore?path.basename(journalRestore.directory):null,journalRoles:journalRestore?.files||[],activation:'review-required',access:'revoked-and-disabled',appliedMigrations:invalidated.appliedMigrations};
  fs.writeFileSync(path.join(destination.directory,'recovery.json'),JSON.stringify(result),{flag:'wx',mode:0o600});files.durable(path.join(destination.directory,'recovery.json'));success=true;return {directory:destination.directory,...result};
 }catch(e){
  if(targetPool)try{await targetPool.query("UPDATE governance_recovery_gate SET state='review-required' WHERE singleton=true");}catch{}
  throw e;
 }finally{try{await targetPool?.end();await admin.end();}finally{try{files.clean(scratch);}finally{if(!success)files.clean(destination);}}}
}
async function reviewRestore({environment,connection,binaries,directory}){
 configuration(environment,connection,binaries);const result=marker(directory,'recovery.json');
 if(result.version!==1||result.kind!=='postgres-coordinated'||result.environment!==environment||result.targetDatabase!==connection.database||result.activation!=='review-required'||!Array.isArray(result.journalRoles))throw Error('Recovery marker mismatch');
 const expected=['recovery.json'];if(result.journalsDirectory){if(typeof result.journalsDirectory!=='string'||!/^restore-[A-Za-z0-9]+$/.test(result.journalsDirectory))throw Error('Invalid journal restore directory');expected.push(result.journalsDirectory);const journal=sqlite.reviewRestore({environment,directory:path.join(directory,result.journalsDirectory)});if(JSON.stringify(journal.files.map(f=>f.role))!==JSON.stringify(result.journalRoles))throw Error('Journal recovery roles mismatch');}
 else if(result.journalRoles.length)throw Error('Missing restored journals');
 if(JSON.stringify(fs.readdirSync(directory).sort())!==JSON.stringify(expected.sort()))throw Error('Unexpected recovery files');
 const pool=new Pool({...connection,max:2,connectionTimeoutMillis:5000});try{return {directory,...await pg.reviewRestore(pool,{environment,restoreId:result.restoreId}),journalRoles:result.journalRoles};}finally{await pool.end();}
}
module.exports={createBackup,restoreBackup,reviewRestore,inspectBackup};
