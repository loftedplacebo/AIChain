const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { GovernanceStore } = require('./store');
const { MAX_EVENT_BYTES } = require('../../sdk/typescript/governance-event');
const { WorkspaceAuth } = require('./auth.cjs');
function parseStrictJson(text) {
  const parsed = JSON.parse(text); let i=0;
  const ws=()=>{while (/\s/.test(text[i] || '') && i<text.length) i++;};
  function string() { const start=i++; while(i<text.length) { if(text[i]==='\\') { i+=2; continue; } if(text[i++]==='"') return JSON.parse(text.slice(start,i)); } }
  function value(depth=0) { if(depth>32) throw new SyntaxError('JSON nesting exceeds 32 levels'); ws(); if(text[i]==='{') { i++; const keys=new Set(); ws(); while(text[i]!=='}') { ws(); const key=string(); if(keys.has(key)) throw new Error('Duplicate JSON key'); keys.add(key); ws(); i++; value(depth+1); ws(); if(text[i]===',') i++; else break; } i++; } else if(text[i]==='[') { i++; ws(); while(text[i]!==']') { value(depth+1); ws(); if(text[i]===',') i++; else break; } i++; } else if(text[i]==='"') string(); else { while(i<text.length && !/[,}\]\s]/.test(text[i])) i++; } }
  value(); return parsed;
}
function createServer(store, credentials, users=[], sessionDb=store.db, evidenceOptions={},services={}) {
  const {assertRecoveryApproved}=require('./environment.cjs');for(const db of [store.db,sessionDb,services.ruleEngine?.db])assertRecoveryApproved(db);
  const agents=require('./agents.cjs');
  if(store.db)store.db.exec(agents.sqliteSchema);
  if(store.db)store.db.exec("CREATE INDEX IF NOT EXISTS governance_outcome_links ON events(tenant,project,json_extract(body,'$.outcome.forEventId')); CREATE INDEX IF NOT EXISTS governance_review_links ON events(tenant,project,json_extract(body,'$.source.integrationVersion'),json_extract(body,'$.parentEventRefs[0]'));");
  const directory=services.directory||new (require('./customer-directory.cjs').CustomerDirectory)(sessionDb);
  const auth=services.auth||new WorkspaceAuth(sessionDb,users,Date.now,directory);
  if(sessionDb&&[directory.db,auth.db,auth.directory?.db].some(db=>db&&db!==sessionDb))throw Error('SQLite customer directory and sessions require co-located storage');
  const identityProvider=services.workosConfig?new (require('./workos-auth.cjs').WorkosAuth)(sessionDb,directory,auth,services.workosConfig,services.workosOptions):null;
  if(!services.projectKeys&&auth.db!==sessionDb)throw Error('SQLite key administration requires co-located session storage');
  const projectKeys=services.projectKeys||new (require('./project-keys.cjs').ProjectKeys)(sessionDb,{authorize:(p,{write})=>{
    const current=auth.resolve(p.sessionToken);
    if(!current||current.id!==p.actorId)throw Object.assign(Error('Sign in required'),{status:401});
    if(identityProvider&&write)try{auth.requireRecent(p.sessionToken);}catch(e){if(e.status===403)e.code='reauthentication-required';throw e;}
    const checked=auth.principal(current,p.workspaceId);
    if(!checked.scopes.includes('manage-keys')||checked.tenant!==p.tenant||checked.project!==p.project)throw Object.assign(Error('Workspace administrator permission required'),{status:403});
  }});
  const guard=require('./http-limits.cjs').requestGuard(services.httpLimits),limits=guard.config;
  const server=http.createServer({maxHeaderSize:limits.maxHeaderSize,headersTimeout:limits.headersTimeoutMs,requestTimeout:limits.uploadTimeoutMs,connectionsCheckingInterval:Math.min(1000,limits.headersTimeoutMs)},async(req,res)=>{
    const release=guard.accept(req,res);if(!release)return;
    const parseRequestJson=text=>{if(res.writableEnded||(req.destroyed&&!req.complete))throw Object.assign(Error('Request no longer active'),{status:408});return parseStrictJson(text);};
    const send=(status,body)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff',...(!req.complete&&(Number(req.headers['content-length']||0)>0||req.headers['transfer-encoding'])?{connection:'close'}:{})});res.end(JSON.stringify(body));};
    try {
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET' && url.pathname==='/health') return send(200,{status:'ok',mode:'local-development',sourceContent:'not-supported'});
      if(req.method==='GET' && url.pathname==='/ready') {
        let result;try{result=await services.readiness?.check();}catch{}
        const ready=result?.status==='ready';
        return send(ready?200:503,{status:ready?'ready':'not-ready'});
      }
      const sessionToken=req.headers['x-workspace-session']||'';
      if(await require('./workos-webhook.cjs').webhookRoute({req,url,send,config:services.workosConfig,repository:identityProvider?.sessions.revocations,parse:parseRequestJson,now:services.workosOptions?.now}))return;
      if(await require('./workos-routes.cjs').workosRoutes({req,url,send,provider:identityProvider,parseStrictJson:parseRequestJson,sessionToken}))return;
      if(url.pathname==='/v1/session' && req.method==='POST') {
        if(req.headers['content-type']!=='application/json'||req.headers['content-encoding'])return send(415,{error:'JSON required'});
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)return send(413,{error:'Request too large'});chunks.push(chunk);}
        const body=parseRequestJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        return send(200,await auth.login(body.email,body.password,sessionToken));
      }
      if(url.pathname==='/v1/session' && req.method==='DELETE'){return send(200,{signedOut:true,...await auth.logout(sessionToken)});}
      const user=sessionToken?await (identityProvider?identityProvider.resolve(sessionToken):auth.resolve(sessionToken)):null;
      if(user?.customer&&services.customerRequestLimits){const budget=await services.customerRequestLimits.consume(user.id,req.method==='GET'?'read':'write');if(!budget.allowed){res.setHeader('retry-after',String(budget.retryAfter));return send(429,{error:'Customer request limit reached',code:'customer-request-limit',retryAfter:budget.retryAfter});}}
      if(url.pathname==='/v1/session' && req.method==='GET')return send(user?200:401,user?await auth.publicUser(user):{error:'Sign in required'});
      if(await require('./account-sessions.cjs').accountSessionRoutes({req,url,send,auth,user,sessionToken,parse:parseRequestJson}))return;
      const reauthorizeCustomer=async()=>{
        const current=await (identityProvider?identityProvider.resolve(sessionToken):auth.resolve(sessionToken));
        if(!current||current.id!==user?.id)throw Object.assign(Error('Sign in required'),{status:401});
        if(identityProvider)try{await auth.requireRecent(sessionToken);}catch(e){if(e.status===403)e.code='reauthentication-required';throw e;}
        return current;
      };
      if(identityProvider&&user&&req.method==='POST'&&(url.pathname==='/v1/invitations/accept'||url.pathname==='/v1/workspaces'||url.pathname.startsWith('/v1/workspaces/')||url.pathname==='/v1/keys'||url.pathname.startsWith('/v1/keys/'))){
        try{await auth.requireRecent(sessionToken);}catch(e){if(e.status!==403)throw e;return send(403,{error:e.message,code:'reauthentication-required'});}
      }
      if(url.pathname==='/v1/invitations/accept'||url.pathname==='/v1/workspaces'||url.pathname.startsWith('/v1/workspaces/')){
        if(!user)return send(401,{error:'Sign in required'});
        if(await require('./customer-routes.cjs').customerRoutes({req,url,send,user,directory,parseStrictJson:parseRequestJson,reauthorize:reauthorizeCustomer,authorizeTransaction:(connection,actor,{write})=>{
          if(auth.authorizeSessionIn)return auth.authorizeSessionIn(connection,{actorId:actor,sessionToken},{write});
          if(connection!==sessionDb||auth.db!==sessionDb)throw Error('Customer session authorization requires co-located storage');
          const current=auth.resolve(sessionToken);if(!current||current.id!==actor)throw Object.assign(Error('Sign in required'),{status:401});
          if(identityProvider&&write)try{auth.requireRecent(sessionToken);}catch(e){if(e.status===403)e.code='reauthentication-required';throw e;}
        }}))return;
      }
      const supplied=Buffer.from((req.headers.authorization || '').replace(/^Bearer /,''));
      const bearer=supplied.toString();
      const principal=sessionToken?(user?await auth.principal(user,req.headers['x-workspace-id']):null):bearer.startsWith('ovk_')?await projectKeys.resolve(bearer):credentials.find(c=>{const expected=Buffer.from(c.token);return expected.length===supplied.length && timingSafeEqual(expected,supplied);});
      if(!principal) return send(401,{error:'Valid project credential required'});
      if(services.projectRequestLimits){const budget=await services.projectRequestLimits.consume(principal,req.method==='GET'?'read':'write');if(!budget.allowed){res.setHeader('retry-after',String(budget.retryAfter));return send(429,{error:'Project request limit reached',code:'project-request-limit',retryAfter:budget.retryAfter});}}
      if(await require('./project-key-routes.cjs').projectKeyRoutes({req,url,send,principal:{...principal,sessionToken,workspaceId:req.headers['x-workspace-id']},user,keys:projectKeys,parseStrictJson:parseRequestJson,reauthorize:async()=>{
        const current=await reauthorizeCustomer();
        const checked=await auth.principal(current,req.headers['x-workspace-id']);
        if(!checked.scopes.includes('manage-keys')||checked.tenant!==principal.tenant||checked.project!==principal.project||checked.actorId!==principal.actorId)throw Object.assign(Error('Workspace administrator permission required'),{status:403});
      }}))return;
      if(await require('./governance-routes.cjs').governanceRoutes({req,url,send,principal,user,store,services,parseStrictJson:parseRequestJson}))return;
      if(req.method==='POST'&&url.pathname==='/v1/reviews'){
        if(!user||!principal.scopes.includes('review'))return send(403,{error:'Reviewer workspace permission required'});
        if(req.headers['content-type']!=='application/json'||req.headers['content-encoding'])return send(415,{error:'Uncompressed JSON required'});
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)return send(413,{error:'Review exceeds 4 KiB'});chunks.push(chunk);}
        const input=parseRequestJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        const result=await require('./reviews.cjs').submitReview(store,principal,input);return send(result.status==='duplicate'?200:201,result);
      }
      if(req.method==='POST' && ['/v1/agents','/v1/agents/heartbeat'].includes(url.pathname)){
        if(!principal.scopes.includes('write'))return send(403,{error:'Write scope required'});
        if(req.headers['content-type']!=='application/json'||req.headers['content-encoding'])return send(415,{error:'Uncompressed JSON required'});
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)return send(413,{error:'Agent request exceeds 4 KiB'});chunks.push(chunk);}
        const body=parseRequestJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        const result=await (url.pathname.endsWith('/heartbeat')?agents.heartbeatAgent:agents.registerAgent)(store,principal,body);
        return send(result.status==='registered'?201:200,result);
      }
      if(req.method==='POST' && url.pathname==='/v1/events') {
        if(!principal.scopes.includes('write')) return send(403,{error:'Write scope required'});
        if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') || req.headers['content-encoding']) return send(415,{error:'Uncompressed UTF-8 application/json required'});
        let bytes=0;const chunks=[];
        for await(const chunk of req) {bytes+=chunk.length;if(bytes>MAX_EVENT_BYTES)return send(413,{error:'Event exceeds 64 KiB'});chunks.push(chunk);}
        const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
        const input=parseRequestJson(text);if(require('./reviews.cjs').reserved(input))return send(403,{error:'Portal review identity is reserved for authenticated reviews'}); if(input.source?.integrationVersion==='orvessian-rules-0.1.0-alpha'||input.source?.keyRef==='governance-rule-engine')return send(403,{error:'Rule-engine identity is reserved for detected records'}); const result=await store.ingest(input,principal); return send(result.status==='duplicate'?200:201,result);
      }
      if(req.method==='GET') {
        if(!principal.scopes.includes('read')) return send(403,{error:'Read scope required'});
        if(url.pathname==='/v1/evidence-status')return send(200,await store.evidenceStatus(principal));
        if(url.pathname.startsWith('/v1/investigations/'))return send(200,await require('./reviews.cjs').investigation(store,principal,decodeURIComponent(url.pathname.slice('/v1/investigations/'.length))));
        if(url.pathname==='/v1/agents')return send(200,await agents.listAgents(store,principal,{limit:Number(url.searchParams.get('limit')||50),offset:Number(url.searchParams.get('offset')||0)}));
        if(url.pathname.startsWith('/v1/evidence/')){
          const id=decodeURIComponent(url.pathname.slice('/v1/evidence/'.length));const event=await store.get(principal,id);if(!event)return send(404,{error:'Event not found'});
          const stored=await store.evidence(principal,id);
          const verification=await require('./evidence.cjs').inspectEvidence(event,stored,evidenceOptions);
          return send(200,{event,verification,evidence:stored?.bundle||null});
        }
        const range={from:url.searchParams.get('from')||'',to:url.searchParams.get('to')||'9999',deployment:url.searchParams.get('deployment')||''};
        if((range.from && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(range.from))||(range.to!=='9999'&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(range.to))||range.from>=range.to)return send(400,{error:'Use an ordered UTC date range'});
        if(url.pathname==='/v1/reviews')return send(200,await require('./reviews.cjs').queue(store,principal,{...range,q:url.searchParams.get('q')||'',state:url.searchParams.get('state')||'all',limit:Number(url.searchParams.get('limit')||50),offset:Number(url.searchParams.get('offset')||0)}));
        if(url.pathname==='/v1/report') {
          const report=await store.report(principal,range);
          report.assurance={...report.assurance,signatures:'not-evaluated-in-aggregate',anchoring:'inspect-individual-record-evidence'};
          return send(200,report);
        }
        if(url.pathname==='/v1/events') {
          const q=url.searchParams.get('q')||'';if(q.length>256)return send(400,{error:'Search is limited to 256 characters'});
          const limit=Number(url.searchParams.get('limit')||100),offset=Number(url.searchParams.get('offset')||0);
          if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0)return send(400,{error:'Invalid pagination'});
          return send(200,await store.list(principal,{...range,limit,offset,q,deployment:url.searchParams.get('deployment')||''}));
        }
        if(url.pathname.startsWith('/v1/events/')) {const event=await store.get(principal,decodeURIComponent(url.pathname.slice(11)));return send(event?200:404,event||{error:'Event not found'});}
      }
      send(404,{error:'Route not found'});
    }catch(e){const status=e.status || (e instanceof TypeError || e instanceof SyntaxError || e.message==='Duplicate JSON key'?400:500),retry=status===429&&e.code==='auth-start-limit'&&Number.isInteger(e.retryAfter)&&e.retryAfter>=1&&e.retryAfter<=60?e.retryAfter:null;if(retry)res.setHeader('retry-after',String(retry));send(status,{error:e.status?e.message:status===400?'Invalid event or request':'Unable to complete request',...(status===403&&e.code==='reauthentication-required'?{code:e.code}:{}),...(retry?{code:e.code,retryAfter:retry}:{})});}finally{release();}
  });
  server.maxConnections=limits.maxConnections;
  server.setTimeout(limits.idleTimeoutMs,socket=>socket.destroy());
  return server;
}
module.exports={createServer,parseStrictJson};
if(require.main===module) require('./start.cjs').start().catch(()=>{console.error('Governance startup failed; check storage configuration and migrations');process.exitCode=1;});
