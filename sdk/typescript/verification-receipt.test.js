const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const crypto = require('node:crypto');
const { Wallet } = require('ethers');
const vr = require('./verification-receipt');
const { createPresentation, assuranceSummary } = require('./avr-presentation');
const { AvrIngressQueue } = require('./avr-ingress-queue');
const { createPresentationIndex, dispatch } = require('./avr-rpc-server');
const { AVR_EVENTS, verifyPresentationAnchor } = require('./avr-anchor-verifier');
const { membershipProof } = require('./avr-event-indexer');
const fixtureDir = path.join(__dirname, '../../fixtures/verification-receipt');
const fixtures = fs.readdirSync(fixtureDir).map(f => JSON.parse(fs.readFileSync(path.join(fixtureDir,f))));
const robot = fixtures.find(f => f.profile.id.endsWith(':robotics'));
const fresh = () => structuredClone(robot.receipt);

for (const fixture of fixtures) test(`golden vector and exact-byte disclosure: ${fixture.profile.id}`, () => {
  assert.deepEqual(vr.deriveVerificationReceipt(fixture.receipt), fixture.expected);
  const profileName = fixture.profile.id.split(':').at(-1);
  const specification = fs.readFileSync(path.join(__dirname, '../../spec/verification-receipt/profiles', `${profileName}.md`));
  assert.equal('0x'+crypto.createHash('sha256').update(specification).digest('hex'),fixture.profile.specificationDigest);
  assert.equal(vr.validateReceiptProfile(fixture.receipt, fixture.profile).profileValidated, true);
  for (const evidence of Object.values(fixture.disclosures)) {
    const bytes = Buffer.from(evidence.bytesHex,'hex');
    assert.equal(vr.verifyEvidence(evidence.commitment, bytes, evidence.salt), true);
    assert.equal(vr.verifyEvidence(evidence.commitment, Buffer.concat([bytes,Buffer.from('!')]), evidence.salt), false);
    assert.equal(vr.verifyEvidence(evidence.commitment, bytes, '0x'+'ff'.repeat(32)), false);
  }
});

test('custom profiles require no central registry or SDK edit and all extensions are committed', () => {
  const profile = {...robot.profile, id:'https://example.org/profiles/inspection', requiredEvidence:['vendor:inspection']};
  const receipt = fresh();
  receipt.profile = vr.profileReference(profile);
  receipt.commitments['vendor:inspection'] = receipt.commitments['machine:event'];
  assert.equal(vr.validateReceiptProfile(receipt, profile).profileValidated, true);
  const id = vr.deriveVerificationReceipt(receipt).receiptId;
  receipt.commitments['vendor:inspection'] = {...receipt.commitments['vendor:inspection'], digest:'0x'+'dd'.repeat(32)};
  assert.notEqual(vr.deriveVerificationReceipt(receipt).receiptId, id);
  assert.throws(() => vr.validateReceiptProfile(receipt, {...profile, requireStream:false}), /pinned/);
  delete receipt.commitments['vendor:inspection'];
  assert.throws(() => vr.validateReceiptProfile(receipt, profile), /missing/);
});

test('all event, context, subject, profile and relationship fields affect receipt identity', () => {
  const mutations = [
    r=>r.context.chainId='1', r=>r.context.anchorContract='0x'+'cc'.repeat(20),
    r=>r.issuer='0x'+'cc'.repeat(20), r=>r.subject.id='0x'+'cc'.repeat(32),
    r=>r.event.id='0x'+'cc'.repeat(32), r=>r.event.claimedAt='2026-09-12T12:00:00.001Z',
    r=>r.event.observation.clock='simulation', r=>r.profile.digest='0x'+'cc'.repeat(32),
    r=>r.links.push({relation:'core:supersedes',receiptId:'0x'+'cc'.repeat(32)})
  ];
  for (const mutate of mutations) { const r=fresh(); mutate(r); assert.notEqual(vr.deriveVerificationReceipt(r).receiptId,robot.expected.receiptId); }
  const reordered = Object.fromEntries(Object.entries(fresh()).reverse());
  assert.equal(vr.deriveVerificationReceipt(reordered).receiptId,robot.expected.receiptId);
});

