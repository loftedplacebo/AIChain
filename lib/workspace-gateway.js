// Server-only gateway. Never import this module into a client component.
export async function workspaceGateway(request,config={},fetcher=fetch){
 const headers={'cache-control':'no-store, private','x-content-type-options':'nosniff','vary':'Cookie'};
 const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{...headers,...extra}});
 try{
  const url=new URL(request.url),origin=new URL(config.origin||'http://localhost:3001');
  const local=origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname);
  if(origin.protocol!=='https:'&&!local)return json({error:'Workspace service configuration unavailable'},503);
  if(url.origin!==origin.origin)return json({error:'Workspace origin not allowed'},403);
  const base=new URL(config.api||'http://127.0.0.1:8790');
  if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))return json({error:'Workspace service configuration unavailable'},503);
  const name=local?'workspace_session':'__Host-workspace_session';
  const cookie=(value,maxAge)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${local?'':'; Secure'}`;
  const cookies=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
  const token=cookies.length===1?cookies[0].slice(name.length+1):'';
  const upstreamHeaders={'content-type':'application/json'};
  if(/^[a-f0-9]{64}$/.test(token))upstreamHeaders['x-workspace-session']=token;
  const action=url.searchParams.get('action')||'session';
  if(action==='invitations'&&['state','limit','offset'].some(key=>url.searchParams.getAll(key).length>1))return json({error:'Duplicate invitation list filters'},400);
  if(action==='keys'&&['state','limit','offset'].some(key=>url.searchParams.getAll(key).length>1))return json({error:'Duplicate key list filters'},400);
  const customerActions=['workspace-create','project-create','member-change','invitation-create','invitation-revoke','invitation-accept','session-revoke'];
  const customerPath='/v1/workspaces/'+encodeURIComponent(url.searchParams.get('organization')||'');
  let path='/v1/session',body;
  if(request.method!=='GET'){
   if(request.headers.get('origin')!==origin.origin)return json({error:'Same-origin request required'},403);
   if(!((action==='session'&&['POST','DELETE'].includes(request.method))||([...customerActions,'review','rule','rule-preview','incident-action','key-create','key-rotate','key-revoke'].includes(action)&&request.method==='POST')))return json({error:'Method not allowed'},405);
   if(customerActions.includes(action)){
    if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Sign in required'},401);
    path=action==='session-revoke'?'/v1/account/sessions/revoke':action==='workspace-create'?'/v1/workspaces':action==='invitation-accept'?'/v1/invitations/accept':customerPath+'/'+({'project-create':'projects','member-change':'members','invitation-create':'invitations','invitation-revoke':'invitations/revoke'}[action]);
   }
   if(['review','rule','rule-preview','incident-action','key-create','key-rotate','key-revoke'].includes(action)){
    if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Sign in required'},401);
    upstreamHeaders['x-workspace-id']=url.searchParams.get('workspace')||'';
    path=action==='rule'?'/v1/rules':action==='rule-preview'?'/v1/rules/preview':action==='incident-action'?'/v1/incidents/'+encodeURIComponent(url.searchParams.get('id')||''):'/v1/reviews';
    if(action==='key-create')path='/v1/keys';
    if(action==='key-rotate'||action==='key-revoke')path='/v1/keys/'+encodeURIComponent(url.searchParams.get('id')||'')+'/'+(action==='key-rotate'?'rotate':'revoke');
   }
   if(request.method==='POST'){
    if(request.headers.get('content-type')!=='application/json')return json({error:'JSON required'},415);
    const reader=request.body?.getReader();let bytes=0;const chunks=[];
    if(reader){while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();return json({error:'Request too large'},413);}chunks.push(value);}}
    const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
    body=new TextDecoder('utf-8',{fatal:true}).decode(all);
   }
  }else if(action!=='session'){
   if(!['report','events','event','export','evidence','evidence-export','evidence-status','agents','reviews','investigation','rules','incidents','incident','keys','members','invitations','account-sessions'].includes(action))return json({error:'Unknown workspace operation'},400);
   if(!token)return json({error:'Sign in required'},401);
   upstreamHeaders['x-workspace-id']=url.searchParams.get('workspace')||'';
   path=action==='reviews'?'/v1/reviews':action==='investigation'?'/v1/investigations/'+encodeURIComponent(url.searchParams.get('id')||''):action==='agents'?'/v1/agents':['evidence','evidence-export'].includes(action)?'/v1/evidence/'+encodeURIComponent(url.searchParams.get('id')||''):action==='event'?'/v1/events/'+encodeURIComponent(url.searchParams.get('id')||''):action==='events'?'/v1/events':'/v1/report';
   if(action==='rules')path='/v1/rules';if(action==='incidents')path='/v1/incidents';if(action==='incident')path='/v1/incidents/'+encodeURIComponent(url.searchParams.get('id')||'');
   if(action==='keys')path='/v1/keys';
   if(action==='evidence-status')path='/v1/evidence-status';
   if(['members','invitations'].includes(action))path=customerPath+'/'+action;
   if(action==='account-sessions'){path='/v1/account/sessions';delete upstreamHeaders['x-workspace-id'];}
   const query=new URLSearchParams();for(const key of ['from','to','deployment','limit','offset','q','state'])if(url.searchParams.has(key))query.set(key,url.searchParams.get(key));
   path+='?'+query;
  }
  const response=await fetcher(new URL(path,base),{method:request.method,headers:upstreamHeaders,body,redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(response.status>=300&&response.status<400)return json({error:'Workspace service unavailable'},503);
  const data=await response.json();
  if(!response.ok){const extra=response.status===401?{'set-cookie':cookie('',0)}:{};const retry=response.headers.get('retry-after');if(response.status===429&&/^[1-9][0-9]{0,4}$/.test(retry||'')&&Number(retry)<=86400)extra['retry-after']=retry;return json(data,response.status,extra);}
  if(request.method==='POST'&&action==='session')return json(data.user,200,{'set-cookie':cookie(data.token,28800)});
  if(request.method==='POST')return json(data,response.status);
  if(request.method==='DELETE')return json(data,200,{'set-cookie':cookie('',0)});
  if(action==='export')return new Response(JSON.stringify({...data,workspaceId:url.searchParams.get('workspace'),window:{from:url.searchParams.get('from'),to:url.searchParams.get('to'),deployment:url.searchParams.get('deployment')}},null,2),{headers:{...headers,'content-type':'application/json','content-disposition':'attachment; filename="governance-report.json"'}});
  if(action==='evidence-export')return new Response(JSON.stringify(data,null,2),{headers:{...headers,'content-type':'application/json','content-disposition':'attachment; filename="governance-evidence.json"'}});
  return json(data);
 }catch{return json({error:'Workspace service unavailable. Please try again.'},503);}
}
