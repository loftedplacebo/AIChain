'use strict';
const path=require('node:path');
const {connectionOptions}=require('./postgres-connection.cjs');
const localHost=host=>host==='localhost'||host==='127.0.0.1';
const databaseName=value=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(value);
const dnsHost=value=>typeof value==='string'&&value.length<=253&&value.split('.').every(label=>/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));

function databaseOptions(connection){
 if(!connection||typeof connection!=='object'||Array.isArray(connection)||Object.keys(connection).some(k=>!['host','port','database','user','password','sslmode','caFile'].includes(k))||
  !dnsHost(connection.host)||!Number.isInteger(connection.port)||connection.port<1||connection.port>65535||
  !databaseName(connection.database)||!databaseName(connection.user)||typeof connection.password!=='string'||!connection.password||/[\x00-\x1f\x7f]/.test(connection.password))throw Error('Explicit PostgreSQL backup connection required');
 if(localHost(connection.host)){
  if(connection.sslmode!==undefined||connection.caFile!==undefined)throw Error('Loopback backup connection must use the local profile');
  return {...connection,max:2,connectionTimeoutMillis:5000};
 }
 if(connection.sslmode!=='verify-full'||typeof connection.caFile!=='string'||!path.isAbsolute(connection.caFile))throw Error('Remote backup connection requires verified TLS and an absolute CA file');
 const url=new URL('postgresql://localhost');url.hostname=connection.host;url.port=String(connection.port);url.username=connection.user;url.password=connection.password;url.pathname='/'+connection.database;url.searchParams.set('sslmode','verify-full');
 const parsed=connectionOptions(url.href,{caFile:connection.caFile});
 if(parsed.host.toLowerCase()!==connection.host.toLowerCase())throw Error('Remote backup hostname mismatch');
 return {...parsed,max:2};
}

function nativeEnv(connection,baseEnv=process.env){
 databaseOptions(connection);
 const env={...baseEnv};for(const name of Object.keys(env))if(name.startsWith('PG'))delete env[name];
 return {...env,PGHOST:connection.host,PGPORT:String(connection.port),PGUSER:connection.user,PGPASSWORD:connection.password,PGDATABASE:connection.database,PGCONNECT_TIMEOUT:'5',PGOPTIONS:'-c statement_timeout=120000',PGSSLMODE:localHost(connection.host)?'disable':'verify-full',...(!localHost(connection.host)?{PGSSLROOTCERT:connection.caFile}:{})};
}
module.exports={databaseOptions,nativeEnv};
