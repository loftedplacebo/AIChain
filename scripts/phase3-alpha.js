// Two-stage disposable Core-Geth integration runner. Outputs belong in ignored devnet/.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JsonRpcProvider, ContractFactory, Contract, Wallet, NonceManager, keccak256, verifyMessage } = require('ethers');
const { derivePublic, derivePolicyReceipt } = require('../sdk/typescript/zk-policy-statement');
const { deriveAuthorisedReceipt } = require('../sdk/typescript/authorised-receipt');
const { createPresentation } = require('../sdk/typescript/avr-presentation');
const { verifyPolicyProof } = require('../sdk/typescript/avr-proof-binding');
const { createManifest, syncIndex, lookupReceipt } = require('../sdk/typescript/avr-event-indexer');
const { verifyBatchMembership, verifyPresentationAnchor } = require('../sdk/typescript/avr-anchor-verifier');
const { createLocalAvrRpcServer, createPresentationIndex } = require('../sdk/typescript/avr-rpc-server');
const { AvrIngressQueue } = require('../sdk/typescript/avr-ingress-queue');

async function run(mode, directory) {
  if (process.env.AICHAIN_ENABLE_PHASE3 !== '1') throw Error('Set AICHAIN_ENABLE_PHASE3=1');
  directory = path.resolve(directory);
  const read = file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
  const write = (file, value) => fs.writeFileSync(path.join(directory, file), JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
  const provider = new JsonRpcProvider(process.env.AICHAIN_PHASE3_RPC_URL || 'http://127.0.0.1:18548', undefined, {cacheTimeout: -1});
  provider.pollingInterval = 250;
  try {
    assert.equal((await provider.getNetwork()).chainId, 1337n, 'Disposable Core-Geth development chain required');
    const artifact = name => read(`artifacts/${name}.json`);
    const owner = await provider.getSigner(0);
    const deploy = async (name, args=[]) => {
      console.log(`Deploying ${name}`);
      const a = artifact(name); const c = await new ContractFactory(a.abi, a.bytecode.object, owner).deploy(...args);
      await c.waitForDeployment(); return c;
    };
    if (mode === 'prepare') {
      assert(!fs.existsSync(path.join(directory, 'context.json')), 'Refusing to overwrite an alpha run');
      const agent = Wallet.createRandom().connect(provider);
      await (await owner.sendTransaction({to: agent.address, value: 10n ** 18n})).wait();
      const document = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/zk/policy-evaluation-v0.1.0-draft.json')));
      document.publicMetadata.issuer = agent.address.toLowerCase();
      document.publicMetadata.claimedAtEpochSeconds = (await provider.getBlock('latest')).timestamp;
      document.expectedPublic = derivePublic(document.publicMetadata, document.privateWitness);
      const registry = await deploy('AuthorityRegistry');
      const authorised = await deploy('AuthorisedAVRAnchor', [await registry.getAddress()]);
      const batch = await deploy('ReceiptBatchAnchor');
      const meta = document.publicMetadata;
      await (await registry.registerOrganization(meta.organizationId)).wait();
      await (await registry.authorizeAgent(meta.organizationId, agent.address, meta.authorityCommitment, meta.claimedAtEpochSeconds, meta.claimedAtEpochSeconds + 86400)).wait();
      write('witness.json', document);
      write('context.json', {agentKey: agent.privateKey, registry: await registry.getAddress(), authorised: await authorised.getAddress(), batch: await batch.getAddress(), genesisHash: (await provider.getBlock(0)).hash});
      console.log('Prepared isolated agent, organisation, authority, contracts and proof witness');
      return;
    }
    if (mode === 'restart') {
      const context = read('context.json');
      assert.equal((await provider.getBlock(0)).hash, context.genesisHash, 'genesis changed after restart');
      const before = await provider.getBlockNumber();
      const signer = await provider.getSigner(0);
      const address = await signer.getAddress();
      const receipt = await (await signer.sendTransaction({to: address, value: 0n})).wait();
      const after = await provider.getBlockNumber();
      assert(receipt.status === 1 && after > before, 'signer did not seal a post-restart block');
      write('restart-report.json', {status:'passed', profile:'disposable CPU-mined Ethash development chain; not AIChain production consensus', genesisHash:context.genesisHash, beforeBlock:before, afterBlock:after, transaction:receipt.hash});
      console.log(JSON.stringify(read('restart-report.json'), null, 2));
      return;
    }
    assert.equal(mode, 'verify');
    const context = read('context.json');
    assert.equal((await provider.getBlock(0)).hash, context.genesisHash);
    const document = read('witness.json'); const proof = read('proof.json');
    const expectedImage = fs.readFileSync(path.join(directory, 'image-id.txt'), 'utf8').trim();
    const official = await deploy('RiscZeroGroth16Verifier', [
      '0xa54dc85ac99f851c92d7c96d7318af41dbe7c0194edfcc37eb4d422a998c1f56',
      '0x04446e66d300eb7fb45c9726bb53c793dda407a62e9601618bb43c5c14657ac0']);
    const binding = await verifyPolicyProof(document, proof, expectedImage, official);
    const adapter = await deploy('RiscZeroAVRProofVerifierAdapter', [await official.getAddress(), expectedImage]);
    assert.equal(await adapter.verifyProof(proof.seal, proof.journal), true);
    const proofTx = await owner.sendTransaction({to: await adapter.getAddress(), data: adapter.interface.encodeFunctionData('verifyProof', [proof.seal, proof.journal])});
    const proofReceipt = await proofTx.wait(); assert.equal(proofReceipt.status, 1);
    await assert.rejects(official.verify('0x' + '00'.repeat(260), expectedImage, proof.journalDigest));
    await assert.rejects(official.verify(proof.seal, expectedImage, '0x' + '00'.repeat(32)));
    const substituted = structuredClone(document); substituted.publicMetadata.issuer = (await owner.getAddress()).toLowerCase();
    await assert.rejects(verifyPolicyProof(substituted, proof, expectedImage, official), /binding mismatch/);
    const agentWallet = new Wallet(context.agentKey, provider); const agent = new NonceManager(agentWallet);
    const anchor = new Contract(context.authorised, artifact('AuthorisedAVRAnchor').abi, agent);
    const registry = new Contract(context.registry, artifact('AuthorityRegistry').abi, owner);
    const metadata = document.publicMetadata;
    const unprovedDoc = structuredClone(document); unprovedDoc.privateWitness.action.amount += 1;
    const unproved = derivePolicyReceipt(unprovedDoc.publicMetadata, unprovedDoc.privateWitness);
    const receipts = [binding.receipt, unproved]; const presentations = []; const txs = [];
    for (const receipt of receipts) {
      const d = deriveAuthorisedReceipt(receipt);
      const message = `AIChain phase3 receipt: ${d.receiptId}`;
      const signature = await agentWallet.signMessage(message);
      assert.equal(verifyMessage(message, signature), agentWallet.address);
      const transaction = await anchor.anchorAuthorisedReceipt(d.receiptId, d.commitmentsRoot, metadata.organizationId, metadata.authorityCommitment, receipt.schemaVersion);
      const mined = await transaction.wait(); txs.push(mined.hash);
      const assurance = d.receiptId === binding.receiptId ? {level:'zk-proved',proof:{system:'risc0',programCommitment:expectedImage,publicValuesDigest:proof.journalDigest,proofDigest:keccak256(proof.seal),verification:'individually-verified'}} : {level:'organisation-authorised'};
      const p = createPresentation(receipt, assurance, {mode:'individual',chainId:1337,contract:context.authorised,transactionHash:mined.hash});
      assert.equal((await verifyPresentationAnchor(p, provider)).valid, true); presentations.push(p);
    }
    fs.mkdirSync(path.join(directory,'presentations'),{recursive:true});
    for (const p of presentations) write(`presentations/${p.receiptId}.json`,p);
    const queue = new AvrIngressQueue({maxBatchReceipts:2});
    for (const p of presentations) assert(queue.submit(p).accepted);
    assert(queue.submit(presentations[0]).duplicate);
    const queued = queue.drain(Date.now(),true); const manifest = queued.manifest;
    const batch = new Contract(context.batch, artifact('ReceiptBatchAnchor').abi, agent);
    const batchMined = await (await batch.anchorBatch(manifest.batchRoot, manifest.leafCount, manifest.anchorSchemaVersion)).wait();
    queue.recordAnchorResult(queued,{status:'included',anchor:{transactionHash:batchMined.hash}});
    fs.mkdirSync(path.join(directory,'manifests'),{recursive:true}); write('manifests/batch.json',manifest);
    const contracts = [{kind:'authorised',address:context.authorised},{kind:'batch',address:context.batch}];
    const startBlock = (await provider.getTransactionReceipt(txs[0])).blockNumber;
    const options = {provider, contracts, startBlock, statePath:path.join(directory,'index.json'), manifestsDirectory:path.join(directory,'manifests')};
    const indexed = await syncIndex(options);
    const batchState = {...indexed.state, individual:{}};
    for(const p of presentations) {
      const found = lookupReceipt(batchState,p.receiptId);
      assert(verifyBatchMembership(p.receiptId,found.inclusion.siblings,manifest.batchRoot));
    }
    const resumed = await syncIndex(options); assert(resumed.state.nextBlock >= indexed.state.nextBlock);
    const {createCheckpoint,membershipProof} = await import('../sdk/typescript/organisational-ledger.js');
    const {createDisclosurePackage} = await import('../sdk/typescript/organisation-view.js');
    const checkpoint = createCheckpoint({organisationRef:metadata.organizationId,ledgerId:'phase3',epoch:0,receiptIds:manifest.receiptIds,createdAt:new Date().toISOString()});
    const disclosure = createDisclosurePackage({checkpointPayload:{checkpoint,inclusionProof:{receiptId:manifest.receiptIds[0],leafIndex:0,siblings:membershipProof(manifest.receiptIds,0)}},evidenceReference:'private:phase3/action',disclosedAt:new Date().toISOString()});
    assert(disclosure.verification.localMembership); write('disclosure.json',disclosure);
    const server = createLocalAvrRpcServer({index:createPresentationIndex(presentations),provider,indexStatePath:options.statePath});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/`,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'aichain_getAvrExplorerEntry',params:[presentations[0].receiptId,'http://127.0.0.1:4000']}),headers:{'content-type':'application/json'}});
      const view = await response.json(); assert(view.result.links.transaction.endsWith(txs[0])); write('explorer.json',view.result);
    } finally { await new Promise(resolve=>server.close(resolve)); }
    await (await registry.revokeAgent(metadata.organizationId,agentWallet.address)).wait();
    await assert.rejects(anchor.anchorAuthorisedReceipt.staticCall('0x'+'dd'.repeat(32),presentations[0].commitmentsRoot,metadata.organizationId,metadata.authorityCommitment,'0.2.0-draft'));
    write('report.json',{scope:'Fresh Core-Geth custom-genesis CPU-mined Ethash development integration, single node, real RISC Zero proof',chainId:1337,genesisHash:context.genesisHash,receipts:presentations.map(p=>p.receiptId),anchorTransactions:txs,batchTransaction:batchMined.hash,proofTransaction:proofMinedHash(proofReceipt),proofGas:proofReceipt.gasUsed.toString(),imageId:expectedImage,proofDigest:keccak256(proof.seal),checks:['agent-signature','authorised-anchor','unproved-anchor','real-proof-adapter','tampered-proof-rejected','tampered-journal-rejected','receipt-substitution-rejected','batch-membership','persistent-index-resume','organisation-disclosure','localhost-rpc-explorer','revoked-agent-rejected']});
    console.log(JSON.stringify(read('report.json'),null,2));
  } finally { provider.destroy(); }
}
function proofMinedHash(receipt) { return receipt.hash; }
run(process.argv[2],process.argv[3] || 'devnet/phase3').catch(error=>{console.error(error.shortMessage || error.message);process.exitCode=1;});
