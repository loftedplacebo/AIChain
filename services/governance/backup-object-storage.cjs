'use strict';
// Offline transfer only. Object credentials and the archive decryption key are
// separate. No bucket creation, object deletion, scheduler or service release.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {S3Client,PutObjectCommand,GetObjectCommand,ListObjectsV2Command}=require('@aws-sdk/client-s3');
const {recoveryFiles:files}=require('./recovery.cjs'),{inspectBackup}=require('./postgres-backup.cjs'),{inventory}=require('./backup-custody-copy.cjs');
const roles=['worker','rules','indexer','relayer'];
const safePrefix=value=>typeof value==='string'&&value.length<=240&&value.split('/').every(part=>/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(part)&&part!=='.'&&part!=='..');
const bucketName=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value);
const knownFiles=journalRoles=>['postgres.gcm','manifest.gcm',...(journalRoles.length?['journals/manifest.gcm',...journalRoles.map(role=>'journals/'+role+'.gcm'),'journals/complete.json']:[]),'complete.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const generatedSetName=/^[a-f0-9-]{36}-[a-f0-9-]{36}$/;

function createStorageClient({endpoint,region,accessKeyId,secretAccessKey}){
 if(typeof endpoint!=='string'||typeof region!=='string'||!/^[a-z0-9-]{2,40}$/.test(region)||typeof accessKeyId!=='string'||!accessKeyId||typeof secretAccessKey!=='string'||!secretAccessKey)throw Error('Explicit object-storage endpoint, region and credentials required');
 let url;try{url=new URL(endpoint);}catch{throw Error('Invalid object-storage endpoint');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(url.hostname)||url.hostname.includes('..')||url.hostname==='localhost'||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname))throw Error('Object-storage endpoint must be an exact public HTTPS origin');
 return new S3Client({endpoint:url.origin,region,credentials:{accessKeyId,secretAccessKey},forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:1});
}
function transferPolicy({environment,bucket,prefix,client,key}){
 if(!['dev','test'].includes(environment)||!bucketName(bucket)||!safePrefix(prefix)||!client||typeof client.send!=='function')throw Error('Explicit bounded object-storage transfer required');files.keyCheck(key);
}
function discoveryPolicy({environment,bucket,prefix,client}){
 if(!['dev','test'].includes(environment)||!bucketName(bucket)||!safePrefix(prefix)||!client||typeof client.send!=='function')throw Error('Explicit bounded object-storage discovery required');
}
async function discoverBackupPrefixes({environment,bucket,prefix,client}){
 discoveryPolicy({environment,bucket,prefix,client});
 const base=prefix+'/'+environment+'/',candidates=new Set(),seenTokens=new Set();let token,objects=0,pages=0;
 do{
  if(++pages>20)throw Error('Object-storage discovery exceeds page limit');
  const result=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:base,MaxKeys:1000,...(token?{ContinuationToken:token}:{})}));
  if(!result||result.Contents!==undefined&&!Array.isArray(result.Contents)||result.Contents?.length>1000)throw Error('Invalid object-storage listing');
  for(const item of result.Contents||[]){
   if(++objects>10000||typeof item?.Key!=='string'||!item.Key.startsWith(base))throw Error('Invalid or oversized object-storage listing');
   if(!item.Key.endsWith('/complete.json'))continue;
   const name=item.Key.slice(base.length,-'/complete.json'.length);
   if(!generatedSetName.test(name))continue;
   candidates.add(base+name);
   if(candidates.size>1000)throw Error('Object-storage discovery exceeds candidate limit');
  }
  if(!result.IsTruncated)break;
  if(typeof result.NextContinuationToken!=='string'||!result.NextContinuationToken||seenTokens.has(result.NextContinuationToken))throw Error('Invalid object-storage continuation');
  token=result.NextContinuationToken;seenTokens.add(token);
 }while(true);
 return {environment,bucket,prefix,candidates:[...candidates].sort(),candidateStatus:'unverified-completion-marker',pages,objectsScanned:objects,scope:'Exact-prefix candidates only; authenticate a downloaded set before restore'};
}
async function smallObject(client,bucket,objectKey,max){
 const response=await client.send(new GetObjectCommand({Bucket:bucket,Key:objectKey}));if(!response.Body||typeof response.Body[Symbol.asyncIterator]!=='function')throw Error('Object-storage response has no readable body');
 const chunks=[];let total=0;for await(const chunk of response.Body){const bytes=Buffer.from(chunk);total+=bytes.length;if(total>max)throw Error('Object-storage response exceeds limit');chunks.push(bytes);}return Buffer.concat(chunks);
}
async function downloadFile(client,bucket,objectKey,target,expected){
 const response=await client.send(new GetObjectCommand({Bucket:bucket,Key:objectKey}));if(!response.Body||typeof response.Body[Symbol.asyncIterator]!=='function')throw Error('Object-storage response has no readable body');
 const hash=createHash('sha256');let bytes=0;await pipeline(response.Body,new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>expected.bytes)return callback(Error('Downloaded backup exceeds expected size'));hash.update(chunk);callback(null,chunk);}}),fs.createWriteStream(target,{flags:'wx',mode:0o600}));
 if(bytes!==expected.bytes||hash.digest('hex')!==expected.sha256)throw Error('Downloaded backup object digest mismatch');files.durable(target);
}
async function uploadBackupSet({environment,directory,bucket,prefix,key,client}){
 transferPolicy({environment,bucket,prefix,key,client});if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Absolute source archive required');
 const stat=fs.lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Regular source archive required');
 const source=fs.realpathSync(directory),verified=await inspectBackup({environment,directory:source,key}),before=await inventory(source,verified.journalRoles),names=knownFiles(verified.journalRoles);
 const keyPrefix=prefix+'/'+environment+'/'+verified.id+'-'+randomUUID();
 const index={version:1,kind:'orvessian-encrypted-backup',environment,id:verified.id,createdAt:verified.createdAt,journalRoles:verified.journalRoles,files:before};
 const indexBytes=Buffer.from(JSON.stringify(index));if(indexBytes.length>65536)throw Error('Object-storage index exceeds limit');
 // The archive completion marker is written last; partial uploads are never
 // selected as complete. We do not erase partial objects automatically.
 for(const name of names.filter(n=>n!=='complete.json')){
  await client.send(new PutObjectCommand({Bucket:bucket,Key:keyPrefix+'/'+name,Body:fs.createReadStream(path.join(source,name)),ContentLength:before[name].bytes,Metadata:{sha256:before[name].sha256}}));
 }
 await client.send(new PutObjectCommand({Bucket:bucket,Key:keyPrefix+'/index.json',Body:indexBytes,ContentLength:indexBytes.length}));
 if(JSON.stringify(before)!==JSON.stringify(await inventory(source,verified.journalRoles)))throw Error('Source archive changed during object upload');
 const marker=fs.readFileSync(path.join(source,'complete.json'));if(sha(marker)!==before['complete.json'].sha256)throw Error('Source completion marker changed during object upload');
 await client.send(new PutObjectCommand({Bucket:bucket,Key:keyPrefix+'/complete.json',Body:marker,ContentLength:marker.length}));
 return {environment,bucket,keyPrefix,id:verified.id,createdAt:verified.createdAt,objects:names.length+1,upload:'complete-marker-written',remoteRestore:'not-tested'};
}
async function downloadBackupSet({environment,bucket,keyPrefix,outputRoot,key,client}){
 transferPolicy({environment,bucket,prefix:keyPrefix,key,client});if(typeof outputRoot!=='string'||!path.isAbsolute(outputRoot))throw Error('Absolute restore download root required');
 const rootStat=fs.lstatSync(outputRoot);if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||fs.existsSync(path.join(outputRoot,'complete.json')))throw Error('Regular dedicated download root required');
 const marker=await smallObject(client,bucket,keyPrefix+'/complete.json',4096),indexBytes=await smallObject(client,bucket,keyPrefix+'/index.json',65536);let index;
 try{index=JSON.parse(indexBytes.toString('utf8'));}catch{throw Error('Invalid object-storage index');}
 if(index?.version!==1||index.kind!=='orvessian-encrypted-backup'||index.environment!==environment||typeof index.id!=='string'||!/^[a-f0-9-]{36}$/.test(index.id)||!Array.isArray(index.journalRoles)||index.journalRoles.length>4||new Set(index.journalRoles).size!==index.journalRoles.length||index.journalRoles.some(role=>!roles.includes(role)))throw Error('Object-storage index identity invalid');
 const names=knownFiles(index.journalRoles),expected=index.files;if(!expected||typeof expected!=='object'||Array.isArray(expected)||JSON.stringify(Object.keys(expected).sort())!==JSON.stringify(names.slice().sort()))throw Error('Object-storage file inventory invalid');
 for(const name of names){const entry=expected[name];if(!entry||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>files.MAX_BYTES+33||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Object-storage file metadata invalid');}
 if(marker.length!==expected['complete.json'].bytes||sha(marker)!==expected['complete.json'].sha256)throw Error('Object-storage completion marker mismatch');
 const destination=files.freshDirectory(outputRoot,'pg-backup-');let success=false;
 try{
  for(const name of names.filter(n=>n!=='complete.json')){
   if(name.startsWith('journals/'))fs.mkdirSync(path.join(destination.directory,'journals'),{recursive:true});
   await downloadFile(client,bucket,keyPrefix+'/'+name,path.join(destination.directory,name),expected[name]);
  }
  fs.writeFileSync(path.join(destination.directory,'complete.json'),marker,{flag:'wx',mode:0o600});files.durable(path.join(destination.directory,'complete.json'));
  const actual=await inventory(destination.directory,index.journalRoles),verified=await inspectBackup({environment,directory:destination.directory,key});
  if(JSON.stringify(actual)!==JSON.stringify(expected)||verified.id!==index.id||verified.createdAt!==index.createdAt||JSON.stringify(verified.journalRoles)!==JSON.stringify(index.journalRoles))throw Error('Downloaded archive identity mismatch');
  success=true;return {environment,directory:destination.directory,id:verified.id,createdAt:verified.createdAt,journalRoles:verified.journalRoles,integrity:'verified',remoteRestore:'not-tested'};
 }finally{if(!success)files.clean(destination);}
}
module.exports={createStorageClient,uploadBackupSet,downloadBackupSet,discoverBackupPrefixes,validateTransferPolicy:transferPolicy};
