// Local alpha delivery journal. Destinations and keys come from trusted operator
// configuration, never from event bodies or public request parameters.
const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('node:crypto');
const {lookup}=require('node:dns/promises');
const http=require('node:http'),https=require('node:https');
const {sign}=require('./webhook-signatures.cjs');
const ref=v=>{if(typeof v!=='string'||! /^[A-Za-z0-9._:-]{1,128}$/.test(v))throw Error('Invalid webhook reference');return v;};
const clock=v=>{if(!Number.isSafeInteger(v)||v<0)throw Error('Invalid delivery clock');return v;};
function publicIPv4(address){
 const p=address.split('.');if(p.length!==4||p.some(x=>! /^\d{1,3}$/.test(x)||Number(x)>255))return false;
 const [a,b,c]=p.map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
async function send(destination,signed,{testLoopback=false}={}){
 const url=new URL(destination);
 if(url.username||url.password||url.hash||url.search||url.href.length>2048)throw Error('Invalid webhook destination');
 const local=testLoopback&&url.protocol==='http:'&&url.hostname==='127.0.0.1';
 if(!local&&(url.protocol!=='https:'||(url.port&&url.port!=='443')))throw Error('HTTPS port 443 required');
 let address;
 if(local)address='127.0.0.1';
 else{
  let timer,records;
  try{records=await Promise.race([lookup(url.hostname,{all:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DNS timeout')),5000);timer.unref();})]);}
  finally{clearTimeout(timer);}
  // Fail closed for private/mixed DNS and IPv6 until IPv6 egress policy is tested.
  if(!records.length||records.some(r=>r.family!==4||!publicIPv4(r.address)))throw Error('Destination address forbidden');
  address=records[0].address;
 }
 return new Promise((resolve,reject)=>{
  const request=(local?http:https).request(url,{method:'POST',headers:{...signed.headers,'content-length':signed.body.length},lookup:(_hostname,_options,callback)=>callback(null,address,4)},response=>{
   let bytes=0;
   response.on('data',chunk=>{bytes+=chunk.length;if(bytes>65536)request.destroy(Error('Response exceeds bound'));});
   response.on('end',()=>resolve(response.statusCode));response.on('error',reject);
  });
  const deadline=setTimeout(()=>request.destroy(Error('Delivery timeout')),10000);
  request.on('close',()=>clearTimeout(deadline));request.on('error',reject);request.end(signed.body);
 });
}
class DeliveryJournal{
 constructor(path){
  this.db=new DatabaseSync(path);
  try{require('./environment.cjs').assertRecoveryApproved(this.db);}catch(e){this.db.close();throw e;}
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS webhook_jobs(tenant TEXT NOT NULL,project TEXT NOT NULL,id TEXT NOT NULL,destination TEXT NOT NULL,key_ref TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL,next_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,lease_token TEXT,last_status INTEGER,PRIMARY KEY(tenant,project,id));
   CREATE INDEX IF NOT EXISTS webhook_due ON webhook_jobs(tenant,project,state,next_at);`);
 }
 enqueue(p,body,{destinationRef,keyRef},now=Date.now()){
  clock(now);ref(p.tenant);ref(p.project);ref(destinationRef);ref(keyRef);
  if(body.tenantRef!==p.tenant||body.projectRef!==p.project)throw Error('Webhook scope mismatch');
  const raw=sign(body,Buffer.alloc(32)).body.toString(); // validates the bounded envelope; not sent
  const ownTransaction=!this.db.isTransaction;
  if(ownTransaction)this.db.exec('BEGIN IMMEDIATE');
  try{
   const old=this.db.prepare('SELECT body,destination,key_ref FROM webhook_jobs WHERE tenant=? AND project=? AND id=?').get(p.tenant,p.project,body.deliveryId);
   if(old&&(old.body!==raw||old.destination!==destinationRef||old.key_ref!==keyRef))throw Error('Webhook identity conflict');
   if(!old){
    const count=this.db.prepare("SELECT COUNT(*) n FROM webhook_jobs WHERE tenant=? AND project=? AND state NOT IN ('delivered','dead')").get(p.tenant,p.project).n;
    if(count>=10000)throw Error('Webhook queue capacity reached');
    this.db.prepare('INSERT INTO webhook_jobs(tenant,project,id,destination,key_ref,body,state,attempts,next_at) VALUES(?,?,?,?,?,?,?,0,?)').run(p.tenant,p.project,body.deliveryId,destinationRef,keyRef,raw,'pending',now);
   }
   if(ownTransaction)this.db.exec('COMMIT');return !old;
  }catch(error){if(ownTransaction)this.db.exec('ROLLBACK');throw error;}
 }
 claim(p,now=Date.now()){
  clock(now);ref(p.tenant);ref(p.project);this.db.exec('BEGIN IMMEDIATE');
  try{
   this.db.prepare("UPDATE webhook_jobs SET state='dead',lease_token=NULL,lease_until=0 WHERE tenant=? AND project=? AND state='sending' AND lease_until<=? AND attempts>=8").run(p.tenant,p.project,now);
   const row=this.db.prepare("SELECT * FROM webhook_jobs WHERE tenant=? AND project=? AND ((state='pending' AND next_at<=?) OR (state='sending' AND lease_until<=?)) ORDER BY next_at,id LIMIT 1").get(p.tenant,p.project,now,now);
   if(!row){this.db.exec('COMMIT');return null;}
   const token=randomUUID();this.db.prepare("UPDATE webhook_jobs SET state='sending',lease_until=?,lease_token=?,attempts=attempts+1 WHERE tenant=? AND project=? AND id=?").run(now+60000,token,p.tenant,p.project,row.id);this.db.exec('COMMIT');
   return {...row,lease_token:token,attempts:row.attempts+1};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 finish(p,job,status,now=Date.now()){
  clock(now);const success=Number.isInteger(status)&&status>=200&&status<300;
  const retry=status===null||[408,429,500,502,503,504].includes(status);
  const state=success?'delivered':retry&&job.attempts<8?'pending':'dead';
  const next=now+Math.min(300000,1000*2**Math.min(job.attempts-1,20));
  const result=this.db.prepare('UPDATE webhook_jobs SET state=?,next_at=?,lease_until=0,lease_token=NULL,last_status=? WHERE tenant=? AND project=? AND id=? AND state=\'sending\' AND lease_token=?').run(state,next,status,p.tenant,p.project,job.id,job.lease_token);
  return {updated:result.changes===1,state};
 }
 list(p){return this.db.prepare('SELECT id,destination,key_ref,state,attempts,next_at,last_status FROM webhook_jobs WHERE tenant=? AND project=? ORDER BY id LIMIT 100').all(p.tenant,p.project);}
 close(){this.db.close();}
}
async function deliverOne(journal,p,{destinations,resolveKey,transport=send,now=()=>Date.now()}){
 const job=journal.claim(p,now());if(!job)return {idle:true};let status=null;
 try{
  const destination=destinations[job.destination];
  if(!destination||destination.tenant!==p.tenant||destination.project!==p.project)throw Error('Destination scope mismatch');
  const key=await resolveKey(job.key_ref,p,job.destination);
  const signed=sign(JSON.parse(job.body),key,{timestamp:Math.floor(now()/1000)});
  status=await transport(destination.url,signed);
  if(!Number.isInteger(status)||status<100||status>599)status=null;
 }catch{/* Persist only status/state: response bodies, URLs and secrets are excluded. */}
 return {id:job.id,...journal.finish(p,job,status,now())};
}
module.exports={DeliveryJournal,deliverOne,send,publicIPv4};
