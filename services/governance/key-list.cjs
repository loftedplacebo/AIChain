'use strict';
function keyListOptions({state='all',limit=50,offset=0}={}){
 if(!['all','active','expired','revoked'].includes(state)||!Number.isInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>Number.MAX_SAFE_INTEGER-100)throw Object.assign(Error('Invalid key list filters'),{status:400});
 return {state,limit,offset};
}
function predicate(state,clock){
 const revoked=`revoked_at IS NOT NULL AND revoked_at<=${clock}`,live=`(revoked_at IS NULL OR revoked_at>${clock})`;
 return state==='revoked'?revoked:state==='active'?`${live} AND expires_at>${clock}`:state==='expired'?`${live} AND expires_at<=${clock}`:'1=1';
}
function pageInfo(keys,total,options){return {keys,total,...options,nextOffset:options.offset+keys.length<total?options.offset+keys.length:null};}
module.exports={keyListOptions,predicate,pageInfo};
