// Server-only OAuth gateway: provider/application credentials never reach JS clients.
import {gatewayOrigins} from './gateway-origins.js';
export async function workosGateway(request,config={},fetcher=fetch){
 const headers={'cache-control':'no-store, private','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
 const json=(body,status,extra={})=>Response.json(body,{status,headers:{...headers,...extra}});
 try{
  const settings=gatewayOrigins(config),url=new URL(request.url);
  if(!settings)return json({error:'Sign-in origin unavailable'},503);
  const {origin,api:base,local}=settings;
  if(url.origin!==origin.origin)return json({error:'Sign-in origin unavailable'},503);
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const operation=url.pathname.split('/').at(-1);if(!['start','callback','status'].includes(operation))return json({error:'Unknown sign-in operation'},404);
  const name=local?'workspace_auth_flow':'__Host-workspace_auth_flow';
  const cookie=(value,age)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${local?'':'; Secure'}`;
  const getCookie=name=>{const matches=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));return matches.length===1?matches[0].slice(name.length+1):'';};
  const upstreamHeaders={'content-type':'application/json'},previous=getCookie(local?'workspace_session':'__Host-workspace_session');if(/^[a-f0-9]{64}$/.test(previous))upstreamHeaders['x-workspace-session']=previous;
  if(operation==='status'){
   const response=await fetcher(new URL('/v1/auth/status',base),{headers:upstreamHeaders,redirect:'manual',signal:AbortSignal.timeout(10000)});if(!response.ok)return json({enabled:false},503);const data=await response.json();return json({enabled:data.enabled===true&&data.provider==='workos'},200);
  }
  let input;
  if(operation==='start'){
   if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Open sign-in from this website'},403);
   const screen=url.searchParams.get('screen')||'sign-in';if(!['sign-in','sign-up'].includes(screen)||url.searchParams.getAll('screen').length>1)return json({error:'Invalid sign-in request'},400);
   const reauth=url.searchParams.get('reauth');if(url.searchParams.getAll('reauth').length>1||reauth!==null&&reauth!=='1'||reauth&&screen!=='sign-in')return json({error:'Invalid reauthentication request'},400);
   const random=crypto.getRandomValues(new Uint8Array(32)),browser=Array.from(random,b=>b.toString(16).padStart(2,'0')).join('');input={browser,screen,...(reauth?{reauthenticate:true}:{})};
  }else{
   const browser=getCookie(name),state=url.searchParams.get('state'),code=url.searchParams.get('code');
   if(url.searchParams.has('error')||url.searchParams.getAll('state').length!==1||url.searchParams.getAll('code').length!==1||!/^[a-f0-9]{64}$/.test(browser)||!/^[a-f0-9]{64}$/.test(state||'')||!code||code.length>1024)return new Response(null,{status:303,headers:{...headers,location:origin.origin+'/workspace?signin=failed','set-cookie':cookie('',0)}});
   input={state,code,browser};
  }
  const response=await fetcher(new URL('/v1/auth/'+operation,base),{method:'POST',headers:upstreamHeaders,body:JSON.stringify(input),redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!response.ok){if(operation==='callback')return new Response(null,{status:303,headers:{...headers,location:origin.origin+'/workspace?signin=failed','set-cookie':cookie('',0)}});if(response.status===429){const delay=response.headers.get('retry-after'),seconds=/^[1-9][0-9]?$/.test(delay||'')&&Number(delay)<=60?Number(delay):null;return json({error:seconds?`Sign-in is busy. Try again in ${seconds} ${seconds===1?'second':'seconds'}.`:'Sign-in is busy. Please wait before trying again.',code:'auth-start-limit',...(seconds?{retryAfter:seconds}:{})},429,seconds?{'retry-after':String(seconds)}:{});}return json({error:'Hosted sign-in unavailable; please try again'},503);}
  const data=await response.json();
  if(operation==='start'){
   const target=new URL(data.url);if(target.origin!=='https://api.workos.com'||target.pathname!=='/user_management/authorize'||target.username||target.password||target.searchParams.get('redirect_uri')!==origin.origin+'/api/auth/callback')return json({error:'Sign-in configuration mismatch'},503);
   return new Response(null,{status:303,headers:{...headers,location:target.href,'set-cookie':cookie(input.browser,300)}});
  }
  if(!/^[a-f0-9]{64}$/.test(data.token||''))return json({error:'Sign-in response unavailable'},503);
  const sessionName=local?'workspace_session':'__Host-workspace_session',result=new Headers(headers);
  result.set('location',origin.origin+'/workspace'+(data.reauthenticated===true?'?reauthenticated=1':''));result.append('set-cookie',`${sessionName}=${data.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${local?'':'; Secure'}`);result.append('set-cookie',cookie('',0));
  return new Response(null,{status:303,headers:result});
 }catch{return json({error:'Sign-in service unavailable; start again'},503);}
}
