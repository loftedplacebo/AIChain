#!/usr/bin/env node
// Explicit local recovery operation; no network, scheduler or service activation.
const fs=require('node:fs'),path=require('node:path');
const {createBackup,restoreBackup,reviewRestore}=require('../services/governance/recovery.cjs');
const {parseStrictJson}=require('../services/governance/server.cjs');
async function main(){
 const [operation,file,...extra]=process.argv.slice(2);
 if(!['backup','restore','review'].includes(operation)||!file||extra.length)throw Error('Usage: node scripts/governance-recovery.cjs backup|restore|review configuration.json');
 if(fs.statSync(file).size>8192)throw Error('Configuration exceeds 8 KiB');const config=parseStrictJson(fs.readFileSync(file,'utf8'));
 const fields=operation==='review'?['environment','directory']:operation==='backup'?['environment','files','outputRoot','keyFile','consistency']:['environment','directory','outputRoot','keyFile'];
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!fields.includes(k)))throw Error('Invalid recovery configuration');
 if(operation==='review'){
  if(typeof config.directory!=='string'||!config.directory)throw Error('Invalid recovery directory');
  console.log(JSON.stringify({operation,...reviewRestore(config)},null,2));return;
 }
 if(typeof config.keyFile!=='string'||typeof config.outputRoot!=='string')throw Error('Invalid recovery configuration');
 const keyFile=path.resolve(config.keyFile),stat=fs.lstatSync(keyFile);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128||process.platform!=='win32'&&(stat.mode&0o077))throw Error('Backup key must be a private regular file');
 const raw=fs.readFileSync(keyFile,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(raw))throw Error('Backup key must contain 64 lowercase hex characters');
 const key=Buffer.from(raw,'hex');try{const result=await (operation==='backup'?createBackup:restoreBackup)({...config,key});console.log(JSON.stringify({operation,...result},null,2));}finally{key.fill(0);}
}
main().catch(error=>{console.error('Recovery operation failed: '+error.message);process.exitCode=1;});
