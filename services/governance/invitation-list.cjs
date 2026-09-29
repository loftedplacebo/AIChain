'use strict';
function options({state='all',limit=50,offset=0}={}){
 if(!['all','pending','accepted','expired','revoked'].includes(state)||!Number.isInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>Number.MAX_SAFE_INTEGER-100)throw Object.assign(Error('Invalid invitation list filters'),{status:400});return {state,limit,offset};
}
function predicate(state,clock){return state==='revoked'?'revoked IS NOT NULL':state==='accepted'?'revoked IS NULL AND accepted_by IS NOT NULL':state==='pending'?`revoked IS NULL AND accepted_by IS NULL AND expires>${clock}`:state==='expired'?`revoked IS NULL AND accepted_by IS NULL AND expires<=${clock}`:'1=1';}
function page(invitations,total,opts){return {invitations,total,...opts,nextOffset:opts.offset+invitations.length<total?opts.offset+invitations.length:null};}
module.exports={options,predicate,page};
