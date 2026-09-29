'use strict';
// Private offline archive operation; no database, wallet or service activation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{timingSafeEqual}=require('node:crypto');
const {recoveryFiles:files}=require('./recovery.cjs'),{inspectBackup}=require('./postgres-backup.cjs');
function futurePath(value){let current=path.resolve(value),parts=[];while(!fs.existsSync(current)){parts.unshift(path.basename(current));const parent=path.dirname(current);if(parent===current)throw Error('Backup output root cannot be resolved');current=parent;}return path.join(fs.realpathSync(current),...parts);}
function outside(source,target){const relative=path.relative(source,target);if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Rotated archive output must be outside the source archive');}
async function inventory(directory,roles){
 const stat=fs.lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Regular archive directory required');
 const expected=['complete.json','manifest.gcm','postgres.gcm',...(roles.length?['journals']:[])].sort();if(JSON.stringify(fs.readdirSync(directory).sort())!==JSON.stringify(expected))throw Error('Archive changed during key rotation');
 const names=['complete.json','manifest.gcm','postgres.gcm'];if(roles.length){const journals=path.join(directory,'journals'),st=fs.lstatSync(journals),nested=['complete.json','manifest.gcm',...roles.map(r=>r+'.gcm')].sort();if(!st.isDirectory()||st.isSymbolicLink()||JSON.stringify(fs.readdirSync(journals).sort())!==JSON.stringify(nested))throw Error('Archive journal inventory changed');names.push(...nested.map(n=>'journals/'+n));}
 const result={};for(const name of names.sort()){const file=path.join(directory,name);files.regular(file);const size=fs.statSync(file).size;if(size>files.MAX_BYTES+33)throw Error('Archive rotation size limit exceeded');result[name]={bytes:size,sha256:await files.digestFile(file)};}return result;
}
async function rotateBackupKey({environment,directory,outputRoot,key,newKey}){
 if(!['dev','test'].includes(environment)||typeof directory!=='string'||!path.isAbsolute(directory)||typeof outputRoot!=='string'||!path.isAbsolute(outputRoot))throw Error('Explicit local dev/test archive and output required');files.keyCheck(key);files.keyCheck(newKey);if(timingSafeEqual(key,newKey))throw Error('Distinct replacement backup key required');
 const source=fs.realpathSync(directory);outside(source,futurePath(outputRoot));const original=await inspectBackup({environment,directory,key}),before=await inventory(directory,original.journalRoles);
 const scratch=files.freshDirectory(os.tmpdir(),'ov-rekey-');let destination,success=false;
 try{
  destination=files.freshDirectory(outputRoot,'pg-backup-');
  const rawManifest=path.join(scratch.directory,'original-manifest.json');await files.decryptFile(path.join(directory,'manifest.gcm'),rawManifest,key,original.id+':'+environment+':manifest',65536);const manifest=JSON.parse(fs.readFileSync(rawManifest,'utf8'));if(manifest.id!==original.id||manifest.createdAt!==original.createdAt)throw Error('Archive changed during key rotation');
  async function reencrypt(input,output,aad,label,max=files.MAX_BYTES){const plaintext=path.join(scratch.directory,label);await files.decryptFile(input,plaintext,key,aad,max);await files.encryptFile(plaintext,output,newKey,aad);fs.unlinkSync(plaintext);}
  await reencrypt(path.join(directory,'postgres.gcm'),path.join(destination.directory,'postgres.gcm'),original.id+':'+environment+':postgres','postgres.dump');
  if(original.journalRoles.length){
   const sourceJournals=path.join(directory,'journals'),targetJournals=path.join(destination.directory,'journals');fs.mkdirSync(targetJournals);const markerFile=path.join(sourceJournals,'complete.json');files.regular(markerFile);if(fs.statSync(markerFile).size>4096)throw Error('Journal marker exceeds rotation limit');const marker=JSON.parse(fs.readFileSync(markerFile,'utf8'));
   for(const role of original.journalRoles)await reencrypt(path.join(sourceJournals,role+'.gcm'),path.join(targetJournals,role+'.gcm'),marker.id+':'+environment+':'+role,role+'.sqlite');
   await reencrypt(path.join(sourceJournals,'manifest.gcm'),path.join(targetJournals,'manifest.gcm'),marker.id+':'+environment+':manifest','journal-manifest.json',65536);fs.copyFileSync(path.join(sourceJournals,'complete.json'),path.join(targetJournals,'complete.json'),fs.constants.COPYFILE_EXCL);files.durable(path.join(targetJournals,'complete.json'));
   manifest.journals=[];for(const name of fs.readdirSync(targetJournals).sort()){const file=path.join(targetJournals,name);manifest.journals.push({file:name,bytes:fs.statSync(file).size,sha256:await files.digestFile(file)});}
  }
  const rotatedAt=new Date().toISOString();manifest.encryptionRotation={rotatedAt,sourceManifestSha256:before['manifest.gcm'].sha256};const newManifest=path.join(scratch.directory,'replacement-manifest.json'),body=JSON.stringify(manifest);if(Buffer.byteLength(body)>65536)throw Error('Rotated manifest exceeds size limit');fs.writeFileSync(newManifest,body,{flag:'wx',mode:0o600});await files.encryptFile(newManifest,path.join(destination.directory,'manifest.gcm'),newKey,original.id+':'+environment+':manifest');
  fs.copyFileSync(path.join(directory,'complete.json'),path.join(destination.directory,'complete.json'),fs.constants.COPYFILE_EXCL);files.durable(path.join(destination.directory,'complete.json'));
  const verified=await inspectBackup({environment,directory:destination.directory,key:newKey});if(verified.id!==original.id||verified.createdAt!==original.createdAt||verified.postgresBytes!==original.postgresBytes||JSON.stringify(verified.journalRoles)!==JSON.stringify(original.journalRoles))throw Error('Rotated archive snapshot mismatch');if(JSON.stringify(await inventory(directory,original.journalRoles))!==JSON.stringify(before))throw Error('Source archive changed during key rotation');
  success=true;return {environment,directory:destination.directory,id:original.id,createdAt:original.createdAt,rotatedAt,journalRoles:verified.journalRoles,integrity:'verified',source:'preserved',activation:'unchanged',interpretation:'New encryption preserves capture identity/time and snapshot contents. Retain independent custody and test restore before retiring any old key/archive; rotation does not create a fresh capture or prove off-host recovery'};
 }finally{try{files.clean(scratch);}finally{if(destination&&!success)files.clean(destination);}}
}
module.exports={rotateBackupKey};
