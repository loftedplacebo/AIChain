'use strict';
const {validateGovernanceEvent}=require('./governance-event');
const VERSION='node-0.1.0-alpha.1';
const ref=v=>{if(typeof v!=='string'||! /^[A-Za-z0-9._:-]{1,128}$/.test(v))throw new TypeError('Expected bounded opaque reference');return v;};
const environment=v=>{if(typeof v!=='string'||! /^[A-Za-z0-9._-]{1,64}$/.test(v))throw new TypeError('Invalid environment');return v;};
const only=(input,keys)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw new TypeError('Unsupported structured field');};
class IngestionError extends Error{constructor(status){super(`Orvessian request failed (${status?`HTTP ${status}`:'transport unavailable'})`);this.name='IngestionError';this.status=status;}}
class Client{
 #token;#fetch;
 constructor({baseUrl,token,tenant,project,timeoutMs=10000,attempts=3},fetcher=fetch){
  const url=new URL(baseUrl);
  if(url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new TypeError('Use HTTPS API origin, or loopback HTTP');
  if(typeof token!=='string'||token.length<32||/[\r\n]/.test(token))throw new TypeError('Scoped project credential required');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000||!Number.isInteger(attempts)||attempts<1||attempts>5)throw new TypeError('Invalid timeout or attempts');
  Object.defineProperties(this,{baseUrl:{value:url.origin,enumerable:true},tenant:{value:ref(tenant),enumerable:true},project:{value:ref(project),enumerable:true},timeoutMs:{value:timeoutMs},attempts:{value:attempts}});this.#token=token;this.#fetch=fetcher;
 }
 async #request(path,input){
  const body=input===undefined?undefined:JSON.stringify(input);
  if(body&&Buffer.byteLength(body)>(path.startsWith('/v1/agents')?4096:65536))throw new TypeError('Request exceeds API bound');
  for(let i=0;i<this.attempts;i++){
   let status;
   try{
    const response=await this.#fetch(this.baseUrl+path,{method:body?'POST':'GET',redirect:'manual',headers:{authorization:`Bearer ${this.#token}`,'content-type':'application/json'},body,signal:AbortSignal.timeout(this.timeoutMs)});
    status=response.status;
    if(!response.ok){await response.body?.cancel();throw new IngestionError(status);}
    const reader=response.body?.getReader();if(!reader)throw new IngestionError(status);let size=0;const chunks=[];
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2097152){await reader.cancel();throw new IngestionError(status);}chunks.push(value);}
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));return result;
   }catch(e){
    if(status&&! [408,429,500,502,503,504].includes(status)||i===this.attempts-1)throw new IngestionError(status);
   }
   await new Promise(r=>setTimeout(r,Math.min(250*2**i,2000)));
  }
 }
 registerAgent(input){
  only(input,['agentRef','environment','deploymentRef','ownerRef','purpose','modelRef','configVersion','heartbeatTtlSeconds']);
  for(const k of ['agentRef','deploymentRef','ownerRef','modelRef','configVersion'])ref(input[k]);environment(input.environment);
  const ttl=input.heartbeatTtlSeconds??300;
  if(typeof input.purpose!=='string'||!input.purpose.trim()||input.purpose.length>256||/[\x00-\x1f]/.test(input.purpose)||!Number.isInteger(ttl)||ttl<60||ttl>86400)throw new TypeError('Invalid purpose or TTL');
  return this.#request('/v1/agents',{...input,heartbeatTtlSeconds:ttl});
 }
 heartbeat(input){only(input,['agentRef','environment','deploymentRef','sequence']);ref(input.agentRef);ref(input.deploymentRef);environment(input.environment);if(!Number.isSafeInteger(input.sequence)||input.sequence<0)throw new TypeError('Invalid heartbeat sequence');return this.#request('/v1/agents/heartbeat',input);}
 buildRun(input){
  only(input,['eventId','streamRef','sequence','occurredAt','runRef','agentRef','environment','deploymentRef','providerRef','modelRef','configVersion','taskClass','status','latencyMs','predictedLabel','decisionCode','caseRef','toolCalls','actionCode','parentEventRefs']);
  if(typeof input.sequence==='number'&&(!Number.isSafeInteger(input.sequence)||input.sequence<0))throw new TypeError('Invalid event sequence');
  const activity={taskClass:input.taskClass};if(input.latencyMs!==undefined)activity.latencyMs=input.latencyMs;
  if(input.toolCalls!==undefined)activity.toolCalls=input.toolCalls;
  const result={status:input.status};for(const key of ['predictedLabel','decisionCode','actionCode'])if(input[key]!==undefined)result[key]=input[key];
  return this.validate({schema:'aichain.governance-event',schemaVersion:'0.1.0-draft',profile:'urn:orvessian:agent-run:v1',tenantRef:this.tenant,projectRef:this.project,environment:input.environment,eventId:input.eventId,streamRef:input.streamRef,sequence:String(input.sequence),occurredAt:input.occurredAt,runRef:input.runRef,agentRef:input.agentRef,eventType:'ai.run.completed',source:{kind:'customer-sdk',integrationVersion:VERSION,keyRef:'project-credential'},model:{providerRef:input.providerRef,modelRef:input.modelRef,deploymentRef:input.deploymentRef,configVersion:input.configVersion},activity,result,...(input.caseRef!==undefined?{caseRef:input.caseRef}:{}),...(input.parentEventRefs!==undefined?{parentEventRefs:input.parentEventRefs}:{})});
 }
 buildOutcome(input){
  only(input,['eventId','forEventId','caseRef','environment','label','labelSource','evaluatorRef','rubricVersion','occurredAt']);
  const sources={'downstream-system':'downstream-system','calibrated-measurement':'downstream-system','customer-feedback':'customer-gateway','automated-evaluator':'customer-sdk'};
  if(!Object.hasOwn(sources,input.labelSource))throw new TypeError('Use authenticated review workflow for human adjudication');
  ref(input.rubricVersion);
  return this.validate({schema:'aichain.governance-event',schemaVersion:'0.1.0-draft',profile:'urn:orvessian:agent-run:v1',tenantRef:this.tenant,projectRef:this.project,environment:input.environment,eventId:input.eventId,streamRef:input.eventId,sequence:'0',caseRef:input.caseRef,occurredAt:input.occurredAt,eventType:'ai.outcome.adjudicated',source:{kind:sources[input.labelSource],integrationVersion:VERSION,keyRef:'project-credential'},outcome:{forEventId:input.forEventId,label:input.label,labelSource:input.labelSource,evaluatorRef:input.evaluatorRef,rubricVersion:input.rubricVersion,adjudicatedAt:input.occurredAt}});
 }
 buildConfigObservation(input){
  only(input,['eventId','streamRef','sequence','occurredAt','agentRef','environment','deploymentRef','providerRef','modelRef','configVersion','approvedConfigDigest','observedConfigDigest','observationSource','parentEventRefs']);
  if(typeof input.sequence==='number'&&(!Number.isSafeInteger(input.sequence)||input.sequence<0))throw new TypeError('Invalid event sequence');
  ref(input.observationSource);
  if(input.observedConfigDigest===undefined)throw new TypeError('Observed configuration commitment required');
  const model={providerRef:input.providerRef,modelRef:input.modelRef,deploymentRef:input.deploymentRef,configVersion:input.configVersion,observedConfigDigest:input.observedConfigDigest,observationSource:input.observationSource};
  if(input.approvedConfigDigest!==undefined)model.approvedConfigDigest=input.approvedConfigDigest;
  return this.validate({schema:'aichain.governance-event',schemaVersion:'0.1.0-draft',profile:'urn:orvessian:agent-run:v1',tenantRef:this.tenant,projectRef:this.project,environment:input.environment,eventId:input.eventId,streamRef:input.streamRef,sequence:String(input.sequence),occurredAt:input.occurredAt,agentRef:input.agentRef,eventType:'ai.runtime.config-observed',source:{kind:'customer-sdk',integrationVersion:VERSION,keyRef:'project-credential'},model,...(input.parentEventRefs!==undefined?{parentEventRefs:input.parentEventRefs}:{})});
 }
 validate(input){
  if(input.tenantRef!==this.tenant||input.projectRef!==this.project)throw new TypeError('Event scope differs from client');
  if(Object.hasOwn(input,'receivedAt'))throw new TypeError('Server receipt time is server-owned');
  const event=JSON.parse(JSON.stringify(input));validateGovernanceEvent({...event,receivedAt:event.occurredAt});return event;
 }
 async submit(input){const event=this.validate(input);const ack=await this.#request('/v1/events',event);if(!ack||ack.eventId!==event.eventId||!['accepted','duplicate'].includes(ack.status))throw new IngestionError();return ack;}
 recordRun(input){return this.submit(this.buildRun(input));}
 recordOutcome(input){return this.submit(this.buildOutcome(input));}
 recordConfigObservation(input){return this.submit(this.buildConfigObservation(input));}
 agents({limit=50,offset=0}={}){if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)throw new TypeError('Invalid pagination');return this.#request(`/v1/agents?limit=${limit}&offset=${offset}`);}
 evidence(eventId){return this.#request('/v1/evidence/'+encodeURIComponent(ref(eventId)));}
}
module.exports={Client,IngestionError,VERSION};
