'use strict';
const {deliverOne}=require('./webhook-delivery.cjs');
const reference=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value);
function validateProjects(projects){
 if(!Array.isArray(projects)||projects.length<1||projects.length>100)throw new TypeError('Configure 1..100 rule projects');
 const seen=new Set();
 return projects.map(p=>{if(!p||Object.keys(p).some(k=>!['tenant','project'].includes(k))||!reference(p.tenant)||!reference(p.project))throw new TypeError('Invalid rule project');const key=JSON.stringify([p.tenant,p.project]);if(seen.has(key))throw new TypeError('Duplicate rule project');seen.add(key);return Object.freeze({tenant:p.tenant,project:p.project});});
}
// Local opt-in processing; one sequential cycle, bounded work per project.
// Journal cursors/outboxes own recovery; this scheduler owns no signing keys.
class RuleProcessor{
 #engine;#store;#projects;#delivery;#timer;#running;#stopped=false;#last=null;
 constructor({engine,store,projects,intervalMs=5000,recordLimit=100,deliveryLimit=10,delivery=null}){
  if(!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>60000||!Number.isInteger(recordLimit)||recordLimit<1||recordLimit>1000||!Number.isInteger(deliveryLimit)||deliveryLimit<1||deliveryLimit>100)throw new TypeError('Invalid rule processing bounds');
  if(typeof engine?.scanStored!=='function'||typeof engine?.publishDetected!=='function'||typeof store?.db?.prepare!=='function')throw new TypeError('Rule processing requires SQLite governance storage');
  if(delivery&&(!delivery.destinations||typeof delivery.resolveKey!=='function'))throw new TypeError('Trusted delivery configuration required');
  this.#projects=validateProjects(projects);this.#engine=engine;this.#store=store;this.#delivery=delivery;Object.defineProperties(this,{intervalMs:{value:intervalMs},recordLimit:{value:recordLimit},deliveryLimit:{value:deliveryLimit}});
 }
 get status(){return {running:!!this.#running,scheduled:!!this.#timer,stopped:this.#stopped,lastCycle:this.#last?structuredClone(this.#last):null};}
 tick(){
  if(this.#stopped)return Promise.reject(new Error('Rule processor is stopped'));
  if(this.#running)return this.#running;
  // Defer work so #running is assigned before even a synchronous failure.
  this.#running=Promise.resolve().then(async()=>{
   const results=[];
   for(const p of this.#projects){
    if(this.#stopped)break;
    const result={...p,processed:0,incidents:0,published:0,delivered:0,dead:0,failed:false};
    try{
     const scan=this.#engine.scanStored(this.#store,p,{limit:this.recordLimit});result.processed=scan.processed;result.incidents=scan.incidents.length;
     result.published=(await this.#engine.publishDetected(this.#store,p,{limit:this.recordLimit})).published;
     if(this.#delivery&&!this.#stopped)for(let i=0;i<this.deliveryLimit&&!this.#stopped;i++){
      const job=await deliverOne(this.#engine.journal,p,this.#delivery);if(job.idle)break;if(job.updated&&job.state==='delivered')result.delivered++;if(job.updated&&job.state==='dead')result.dead++;
     }
    }catch{result.failed=true;} // Never include events, destinations, keys or raw errors.
    results.push(result);
   }
   this.#last={checkedAt:new Date().toISOString(),projects:results};return structuredClone(this.#last);
  }).finally(()=>{this.#running=null;});
  return this.#running;
 }
 start(){
  if(this.#stopped)throw new Error('Rule processor is stopped');if(this.#timer)return;
  this.#timer=setInterval(()=>{this.tick().catch(()=>{});},this.intervalMs);this.#timer.unref();this.tick().catch(()=>{});
 }
 async stop(){this.#stopped=true;clearInterval(this.#timer);this.#timer=null;await this.#running;}
}
module.exports={RuleProcessor,validateProjects};
