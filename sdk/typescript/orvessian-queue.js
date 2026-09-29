'use strict';
const {DatabaseSync}=require('node:sqlite');
class DurableQueue {
 #db;#client;#busy=false;#closed=false;
 constructor(client,path,{capacity=10000}={}) {
  if(typeof path!=='string'||!path||path===':memory:')throw new TypeError('Persistent queue path required');
  if(!Number.isInteger(capacity)||capacity<1||capacity>100000)throw new TypeError('Invalid queue capacity');
  this.#client=client;this.capacity=capacity;this.#db=new DatabaseSync(path);
  try {
   this.#db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS scope (singleton INTEGER PRIMARY KEY CHECK(singleton=1), origin TEXT NOT NULL, tenant TEXT NOT NULL, project TEXT NOT NULL); CREATE TABLE IF NOT EXISTS pending (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS import_checkpoint (id TEXT PRIMARY KEY, binding TEXT NOT NULL, revision INTEGER NOT NULL, cursor TEXT, complete INTEGER NOT NULL)');
   this.#db.exec('BEGIN IMMEDIATE');
   const scope=this.#db.prepare('SELECT origin,tenant,project FROM scope WHERE singleton=1').get();
   if(scope&&(scope.origin!==client.baseUrl||scope.tenant!==client.tenant||scope.project!==client.project))throw new TypeError('Queue belongs to another project or API');
   if(!scope)this.#db.prepare('INSERT INTO scope VALUES (1,?,?,?)').run(client.baseUrl,client.tenant,client.project);
   this.#db.exec('COMMIT');
  }catch(error){try{this.#db.exec('ROLLBACK');}catch{}this.#db.close();throw error;}
 }
 #open(){if(this.#closed)throw new Error('Queue is closed');}
 get size(){this.#open();return this.#db.prepare('SELECT COUNT(*) AS total FROM pending').get().total;}
 enqueue(input){
  this.#open();const event=this.#client.validate(input),body=JSON.stringify(event);
  if(Buffer.byteLength(body)>65536)throw new TypeError('Event exceeds API bound');
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   const previous=this.#db.prepare('SELECT body FROM pending WHERE event_id=?').get(event.eventId);
   if(previous){if(previous.body!==body)throw new TypeError('Queued event identity collision');this.#db.exec('COMMIT');return false;}
   if(this.size>=this.capacity)throw new Error('Queue capacity reached');
   this.#db.prepare('INSERT INTO pending(event_id,body) VALUES (?,?)').run(event.eventId,body);this.#db.exec('COMMIT');return true;
  }catch(error){this.#db.exec('ROLLBACK');throw error;}
 }
 async flush({limit=100}={}){
  this.#open();if(this.#busy)throw new Error('Queue flush already running');
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new TypeError('Invalid flush limit');
  this.#busy=true;let delivered=0;
  try{
   const rows=this.#db.prepare('SELECT id,body FROM pending ORDER BY id LIMIT ?').all(limit);
   for(const row of rows){await this.#client.submit(JSON.parse(row.body));this.#db.prepare('DELETE FROM pending WHERE id=?').run(row.id);delivered++;}
   return {delivered,pending:this.size};
  }finally{this.#busy=false;}
 }
 checkpoint(id,binding){
  this.#open();this.#importIdentity(id,binding);
  const row=this.#db.prepare('SELECT binding,revision,cursor,complete FROM import_checkpoint WHERE id=?').get(id);
  if(row&&row.binding!==binding)throw new TypeError('Import belongs to another source or window');
  return row?{revision:row.revision,cursor:row.cursor,complete:!!row.complete}:{revision:0,cursor:null,complete:false};
 }
 #importIdentity(id,binding){if(typeof id!=='string'||! /^[A-Za-z0-9._:-]{1,128}$/.test(id)||typeof binding!=='string'||! /^[a-f0-9]{64}$/.test(binding))throw new TypeError('Invalid import identity');}
 commitImportPage(id,binding,expectedRevision,events,nextCursor){
  this.#open();this.#importIdentity(id,binding);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!Array.isArray(events)||events.length>100||nextCursor!==null&&(typeof nextCursor!=='string'||nextCursor.length<1||nextCursor.length>2048||! /^[A-Za-z0-9_=-]+$/.test(nextCursor)))throw new TypeError('Invalid import page');
  const rows=events.map(input=>{const event=this.#client.validate(input),body=JSON.stringify(event);if(Buffer.byteLength(body)>65536)throw new TypeError('Event exceeds API bound');return {id:event.eventId,body};});
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new TypeError('Duplicate page identity');
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   const current=this.checkpoint(id,binding);
   if(current.revision!==expectedRevision||current.complete)throw new Error('Import checkpoint changed');
   if(nextCursor!==null&&nextCursor===current.cursor)throw new Error('Import cursor did not advance');
   if(current.revision===0&&this.#db.prepare('SELECT count(*) AS total FROM import_checkpoint').get().total>=100)throw new Error('Import checkpoint capacity reached');
   for(const row of rows){const previous=this.#db.prepare('SELECT body FROM pending WHERE event_id=?').get(row.id);if(previous){if(previous.body!==row.body)throw new TypeError('Queued event identity collision');continue;}if(this.size>=this.capacity)throw new Error('Queue capacity reached');this.#db.prepare('INSERT INTO pending(event_id,body) VALUES (?,?)').run(row.id,row.body);}
   this.#db.prepare('INSERT INTO import_checkpoint VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,cursor=excluded.cursor,complete=excluded.complete').run(id,binding,current.revision+1,nextCursor,nextCursor===null?1:0);
   this.#db.exec('COMMIT');return this.checkpoint(id,binding);
  }catch(error){this.#db.exec('ROLLBACK');throw error;}
 }
 close(){if(this.#busy)throw new Error('Cannot close during delivery');if(!this.#closed){this.#db.close();this.#closed=true;}}
}
module.exports={DurableQueue};
