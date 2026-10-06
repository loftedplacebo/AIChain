'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {parseStrictJson}=require('./server.cjs');
const {MAX_JOURNALS,validRole}=require('./journal-roles.cjs');
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===fields.length&&fields.every(field=>Object.hasOwn(value,field));
const privateRegular=file=>{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>4096||process.platform!=='win32'&&(stat.mode&0o077))throw Error('Private regular backup pointer required');};
const outside=(file,directory)=>{const source=fs.realpathSync(directory),target=path.join(fs.realpathSync(path.dirname(file)),path.basename(file)),relative=path.relative(source,target);if(relative===''||relative==='..'||!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))throw Error('Backup pointer must be outside the source archive');};

function savePointer({file,environment,bucket,keyPrefix,sourceDirectory,journalRoles=[]}){
 if(typeof file!=='string'||!path.isAbsolute(file)||typeof sourceDirectory!=='string'||!path.isAbsolute(sourceDirectory))throw Error('Absolute backup pointer and source paths required');
 outside(file,sourceDirectory);
 if(!['dev','test'].includes(environment)||typeof bucket!=='string'||bucket.length<3||bucket.length>63||typeof keyPrefix!=='string'||!keyPrefix||keyPrefix.length>512)throw Error('Complete backup upload identity required');
 if(!Array.isArray(journalRoles)||journalRoles.length>MAX_JOURNALS||new Set(journalRoles).size!==journalRoles.length||journalRoles.some(role=>!validRole(role,{postgres:true})))throw Error('Invalid backup pointer journal inventory');
 const parent=path.dirname(file),parentStat=fs.lstatSync(parent);if(!parentStat.isDirectory()||parentStat.isSymbolicLink())throw Error('Regular private backup pointer directory required');
 if(fs.lstatSync(file,{throwIfNoEntry:false}))privateRegular(file);
 const value=JSON.stringify({version:2,environment,bucket,keyPrefix,journalRoles})+'\n',temporary=path.join(parent,'.latest-backup-'+randomUUID());
 let fd;
 try{
  fd=fs.openSync(temporary,'wx',0o600);fs.writeFileSync(fd,value);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  fs.renameSync(temporary,file);
  if(process.platform!=='win32'){const directoryFd=fs.openSync(parent,'r');try{fs.fsyncSync(directoryFd);}finally{fs.closeSync(directoryFd);}}
 }finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
}

function readPointer({file,environment,bucket}){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Absolute backup pointer required');
 privateRegular(file);
 const value=parseStrictJson(fs.readFileSync(file,'utf8'));
 const legacy=exact(value,['version','environment','bucket','keyPrefix'])&&value.version===1;
 const current=exact(value,['version','environment','bucket','keyPrefix','journalRoles'])&&value.version===2&&Array.isArray(value.journalRoles)&&value.journalRoles.length<=MAX_JOURNALS&&new Set(value.journalRoles).size===value.journalRoles.length&&value.journalRoles.every(role=>validRole(role,{postgres:true}));
 if(!(legacy||current)||value.environment!==environment||value.bucket!==bucket||typeof value.keyPrefix!=='string'||!value.keyPrefix)throw Error('Backup pointer does not match the selected bucket or environment');
 return value.keyPrefix;
}
module.exports={savePointer,readPointer};