test('reject malformed or ambiguous values before hashing', () => {
  const mutations = [r=>r.schemaVersion='1.0.0', r=>r.extra={}, r=>r.event.claimedAt='2026-02-30T12:00:00.000Z',
    r=>r.event.claimedAt='2026-09-12T12:00:00Z', r=>r.event.claimedAt='0000-01-01T00:00:00.000Z',
    r=>r.event.stream.sequence=1, r=>r.event.stream.sequence='01', r=>r.event.stream.sequence='-1',
    r=>r.event.stream.previousReceiptId='0x'+'cc'.repeat(32), r=>r.event.stream.sequence='1',
    r=>r.event.observation.ticksNs=9007199254740992, r=>r.event.observation.clock='gps',
    r=>r.context.chainId='0', r=>r.context.chainId=(1n<<256n).toString(), r=>r.issuer='0x'+'BB'.repeat(20),
    r=>r.context.anchorContract='0x'+'00'.repeat(20), r=>r.commitments={}, r=>r.issuer+='\n',
    r=>r.commitments['machine:event'].scheme='unknown', r=>r.commitments['machine:event'].url='https://private',
    r=>r.commitments['machine:event'].salt='secret', r=>r.subject.kind='🤖',
    r=>r.links=[{relation:'core:parent',receiptId:'0x'+'cc'.repeat(32)},{relation:'core:parent',receiptId:'0x'+'cc'.repeat(32)}]
  ];
  for (const mutate of mutations) { const r=fresh(); mutate(r); assert.throws(()=>vr.deriveVerificationReceipt(r)); }
  const oversized=fresh();
  oversized.commitments={};
  for(let i=0;i<32;i++) oversized.commitments[`vendor:${'a'.repeat(140)}${i}`]={...robot.receipt.commitments['machine:event'],mediaType:`application/${'a'.repeat(110)}`};
  assert.throws(()=>vr.deriveVerificationReceipt(oversized),/byte limit/);
});

test('streaming evidence is byte-identical across chunk boundaries', async () => {
  const bytes=Buffer.from('telemetry — 🤖'), salt='0x'+'11'.repeat(32);
  const expected=vr.commitEvidence(bytes,'application/octet-stream',salt);
  assert.deepEqual(await vr.commitEvidenceStream([bytes.subarray(0,3),bytes.subarray(3)],'application/octet-stream',salt),expected);
  await assert.rejects(vr.commitEvidenceStream(['text'],'text/plain',salt),/bytes/);
});

test('salt is private, randomized by default and required to open private evidence', () => {
  const a=vr.commitEvidence(Buffer.from('yes'),'text/plain'), b=vr.commitEvidence(Buffer.from('yes'),'text/plain');
  assert.notEqual(a.commitment.digest,b.commitment.digest);
  assert.equal(Object.hasOwn(a.commitment,'salt'),false);
  assert.throws(()=>vr.verifyEvidence(a.commitment,Buffer.from('yes')));
  assert.throws(()=>vr.commitEvidence('yes','text/plain'));
});

test('stream continuity rejects omission, reordering, forks and changed recording context', () => {
  const previous=fresh(), current=fresh();
  current.event.stream.sequence='1'; current.event.stream.previousReceiptId=vr.deriveVerificationReceipt(previous).receiptId;
  assert.equal(vr.verifyStreamLink(previous,current),true);
  for(const mutate of [r=>r.event.stream.sequence='2',r=>r.event.stream.id='0x'+'cc'.repeat(32),r=>r.event.stream.previousReceiptId='0x'+'cc'.repeat(32),r=>r.issuer='0x'+'cc'.repeat(20),r=>r.subject.id='0x'+'cc'.repeat(32)]) {
    const copy=structuredClone(current); mutate(copy); assert.equal(vr.verifyStreamLink(previous,copy),false);
  }
  const partial=fresh(); delete partial.event.stream;
  assert.throws(()=>vr.validateReceiptProfile(partial,robot.profile),/stream/);
});

