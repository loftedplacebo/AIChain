const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {DatabaseSync,backup}=require('node:sqlite');
const {randomBytes,randomUUID,createHash,createCipheriv,createDecipheriv}=require('node:crypto');
const {pipeline}=require('node:stream/promises');
const {Transform}=require('node:stream');
const MAGIC=Buffer.from('OVBK1'),MAX_BYTES=512*1024*1024;
const ROLES=['events','control','rules','worker','indexer','relayer'];
function keyCheck(key){if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('A separate 32-byte backup key is required');}
function stageCheck(stage){if(!['dev','test'].includes(stage))throw new Error('SQLite recovery tooling is limited to dev/test; production recovery remains gated');}
function privateDirectory(directory){
 fs.chmodSync(directory,0o700);
 if(process.platform==='win32'){
  const who=spawnSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}),sid=who.stdout?.match(/S-1-[0-9-]+/)?.[0];
  if(who.status!==0||!sid)throw new Error('Cannot establish private recovery directory');
  const secured=spawnSync('icacls',[directory,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`],{windowsHide:true,stdio:'ignore'});
  if(secured.status!==0)throw new Error('Cannot protect recovery directory');
 }
}
function freshDirectory(root,prefix){fs.mkdirSync(root,{recursive:true});const base=fs.realpathSync(root),directory=fs.mkdtempSync(path.join(base,prefix));try{privateDirectory(directory);return {base,directory};}catch(e){fs.rmdirSync(directory);throw e;}}
function clean({base,directory}){const resolved=fs.realpathSync(directory),relative=path.relative(base,resolved);if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||path.dirname(relative)!=='.')throw new Error('Unsafe recovery cleanup target');fs.rmSync(resolved,{recursive:true,force:true});}
function durable(file){const fd=fs.openSync(file,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function limitBytes(max){let size=0;return new Transform({transform(chunk,encoding,callback){size+=chunk.length;callback(size>max?new Error('Recovery size limit exceeded'):null,chunk);}});}
function regular(file){if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw new Error('Recovery source must be a regular file');}
function sqliteInspection(file,environment){
 const db=new DatabaseSync(file,{readOnly:true});try{
  if(db.prepare('PRAGMA page_count').get().page_count*db.prepare('PRAGMA page_size').get().page_size>MAX_BYTES)throw new Error('Recovery size limit exceeded');
  const result=db.prepare('PRAGMA integrity_check').all();if(result.length!==1||Object.values(result[0])[0]!=='ok')throw new Error('SQLite integrity check failed');
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite foreign key check failed');
  const rows=db.prepare('SELECT name FROM governance_environment').all();if(rows.length!==1||rows[0].name!==environment)throw new Error('Recovery database environment mismatch');
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return tables.map(({name})=>({name,rows:db.prepare('SELECT count(*) n FROM "'+name.replaceAll('"','""')+'"').get().n}));
 }finally{db.close();}
}
async function digestFile(file){const digest=createHash('sha256');for await(const chunk of fs.createReadStream(file))digest.update(chunk);return digest.digest('hex');}
async function encryptFile(source,target,key,aad){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(aad));
 fs.writeFileSync(target,Buffer.concat([MAGIC,nonce]),{flag:'wx',mode:0o600});
 await pipeline(fs.createReadStream(source),limitBytes(MAX_BYTES),cipher,fs.createWriteStream(target,{flags:'a'}));
 fs.appendFileSync(target,cipher.getAuthTag());durable(target);
}
async function decryptFile(source,target,key,aad,max=MAX_BYTES){
 regular(source);const size=fs.statSync(source).size;if(size<33||size>max+33)throw new Error('Invalid encrypted backup size');
 const fd=fs.openSync(source,'r'),header=Buffer.alloc(17),tag=Buffer.alloc(16);try{fs.readSync(fd,header,0,17,0);fs.readSync(fd,tag,0,16,size-16);}finally{fs.closeSync(fd);}
 if(!header.subarray(0,5).equals(MAGIC))throw new Error('Unknown backup format');
 const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(5));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(tag);
 await pipeline(fs.createReadStream(source,{start:17,end:size-17}),decipher,limitBytes(max),fs.createWriteStream(target,{flags:'wx',mode:0o600}));durable(target);
}
async function createBackup({environment,files,outputRoot,key,consistency}){
 stageCheck(environment);keyCheck(key);
 if(consistency!=='quiesced')throw new Error('Stop all writers and acknowledge quiesced capture before multi-database backup');
 if(!Array.isArray(files)||!files.length||files.length>6||files.some(f=>!ROLES.includes(f.role)||typeof f.path!=='string'||f.path===':memory:')||new Set(files.map(f=>f.role)).size!==files.length||new Set(files.map(f=>fs.realpathSync(f.path))).size!==files.length)throw new Error('Explicit unique database roles/paths required');
 const destination=freshDirectory(outputRoot,'backup-'),scratch=freshDirectory(os.tmpdir(),'ov-backup-');let succeeded=false;
 try{
  const id=randomUUID(),createdAt=new Date().toISOString(),manifest={version:1,id,environment,createdAt,consistency,files:[]};
  for(const item of files){
   regular(item.path);sqliteInspection(item.path,environment);const snapshot=path.join(scratch.directory,item.role+'.sqlite'),source=new DatabaseSync(item.path,{readOnly:true});
   try{await backup(source,snapshot);}finally{source.close();}
   const bytes=fs.statSync(snapshot).size;if(bytes>MAX_BYTES)throw new Error('Recovery size limit exceeded');
   const tables=sqliteInspection(snapshot,environment),sha256=await digestFile(snapshot);await encryptFile(snapshot,path.join(destination.directory,item.role+'.gcm'),key,[id,environment,item.role].join(':'));
   manifest.files.push({role:item.role,bytes,sha256,tables});fs.unlinkSync(snapshot);
  }
  const manifestText=JSON.stringify(manifest);if(Buffer.byteLength(manifestText)>65536)throw new Error('Backup manifest size limit exceeded');
  const manifestFile=path.join(scratch.directory,'manifest.json');fs.writeFileSync(manifestFile,manifestText,{mode:0o600});
  await encryptFile(manifestFile,path.join(destination.directory,'manifest.gcm'),key,[id,environment,'manifest'].join(':'));
  fs.writeFileSync(path.join(destination.directory,'complete.json'),JSON.stringify({version:1,id,environment,createdAt}),{flag:'wx',mode:0o600});durable(path.join(destination.directory,'complete.json'));
  succeeded=true;return {directory:destination.directory,id,environment,files:manifest.files.length,createdAt,consistency};
 }finally{clean(scratch);if(!succeeded)clean(destination);}
}
function invalidateRestoredAccess(file){
 const db=new DatabaseSync(file);try{
  // Restores are offline snapshots. Leave them in DELETE mode so read-only
  // inspection does not create WAL/SHM sidecars and invalidate later review.
  db.exec('PRAGMA journal_mode=DELETE');
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));db.exec('BEGIN IMMEDIATE');
  for(const table of ['workspace_active_auth','workspace_auth_reauth','workspace_sessions','workspace_provider_sessions','workspace_provider_refresh','workspace_refresh_claims','workspace_auth_flows'])if(tables.has(table))db.exec('DELETE FROM '+table);
  if(tables.has('project_api_keys'))db.prepare('UPDATE project_api_keys SET revoked_at=?').run(Date.now());
  if(tables.has('customer_invitations'))db.prepare('UPDATE customer_invitations SET revoked=?').run(Date.now());
  if(tables.has('customer_identities'))db.exec('UPDATE customer_identities SET disabled=1,version=version+1');
  db.exec("CREATE TABLE IF NOT EXISTS governance_recovery_gate(singleton INTEGER PRIMARY KEY CHECK(singleton=1),state TEXT NOT NULL); INSERT OR REPLACE INTO governance_recovery_gate VALUES(1,'review-required'); COMMIT;");
 }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}finally{db.close();}
}
async function restoreBackup({environment,directory,outputRoot,key}){
 stageCheck(environment);keyCheck(key);regular(path.join(directory,'complete.json'));if(fs.statSync(path.join(directory,'complete.json')).size>4096)throw new Error('Invalid backup marker');
 const marker=JSON.parse(fs.readFileSync(path.join(directory,'complete.json'),'utf8'));
 if(marker.version!==1||marker.environment!==environment||typeof marker.id!=='string'||!/^[a-f0-9-]{36}$/.test(marker.id))throw new Error('Backup environment or format mismatch');
 const destination=freshDirectory(outputRoot,'restore-');let succeeded=false;
 try{
  const manifestPath=path.join(destination.directory,'manifest.json');await decryptFile(path.join(directory,'manifest.gcm'),manifestPath,key,[marker.id,environment,'manifest'].join(':'),65536);
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));fs.unlinkSync(manifestPath);
  if(manifest.version!==1||manifest.id!==marker.id||manifest.environment!==environment||manifest.consistency!=='quiesced'||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>6||new Set(manifest.files.map(f=>f.role)).size!==manifest.files.length)throw new Error('Invalid authenticated backup manifest');
  for(const item of manifest.files){
   if(!ROLES.includes(item.role)||!Number.isSafeInteger(item.bytes)||item.bytes<0||item.bytes>MAX_BYTES||!/^[a-f0-9]{64}$/.test(item.sha256))throw new Error('Invalid backup entry');
   const file=path.join(destination.directory,item.role+'.sqlite');await decryptFile(path.join(directory,item.role+'.gcm'),file,key,[marker.id,environment,item.role].join(':'));
   if(fs.statSync(file).size!==item.bytes||await digestFile(file)!==item.sha256||JSON.stringify(sqliteInspection(file,environment))!==JSON.stringify(item.tables))throw new Error('Restored snapshot does not match authenticated manifest');
   invalidateRestoredAccess(file);durable(file);
  }
  const result={version:1,backupId:marker.id,environment,restoredAt:new Date().toISOString(),files:manifest.files.map(f=>f.role),access:'revoked-and-disabled',activation:'review-required'};
  fs.writeFileSync(path.join(destination.directory,'recovery.json'),JSON.stringify(result),{flag:'wx',mode:0o600});durable(path.join(destination.directory,'recovery.json'));
  succeeded=true;return {directory:destination.directory,...result};
 }finally{if(!succeeded)clean(destination);}
}
// Review is deliberately read-only. Passing does not authorise service activation,
// identity recovery, publisher replay or reuse of credentials from the backup.
function reviewRestore({environment,directory}){
 stageCheck(environment);
 const markerFile=path.join(directory,'recovery.json');regular(markerFile);
 if(fs.statSync(markerFile).size>4096)throw new Error('Invalid recovery marker');
 const marker=JSON.parse(fs.readFileSync(markerFile,'utf8'));
 if(marker.version!==1||marker.environment!==environment||marker.activation!=='review-required'||marker.access!=='revoked-and-disabled'||typeof marker.backupId!=='string'||!/^[a-f0-9-]{36}$/.test(marker.backupId)||!Array.isArray(marker.files)||!marker.files.length||marker.files.length>6||new Set(marker.files).size!==marker.files.length||marker.files.some(role=>!ROLES.includes(role)))throw new Error('Invalid recovery marker');
 const actual=fs.readdirSync(directory).sort(),expected=['recovery.json',...marker.files.map(role=>role+'.sqlite')].sort();
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Recovery directory contains unexpected or missing files; stop writers before review');
 const files=marker.files.map(role=>{
  const file=path.join(directory,role+'.sqlite');regular(file);
  const tables=sqliteInspection(file,environment),names=new Set(tables.map(t=>t.name)),db=new DatabaseSync(file,{readOnly:true});
  try{
   if(!names.has('governance_recovery_gate'))throw new Error('Recovery activation gate missing');
   const gate=db.prepare('SELECT state FROM governance_recovery_gate').all();
   if(gate.length!==1||gate[0].state!=='review-required')throw new Error('Recovery activation gate changed');
   for(const table of ['workspace_active_auth','workspace_auth_reauth','workspace_sessions','workspace_provider_sessions','workspace_provider_refresh','workspace_refresh_claims','workspace_auth_flows'])if(names.has(table)&&db.prepare('SELECT count(*) n FROM '+table).get().n)throw new Error('Restored authentication state is not empty');
   if(names.has('project_api_keys')&&db.prepare('SELECT count(*) n FROM project_api_keys WHERE revoked_at IS NULL OR revoked_at<=0 OR revoked_at>?').get(Date.now()).n)throw new Error('Restored API keys are not all revoked');
   if(names.has('customer_invitations')&&db.prepare('SELECT count(*) n FROM customer_invitations WHERE revoked IS NULL OR revoked<=0').get().n)throw new Error('Restored invitations are not all revoked');
   if(names.has('customer_identities')&&db.prepare('SELECT count(*) n FROM customer_identities WHERE disabled IS NULL OR disabled<>1').get().n)throw new Error('Restored identities are not all disabled');
   return {role,bytes:fs.statSync(file).size,integrity:'ok',environment,activation:'review-required',authentication:'revoked-and-disabled',tables:tables.length};
  }finally{db.close();}
 });
 return {version:1,backupId:marker.backupId,environment,review:'passed',activation:'review-required',files};
}
module.exports={createBackup,restoreBackup,sqliteInspection,reviewRestore,
 recoveryFiles:{keyCheck,privateDirectory,freshDirectory,clean,durable,regular,digestFile,encryptFile,decryptFile,MAX_BYTES}};
