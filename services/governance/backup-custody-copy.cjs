'use strict';
// Copy an authenticated encrypted archive to an operator-selected separate
// filesystem root. This proves file integrity, not independent cloud custody.
const fs=require('node:fs'),path=require('node:path');
const {recoveryFiles:files}=require('./recovery.cjs');
const {inspectBackup}=require('./postgres-backup.cjs');
const within=(parent,child)=>{const rel=path.relative(parent,child);return !rel||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};

async function inventory(directory,journalRoles){
 const names=['manifest.gcm','postgres.gcm','complete.json'];
 if(journalRoles.length)names.push('journals/manifest.gcm','journals/complete.json',...journalRoles.map(role=>'journals/'+role+'.gcm'));
 const expected=journalRoles.length?['complete.json','manifest.gcm','postgres.gcm','journals']:['complete.json','manifest.gcm','postgres.gcm'];
 if(JSON.stringify(fs.readdirSync(directory).sort())!==JSON.stringify(expected.sort()))throw Error('Unexpected backup inventory');
 if(journalRoles.length){const journal=path.join(directory,'journals'),stat=fs.lstatSync(journal);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Invalid journal directory');const expectedJ=['complete.json','manifest.gcm',...journalRoles.map(role=>role+'.gcm')];if(JSON.stringify(fs.readdirSync(journal).sort())!==JSON.stringify(expectedJ.sort()))throw Error('Unexpected journal inventory');}
 const result={};for(const name of names){const file=path.join(directory,name);files.regular(file);const bytes=fs.statSync(file).size;if(bytes<1||bytes>files.MAX_BYTES+33)throw Error('Backup file size exceeds custody-copy limit');result[name]={bytes,sha256:await files.digestFile(file)};}
 return result;
}

async function copyBackupSet({environment,directory,destinationRoot,key}){
 if(!['dev','test'].includes(environment)||typeof directory!=='string'||!path.isAbsolute(directory)||typeof destinationRoot!=='string'||!path.isAbsolute(destinationRoot))throw Error('Explicit archive and destination root required');files.keyCheck(key);
 const sourceStat=fs.lstatSync(directory),rootStat=fs.lstatSync(destinationRoot);if(!sourceStat.isDirectory()||sourceStat.isSymbolicLink()||!rootStat.isDirectory()||rootStat.isSymbolicLink())throw Error('Regular source and destination directories required');
 const source=fs.realpathSync(directory),root=fs.realpathSync(destinationRoot);if(within(source,root)||within(root,source))throw Error('Destination root must be separate from the source archive tree');
 const original=await inspectBackup({environment,directory:source,key}),before=await inventory(source,original.journalRoles);
 const destination=files.freshDirectory(root,'pg-backup-');let success=false;
 try{
  for(const name of Object.keys(before).filter(name=>name!=='complete.json'&&name!=='journals/complete.json')){
   const target=path.join(destination.directory,name);if(name.startsWith('journals/'))fs.mkdirSync(path.join(destination.directory,'journals'),{recursive:true});
   fs.copyFileSync(path.join(source,name),target,fs.constants.COPYFILE_EXCL);files.durable(target);
  }
  if(before['journals/complete.json']){const name='journals/complete.json',target=path.join(destination.directory,name);fs.copyFileSync(path.join(source,name),target,fs.constants.COPYFILE_EXCL);files.durable(target);}
  fs.copyFileSync(path.join(source,'complete.json'),path.join(destination.directory,'complete.json'),fs.constants.COPYFILE_EXCL);files.durable(path.join(destination.directory,'complete.json'));
  const copied=await inspectBackup({environment,directory:destination.directory,key}),after=await inventory(source,original.journalRoles),atDestination=await inventory(destination.directory,original.journalRoles);
  if(JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(before)!==JSON.stringify(atDestination)||copied.id!==original.id||copied.createdAt!==original.createdAt||JSON.stringify(copied.journalRoles)!==JSON.stringify(original.journalRoles))throw Error('Backup copy or source changed during transfer');
  success=true;return {environment,directory:destination.directory,id:original.id,createdAt:original.createdAt,journalRoles:original.journalRoles,integrity:'verified',custody:'destination-filesystem-only',restore:'not-tested'};
 }finally{if(!success)files.clean(destination);}
}
module.exports={copyBackupSet,inventory};
