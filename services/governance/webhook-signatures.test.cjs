const {test}=require('node:test'),assert=require('node:assert/strict');
const {sign,verify}=require('./webhook-signatures.cjs');
const key=Buffer.alloc(32,7),body={schemaVersion:1,deliveryId:'delivery-1',tenantRef:'t',projectRef:'p',incidentRef:'incident-1',eventRef:'e',severity:'high'};
test('webhook protocol authenticates exact bytes, destination key, identity and freshness',()=>{
 const signed=sign(body,key,{timestamp:1000});assert.equal(verify(signed.body,signed.headers,key,{now:1001}),true);
 assert.equal(verify(Buffer.from(signed.body.toString().replace('high','low')),signed.headers,key,{now:1001}),false);
 assert.equal(verify(signed.body,signed.headers,Buffer.alloc(32,8),{now:1001}),false);
 assert.equal(verify(signed.body,signed.headers,key,{now:1400}),false);
 assert.equal(verify(signed.body,{...signed.headers,'x-orvessian-delivery':'other'},key,{now:1001}),false);
 assert.throws(()=>sign({...body,prompt:'private'},key));assert.throws(()=>sign(body,Buffer.alloc(10)));
});
