'use strict';
const {normalizedRevocation}=require('./workos-webhook.cjs');
const {parseStrictJson}=require('./server.cjs');
const eventId=v=>typeof v==='string'&&/^event_[A-Za-z0-9]{1,122}$/.test(v);
// No public route or scheduler. The caller selects a bounded window and supplies
// the existing environment-bound revocation repository and private API config.
async function replayRevocations({clientId,apiKey,rangeStart,rangeEnd,maxPages=10,maxEvents=1000,fetcher=fetch,repository,now=Date.now}){
 const start=Date.parse(rangeStart),end=Date.parse(rangeEnd),time=now();
 if(typeof clientId!=='string'||!/^client_[A-Za-z0-9]+$/.test(clientId)||typeof apiKey!=='string'||!apiKey||/[\s\x00-\x1f]/.test(apiKey)||!repository||typeof repository.apply!=='function'||typeof rangeStart!=='string'||typeof rangeEnd!=='string'||!Number.isFinite(start)||!Number.isFinite(end)||new Date(start).toISOString()!==rangeStart||new Date(end).toISOString()!==rangeEnd||end<=start||end-start>86400000||end>time||!Number.isInteger(maxPages)||maxPages<1||maxPages>10||!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>1000)throw Error('Explicit bounded WorkOS revocation replay policy required');
 const deadline=Date.now()+30000,events=[],seen=new Map(),cursors=new Set();let cursor=null,pages=0,foreignClient=0,complete=false;
 while(pages<maxPages){
  if(Date.now()>=deadline)throw Error('Revocation replay observation budget exceeded');
  const url=new URL('https://api.workos.com/events');url.search=new URLSearchParams({events:'session.revoked',order:'asc',limit:'100',range_start:rangeStart,range_end:rangeEnd});if(cursor)url.searchParams.set('after',cursor);
  const signal=AbortSignal.timeout(Math.min(5000,deadline-Date.now()));
  const response=await fetcher(url.href,{method:'GET',headers:{Authorization:'Bearer '+apiKey},redirect:'error',signal});
  if(!response.ok){await response.body?.cancel();throw Error('Revocation replay provider unavailable');}
  const reader=response.body?.getReader();if(!reader)throw Error('Revocation replay response required');
  const chunks=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1048576){await reader.cancel();throw Error('Revocation replay page exceeds 1 MiB');}chunks.push(value);}
  const page=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));pages++;
  if(page?.object!=='list'||!Array.isArray(page.data)||page.data.length>100||!page.list_metadata||typeof page.list_metadata!=='object'||Array.isArray(page.list_metadata))throw Error('Invalid revocation replay page');
  for(const event of page.data){
   if(!eventId(event?.id)||event.event!=='session.revoked'||typeof event.context?.client_id!=='string'||typeof event.created_at!=='string'||!Number.isFinite(Date.parse(event.created_at))||Date.parse(event.created_at)<start||Date.parse(event.created_at)>end)throw Error('Invalid revocation replay event or window');
   // Validate foreign-client envelopes too, but never write their revocations.
   const normalized=normalizedRevocation(event,event.context.client_id);
   if(seen.has(event.id)){if(seen.get(event.id)!==normalized.digest)throw Error('Revocation replay event identity conflict');continue;}
   seen.set(event.id,normalized.digest);if(seen.size>maxEvents)throw Error('Revocation replay exceeds complete-window limit');
   if(event.context.client_id!==clientId)foreignClient++;else events.push(normalized);
  }
  const next=page.list_metadata.after;
  if(next===undefined||next===null){complete=true;break;}
  if(!eventId(next)||!page.data.length||next!==page.data.at(-1).id||cursors.has(next))throw Error('Invalid revocation replay cursor');
  cursors.add(next);cursor=next;
 }
 if(!complete)throw Error('Revocation replay exceeds complete-window page limit');
 // Finish validating the complete selected window before changing sessions.
 // If a repository write fails, retry the same window; committed events dedupe.
 const counts={applied:0,duplicate:0};
 for(const event of events){const result=await repository.apply(clientId,event,now());if(!Object.hasOwn(counts,result?.status))throw Error('Invalid revocation replay repository result');counts[result.status]++;}
 return {rangeStart,rangeEnd,pages,events:seen.size,foreignClient,...counts,window:'replayed',historicalCoverage:'not-proven',scheduler:'not-installed'};
}
module.exports={replayRevocations};
