'use strict';
// Non-secret topology review only. Does not resolve credentials or approve release.
const stages=['dev','test','prod'];
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
 if(!exact(plan,['schemaVersion','environments'],'plan',errors)||plan.schemaVersion!==6){return {valid:false,releaseReady:false,errors:errors.length?errors:['plan: unsupported schema']};}
 if(!Array.isArray(plan.environments)||plan.environments.length!==3)return {valid:false,releaseReady:false,errors:['plan: exactly dev, test and prod required']};
 const seen=new Set();
 for(const env of plan.environments){
  if(!exact(env,['stage','hosting','portal','database','identity','secrets','evidence','backup'],'environment',errors))continue;
  const stage=env.stage;if(!stages.includes(stage)||seen.has(stage)){errors.push('environment: invalid or repeated stage');continue;}seen.add(stage);
  const hosted=stage==='prod'||stage==='test'&&['origin','apiOrigin'].some(field=>typeof env.portal?.[field]==='string'&&env.portal[field].startsWith('https:'));
  if(exact(env.hosting,['appProvider','appRegion','appInstanceRef','appTopology','appServiceRef','databaseProvider','databaseRegion','databaseClusterRef','databaseTopology','backupProvider','backupRegion','backupAccountRef','operatorRef'],'hosting',errors)){
   const hosting=env.hosting;
   for(const field of ['appProvider','appRegion','appInstanceRef','appServiceRef','databaseProvider','databaseRegion','databaseClusterRef','backupProvider','backupRegion','backupAccountRef','operatorRef'])if(!scalar(hosting[field]))errors.push(stage+': invalid hosting '+field);
   if(!['own-instance','shared-with-test'].includes(hosting.appTopology)||stage!=='prod'&&hosting.appTopology!=='own-instance')errors.push(stage+': invalid application topology');
   if(!['own-cluster','shared-with-test'].includes(hosting.databaseTopology)||stage!=='prod'&&hosting.databaseTopology!=='own-cluster')errors.push(stage+': invalid database topology');
   if(hosted&&scalar(hosting.backupProvider)&&[hosting.appProvider,hosting.databaseProvider].some(provider=>scalar(provider)&&provider.toLowerCase()===hosting.backupProvider.toLowerCase()))errors.push(stage+': backup provider must be independent of application and database providers');
   if(scalar(hosting.appInstanceRef)&&hosting.appTopology!=='shared-with-test')unique('application instance',hosting.appInstanceRef,stage);
   if(scalar(hosting.appServiceRef))unique('application service',hosting.appServiceRef,stage);
   if(scalar(hosting.databaseClusterRef)&&hosting.databaseTopology!=='shared-with-test')unique('database cluster',hosting.databaseClusterRef,stage);
   if(scalar(hosting.backupAccountRef))unique('backup account',hosting.backupAccountRef,stage);
  }
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
   const hostedLocalTest=stage==='test'&&db.host==='127.0.0.1'&&env.hosting?.appProvider==='contabo'&&env.hosting?.databaseProvider==='contabo'&&env.hosting?.databaseTopology==='own-cluster';
   if(typeof db.host!=='string'||!/^[a-z0-9.-]+$/.test(db.host)||hosted&&localDatabase(db.host)&&!hostedLocalTest||!Number.isInteger(db.port)||db.port<1||db.port>65535||![db.name,db.apiRole,db.workerRole,db.migrationRole].every(v=>typeof v==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(v)))errors.push(stage+': invalid database endpoint or role');
   else unique('database',db.host+':'+db.port+'/'+db.name,stage);
   if(new Set([db.apiRole,db.workerRole,db.migrationRole]).size!==3)errors.push(stage+': API, worker and migration roles must differ');
   if(!['local','verify-full'].includes(db.tls)||hosted&&db.tls!=='verify-full'&&!(hostedLocalTest&&db.tls==='local')||hostedLocalTest&&db.tls!=='local')errors.push(stage+': hosted PostgreSQL requires verified TLS outside same-host loopback');
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
  if(exact(env.evidence,['mode','chainId','recordingAddress','relayerAddress','workerJournal'],'evidence',errors)){
   const evidence=env.evidence,pending=stage==='prod'&&evidence.mode==='undecided';
   if(pending){
    if(evidence.chainId!==null||evidence.recordingAddress!==null||evidence.relayerAddress!==null)errors.push(stage+': undecided evidence must not declare a chain or keys');
   }else{
    if(evidence.mode!==(stage==='prod'?'base-mainnet':'base-sepolia')||evidence.chainId!==(stage==='prod'?8453:84532))errors.push(stage+': invalid Base chain selection');
    for(const field of ['recordingAddress','relayerAddress'])if(typeof evidence[field]!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(evidence[field])||/^0x0{40}$/i.test(evidence[field]))errors.push(stage+': invalid evidence address');else unique('signing address',evidence[field].toLowerCase(),stage);
   }
   if(!scalar(env.evidence.workerJournal))errors.push(stage+': invalid worker journal reference');else unique('worker journal',env.evidence.workerJournal,stage);
  }
  if(exact(env.backup,['destination','custody','retentionDays','rpoMinutes','rtoMinutes'],'backup',errors)){
   if(!scalar(env.backup.destination))errors.push(stage+': invalid backup destination');else unique('backup destination',env.backup.destination,stage);
   if(!['local-synthetic','independent-storage'].includes(env.backup.custody)||hosted&&env.backup.custody!=='independent-storage')errors.push(stage+': hosted backup requires independent storage');
   for(const field of ['retentionDays','rpoMinutes','rtoMinutes'])if(!Number.isSafeInteger(env.backup[field])||env.backup[field]<1||env.backup[field]>525600)errors.push(stage+': invalid backup objective');
  }
 }
 const test=plan.environments.find(env=>env?.stage==='test'),prod=plan.environments.find(env=>env?.stage==='prod');
 if(prod?.hosting?.appTopology==='shared-with-test'){
  if(!test?.hosting||test.hosting.appTopology!=='own-instance'||
   prod.hosting.appInstanceRef!==test.hosting.appInstanceRef||
   prod.hosting.appProvider!==test.hosting.appProvider||
   prod.hosting.appRegion!==test.hosting.appRegion||
   prod.hosting.appServiceRef===test.hosting.appServiceRef)
   errors.push('prod: shared application host requires matching test instance and distinct service');
 }
 if(prod?.hosting?.databaseTopology==='shared-with-test'){
  if(!test||!prod.database||!test.database||!test.hosting||test.hosting.databaseTopology!=='own-cluster'||
   prod.hosting.databaseClusterRef!==test.hosting.databaseClusterRef||
   prod.hosting.databaseProvider!==test.hosting.databaseProvider||
   prod.hosting.databaseRegion!==test.hosting.databaseRegion||
   prod.database.host!==test.database.host||prod.database.port!==test.database.port||
   prod.database.name===test.database.name||
   [prod.database.apiRole,prod.database.workerRole,prod.database.migrationRole].some(role=>
    [test.database.apiRole,test.database.workerRole,test.database.migrationRole].includes(role)))
   errors.push('prod: shared cluster requires matching test endpoint and distinct databases and runtime roles');
 }
 return {valid:errors.length===0&&seen.size===3,releaseReady:false,errors};
}
module.exports={validatePlan};
