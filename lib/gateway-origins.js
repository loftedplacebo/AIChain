// Server-only origin validation shared by the workspace and sign-in gateways.
const loopback=host=>['localhost','127.0.0.1'].includes(host);

function exactOrigin(value){
 if(typeof value!=='string'||!value.trim())return null;
 try{
  const url=new URL(value);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;
  const local=url.protocol==='http:'&&loopback(url.hostname);
  if(!local&&(url.protocol!=='https:'||loopback(url.hostname)))return null;
  return {url,local};
 }catch{return null;}
}

export function gatewayOrigins(config={}){
 const origin=exactOrigin(config.origin||'http://localhost:3001');
 if(!origin)return null;
 if(!origin.local&&!config.api)return null;
 const api=exactOrigin(config.api||'http://127.0.0.1:8790');
 if(!api)return null;
 if(!origin.local&&(api.local||api.url.origin===origin.url.origin))return null;
 return {origin:origin.url,api:api.url,local:origin.local};
}
