'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createStorageClient,discoverBackupPrefixes}=require('./backup-object-storage.cjs');
const {ListObjectsV2Command}=require('@aws-sdk/client-s3');
test('object-storage client requires exact public HTTPS endpoint and explicit credentials',()=>{
 const config={endpoint:'https://s3.eu-central-003.backblazeb2.com',region:'eu-central-003',accessKeyId:'synthetic-id',secretAccessKey:'synthetic-secret'};
 const client=createStorageClient(config);client.destroy();
 for(const endpoint of ['http://s3.example.test','https://localhost','https://127.0.0.1','https://s3.example.test/path','https://user:pass@s3.example.test','https://s3.example.test/?region=other'])assert.throws(()=>createStorageClient({...config,endpoint}));
 for(const altered of [{region:''},{accessKeyId:''},{secretAccessKey:''}])assert.throws(()=>createStorageClient({...config,...altered}));
});
test('remote discovery returns bounded unverified completion-marker candidates without a local pointer',async()=>{
 const first='11111111-1111-4111-8111-111111111111-22222222-2222-4222-8222-222222222222';
 const second='33333333-3333-4333-8333-333333333333-44444444-4444-4444-8444-444444444444';
 const calls=[],client={send:async command=>{
  assert.ok(command instanceof ListObjectsV2Command);calls.push(command.input);
  return calls.length===1?{Contents:[{Key:`pilot/test/${first}/postgres.gcm`},{Key:`pilot/test/${first}/complete.json`},{Key:'pilot/test/partial/index.json'}],IsTruncated:true,NextContinuationToken:'page-2'}:{Contents:[{Key:`pilot/test/${second}/complete.json`},{Key:`pilot/test/${first}/complete.json`}],IsTruncated:false};
 }};
 const result=await discoverBackupPrefixes({environment:'test',bucket:'synthetic-backups',prefix:'pilot',client});
 assert.deepEqual(result.candidates,[`pilot/test/${first}`,`pilot/test/${second}`]);
 assert.equal(result.candidateStatus,'unverified-completion-marker');
 assert.equal(result.pages,2);
 assert.deepEqual(calls.map(call=>call.Prefix),['pilot/test/','pilot/test/']);
 assert.equal(calls[1].ContinuationToken,'page-2');
});
test('remote discovery rejects malformed listings and unbounded pagination',async()=>{
 const args={environment:'test',bucket:'synthetic-backups',prefix:'pilot'};
 await assert.rejects(discoverBackupPrefixes({...args,client:{send:async()=>({Contents:[{Key:'other/complete.json'}]})}}),/Invalid or oversized/);
 await assert.rejects(discoverBackupPrefixes({...args,client:{send:async()=>({Contents:[],IsTruncated:true})}}),/continuation/);
 await assert.rejects(discoverBackupPrefixes({...args,client:{send:async()=>({Contents:[],IsTruncated:true,NextContinuationToken:'same'})}}),/continuation/);
 let page=0;const thousand=Array.from({length:1000},(_,index)=>({Key:`pilot/test/partial-${index}/index.json`}));
 await assert.rejects(discoverBackupPrefixes({...args,client:{send:async()=>({Contents:thousand,IsTruncated:true,NextContinuationToken:String(++page)})}}),/object-storage listing/);
 await assert.rejects(discoverBackupPrefixes({...args,prefix:'../pilot',client:{send:async()=>{throw Error('Should not list');}}}),/discovery required/);
});
