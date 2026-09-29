'use strict';
const fs=require('node:fs'),net=require('node:net'),tls=require('node:tls');
// Parse once into explicit pg options. pg reparses connectionString last and can
// otherwise overwrite caller TLS options or inherit PGSSLMODE from the host.
function connectionOptions(value,{caFile}={}){
 try{
  if(typeof value!=='string'||value.length>8192)throw Error();const url=new URL(value);
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.hash||!url.hostname||!url.username||!url.password||!url.pathname||url.pathname==='/')throw Error();
  for(const [name] of url.searchParams)if(name!=='sslmode'||url.searchParams.getAll(name).length!==1)throw Error();
  const host=url.hostname.replace(/^\[|\]$/g,''),port=Number(url.port||5432),database=decodeURIComponent(url.pathname.slice(1)),user=decodeURIComponent(url.username),password=decodeURIComponent(url.password);
  if(!Number.isInteger(port)||port<1||port>65535||!database||database.includes('/')||[host,database,user,password].some(s=>/[\x00-\x1f\x7f]/.test(s))||host.includes('%')||host.includes('/'))throw Error();
  const local=['localhost','127.0.0.1','::1'].includes(host.toLowerCase()),mode=url.searchParams.get('sslmode');
  if(mode!==null&&mode!=='verify-full'&&!(local&&mode==='disable'))throw Error();
  let ssl=false;
  if(!local||mode==='verify-full'||caFile){
   if(mode==='disable')throw Error();ssl={rejectUnauthorized:true,checkServerIdentity:(_servername,certificate)=>tls.checkServerIdentity(host,certificate)};
   if(caFile){const stat=fs.lstatSync(caFile);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>1048576)throw Error();const ca=fs.readFileSync(caFile,'utf8');if(!ca.includes('-----BEGIN CERTIFICATE-----')||ca.includes('PRIVATE KEY'))throw Error();ssl.ca=ca;}
   // pg sets the DNS TLS servername; IP addresses are validated as IP SANs.
   if(!net.isIP(host))ssl.servername=host;
  }
  return {host,port,database,user,password,ssl,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000};
 }catch{throw Error('Invalid PostgreSQL connection configuration; require explicit credentials and verified TLS outside loopback');}
}
module.exports={connectionOptions};
