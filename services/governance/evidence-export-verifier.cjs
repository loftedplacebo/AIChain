'use strict';
const {inspectEvidence}=require('./evidence.cjs');
const incomplete=new Set(['queued','batched','submitted','confirming','not-found','unavailable']);

function outcome(result){
 if(result.state==='confirmed'&&result.signature==='valid'&&result.trustedSigner===true&&result.recordCommitment===true&&result.batchMembership===true&&Number.isInteger(result.confirmations)&&result.confirmations>=result.minimumConfirmations)return {exportVerification:'verified',exitCode:0};
 if(incomplete.has(result.state))return {exportVerification:'incomplete',exitCode:2};
 return {exportVerification:'invalid',exitCode:1};
}

async function verifyExport(exported,{trustedSigners,provider=null}={}){
 if(!exported||typeof exported!=='object'||Array.isArray(exported)||!exported.event||typeof exported.event!=='object'||Array.isArray(exported.event)||!Object.hasOwn(exported,'evidence'))throw Error('Record-specific evidence export required');
 if(!Array.isArray(trustedSigners)||!trustedSigners.length||trustedSigners.some(s=>typeof s!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(s)))throw Error('Explicit trusted recording-service addresses required');
 const result=await inspectEvidence(exported.event,exported.evidence,{trustedSigners,provider});
 return {...result,...outcome(result)};
}
module.exports={outcome,verifyExport};
