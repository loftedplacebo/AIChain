#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{parseStrictJson}=require('../services/governance/server.cjs'),recovery=require('../services/governance/postgres-backup.cjs');
function privateFile(file,max){const absolute=path.resolve(file),stat=fs.lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max||process.platform!=='win32'&&(stat.mode&0o077))throw Error('Private regular configuration/key file required');return fs.readFileSync(absolute,'utf8');}
async function main(){
 const [operation,file,...extra]=process.argv.slice(2);if(!['backup','restore','review','inspect','monitor','rotate-key'].includes(operation)||!file||extra.length)throw Error('Usage: governance-postgres-recovery.cjs backup|restore|review|inspect|monitor|rotate-key private-config.json');
 const config=parseStrictJson(privateFile(file,8192)),common=['environment','connectionFile','binaries','directory'],fields=operation==='monitor'?['environment','root','keyFile','maxAgeHours','requiredJournalRoles','maxArchives']:operation==='inspect'?['environment','directory','keyFile','maxAgeHours']:operation==='backup'?['environment','connectionFile','binaries','journals','outputRoot','keyFile','consistency']:operation==='restore'?[...common,'outputRoot','keyFile','targetDatabase','approvedMigrations']:common;
 const permitted=operation==='rotate-key'?['environment','directory','outputRoot','keyFile','newKeyFile']:fields;
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!permitted.includes(k)))throw Error('Invalid recovery configuration');
 if(operation==='rotate-key'){
  const oldRaw=privateFile(config.keyFile,128).trim(),newRaw=privateFile(config.newKeyFile,128).trim();if(!/^[a-f0-9]{64}$/.test(oldRaw)||!/^[a-f0-9]{64}$/.test(newRaw))throw Error('Separate existing and replacement 32-byte backup keys required');const key=Buffer.from(oldRaw,'hex'),newKey=Buffer.from(newRaw,'hex');
  try{console.log(JSON.stringify({operation,...await require('../services/governance/backup-key-rotation.cjs').rotateBackupKey({...config,key,newKey})},null,2));}finally{key.fill(0);newKey.fill(0);}return;
 }
 if(operation==='inspect'||operation==='monitor'){
  const raw=privateFile(config.keyFile,128).trim();if(!/^[a-f0-9]{64}$/.test(raw))throw Error('Separate 32-byte backup key required');const key=Buffer.from(raw,'hex');
  try{const result=await (operation==='monitor'?require('../services/governance/backup-monitor.cjs').checkBackupSet:recovery.inspectBackup)({...config,key});console.log(JSON.stringify({operation,...result},null,2));if(result.freshness==='stale'||result.status==='not-ready')process.exitCode=2;}finally{key.fill(0);}return;
 }
 const connection=parseStrictJson(privateFile(config.connectionFile,4096));if(!connection||typeof connection!=='object'||Array.isArray(connection)||Object.keys(connection).some(k=>!['host','port','database','user','password','sslmode','caFile'].includes(k)))throw Error('Invalid private database configuration');
 if(operation==='review'){console.log(JSON.stringify({operation,...await recovery.reviewRestore({...config,connection})},null,2));return;}
 const raw=privateFile(config.keyFile,128).trim();if(!/^[a-f0-9]{64}$/.test(raw))throw Error('Separate 32-byte backup key required');const key=Buffer.from(raw,'hex');
 try{console.log(JSON.stringify({operation,...await (operation==='backup'?recovery.createBackup:recovery.restoreBackup)({...config,connection,key})},null,2));}finally{key.fill(0);}
}
main().catch(()=>{console.error('PostgreSQL recovery operation failed; check private configuration, environment, backup integrity and database access. No services were activated.');process.exitCode=1;});
