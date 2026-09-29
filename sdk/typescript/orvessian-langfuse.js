'use strict';
const {createHash}=require('node:crypto');
const {mapEvaluationRows}=require('./orvessian-mappings');
const fail=()=>{throw new TypeError('Invalid Langfuse score mapping');};
const ref=v=>{if(typeof v!=='string'||! /^[A-Za-z0-9._:-]{1,128}$/.test(v))fail();return v;};
const keys=(v,allowed)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail();};
const time=v=>{if(typeof v!=='string'||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString()!==v)fail();return v;};
const cursor=v=>{if(v!==null&&v!==undefined&&(typeof v!=='string'||v.length>2048||! /^[A-Za-z0-9_=-]+$/.test(v)))fail();return v??null;};
function subjectKey(subject){
 if(!subject||!['trace','observation'].includes(subject.kind))fail();
 ref(subject.id);if(subject.kind==='observation')ref(subject.traceId);
 return JSON.stringify([subject.kind,subject.id,subject.kind==='observation'?subject.traceId:null]);
}
function mapLangfuseScorePage(client,page,links,options){
 keys(options,['environment','evaluatorRef','rubricVersion','vendorProjectId','scoreName','labelMap']);
 for(const key of ['evaluatorRef','rubricVersion','vendorProjectId','scoreName'])ref(options[key]);
 if(!options.labelMap||typeof options.labelMap!=='object'||Array.isArray(options.labelMap)||Object.keys(options.labelMap).length<1||Object.keys(options.labelMap).length>32)fail();
 for(const [label,value] of Object.entries(options.labelMap)){if(label.length<1||label.length>128||/[\x00-\x1f]/.test(label))fail();ref(value);}
 if(!Array.isArray(page?.data)||page.data.length>100||!Array.isArray(links)||links.length>1000)fail();
 const nextCursor=cursor(page.meta?.cursor),mapping=new Map(),seen=new Set();
 for(const link of links){keys(link,['subject','forEventId','caseRef']);keys(link.subject,['kind','id','traceId']);ref(link.forEventId);ref(link.caseRef);const key=subjectKey(link.subject);if(mapping.has(key))fail();mapping.set(key,link);}
 const rows=page.data.map(score=>{
  if(!score||score.projectId!==options.vendorProjectId||score.environment!==options.environment||score.name!==options.scoreName||score.dataType!=='CATEGORICAL'||typeof score.value!=='string'||!Object.hasOwn(options.labelMap,score.value))fail();
  ref(score.id);if(seen.has(score.id))fail();seen.add(score.id);const link=mapping.get(subjectKey(score.subject));if(!link)fail();
  // Read only selected core fields + subject. Comments, annotation authors,
  // metadata, raw trace objects and content are never copied or logged.
  const evaluationId='lf-'+createHash('sha256').update(JSON.stringify([options.vendorProjectId,score.id])).digest('hex');
  return {evaluationId,forEventId:link.forEventId,caseRef:link.caseRef,label:options.labelMap[score.value],occurredAt:time(score.timestamp)};
 });
 const events=mapEvaluationRows(client,rows,{environment:options.environment,evaluatorRef:options.evaluatorRef,rubricVersion:options.rubricVersion});
 for(const event of events)event.source.integrationVersion='langfuse-scores-v3-0.1.0-alpha';
 return {events,nextCursor};
}
class LangfuseReadError extends Error{constructor(status){super(`Langfuse score read failed (${status?`HTTP ${status}`:'transport unavailable'})`);this.name='LangfuseReadError';this.status=status;}}
class LangfuseScoresClient{
 #authorization;#fetch;
 constructor({baseUrl,publicKey,secretKey,scoreName,environment,timeoutMs=10000},fetcher=fetch){
  const url=new URL(baseUrl);if(url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))fail();
  for(const key of [publicKey,secretKey])if(typeof key!=='string'||key.length<8||key.length>1024||/[\r\n:]/.test(key))fail();
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)fail();
  Object.defineProperties(this,{baseUrl:{value:url.origin,enumerable:true},scoreName:{value:ref(scoreName),enumerable:true},environment:{value:ref(environment),enumerable:true},timeoutMs:{value:timeoutMs}});this.#authorization='Basic '+Buffer.from(publicKey+':'+secretKey).toString('base64');this.#fetch=fetcher;
 }
 async page({from,to,after=null}){
  time(from);time(to);if(from>=to)fail();cursor(after);
  const url=new URL('/api/public/v3/scores',this.baseUrl);url.search=new URLSearchParams({name:this.scoreName,environment:this.environment,dataType:'CATEGORICAL',fields:'subject',limit:'100',fromTimestamp:from,toTimestamp:to,...(after?{cursor:after}:{})});
  let status;
  try{
   const response=await this.#fetch(url,{headers:{authorization:this.#authorization,accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(this.timeoutMs)});status=response.status;
   if(!response.ok){await response.body?.cancel();throw Error();}
   const reader=response.body?.getReader();if(!reader)throw Error();let bytes=0;const chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2097152){await reader.cancel();throw Error();}chunks.push(value);}
   const page=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(page?.data)||page.data.length>100)throw Error();cursor(page.meta?.cursor);return page;
  }catch{throw new LangfuseReadError(status);}
 }
}
async function importLangfuseWindow(client,reader,queue,{importId,from,to,links,options,maxPages=10}){
 ref(importId);time(from);time(to);
 if(from>=to||!Number.isInteger(maxPages)||maxPages<1||maxPages>100||!(reader instanceof LangfuseScoresClient)||reader.scoreName!==options?.scoreName||reader.environment!==options?.environment)fail();
 // Validate mapping before fetching and bind its entire explicit linkage to the
 // checkpoint. Persist only the binding hash, cursor and filtered queue records.
 mapLangfuseScorePage(client,{data:[]},links,options);
 links=JSON.parse(JSON.stringify(links));options=JSON.parse(JSON.stringify(options));
 const normalizedLinks=links.map(link=>[subjectKey(link.subject),link.forEventId,link.caseRef]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const binding=createHash('sha256').update(JSON.stringify([reader.baseUrl,client.baseUrl,client.tenant,client.project,from,to,options.environment,options.vendorProjectId,options.scoreName,options.evaluatorRef,options.rubricVersion,Object.entries(options.labelMap).sort(([a],[b])=>a.localeCompare(b)),normalizedLinks])).digest('hex');
 let checkpoint=queue.checkpoint(importId,binding),pages=0,records=0;
 const seen=new Set([checkpoint.cursor]);
 while(!checkpoint.complete&&pages<maxPages){
  if(checkpoint.revision>=10000)throw new Error('Import page safety limit reached');
  const page=await reader.page({from,to,after:checkpoint.cursor});
  const mapped=mapLangfuseScorePage(client,page,links,options);
  if(mapped.events.some(event=>event.occurredAt<from||event.occurredAt>to))throw new TypeError('Score falls outside import window');
  if(mapped.nextCursor!==null&&seen.has(mapped.nextCursor))throw new Error('Import cursor cycle detected');
  checkpoint=queue.commitImportPage(importId,binding,checkpoint.revision,mapped.events,mapped.nextCursor);
  seen.add(checkpoint.cursor);pages++;records+=mapped.events.length;
 }
 return {pages,records,checkpoint};
}
module.exports={mapLangfuseScorePage,LangfuseScoresClient,LangfuseReadError,importLangfuseWindow};
