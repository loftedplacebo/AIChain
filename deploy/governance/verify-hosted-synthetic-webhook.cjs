'use strict';
// Run under the isolated pilot service account with its protected EnvironmentFile.
// Sends a signed revocation for a random, nonexistent synthetic session.
const {createHmac,randomBytes}=require('node:crypto');
const client=process.env.WORKOS_CLIENT_ID,secret=process.env.WORKOS_WEBHOOK_SECRET;
if(!/^client_[A-Za-z0-9]+$/.test(client||'')||typeof secret!=='string'||secret.length<24)throw Error('Pilot webhook environment is unavailable');
const id=()=>randomBytes(16).toString('hex');
const body=JSON.stringify({id:'event_'+id(),event:'session.revoked',data:{object:'session',id:'session_'+id(),user_id:'user_'+id()},context:{client_id:client}});
const t=Date.now(),signature='t='+t+', v1='+createHmac('sha256',secret).update(t+'.'+body).digest('hex');
fetch('https://api.orvessian.com/v1/auth/workos-webhook',{method:'POST',headers:{'content-type':'application/json','workos-signature':signature},body,signal:AbortSignal.timeout(10000)}).then(async response=>{
 const result=await response.json().catch(()=>null);
 if(response.status!==200||result?.received!==true)throw Error('Signed webhook test failed: HTTP '+response.status);
 console.log('Signed public webhook accepted: HTTP 200; status='+result.status);
}).catch(error=>{console.error(error.message.startsWith('Signed webhook test failed: HTTP ')?error.message:'Signed webhook test failed');process.exitCode=1;});
