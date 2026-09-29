'use strict';
const {createHmac,createHash,timingSafeEqual}=require('node:crypto');
const fail=(status,message)=>Object.assign(Error(message),{status});
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
function verifiedEvent(raw,signature,secret,clientId,parse,now=Date.now()){
 if(typeof signature!=='string'||signature.length>256)throw fail(401,'Webhook signature required');
 const match=/^t=([0-9]{13}),\s*v1=([a-f0-9]{64})$/.exec(signature);
 if(!match||Math.abs(now-Number(match[1]))>300000)throw fail(401,'Webhook signature expired or invalid');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(raw),expected=createHmac('sha256',secret).update(match[1]+'.'+text).digest();
 if(!timingSafeEqual(expected,Buffer.from(match[2],'hex')))throw fail(401,'Webhook signature expired or invalid');
 return normalizedRevocation(parse(text),clientId);
}
// Shared by signature-verified webhooks and authenticated server-side replay.
function normalizedRevocation(event,clientId){
 if(!event||typeof event!=='object'||Array.isArray(event)||typeof event.id!=='string'||!/^event_[A-Za-z0-9]+$/.test(event.id)||event.id.length>128||event.context?.client_id!==clientId)throw fail(400,'Invalid webhook identity or client context');
 if(event.event!=='session.revoked')throw fail(422,'Webhook event is not supported');
 if(event.data?.object!=='session'||typeof event.data.id!=='string'||!/^session_[A-Za-z0-9]+$/.test(event.data.id)||event.data.id.length>128||typeof event.data.user_id!=='string'||!/^user_[A-Za-z0-9]+$/.test(event.data.user_id)||event.data.user_id.length>128)throw fail(400,'Invalid session revocation');
 return {eventId:event.id,sessionId:event.data.id,subject:event.data.user_id,digest:createHash('sha256').update(JSON.stringify(canonical(event))).digest('hex')};
}
async function webhookRoute({req,url,send,config,repository,parse,now=Date.now}){
 if(url.pathname!=='/v1/auth/workos-webhook')return false;
 if(!config?.webhookSecret||!repository){send(503,{error:'Provider webhook is not configured'});return true;}
 if(req.method!=='POST'){send(405,{error:'Method not allowed'});return true;}
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||req.headers['content-encoding']){send(415,{error:'Uncompressed JSON required'});return true;}
 let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>65536){send(413,{error:'Webhook exceeds 64 KiB'});return true;}chunks.push(chunk);}
 const event=verifiedEvent(Buffer.concat(chunks),req.headers['workos-signature'],config.webhookSecret,config.clientId,parse,now());
 const result=await repository.apply(config.clientId,event,now());send(200,{received:true,status:result.status});return true;
}
module.exports={verifiedEvent,normalizedRevocation,webhookRoute};
