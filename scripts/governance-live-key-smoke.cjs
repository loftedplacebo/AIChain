'use strict';
// Deliberately ephemeral loopback transfer from one-time browser key to local API.
// No key file, command-line argument, logging, redirect, or third-party request.
const http=require('node:http'),{randomUUID}=require('node:crypto');
const host='127.0.0.1',port=3003,api='http://127.0.0.1:8798';
const tenant='org-30d689af-1645-4087-813e-50a29fd799ea',project='prj-541d47ee-8910-4309-8c03-e015858738cf';
let key=null,acceptedId=null;
function event(){const id=randomUUID().replaceAll('-','');return {schema:'aichain.governance-event',schemaVersion:'0.1.0-draft',profile:'urn:aichain:profile:enterprise-agent',tenantRef:tenant,projectRef:project,environment:'test',eventId:'synthetic-live-'+id,runRef:'synthetic-run-'+id,streamRef:'synthetic-stream-'+id,sequence:'1',occurredAt:new Date().toISOString(),eventType:'ai.run.completed',source:{kind:'customer-sdk',integrationVersion:'portal-quickstart-0.1.0',keyRef:'onboarding-key'},agentRef:'synthetic-onboarding-agent',model:{providerRef:'synthetic',modelRef:'onboarding-example',deploymentRef:'onboarding-test',configVersion:'1'},activity:{taskClass:'onboarding-test',latencyMs:100},result:{status:'completed'}};}
const page=(message='')=>`<!doctype html><html><head><meta name="referrer" content="no-referrer"><title>Local API key smoke test</title></head><body><h1>Local API key smoke test</h1><p>${message}</p><form method="post" action="/submit"><label>One-time test key <input type="password" name="key" autocomplete="off" required></label><button type="submit">Submit one synthetic record</button></form><form method="post" action="/verify-revoked"><button type="submit">Verify revocation after revoking in the portal</button></form><p>This page runs only at 127.0.0.1:3003. It does not save or display the key.</p></body></html>`;
function send(res,status,html){res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'none'; form-action 'self'; frame-ancestors 'none'"});res.end(html);}
async function ingest(){const e=event();const response=await fetch(api+'/v1/events',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(e)});return {status:response.status,id:e.eventId};}
const server=http.createServer(async(req,res)=>{
 try{
  const samePage=req.headers['sec-fetch-site']==='same-origin'&&['http://127.0.0.1:3003','null'].includes(req.headers.origin);
  if(req.headers.host!=='127.0.0.1:3003'||(req.method==='POST'&&!samePage))return send(res,403,page('Origin refused.'));
  if(req.method==='GET'&&req.url==='/')return send(res,200,page());
  if(req.method!=='POST'||!['/submit','/verify-revoked'].includes(req.url))return send(res,404,page('Not found.'));
  let input='';for await(const part of req){input+=part;if(input.length>512)throw Error('Input too large');}
  if(req.url==='/submit'){
   if(key||acceptedId)throw Error('One-time submission already attempted');
   const candidate=new URLSearchParams(input).get('key');if(!/^ovk_[a-f0-9]{64}$/.test(candidate||''))throw Error('Invalid test key format');
   key=candidate;input='';const result=await ingest();if(result.status!==201&&result.status!==200&&result.status!==202)throw Error('Submission not accepted: HTTP '+result.status);
   acceptedId=result.id;return send(res,200,page('Synthetic record accepted: '+acceptedId+'. Revoke the key in the portal before verifying revocation.'));
  }
  if(!key||!acceptedId)throw Error('Submit the synthetic record first');
  const result=await ingest();if(result.status!==401&&result.status!==403)throw Error('Revocation not verified: HTTP '+result.status);
  key=null;return send(res,200,page('Revocation verified: a new submission was denied with HTTP '+result.status+'.'));
 }catch(e){send(res,400,page(String(e.message).replaceAll('&','&amp;').replaceAll('<','&lt;')));}
});
server.listen(port,host,()=>console.log('Ephemeral local key smoke page ready on 127.0.0.1:3003'));
process.once('SIGINT',()=>server.close());process.once('SIGTERM',()=>server.close());
