'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {databaseOptions,nativeEnv}=require('./postgres-backup-connection.cjs');
const local={host:'127.0.0.1',port:55439,database:'gov_test',user:'gov_admin',password:'synthetic'};

test('backup uses the explicit local connection and scrubs ambient libpq options',()=>{
 const options=databaseOptions(local);assert.equal(options.ssl,undefined);assert.equal(options.host,'127.0.0.1');
 const env=nativeEnv(local,{PGHOST:'foreign.example.test',PGSSLMODE:'require',PGSSLROOTCERT:'wrong',OTHER:'retained'});
 assert.equal(env.PGHOST,'127.0.0.1');assert.equal(env.PGSSLMODE,'disable');assert.equal(env.PGSSLROOTCERT,undefined);assert.equal(env.OTHER,'retained');
});

test('remote backup requires verified TLS for both Node and native PostgreSQL clients',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gov-remote-backup-')),caFile=path.join(dir,'ca.pem');
 try{
  fs.writeFileSync(caFile,'-----BEGIN CERTIFICATE-----\nsynthetic-test-only\n-----END CERTIFICATE-----\n');
  const remote={host:'db.example.test',port:25060,database:'gov_test',user:'gov_admin',password:'p@ss',sslmode:'verify-full',caFile};
  const options=databaseOptions(remote);assert.equal(options.host,remote.host);assert.equal(options.password,remote.password);assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(options.ssl.servername,remote.host);assert.equal(options.connectionString,undefined);
  const env=nativeEnv(remote,{PGHOST:'wrong',PGSSLMODE:'require',PGSSLROOTCERT:'wrong'});assert.equal(env.PGHOST,remote.host);assert.equal(env.PGSSLMODE,'verify-full');assert.equal(env.PGSSLROOTCERT,caFile);assert.equal(env.PGPASSWORD,remote.password);
  for(const invalid of [{...remote,sslmode:'require'},{...remote,sslmode:undefined},{...remote,caFile:undefined},{...remote,caFile:'ca.pem'},{...remote,host:'db.example.test@localhost'},{...remote,password:'bad\nvalue'},{...remote,connectionString:'postgres://elsewhere'}])assert.throws(()=>databaseOptions(invalid));
  assert.throws(()=>databaseOptions({...local,sslmode:'disable'}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
