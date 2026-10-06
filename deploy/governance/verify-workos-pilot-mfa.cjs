'use strict';
// Read-only operator check. Never print the WorkOS API key or factor details.
const key=process.env.WORKOS_API_KEY;
if(!/^sk_[A-Za-z0-9_]+$/.test(key||''))throw Error('Pilot WorkOS API key unavailable');
const userId='user_01M415J0R7YWMP7DW79C7Y20SA';
const options={headers:{authorization:'Bearer '+key},redirect:'manual',signal:AbortSignal.timeout(10000)};
(async()=>{
 const [userResponse,factorsResponse]=await Promise.all([
  fetch('https://api.workos.com/user_management/users/'+userId,options),
  fetch('https://api.workos.com/user_management/users/'+userId+'/auth_factors',options),
 ]);
 if(userResponse.status!==200||factorsResponse.status!==200)throw Error('WorkOS read failed: user='+userResponse.status+', factors='+factorsResponse.status);
 const user=await userResponse.json(),factors=await factorsResponse.json();
 if(!Array.isArray(factors.data))throw Error('Unexpected WorkOS factor response');
 console.log(JSON.stringify({lastSignInRecorded:Boolean(user.last_sign_in_at),factorTypes:factors.data.map(f=>f.type).filter(v=>typeof v==='string'),factorCount:factors.data.length}));
})().catch(error=>{console.error(error.message.startsWith('WorkOS read failed:')?error.message:'WorkOS verification failed');process.exitCode=1;});
