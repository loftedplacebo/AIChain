'use strict';
const os=require('node:os');
const {recoveryFiles:files}=require('./recovery.cjs');
const {downloadBackupSet,validateTransferPolicy}=require('./backup-object-storage.cjs');
const roles=['worker','rules','indexer','relayer'];

async function checkRemoteBackup({environment,bucket,keyPrefix,key,client,maxAgeHours=24,requiredJournalRoles=[]}){
 if(!Number.isInteger(maxAgeHours)||maxAgeHours<1||maxAgeHours>720||!Array.isArray(requiredJournalRoles)||new Set(requiredJournalRoles).size!==requiredJournalRoles.length||requiredJournalRoles.some(role=>!roles.includes(role)))throw Error('Invalid remote backup monitoring policy');
 validateTransferPolicy({environment,bucket,prefix:keyPrefix,key,client});
 const scratch=files.freshDirectory(os.tmpdir(),'ov-remote-check-');
 try{
  let verified;try{verified=await downloadBackupSet({environment,bucket,keyPrefix,outputRoot:scratch.directory,key,client});}
  catch{return {environment,status:'not-ready',reason:'remote-verification-failed',scope:'Exact remote backup set only; no restore or retention proof'};}
  const ageSeconds=Math.max(0,Math.floor((Date.now()-Date.parse(verified.createdAt))/1000)),missingJournalRoles=requiredJournalRoles.filter(role=>!verified.journalRoles.includes(role));
  const freshness=ageSeconds>=maxAgeHours*3600?'stale':'fresh';
  return {environment,status:freshness==='fresh'&&!missingJournalRoles.length?'ready':'not-ready',reason:missingJournalRoles.length?'missing-journals':freshness==='stale'?'stale-backup':'verified',createdAt:verified.createdAt,ageSeconds,freshness,journalRoles:verified.journalRoles,missingJournalRoles,scope:'Exact remote backup set only; no restore or retention proof'};
 }finally{files.clean(scratch);}
}
module.exports={checkRemoteBackup};
