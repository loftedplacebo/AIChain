// Real-proof governance integration. simulated mode uses Anvil time travel;
// schedule/finish modes enforce both the on-chain delay and elapsed wall time.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JsonRpcProvider, ContractFactory, Contract, Wallet, keccak256, toUtf8Bytes } = require('ethers');

async function main() {
  assert.equal(process.env.AICHAIN_ENABLE_PHASE3, '1');
  const [mode, inputDir] = process.argv.slice(2);
  assert(['simulated','schedule','finish'].includes(mode));
  const dir = path.resolve(inputDir);
  const read = name => JSON.parse(fs.readFileSync(path.join(dir,name)));
  const write = (name,value) => fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  const provider = new JsonRpcProvider(`http://127.0.0.1:${mode==='simulated'?18558:18548}`,undefined,{cacheTimeout:-1});
  provider.pollingInterval=100;
  try {
    assert.equal((await provider.getNetwork()).chainId, mode==='simulated'?1338n:1337n);
    const owner=await provider.getSigner(0);
    const proof=read('proof.json');
    const image=fs.readFileSync(path.join(dir,'image-id.txt'),'utf8').trim();
    assert.equal(proof.imageId,image);
    const artifact=name=>read(`artifacts/${name}.json`);
    const deploy=async(name,args)=>{const a=artifact(name);const c=await new ContractFactory(a.abi,a.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
    const registryAbi=artifact('AVRProofVerifierRegistry').abi;
    let registry, guardian, version, scheduled;
    if(mode==='finish') {
      scheduled=read('governance-pending.json');
      assert.equal((await provider.getBlock(0)).hash,scheduled.genesisHash);
      assert(Date.now()>=scheduled.wallEarliestMs,'Real 48-hour wall-clock interval has not elapsed');
      registry=new Contract(scheduled.registry,registryAbi,owner);
      guardian=new Wallet(scheduled.guardianKey,provider); version=scheduled.version;
    } else {
      if(mode==='schedule') assert(!fs.existsSync(path.join(dir,'governance-pending.json')),'Do not overwrite a pending trial');
      guardian= mode==='simulated'? await provider.getSigner(1):Wallet.createRandom().connect(provider);
      if(mode==='schedule') await(await owner.sendTransaction({to:await guardian.getAddress(),value:10n**18n})).wait();
      const verifier=await deploy('RiscZeroGroth16Verifier',[
        '0xa54dc85ac99f851c92d7c96d7318af41dbe7c0194edfcc37eb4d422a998c1f56',
        '0x04446e66d300eb7fb45c9726bb53c793dda407a62e9601618bb43c5c14657ac0']);
      const adapter=await deploy('RiscZeroAVRProofVerifierAdapter',[await verifier.getAddress(),image]);
      assert.equal(await adapter.verifyProof(proof.seal,proof.journal),true);
      registry=await deploy('AVRProofVerifierRegistry',[await owner.getAddress(),await guardian.getAddress(),172800]);
      version=keccak256(toUtf8Bytes('aichain:phase3:real-proof-governance:1'));
      const values=JSON.parse(Buffer.from(proof.journal.slice(2),'hex'));
      await(await registry.proposeVerifier(version,await adapter.getAddress(),values.statementId,image,1024,2048)).wait();
      const proposed=await registry.getVerifier(version);
      await assert.rejects(registry.activateVerifier.staticCall(version));
      await assert.rejects(registry.verifyAndRecord.staticCall(version,proof.seal,proof.journal));
      if(mode==='schedule') {
        const wallEarliestMs=Date.now()+172800000;
        write('governance-pending.json',{registry:await registry.getAddress(),guardianKey:guardian.privateKey,version,genesisHash:(await provider.getBlock(0)).hash,activationTime:Number(proposed.activationTime),wallEarliestMs});
        write('governance-scheduled-public.json',{status:'pending-real-delay',registry:await registry.getAddress(),version,activationTime:Number(proposed.activationTime),wallEarliestUtc:new Date(wallEarliestMs).toISOString(),earlyActivationRejected:true,earlyProofRejected:true});
        console.log(JSON.stringify(read('governance-scheduled-public.json'),null,2)); return;
      }
      await provider.send('evm_setNextBlockTimestamp',[Number(proposed.activationTime)-1]);await provider.send('evm_mine',[]);
      await assert.rejects(registry.activateVerifier.staticCall(version));
      await provider.send('evm_setNextBlockTimestamp',[Number(proposed.activationTime)]);await provider.send('evm_mine',[]);
      await registry.activateVerifier.staticCall(version); // Exact boundary, before the next transaction mines.
    }
    await(await registry.activateVerifier(version)).wait();
    await assert.rejects(registry.connect(guardian).retireVerifier.staticCall(version));
    await assert.rejects(registry.verifyAndRecord.staticCall(version,'0x'+'00'.repeat(1025),proof.journal));
    await assert.rejects(registry.verifyAndRecord.staticCall(version,proof.seal,'0x'+'00'.repeat(2049)));
    await assert.rejects(registry.verifyAndRecord.staticCall(version,'0x'+'00'.repeat(260),proof.journal));
    await(await registry.connect(guardian).pause()).wait();
    await assert.rejects(registry.verifyAndRecord.staticCall(version,proof.seal,proof.journal));
    await assert.rejects(registry.connect(guardian).unpause.staticCall());
    await(await registry.unpause()).wait();
    const mined=await(await registry.verifyAndRecord(version,proof.seal,proof.journal)).wait();
    const digest=keccak256(proof.journal);const recorded=await registry.verificationTime(version,digest);assert(recorded>0n);
    await assert.rejects(registry.verifyAndRecord.staticCall(version,proof.seal,proof.journal));
    await(await registry.connect(guardian).emergencyRetireVerifier(version)).wait();
    await assert.rejects(registry.activateVerifier.staticCall(version));
    await assert.rejects(registry.verifyAndRecord.staticCall(version,proof.seal,proof.journal));
    assert.equal(await registry.verificationTime(version,digest),recorded);
    write(`governance-${mode}-report.json`,{status:'passed',timeMode:mode==='simulated'?'Anvil boundary simulation, NOT elapsed real time':'real 48-hour wall time and chain delay',registry:await registry.getAddress(),version,transaction:mined.hash,gasUsed:mined.gasUsed.toString(),checks:['early-activation','early-proof','activation-boundary','real-proof','resource-limits','role-controls','pause','duplicate','irreversible-retirement','historical-record-retained']});
    console.log(JSON.stringify(read(`governance-${mode}-report.json`),null,2));
  } finally {provider.destroy();}
}
main().catch(e=>{console.error(e.shortMessage||e.message);process.exitCode=1;});
