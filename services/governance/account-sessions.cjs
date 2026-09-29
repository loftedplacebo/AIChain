'use strict';
const {createHash}=require('node:crypto'),hash=v=>createHash('sha256').update(v).digest('hex'),valid=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(status,message)=>Object.assign(Error(message),{status});
const reference=row=>hash('customer-app-session:'+row.hash);
function selected(rows,current,version,now,revokeRef){
 const active=rows.filter(r=>r.version===(r.version.startsWith('provider:')?'provider:':'')+version&&now-Number(r.created)<28800000&&now-Number(r.touched)<1800000&&(!r.session_id||Number(r.expires)>now||r.renewable||Number(r.claim_expires)>now));
 if(active.length>20)throw fail(409,'Session inventory exceeds the customer limit');
 if(revokeRef){const target=active.find(r=>reference(r)===revokeRef);if(!target)throw fail(404,'App session not found');if(target.hash===current)throw fail(400,'Use Sign out to end this browser session');return target;}
 return {scope:'App sessions only; ending one does not revoke provider sign-in or API keys',sessions:active.map(r=>({ref:reference(r),current:r.hash===current,createdAt:Number(r.created),lastSeenAt:Number(r.touched),absoluteExpiresAt:Number(r.created)+28800000,renewalRequired:!!r.session_id&&Number(r.expires)<=now}))};
}
function validate(token,revokeRef){if(!valid(token))throw fail(401,'Sign in required');if(revokeRef!==null&&!valid(revokeRef))throw fail(400,'Invalid app session reference');}
function sqliteSessions(auth,token,revokeRef=null){
 validate(token,revokeRef);const db=auth.db;db.exec('BEGIN IMMEDIATE');try{
  const user=auth.resolve(token);if(!user?.customer)throw fail(401,'Customer sign-in required');
  if(revokeRef)try{auth.requireRecent(token);}catch(e){if(e.status===403){e.code='reauthentication-required';e.message='Sign in again before ending an app session';}throw e;}
  const rows=db.prepare(`SELECT s.*,p.session_id,p.expires,q.expires claim_expires,CASE WHEN r.credential IS NOT NULL THEN 1 ELSE 0 END renewable FROM workspace_sessions s LEFT JOIN workspace_provider_sessions p USING(hash) LEFT JOIN workspace_provider_refresh r USING(hash) LEFT JOIN workspace_refresh_claims q USING(hash) WHERE s.user_id=? ORDER BY s.created DESC LIMIT 21`).all(user.id);
  const result=selected(rows,hash(token),auth.version(user),auth.now(),revokeRef);
  if(revokeRef)auth.logoutHash(result.hash);
  db.exec('COMMIT');return revokeRef?{ended:true,scope:'App session only; provider sign-in and API keys remain separate'}:result;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
async function postgresSessions(auth,token,revokeRef=null){
 validate(token,revokeRef);return auth.sessions.tx({hash:hash(token)},async c=>{
  const initial=(await c.query('SELECT user_id FROM governance_customer_sessions WHERE hash=$1',[hash(token)])).rows[0];if(!initial)throw fail(401,'Sign in required');
  await auth.directory.context(c,{actor:initial.user_id});try{await auth.authorizeSessionIn(c,{actorId:initial.user_id,sessionToken:token},{write:!!revokeRef});}catch(e){if(e.status===403&&e.code==='reauthentication-required')e.message='Sign in again before ending an app session';throw e;}
  const user=await auth.directory.identityIn(c,initial.user_id),rows=(await c.query('SELECT hash,version,created,touched,session_id,expires,claim_expires,(credential IS NOT NULL) renewable FROM governance_customer_sessions WHERE user_id=$1 ORDER BY created DESC LIMIT 21',[initial.user_id])).rows,result=selected(rows,hash(token),auth.version(user),auth.now(),revokeRef);
  if(revokeRef)await c.query('DELETE FROM governance_customer_sessions WHERE hash=$1 AND user_id=$2',[result.hash,user.id]);
  return revokeRef?{ended:true,scope:'App session only; provider sign-in and API keys remain separate'}:result;
 });
}
async function accountSessionRoutes({req,url,send,auth,user,sessionToken,parse}){
 if(!['/v1/account/sessions','/v1/account/sessions/revoke'].includes(url.pathname))return false;
 if(!user?.customer){send(401,{error:'Customer sign-in required'});return true;}
 if(url.pathname==='/v1/account/sessions'&&req.method==='GET'){send(200,await auth.accountSessions(sessionToken));return true;}
 if(url.pathname!=='/v1/account/sessions/revoke'||req.method!=='POST'){send(405,{error:'Method not allowed'});return true;}
 if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']){send(415,{error:'Uncompressed JSON required'});return true;}
 const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>4096){send(413,{error:'Session request exceeds 4 KiB'});return true;}chunks.push(chunk);}
 const input=parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(!input||Array.isArray(input)||Object.keys(input).join(',')!=='ref'||!valid(input.ref)){send(400,{error:'Invalid app session reference'});return true;}
 send(200,await auth.accountSessions(sessionToken,input.ref));return true;
}
module.exports={sqliteSessions,postgresSessions,accountSessionRoutes};
