'use strict';
// Non-secret topology review only. Does not resolve credentials or approve release.
const stages=['dev','test','staging','prod'];
const secretFields=['apiDatabase','workerDatabase','workosApi','sessionEncryption','webhookSigning','recordingSigner','relayer','backupEncryption'];
const scalar=(value)=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(value);
const loopback=host=>['localhost','127.0.0.1','[::1]'].includes(host);
const localDatabase=host=>{const name=host.toLowerCase().replace(/\.$/,'');return loopback(name)||name==='0.0.0.0'||name.startsWith('127.')||name.endsWith('.localhost')||name==='localhost.localdomain';};
const publicHost=host=>{const name=host.toLowerCase().replace(/\.$/,'');return !loopback(name)&&!name.startsWith('[')&&!/^[0-9.]+$/.test(name)&&!['.localhost','.local','.internal'].some(suffix=>name.endsWith(suffix))&&name!=='localhost.localdomain';};
function exact(value,fields,location,errors){
 if(!value||typeof value!=='object'||Array.isArray(value)){errors.push(location+': object required');return false;}
 if(Object.keys(value).some(key=>!fields.includes(key))||fields.some(key=>!Object.hasOwn(value,key))){errors.push(location+': fields do not match schema');return false;}return true;
}
function validatePlan(plan){
 const errors=[],resources=new Map();
 const unique=(kind,value,stage)=>{const key=kind+':'+value;if(resources.has(key))errors.push(stage+': '+kind+' must be separate from '+resources.get(key));else resources.set(key,stage);};
 if(!exact(plan,['schemaVersion','environments'],'plan',errors)||plan.schemaVersion!==2){return {valid:false,releaseReady:false,errors:errors.length?errors:['plan: unsupported schema']};}
 if(!Array.isArray(plan.environments)||plan.environments.length!==4)return {valid:false,releaseReady:false,errors:['plan: exactly dev, test, staging and prod required']};
 const seen=new Set();
 for(const env of plan.environments){
  if(!exact(env,['stage','portal','database','identity','secrets','evidence','backup'],'environment',errors))continue;
  const stage=env.stage;if(!stages.includes(stage)||seen.has(stage)){errors.push('environment: invalid or repeated stage');continue;}seen.add(stage);
  const hosted=['staging','prod'].includes(stage)||stage==='test'&&['origin','apiOrigin'].some(field=>typeof env.portal?.[field]==='string'&&env.portal[field].startsWith('https:'));
  let portalOrigin=null,apiOrigin=null;
  if(exact(env.portal,['origin','apiOrigin'],'portal',errors)){
   for(const field of ['origin','apiOrigin']){
    try{
     const value=env.portal[field],url=new URL(value),local=loopback(url.hostname);
     if(value!==url.origin||url.username||url.password||!['http:','https:'].includes(url.protocol)||url.protocol==='http:'&&!local||url.protocol==='https:'&&!publicHost(url.hostname)||hosted&&(url.protocol!=='https:'||!publicHost(url.hostname)))throw Error();
     unique('network origin',value,stage);if(field==='origin')portalOrigin=value;else apiOrigin=value;
    }catch{errors.push(stage+': invalid '+field);}
   }
  }
  if(exact(env.database,['host','port','name','apiRole','workerRole','migrationRole','tls'],'database',errors)){
   const db=env.database;
   if(typeof db.host!=='string'||!/^[a-z0-9.-]+$/.test(db.host)||hosted&&localDatabase(db.host)||!Number.isInteger(db.port)||db.port<1||db.port>65535||![db.name,db.apiRole,db.workerRole,db.migrationRole].every(v=>typeof v==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(v)))errors.push(stage+': invalid database endpoint or role');
   else unique('database',db.host+':'+db.port+'/'+db.name,stage);
   if(new Set([db.apiRole,db.workerRole,db.migrationRole]).size!==3)errors.push(stage+': API, worker and migration roles must differ');
   if(!['local','verify-full'].includes(db.tls)||hosted&&db.tls!=='verify-full')errors.push(stage+': hosted PostgreSQL requires verified TLS');
  }
  if(exact(env.identity,['environmentId','clientId','callbackUrl','webhookUrl'],'identity',errors)){
   if(!scalar(env.identity.environmentId)||!scalar(env.identity.clientId))errors.push(stage+': invalid provider identifiers');
   else{unique('provider environment',env.identity.environmentId,stage);unique('provider client',env.identity.clientId,stage);}
   for(const field of ['callbackUrl','webhookUrl']){
    try{const url=new URL(env.identity[field]);if(url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol)||url.protocol==='http:'&&!loopback(url.hostname)||url.protocol==='https:'&&!publicHost(url.hostname)||hosted&&(url.protocol!=='https:'||!publicHost(url.hostname)))throw Error();unique(field,url.href,stage);}catch{errors.push(stage+': invalid '+field);}
   }
   if(portalOrigin&&env.identity.callbackUrl!==portalOrigin+'/api/auth/callback')errors.push(stage+': callback must match portal origin');
   if(apiOrigin&&env.identity.webhookUrl!==apiOrigin+'/v1/auth/workos-webhook')errors.push(stage+': webhook must match API origin');
  }
  if(exact(env.secrets,secretFields,'secrets',errors)){
   for(const field of secretFields)if(!scalar(env.secrets[field]))errors.push(stage+': invalid secret reference');else unique('secret reference',env.secrets[field],stage);
  }
  if(exact(env.evidence,['chainId','recordingAddress','relayerAddress','workerJournal'],'evidence',errors)){
   if(![84532,8453].includes(env.evidence.chainId)||stage!=='prod'&&env.evidence.chainId!==84532)errors.push(stage+': invalid Base chain selection');
   for(const field of ['recordingAddress','relayerAddress'])if(typeof env.evidence[field]!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(env.evidence[field])||/^0x0{40}$/i.test(env.evidence[field]))errors.push(stage+': invalid evidence address');else unique('signing address',env.evidence[field].toLowerCase(),stage);
   if(!scalar(env.evidence.workerJournal))errors.push(stage+': invalid worker journal reference');else unique('worker journal',env.evidence.workerJournal,stage);
  }
  if(exact(env.backup,['destination','custody','retentionDays','rpoMinutes','rtoMinutes'],'backup',errors)){
   if(!scalar(env.backup.destination))errors.push(stage+': invalid backup destination');else unique('backup destination',env.backup.destination,stage);
   if(!['local-synthetic','independent-storage'].includes(env.backup.custody)||hosted&&env.backup.custody!=='independent-storage')errors.push(stage+': hosted backup requires independent storage');
   for(const field of ['retentionDays','rpoMinutes','rtoMinutes'])if(!Number.isSafeInteger(env.backup[field])||env.backup[field]<1||env.backup[field]>525600)errors.push(stage+': invalid backup objective');
  }
 }
 return {valid:errors.length===0&&seen.size===4,releaseReady:false,errors};
}
module.exports={validatePlan};
