const {randomBytes,createHash,createCipheriv,createDecipheriv}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function workosConfig(env){
 const mode=env.GOVERNANCE_IDENTITY_PROVIDER||'configured';
 if(!['configured','workos'].includes(mode))throw new Error('Unknown identity provider');
 if(mode==='configured')return null;
 if(!/^client_[A-Za-z0-9]+$/.test(env.WORKOS_CLIENT_ID||'')||!/^sk_[A-Za-z0-9_]+$/.test(env.WORKOS_API_KEY||'')||!/^[a-f0-9]{64}$/.test(env.GOVERNANCE_IDENTITY_SEAL_KEY||''))throw new Error('WorkOS server credentials and sealing key required');
 const redirect=new URL(env.WORKOS_REDIRECT_URI||'');
 if(redirect.username||redirect.password||redirect.hash||redirect.search||redirect.pathname!=='/api/auth/callback'||(redirect.protocol!=='https:'&&!(redirect.protocol==='http:'&&['localhost','127.0.0.1'].includes(redirect.hostname))))throw new Error('Invalid WorkOS redirect URI');
 const pilotEmails=env.WORKOS_PILOT_ALLOWED_EMAILS;
 let allowedEmails=null;
 if(pilotEmails!==undefined){
  if(typeof pilotEmails!=='string'||!pilotEmails||pilotEmails.length>8192)throw new Error('Invalid pilot admission list');
  const entries=pilotEmails.split(',').map(email=>email.trim().toLowerCase());
  if(entries.length>100||entries.some(email=>email.length>254||!/^[^\s@,*]+@[^\s@,*]+\.[^\s@,*]+$/.test(email))||new Set(entries).size!==entries.length)throw new Error('Invalid pilot admission list');
  allowedEmails=new Set(entries);
 }
 if(!['localhost','127.0.0.1'].includes(redirect.hostname)&&!allowedEmails)throw new Error('Hosted WorkOS requires a pilot admission list');
 const webhookSecret=env.WORKOS_WEBHOOK_SECRET||null;
 if(webhookSecret&&(typeof webhookSecret!=='string'||webhookSecret.length<32||webhookSecret.length>256||/[\x00-\x20\x7f]/.test(webhookSecret)))throw new Error('Invalid WorkOS webhook secret');
 return {clientId:env.WORKOS_CLIENT_ID,apiKey:env.WORKOS_API_KEY,sealKey:Buffer.from(env.GOVERNANCE_IDENTITY_SEAL_KEY,'hex'),redirectUri:redirect.href,webhookSecret,allowedEmails};
}
class WorkosAuth {
 constructor(db,directory,auth,config,{fetcher=fetch,now=Date.now,keySet=null,sessions=null,startRequestLimits=null}={}){
  this.directory=directory;this.auth=auth;this.config=config;this.fetcher=fetcher;this.now=now;this.keySet=keySet;this.renewals=new Map();
  this.sessions=sessions||new (require('./sqlite-provider-sessions.cjs').SqliteProviderSessions)(db);this.startRequestLimits=startRequestLimits;
 }
 admitted(email){return typeof email==='string'&&(!this.config.allowedEmails||this.config.allowedEmails.has(email.toLowerCase()));}
 async replayRevocations(options){
  if(!options||Object.keys(options).some(k=>!['rangeStart','rangeEnd','maxPages','maxEvents'].includes(k)))throw Error('Invalid revocation replay options');
  return require('./workos-revocation-replay.cjs').replayRevocations({...options,clientId:this.config.clientId,apiKey:this.config.apiKey,fetcher:this.fetcher,repository:this.sessions.revocations,now:this.now});
 }
 async reconcileRevocations(options){
  if(!options||Object.keys(options).some(k=>!['startAt','overlapMs'].includes(k)))throw Error('Invalid coordinated replay options');
  return require('./workos-revocation-step.cjs').revocationStep({...options,clientId:this.config.clientId,progress:this.sessions.replayProgress,replay:input=>this.replayRevocations(input),now:this.now});
 }
 async revocationStatus(options={}){
  if(!options||Object.keys(options).some(k=>k!=='maxLagSeconds'))throw Error('Invalid replay monitoring options');
  return require('./workos-revocation-status.cjs').revocationStatus({...options,clientId:this.config.clientId,progress:this.sessions.replayProgress,now:this.now});
 }
 seal(value,state){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.config.sealKey,nonce);cipher.setAAD(Buffer.from(state));const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64');}
 unseal(value,state){const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',this.config.sealKey,data.subarray(0,12));cipher.setAAD(Buffer.from(state));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8');}
 async verifiedResult(result){
  const user=result.user;
  if(result.impersonator||user?.email_verified!==true||typeof user.id!=='string'||!/^user_[A-Za-z0-9]+$/.test(user.id)||(user.object!==undefined&&user.object!=='user')||typeof result.access_token!=='string'||result.access_token.length>16384)throw fail(401,'Verified customer sign-in required');
  const {createRemoteJWKSet,jwtVerify}=await import('jose');
  this.keySet||=createRemoteJWKSet(new URL('https://api.workos.com/sso/jwks/'+this.config.clientId),{timeoutDuration:5000});
  const {payload}=await jwtVerify(result.access_token,this.keySet,{algorithms:['RS256'],issuer:['https://api.workos.com','https://api.workos.com/user_management/'+this.config.clientId],requiredClaims:['sub','sid','exp','iat'],currentDate:new Date(this.now()),clockTolerance:0});
  if(payload.act||payload.client_id!==undefined&&payload.client_id!==this.config.clientId||payload.sub!==user.id||typeof payload.sid!=='string'||!/^session_[A-Za-z0-9]+$/.test(payload.sid)||!Number.isSafeInteger(payload.exp)||!Number.isSafeInteger(payload.iat)||payload.iat>Math.floor(this.now()/1000)+5||(payload.aud!==undefined&&payload.aud!==this.config.clientId&&!(Array.isArray(payload.aud)&&payload.aud.includes(this.config.clientId))))throw fail(401,'Sign-in could not be verified');
  // Agent tokens can share signing keys with users. Never turn one into a
  // human customer session, including during refresh of an existing session.
  if(payload.sub_profile!==undefined&&payload.sub_profile!=='user')throw fail(401,'Human customer sign-in required');
  if(payload.auth_time!==undefined&&(!Number.isSafeInteger(payload.auth_time)||payload.auth_time<0||payload.auth_time>payload.iat||payload.auth_time>Math.floor(this.now()/1000)))throw fail(401,'Active authentication could not be verified');
  return {user,payload};
 }
 async exchange(input){
  const response=await this.fetcher('https://api.workos.com/user_management/authenticate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_id:this.config.clientId,client_secret:this.config.apiKey,...input}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok){await response.body?.cancel();throw fail(401,'Sign-in could not be verified');}
  const reader=response.body?.getReader();if(!reader)throw fail(401,'Sign-in could not be verified');const chunks=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>65536){await reader.cancel();throw fail(401,'Sign-in could not be verified');}chunks.push(value);}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 }
 refreshCredential(result,sessionHash){
  if(typeof result.refresh_token!=='string'||!result.refresh_token||result.refresh_token.length>8192)throw fail(401,'Provider renewal credential unavailable');
  return this.seal(result.refresh_token,'refresh:'+sessionHash);
 }
 async resolve(token){
  if(!/^[a-f0-9]{64}$/.test(token||''))return null;
  const sessionHash=hash(token);
  if(this.renewals.has(sessionHash))return this.renewals.get(sessionHash);
  const pending=(async()=>{const principal=await this.resolveSession(token,sessionHash);if(principal?.customer&&!this.admitted(principal.email)){await this.auth.logout(token);return null;}return principal;})();this.renewals.set(sessionHash,pending);
  try{return await pending;}finally{this.renewals.delete(sessionHash);}
 }
 async resolveSession(token,sessionHash){
  const {session:row,provider}=await this.sessions.read(sessionHash);
  if(!row?.version.startsWith('provider:'))return this.auth.resolve(token);
  const identity=await this.directory.identity(row.user_id),now=this.now();
  if(!identity||row.version!=='provider:'+await this.auth.version(identity)||!provider||now-row.created>=28800000||now-row.touched>=1800000){await this.auth.logoutHash(sessionHash);return null;}
  if(await this.sessions.revocations.revoked(this.config.clientId,provider.session_id,await this.sessions.subject(row.user_id))){await this.auth.logoutHash(sessionHash);return null;}
  if(provider.expires>now+30000)return this.auth.resolve(token);
  // Consume durably before exchange: crashes/timeouts cannot replay a rotating token.
  const owner=randomBytes(32).toString('hex'),waitUntil=Date.now()+12000;
  let claimed=await this.sessions.claim(sessionHash,owner,this.now());
  while(claimed.status==='busy'&&Date.now()<waitUntil){
   await require('node:timers/promises').setTimeout(50);
   claimed=await this.sessions.claim(sessionHash,owner,this.now());
  }
  if(claimed.status==='ready')return this.auth.resolve(token);
  // A slow live owner must not be invalidated by another request's wait budget.
  if(claimed.status==='busy')throw fail(503,'Session renewal in progress; retry shortly');
  if(claimed.status!=='acquired'){await this.auth.logoutHash(sessionHash);return null;}
  try{
   const result=await this.exchange({grant_type:'refresh_token',refresh_token:this.unseal(claimed.credential,'refresh:'+sessionHash)});
   const {user,payload}=await this.verifiedResult(result),currentIdentity=await this.directory.identity(row.user_id);
   if(!this.admitted(user.email))throw fail(403,'Pilot access is by invitation');
   if(user.id!==await this.sessions.subject(row.user_id)||payload.sid!==provider.session_id||!currentIdentity||row.version!=='provider:'+await this.auth.version(currentIdentity))throw fail(401,'Renewal identity changed');
   const credential=this.refreshCredential(result,sessionHash);
   if(await this.sessions.revocations.revoked(this.config.clientId,provider.session_id,user.id))throw fail(401,'Provider session revoked');
   await this.sessions.complete(sessionHash,owner,{version:row.version,sessionId:provider.session_id},credential,Math.min(payload.exp*1000,this.now()+900000),this.now());
   return this.auth.resolve(token);
  }catch{await this.auth.logoutHash(sessionHash);return null;}
 }
 async start({browser,screen='sign-in',reauthenticate=false},previousToken=''){
  if(!/^[a-f0-9]{64}$/.test(browser||'')||!['sign-in','sign-up'].includes(screen))throw fail(400,'Invalid sign-in request');
  if(typeof reauthenticate!=='boolean'||reauthenticate&&screen!=='sign-in')throw fail(400,'Invalid reauthentication request');
  if(this.startRequestLimits){const budget=await this.startRequestLimits.consume(this.config.clientId);if(!budget.allowed)throw Object.assign(fail(429,'Sign-in start limit reached'),{code:'auth-start-limit',retryAfter:budget.retryAfter});}
  const prior=reauthenticate?await this.resolve(previousToken):null;if(reauthenticate&&!prior?.customer)throw fail(401,'Sign in required');
  const now=this.now();
  const state=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url'),stateHash=hash(state);
  await this.sessions.createFlow({state_hash:stateHash,browser_hash:hash(browser),verifier:this.seal(verifier,stateHash),expires:now+300000,previous_hash:/^[a-f0-9]{64}$/.test(previousToken)?hash(previousToken):null,reauth_user_id:prior?.id||null},now);
  const url=new URL('https://api.workos.com/user_management/authorize');url.search=new URLSearchParams({client_id:this.config.clientId,redirect_uri:this.config.redirectUri,response_type:'code',provider:'authkit',state,screen_hint:screen,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
  if(reauthenticate)url.searchParams.set('max_age','0');
  return {url:url.href};
 }
 async callback({state,browser,code}){
  if(!/^[a-f0-9]{64}$/.test(state||'')||!/^[a-f0-9]{64}$/.test(browser||'')||typeof code!=='string'||!code||code.length>1024)throw fail(401,'Sign-in could not be verified');
  // Consume before the network call: concurrent/replayed callbacks never exchange twice.
  const row=await this.sessions.consumeFlow(hash(state),hash(browser),this.now());
  if(!row)throw fail(401,'Sign-in expired or already used; start again');
  try{
   const verifier=this.unseal(row.verifier,hash(state));
   const result=await this.exchange({grant_type:'authorization_code',code,code_verifier:verifier}),{user,payload}=await this.verifiedResult(result);
   if(!this.admitted(user.email))throw fail(403,'Pilot access is by invitation');
   if(row.reauth_user_id&&(user.id!==await this.sessions.subject(row.reauth_user_id)||!Number.isSafeInteger(payload.auth_time)||this.now()-payload.auth_time*1000>=300000))throw fail(401,'Fresh authentication for the same customer is required');
   const identity=await this.directory.verifiedIdentity({provider:'workos:'+this.config.clientId,subject:user.id,email:user.email,emailVerified:true});
   if(await this.sessions.revocations.revoked(this.config.clientId,payload.sid,user.id))throw fail(401,'Provider session revoked');
   const session=await this.auth.loginVerified(identity.id,'',{expiresAt:Math.min(payload.exp*1000,this.now()+900000),providerSessionId:payload.sid,previousHash:row.previous_hash,clientId:this.config.clientId,subject:user.id,authenticatedAt:payload.auth_time===undefined?null:payload.auth_time*1000});
   try{await this.sessions.storeCredential(hash(session.token),this.refreshCredential(result,hash(session.token)));}catch(e){await this.auth.logout(session.token);throw e;}
   if(row.previous_hash)await this.auth.logoutHash(row.previous_hash);
   return {...session,...(row.reauth_user_id?{reauthenticated:true}:{})};
  }catch(e){if(e.status)throw e;throw fail(401,'Sign-in could not be verified; start again');}
 }
}
module.exports={WorkosAuth,workosConfig};
