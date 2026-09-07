const test = require('node:test');
const assert = require('node:assert/strict');
const {sha256,toUtf8Bytes,hexlify}=require('ethers');
const {derivePublic,derivePolicyReceipt}=require('./zk-policy-statement');
const {deriveAuthorisedReceipt}=require('./authorised-receipt');
const {verifyPolicyProof}=require('./avr-proof-binding');
const doc=require('../../fixtures/zk/policy-evaluation-v0.1.0-draft.json');
const image='0x'+'11'.repeat(32);
function sample(){ const values=derivePublic(doc.publicMetadata,doc.privateWitness);const journal=hexlify(toUtf8Bytes(JSON.stringify(values))); return {format:'aichain.risc0-evm-proof-export',stack:'risc0',stackVersion:'3.0.3',statementVersion:'0.1.0-draft',receiptId:values.receiptId,imageId:image,journal,journalDigest:sha256(journal),seal:'0x'+'00'.repeat(260)}; }
test('public values and authorised AVR derive the same receipt',()=>{
 assert.equal(derivePublic(doc.publicMetadata,doc.privateWitness).receiptId,deriveAuthorisedReceipt(derivePolicyReceipt(doc.publicMetadata,doc.privateWitness)).receiptId);
});
test('binding checks precede verifier call; verifier failures propagate',async()=>{
 let calls=0; const verifier={verify:async()=>{calls++;throw Error('cryptographic rejection');}};
 await assert.rejects(verifyPolicyProof(doc,sample(),'0x'+'22'.repeat(32),verifier),/image/);
 const version=sample();version.stackVersion='unknown';
 await assert.rejects(verifyPolicyProof(doc,version,image,verifier),/version/);
 const swapped=sample();swapped.receiptId=image;
 await assert.rejects(verifyPolicyProof(doc,swapped,image,verifier),/receipt binding/);
 const bad=sample();bad.journalDigest=image;
 await assert.rejects(verifyPolicyProof(doc,bad,image,verifier),/digest/);
 const changed=structuredClone(doc); changed.publicMetadata.claimedAtEpochSeconds++;
 await assert.rejects(verifyPolicyProof(changed,sample(),image,verifier),/binding/);
 assert.equal(calls,0);
 await assert.rejects(verifyPolicyProof(doc,sample(),image,verifier),/cryptographic rejection/);
 assert.equal(calls,1);
});
