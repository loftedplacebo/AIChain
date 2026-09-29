'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createStorageClient}=require('./backup-object-storage.cjs');
test('object-storage client requires exact public HTTPS endpoint and explicit credentials',()=>{
 const config={endpoint:'https://s3.eu-central-003.backblazeb2.com',region:'eu-central-003',accessKeyId:'synthetic-id',secretAccessKey:'synthetic-secret'};
 const client=createStorageClient(config);client.destroy();
 for(const endpoint of ['http://s3.example.test','https://localhost','https://127.0.0.1','https://s3.example.test/path','https://user:pass@s3.example.test','https://s3.example.test/?region=other'])assert.throws(()=>createStorageClient({...config,endpoint}));
 for(const altered of [{region:''},{accessKeyId:''},{secretAccessKey:''}])assert.throws(()=>createStorageClient({...config,...altered}));
});
