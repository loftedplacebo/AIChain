'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),tls=require('node:tls'),{spawnSync}=require('node:child_process'),{connectionOptions}=require('./postgres-connection.cjs');
test('explicit PostgreSQL parameters prevent connection-string and ambient TLS override',()=>{
 const original=process.env.PGSSLMODE;process.env.PGSSLMODE='no-verify';try{
  const config=connectionOptions('postgresql://app:p%40ss@db.example.test:5433/governance');assert.equal(config.password,'p@ss');assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.ssl.servername,'db.example.test');assert.equal(config.connectionString,undefined);
  const client=new (require('pg').Client)(config);assert.equal(client.connectionParameters.ssl.rejectUnauthorized,true);assert.equal(client.connectionParameters.database,'governance');
  assert.equal(connectionOptions('postgres://app:synthetic@127.0.0.1/test').ssl,false);assert.equal(connectionOptions('postgres://app:synthetic@[::1]/test').host,'::1');
 }finally{if(original===undefined)delete process.env.PGSSLMODE;else process.env.PGSSLMODE=original;}
});
test('weak or overriding URL parameters, incomplete credentials and malformed references fail without secrets',()=>{
 for(const value of ['postgres://app:private-value@db.example.test/test?sslmode=disable','postgres://app:private-value@db.example.test/test?sslmode=require','postgres://app:private-value@localhost/test?sslmode=no-verify','postgres://app:private-value@localhost/test?host=other','postgres://app:private-value@localhost/test?sslrootcert=/secret','postgres://app:private-value@localhost/test?sslmode=disable&sslmode=verify-full','postgres://app@localhost/test','postgres://app:private-value@localhost/','http://app:private-value@localhost/test','postgres://app:private-value@localhost/test#fragment'])assert.throws(()=>connectionOptions(value),error=>!error.message.includes('private-value'));
});
test('actual TLS rejects untrusted or mismatched certificates and accepts a trusted matching certificate',async t=>{
 const binary=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl';if(process.platform==='win32'&&!fs.existsSync(binary)){t.skip('OpenSSL fixture generator unavailable');return;}
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gov-transport-')),keyFile=path.join(directory,'server.key'),certFile=path.join(directory,'server.crt');let server;
 try{
  const generation=spawnSync(binary,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-days','1'],{windowsHide:true});assert.equal(generation.status,0,'Synthetic certificate generation failed');
  server=tls.createServer({key:fs.readFileSync(keyFile),cert:fs.readFileSync(certFile)},socket=>socket.end());server.on('tlsClientError',()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const connect=ssl=>new Promise((resolve,reject)=>{const socket=tls.connect({host:'127.0.0.1',port:server.address().port,...ssl});socket.setTimeout(3000,()=>socket.destroy(Error('TLS fixture timeout')));socket.once('secureConnect',()=>{socket.destroy();resolve();});socket.once('error',reject);});
  await assert.rejects(connect(connectionOptions('postgres://app:synthetic@localhost/test?sslmode=verify-full').ssl));
  await connect(connectionOptions('postgres://app:synthetic@localhost/test?sslmode=verify-full',{caFile:certFile}).ssl);
  await assert.rejects(connect(connectionOptions('postgres://app:synthetic@wrong.example.test/test',{caFile:certFile}).ssl),error=>error.code==='ERR_TLS_CERT_ALTNAME_INVALID');
  await assert.rejects(connect(connectionOptions('postgres://app:synthetic@127.0.0.1/test?sslmode=verify-full',{caFile:certFile}).ssl),error=>error.code==='ERR_TLS_CERT_ALTNAME_INVALID');
  assert.throws(()=>connectionOptions('postgres://app:synthetic@localhost/test',{caFile:keyFile}));
 }finally{if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});
