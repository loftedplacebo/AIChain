#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {parseStrictJson}=require('../services/governance/server.cjs');
const storage=require('../services/governance/backup-object-storage.cjs');
function privateFile(file,max){const absolute=path.resolve(file),stat=fs.lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>max||process.platform!=='win32'&&(stat.mode&0o077))throw Error('Private regular configuration/key file required');return fs.readFileSync(absolute,'utf8');}
async function main(){
 const [operation,file,...extra]=process.argv.slice(2);if(!['upload','download'].includes(operation)||!file||extra.length)throw Error('Usage: governance-backup-object-storage.cjs upload|download private-config.json');
 const config=parseStrictJson(privateFile(file,8192)),allowed=operation==='upload'?['environment','directory','bucket','prefix','endpoint','region','credentialsFile','keyFile']:['environment','bucket','keyPrefix','outputRoot','endpoint','region','credentialsFile','keyFile'];
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!allowed.includes(k)))throw Error('Invalid object-storage transfer configuration');
 const credentials=parseStrictJson(privateFile(config.credentialsFile,4096));if(!credentials||typeof credentials!=='object'||Array.isArray(credentials)||Object.keys(credentials).some(k=>!['accessKeyId','secretAccessKey'].includes(k)))throw Error('Invalid private object-storage credentials');
 const raw=privateFile(config.keyFile,128).trim();if(!/^[a-f0-9]{64}$/.test(raw))throw Error('Separate 32-byte archive decryption key required');const key=Buffer.from(raw,'hex');
 let client;try{client=storage.createStorageClient({...config,...credentials});const result=await (operation==='upload'?storage.uploadBackupSet:storage.downloadBackupSet)({...config,key,client});console.log(JSON.stringify({operation,...result},null,2));}finally{key.fill(0);client?.destroy();}
}
main().catch(()=>{console.error('Encrypted backup object-storage transfer failed; check private configuration, remote inventory, archive integrity and access. No services were activated.');process.exitCode=1;});
