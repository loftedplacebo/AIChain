'use strict';
const {createHash}=require('node:crypto');
const fields=['tenant','project','releaseId','publisher','recorder','policyDigest','codeHash'];
function validateBinding(value){
 if(!value||Object.keys(value).sort().join(',')!==[...fields].sort().join(',')||!['tenant','project'].every(k=>typeof value[k]==='string'&&/^[A-Za-z0-9._:-]{1,200}$/.test(value[k]))||typeof value.releaseId!=='string'||!/^[-a-f0-9]{36}$/.test(value.releaseId)||!['publisher','recorder'].every(k=>typeof value[k]==='string'&&/^0x[0-9a-fA-F]{40}$/.test(value[k]))||!(/^[a-f0-9]{64}$/.test(value.policyDigest))||!(/^0x[0-9a-fA-F]{64}$/.test(value.codeHash)))throw Error('Explicit scoped publisher release binding required');
 return Object.freeze({...value,publisher:value.publisher.toLowerCase(),recorder:value.recorder.toLowerCase(),codeHash:value.codeHash.toLowerCase()});
}
function policyDigest(policy){
 const value={batchSize:policy.batchSize,maxTransactionsPerHour:policy.maxTransactionsPerHour,maxGasPriceWei:String(policy.maxGasPriceWei),dailyReservationWei:String(policy.dailyReservationWei),l1AllowanceWei:String(policy.l1AllowanceWei)};
 if(!Number.isInteger(value.batchSize)||value.batchSize<1||value.batchSize>1000||!Number.isInteger(value.maxTransactionsPerHour)||value.maxTransactionsPerHour<1||value.maxTransactionsPerHour>10000||!['maxGasPriceWei','dailyReservationWei','l1AllowanceWei'].every(k=>/^[1-9][0-9]{0,77}$/.test(value[k])))throw Error('Bounded publisher release policy required');
 return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function sameBinding(left,right){try{const a=validateBinding(left),b=validateBinding(right);return fields.every(k=>a[k]===b[k]);}catch{return false;}}
module.exports={validateBinding,policyDigest,sameBinding};
