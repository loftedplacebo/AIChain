const {createHash}=require('node:crypto');
const {canonicalize}=require('../../sdk/typescript/receipt');
const vr=require('../../sdk/typescript/verification-receipt');
const {createPresentation}=require('../../sdk/typescript/avr-presentation');
const {createManifest,membershipProof}=require('../../sdk/typescript/avr-event-indexer');
const {verifyPresentationAnchor,AVR_EVENTS,verifyBatchMembership}=require('../../sdk/typescript/avr-anchor-verifier');
const {baseBatchId,BATCH_ABI}=require('../../sdk/typescript/base-sepolia-batch-adapter');
const {keccak256}=require('ethers');
const digest=value=>'0x'+createHash('sha256').update(value).digest('hex');
const CONTRACT='0x5781540e4682a9d35011c94a25f615e438e8e7af';
const CODE_HASH='0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f';
const PROFILE={id:'urn:aichain:profile:governance-record',version:'1.0.0',specificationDigest:digest('governance-record-v1:canonical accepted event including server receivedAt; recording-service attestation, not source authentication'),subjectKinds:['governance:event'],requiredEvidence:['governance:record'],requireStream:false,requireObservation:false};
const fail=(status,message)=>Object.assign(new Error(message),{status});
async function prepareBatch(store,principal,signer,{publisher,limit=100}={}){
 if(!/^0x[0-9a-fA-F]{40}$/.test(publisher||''))throw new Error('Expected Base publisher address required');
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Batch limit must be 1..1000');
 const events=await store.pendingEvidence(principal,limit);if(!events.length)return null;
 const entries=[];
 for(const event of events){
  if(event.environment!=='demo'&&event.environment!=='test')throw new Error('This Base Sepolia integration accepts demo/test events only');
  const evidence=vr.commitEvidence(Buffer.from(canonicalize(event),'utf8'),'application/json');
  const identity=digest(evidence.salt+canonicalize([event.tenantRef,event.projectRef,event.eventId]));
  const receipt=vr.createVerificationReceipt({context:{chainId:'84532',anchorContract:CONTRACT},issuer:signer.address.toLowerCase(),subject:{kind:'governance:event',id:identity},event:{id:identity,type:'governance:recorded',claimedAt:event.receivedAt},commitments:{'governance:record':evidence.commitment}},PROFILE);
  const signature=await signer.signMessage(vr.prepareVerificationAttestation(receipt).message);
  entries.push({id:event.eventId,expectedRevision:0,bundle:{schema:'aichain.governance-evidence',version:1,createdAt:new Date().toISOString(),salt:evidence.salt,receipt,signature,signerRole:'recording-service',transactions:[]}});
 }
 const ids=entries.map(e=>vr.deriveVerificationReceipt(e.bundle.receipt).receiptId);
 const manifest=createManifest(ids,vr.VERSION);const batchId=baseBatchId(CONTRACT,publisher,manifest.batchRoot);
 for(let i=0;i<entries.length;i++)entries[i].bundle.batch={id:batchId,root:manifest.batchRoot,leafCount:ids.length,schemaVersion:vr.VERSION,publisher:publisher.toLowerCase(),siblings:membershipProof(ids,i)};
 await store.commitEvidence(principal,entries);
 return {batchId,root:manifest.batchRoot,leafCount:ids.length,transaction:{to:CONTRACT,value:'0x0',chainId:84532,data:BATCH_ABI.encodeFunctionData('anchorBatch',[manifest.batchRoot,ids.length,vr.VERSION])},status:'queued',broadcast:false};
}
async function attachTransaction(store,principal,batchId,transactionHash){
 if(!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)||!/^0x[0-9a-fA-F]{64}$/.test(batchId))throw fail(400,'Valid batch ID and transaction hash required');
 const entries=await store.batchEvidence(principal,batchId);if(!entries.length)throw fail(404,'Batch not found');
 for(const e of entries){if(e.bundle.transactions.includes(transactionHash.toLowerCase()))continue;if(e.bundle.transactions.length>=5)throw fail(409,'Transaction history limit reached');e.bundle.transactions.push(transactionHash.toLowerCase());}
 await store.commitEvidence(principal,entries);return {batchId,status:'submitted',records:entries.length};
}
async function inspectEvidence(event,stored,{provider=null,trustedSigners=[],minimumConfirmations=12,codeHash=CODE_HASH}={}){
 const result={state:'queued',checkedAt:new Date().toISOString(),signature:'not-created',sourceSignature:'not-verified',recordCommitment:false,batchMembership:false,chainId:84532,contract:CONTRACT,finality:'Not an Ethereum finality or AI correctness claim'};
 if(!stored)return {...result,reason:'Accepted record is waiting for the evidence worker'};
 const b=stored.bundle||stored;
 try{
  if(b.schema!=='aichain.governance-evidence'||b.version!==1)throw new Error('Unsupported evidence bundle');
  vr.validateReceiptProfile(b.receipt,PROFILE);
  if(b.receipt.context.chainId!=='84532'||b.receipt.context.anchorContract!==CONTRACT)throw new Error('Wrong receipt destination');
  const identity=digest(b.salt+canonicalize([event.tenantRef,event.projectRef,event.eventId]));
  if(b.signerRole!=='recording-service'||b.receipt.subject.id!==identity||b.receipt.event.id!==identity||b.receipt.event.type!=='governance:recorded'||b.receipt.event.claimedAt!==event.receivedAt)throw new Error('Receipt does not bind the accepted event identity and receipt time');
  if(!vr.verifyEvidence(b.receipt.commitments['governance:record'],Buffer.from(canonicalize(event),'utf8'),b.salt))throw new Error('Stored record does not match signed commitment');
  result.recordCommitment=true;
  if(!vr.verifyVerificationAttestation(b.receipt,b.signature))throw new Error('Invalid recording-service signature');
  result.signature='valid';result.signer=b.receipt.issuer;result.receiptId=vr.deriveVerificationReceipt(b.receipt).receiptId;
  result.trustedSigner=trustedSigners.map(s=>s.toLowerCase()).includes(b.receipt.issuer);
  if(!result.trustedSigner)return {...result,state:'untrusted-signer',reason:'Signature is valid but signer is not in this service configuration'};
  if(!Number.isInteger(b.batch.leafCount)||b.batch.leafCount<1||b.batch.leafCount>1000||b.batch.schemaVersion!==vr.VERSION||baseBatchId(CONTRACT,b.batch.publisher,b.batch.root)!==b.batch.id||!verifyBatchMembership(result.receiptId,b.batch.siblings,b.batch.root))throw new Error('Invalid batch identity or membership proof');
  result.batchMembership=true;result.batch={id:b.batch.id,root:b.batch.root,leafCount:b.batch.leafCount,publisher:b.batch.publisher};
  const tx=b.transactions.at(-1);if(!tx)return {...result,state:'batched',reason:'Signed and batched; no transaction has been submitted'};
  if(!/^0x[0-9a-f]{64}$/.test(tx))throw new Error('Malformed transaction hash');
  result.transactionHash=tx;result.explorerUrl='https://sepolia.basescan.org/tx/'+tx;
  if(!provider)return {...result,state:'submitted',reason:'Transaction recorded; live chain verification is not configured'};
  if(!Number.isInteger(minimumConfirmations)||minimumConfirmations<1)throw new Error('Invalid confirmation policy');
  try{
   if(Number((await provider.getNetwork()).chainId)!==84532)return {...result,state:'verification-failed',reason:'RPC is connected to the wrong chain'};
   if(keccak256(await provider.getCode(CONTRACT))!==codeHash)return {...result,state:'verification-failed',reason:'Anchor contract runtime fingerprint mismatch'};
   const chainReceipt=await provider.getTransactionReceipt(tx);
   if(!chainReceipt)return {...result,state:'not-found',reason:'Transaction is not currently included; it may be pending, dropped or reorganised'};
   if(chainReceipt.status!==1&&chainReceipt.status!=='0x1')return {...result,state:'failed',reason:'Anchor transaction reverted'};
   const presentation=createPresentation(b.receipt,{level:'issuer-attested',attestation:{scheme:'eip191-personal-sign',signer:b.receipt.issuer,signature:b.signature}},{mode:'batch',chainId:84532,contract:CONTRACT,transactionHash:tx,batch:{batchRoot:b.batch.root,leafCount:b.batch.leafCount,schemaVersion:b.batch.schemaVersion,siblings:b.batch.siblings}});
   // Pin this receipt for all checks; bind V2 publisher and batchId in addition to the generic SDK verifier.
   const boundProvider={getNetwork:()=>provider.getNetwork(),getBlockNumber:()=>provider.getBlockNumber(),getBlock:n=>provider.getBlock(n),getTransactionReceipt:async()=>chainReceipt};
   const verified=await verifyPresentationAnchor(presentation,boundProvider,{minimumConfirmations:1});
   if(!verified.valid&&verified.reason==='Anchor has insufficient confirmations')return {...result,state:'unavailable',confirmations:verified.confirmations,reason:'RPC head has not caught up with the transaction receipt; retrying verification is safe. No current confirmation is asserted'};
   if(!verified.valid)return {...result,state:/canonical|logs do not match/.test(verified.reason)?'reorg-detected':'verification-failed',reason:verified.reason};
   const match=(chainReceipt.logs||[]).some(log=>{try{if(log.address.toLowerCase()!==CONTRACT)return false;const parsed=AVR_EVENTS.parseLog(log);return parsed.name==='ReceiptBatchAnchoredV2'&&parsed.args[0].toLowerCase()===b.batch.id&&parsed.args[1].toLowerCase()===b.batch.root&&parsed.args[2].toLowerCase()===b.batch.publisher;}catch{return false;}});
   if(!match)return {...result,state:'verification-failed',reason:'Expected publisher-scoped V2 batch event is absent'};
   return {...result,state:verified.confirmations>=minimumConfirmations?'confirmed':'confirming',confirmations:verified.confirmations,minimumConfirmations,blockNumber:verified.blockNumber,blockHash:chainReceipt.blockHash,reason:'Canonical Base Sepolia inclusion checked at the displayed time; later reorganisations remain possible'};
  }catch{return {...result,state:'unavailable',reason:'Chain verification is unavailable; no current confirmation is asserted'};}
 }catch(e){return {...result,state:'invalid-evidence',reason:e.message};}
}
module.exports={prepareBatch,attachTransaction,inspectEvidence,PROFILE,CONTRACT,CODE_HASH};
