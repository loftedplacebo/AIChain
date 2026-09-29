#!/usr/bin/env node
'use strict';
// One read-only provider window. Never touches customer databases or sessions.
async function main(){
 if(process.argv[2]!=='--live-read-only'||process.argv.length>4||process.argv[3]!==undefined&&process.argv[3]!=='--hours=24')throw Error('Explicit live read-only flag and optional --hours=24 required');
 const end=Date.now()-5000,start=end-(process.argv[3]?24:1)*3600000;
 const result=await require('../services/governance/workos-revocation-replay.cjs').replayRevocations({clientId:process.env.WORKOS_CLIENT_ID,apiKey:process.env.WORKOS_API_KEY,rangeStart:new Date(start).toISOString(),rangeEnd:new Date(end).toISOString(),repository:{apply:async()=>({status:'applied'})}});
 console.log(JSON.stringify({mode:'read-only-provider-contract-check',observedAt:new Date().toISOString(),rangeStart:result.rangeStart,rangeEnd:result.rangeEnd,pages:result.pages,events:result.events,matchedRevocationsValidated:result.applied,foreignClient:result.foreignClient,customerStateChanged:false,providerStateChanged:false,sessionRevocationAcceptance:result.applied?'response-schema-validated':'no-matching-event-observed',historicalCoverage:'not-proven'},null,2));
}
main().catch(()=>{console.error('WorkOS read-only feed check failed; inspect API access and response contract privately. No customer or provider state was changed.');process.exitCode=1;});
