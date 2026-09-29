// Signature protocol only. No network, destination registration or delivery worker.
const {createHmac,timingSafeEqual}=require('node:crypto');
const ref=/^[A-Za-z0-9._:-]{1,128}$/;
function validate(body){
 const allowed=['schemaVersion','deliveryId','tenantRef','projectRef','incidentRef','eventRef','severity'];
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k))||body.schemaVersion!==1)throw Error('Invalid webhook envelope');
 for(const key of ['deliveryId','tenantRef','projectRef','incidentRef','eventRef'])if(typeof body[key]!=='string'||!ref.test(body[key]))throw Error('Invalid webhook reference');
 if(!['info','low','medium','high','critical'].includes(body.severity))throw Error('Invalid webhook severity');
 return Buffer.from(JSON.stringify(body));
}
function secret(value){if(!Buffer.isBuffer(value)||value.length<32)throw Error('Webhook signing key needs at least 32 bytes');return value;}
function mac(raw,key,id,time){return createHmac('sha256',secret(key)).update(`${id}.${time}.`).update(raw).digest();}
function sign(body,key,{timestamp=Math.floor(Date.now()/1000)}={}){
 if(!Number.isSafeInteger(timestamp)||timestamp<0)throw Error('Invalid webhook timestamp');
 const raw=validate(body);return {body:raw,headers:{'content-type':'application/json','x-orvessian-delivery':body.deliveryId,'x-orvessian-timestamp':String(timestamp),'x-orvessian-signature':'v1='+mac(raw,key,body.deliveryId,timestamp).toString('hex')}};
}
function verify(raw,headers,key,{now=Math.floor(Date.now()/1000),toleranceSeconds=300}={}){
 if(!Number.isSafeInteger(now)||!Number.isInteger(toleranceSeconds)||toleranceSeconds<1||toleranceSeconds>3600)throw Error('Invalid webhook clock policy');
 if(!Buffer.isBuffer(raw)||raw.length>4096)return false;
 const id=headers['x-orvessian-delivery'],time=headers['x-orvessian-timestamp'],signature=headers['x-orvessian-signature'];
 if(typeof id!=='string'||!ref.test(id)||typeof time!=='string'||! /^(0|[1-9][0-9]{0,15})$/.test(time)||typeof signature!=='string'||! /^v1=[0-9a-f]{64}$/.test(signature)||Math.abs(now-Number(time))>toleranceSeconds)return false;
 const expected=mac(raw,key,id,time),supplied=Buffer.from(signature.slice(3),'hex');
 if(!timingSafeEqual(expected,supplied))return false;
 try{const parsed=JSON.parse(raw);validate(parsed);return parsed.deliveryId===id;}catch{return false;}
}
module.exports={sign,verify,validateEnvelope:validate};
