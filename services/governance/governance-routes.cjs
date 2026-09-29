const {createHash}=require('node:crypto');
const only=(body,keys)=>{if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))throw Error('Unsupported request field');};
const reference=v=>{if(typeof v!=='string'||! /^[A-Za-z0-9._:-]{1,128}$/.test(v))throw Error('Invalid reference');return v;};
async function governanceRoutes({req,url,send,principal:p,user,store,services,parseStrictJson}){
 const isRoute=['/v1/rules','/v1/rules/preview','/v1/incidents'].includes(url.pathname)||url.pathname.startsWith('/v1/incidents/');
 if(!isRoute)return false;
 if(req.method==='POST'&&(!user||!p.scopes.includes('manage-governance'))){send(403,{error:'Governance administrator workspace permission required'});return true;}
 if(req.method==='GET'&&!p.scopes.includes('read')){send(403,{error:'Read scope required'});return true;}
 const engine=services.ruleEngine;if(!engine){send(503,{error:'Rules and detected incidents are not enabled on this deployment'});return true;}
 try{
  const actorRef='workspace-'+createHash('sha256').update(p.actorId||'').digest('hex');
  const id=url.pathname.startsWith('/v1/incidents/')?reference(decodeURIComponent(url.pathname.slice('/v1/incidents/'.length))):null;
  if(req.method==='GET'){
   if(url.pathname==='/v1/rules'){send(200,{rules:engine.activeRules(p),destinations:Object.entries(services.notificationDestinations||{}).filter(([,target])=>target.tenant===p.tenant&&target.project===p.project).map(([id])=>id).sort().slice(0,100)});return true;}
   if(url.pathname==='/v1/incidents'){send(200,{...engine.incidentPage(p,{limit:Number(url.searchParams.get('limit')||50),offset:Number(url.searchParams.get('offset')||0)}),scope:'Detected incidents across all dates in this workspace; newest first'});return true;}
   if(id){const incident=engine.getIncident(p,id);send(incident?200:404,incident?{incident,history:engine.history(p,id)}:{error:'Incident not found'});return true;}
  }
  if(req.method!=='POST'){send(405,{error:'Method not allowed'});return true;}
  if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']){send(415,{error:'Uncompressed JSON required'});return true;}
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096){send(413,{error:'Governance request exceeds 4 KiB'});return true;}chunks.push(chunk);}
  const input=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  function bindRule(definition){
   only(definition,['id','version','environment','agentRef','taskClass','condition','thresholdMs','severity','destinationRef']);
   if(!definition.destinationRef)return definition;
   reference(definition.destinationRef);const target=services.notificationDestinations?.[definition.destinationRef];
   if(!target||target.tenant!==p.tenant||target.project!==p.project)throw Error('Destination not available');
   return {...definition,keyRef:target.keyRef};
  }
  if(url.pathname==='/v1/rules'){const created=engine.register(p,bindRule(input),{actorRef});send(created?201:200,{status:created?'created':'duplicate'});return true;}
  if(url.pathname==='/v1/rules/preview'){
   only(input,['rule','eventIds']);if(!Array.isArray(input.eventIds)||input.eventIds.length>100||new Set(input.eventIds).size!==input.eventIds.length)throw Error('Invalid preview references');
   const events=[];for(const eventId of input.eventIds){reference(eventId);const event=await store.get(p,eventId);if(!event){send(404,{error:'Preview record not found'});return true;}events.push(event);}
   send(200,{results:engine.preview(p,bindRule(input.rule),events),coverage:'Selected accepted records only; no completeness or safety guarantee'});return true;
  }
  if(id){only(input,['actionId','action','reasonCode','expectedRevision']);const revision=engine.transition(p,id,{...input,actorRef});send(200,{revision});return true;}
  send(404,{error:'Route not found'});return true;
 }catch(error){
  const status=/conflict|must increase|must not decrease/.test(error.message)?409:/not found/.test(error.message)?404:/capacity/.test(error.message)?429:error.code?.startsWith('SQLITE')?500:400;
  send(status,{error:status===409?'State or identity conflict':status===404?'Record not found':status===429?'Governance capacity reached':status===500?'Governance storage unavailable':'Invalid governance operation'});return true;
 }
}
module.exports={governanceRoutes};
