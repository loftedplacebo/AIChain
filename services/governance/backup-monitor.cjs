'use strict';
const fs=require('node:fs'),path=require('node:path');
const roles=['worker','rules','indexer','relayer'];
async function checkBackupSet({environment,root,key,maxAgeHours=24,requiredJournalRoles=[],maxArchives=32},inspect=require('./postgres-backup.cjs').inspectBackup){
 if(!['dev','test'].includes(environment)||typeof root!=='string'||!path.isAbsolute(root)||!Number.isInteger(maxArchives)||maxArchives<1||maxArchives>64||!Number.isInteger(maxAgeHours)||maxAgeHours<1||maxAgeHours>720||!Array.isArray(requiredJournalRoles)||new Set(requiredJournalRoles).size!==requiredJournalRoles.length||requiredJournalRoles.some(role=>!roles.includes(role)))throw Error('Invalid backup monitoring configuration');
 const state={status:'not-ready',environment,scope:'Authenticated archives only; no restore, off-host custody or release proof',scanned:0,invalidArchives:0,incompleteArchives:0,latest:null};
 const stat=fs.lstatSync(root);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Regular backup root required');
 const entries=fs.readdirSync(root,{withFileTypes:true});
 if(entries.length>maxArchives)return {...state,reason:'inventory-limit'};
 if(!entries.length)return {...state,reason:'missing-backup'};
 const verified=[];
 for(const entry of entries){
  // Capture roots are dedicated; unrelated files/symlinks are operational errors.
  if(!entry.isDirectory()||entry.isSymbolicLink()||!/^pg-backup-[A-Za-z0-9-]+$/.test(entry.name)){state.invalidArchives++;continue;}
  const directory=path.join(root,entry.name);state.scanned++;
  try{fs.lstatSync(path.join(directory,'complete.json'));}catch(error){if(error.code==='ENOENT'){state.incompleteArchives++;continue;}state.invalidArchives++;continue;}
  try{const result=await inspect({environment,directory,key,maxAgeHours});if(result.integrity!=='verified'||result.environment!==environment||!Number.isFinite(Date.parse(result.createdAt))||!Array.isArray(result.journalRoles)||!['fresh','stale'].includes(result.freshness))throw Error();verified.push(result);}catch{state.invalidArchives++;}
 }
 verified.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const latest=verified[0];
 if(latest)state.latest={createdAt:latest.createdAt,ageSeconds:latest.ageSeconds,freshness:latest.freshness,journalRoles:latest.journalRoles};
 // Never fall back to an older complete bundle when the newest lacks a journal.
 const missingJournalRoles=latest?requiredJournalRoles.filter(role=>!latest.journalRoles.includes(role)):requiredJournalRoles;
 return {...state,status:latest&&latest.freshness==='fresh'&&!missingJournalRoles.length&&!state.invalidArchives&&!state.incompleteArchives?'ready':'not-ready',missingJournalRoles,reason:state.invalidArchives?'invalid-archive':state.incompleteArchives?'incomplete-archive':!latest?'missing-backup':missingJournalRoles.length?'missing-journals':latest.freshness==='stale'?'stale-backup':'verified'};
}
module.exports={checkBackupSet};