test('real EIP-191 signature binds issuer, profile and destination; forged assurance is not a proof', async () => {
  const wallet=Wallet.createRandom(), receipt=fresh(); receipt.issuer=wallet.address.toLowerCase();
  const signature=await wallet.signMessage(vr.prepareVerificationAttestation(receipt).message);
  assert.equal(vr.verifyVerificationAttestation(receipt,signature),true);
  receipt.context.chainId='1';
  assert.equal(vr.verifyVerificationAttestation(receipt,signature),false);
  assert.equal(vr.verifyVerificationAttestation(receipt,'0x00'),false);
  for(const level of ['zk-proved','organisation-authorised']) assert.throws(()=>createPresentation(receipt,{level}),/adapter/);
  const summary=assuranceSummary(createPresentation(receipt,{level:'commitment-only'}));
  assert.equal(summary.profileValidation,'not-checked');
  assert.equal(summary.signatureVerification,'not-checked');
});

test('general receipts traverse presentation, ingress, batch membership, RPC lookup and anchor verification', async () => {
  const receipt=fresh(), presentation=createPresentation(receipt,{level:'commitment-only'});
  const queue=new AvrIngressQueue(); assert.equal(queue.submit(presentation).accepted,true);
  assert.equal(queue.submit(presentation).duplicate,true);
  const batch=queue.drain(Date.now(),true);
  assert.deepEqual(batch.anchorContext,receipt.context);
  const differentDestination=fresh(); differentDestination.context.chainId='1';
  assert.equal(queue.submit(createPresentation(differentDestination,{level:'commitment-only'})).status,'rejected-anchor-context');
  const anchor={mode:'batch',chainId:Number(receipt.context.chainId),contract:receipt.context.anchorContract,transactionHash:'0x'+'ee'.repeat(32),batch:{batchRoot:batch.manifest.batchRoot,leafCount:1,schemaVersion:batch.manifest.anchorSchemaVersion,siblings:membershipProof(batch.receiptIds,0)}};
  const anchored=createPresentation(receipt,{level:'commitment-only'},anchor);
  const event=AVR_EVENTS.encodeEventLog(AVR_EVENTS.getEvent('ReceiptBatchAnchored'),[anchor.batch.batchRoot,receipt.issuer,1,anchor.batch.schemaVersion,100]);
  const blockHash='0x'+'dd'.repeat(32);
  const provider={getNetwork:async()=>({chainId:BigInt(anchor.chainId)}),getBlockNumber:async()=>12,getBlock:async()=>({number:10,hash:blockHash}),getTransactionReceipt:async()=>({status:1,hash:anchor.transactionHash,blockNumber:10,blockHash,logs:[{address:anchor.contract,...event}]})};
  assert.equal((await verifyPresentationAnchor(anchored,provider,{minimumConfirmations:2})).valid,true);
  const index=createPresentationIndex([anchored]);
  const result=await dispatch({jsonrpc:'2.0',id:1,method:'aichain_getAvrPresentation',params:[presentation.receiptId]},{index,provider});
  assert.equal(result.result.receiptId,presentation.receiptId);
  assert.throws(()=>createPresentation(receipt,{level:'commitment-only'},{...anchor,chainId:1}),/context/);
  assert.throws(()=>createPresentation(receipt,{level:'commitment-only'},{...anchor,contract:'0x'+'cc'.repeat(20)}),/context/);
  const individual=createPresentation(receipt,{level:'commitment-only'},{...anchor,mode:'individual',batch:undefined});
  const individualEvent=AVR_EVENTS.encodeEventLog(AVR_EVENTS.getEvent('ReceiptAnchored'),[presentation.receiptId,presentation.commitmentsRoot,receipt.issuer,receipt.schemaVersion,100]);
  provider.getTransactionReceipt=async()=>({status:1,hash:anchor.transactionHash,blockNumber:10,blockHash,logs:[{address:anchor.contract,...individualEvent}]});
  assert.equal((await verifyPresentationAnchor(individual,provider)).valid,true);
});
