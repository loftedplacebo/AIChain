// Read-only chain integration test; writes only to a fresh evidence directory.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { JsonRpcProvider, keccak256, toUtf8Bytes } = require('ethers');
const { syncIndex, createManifest, lookupReceipt } = require('../sdk/typescript/avr-event-indexer');

async function main() {
  assert.equal(process.env.AICHAIN_ENABLE_AVR_INDEXER, '1', 'Explicit indexer opt-in required');
  const [rpc, trafficDir, outputDir, genesis, mode] = process.argv.slice(2);
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(rpc).hostname), 'Loopback RPC required');
  assert(/^0x[0-9a-f]{64}$/.test(genesis), 'Expected genesis required');
  const input = JSON.parse(fs.readFileSync(path.join(trafficDir, 'report.json')));
  assert.equal(input.status, 'passed');
  assert.equal(input.genesisHash, genesis);
  const contracts = [{kind:'individual', address:input.anchor}, {kind:'batch', address:input.batch}];
  const statePath = path.join(outputDir, 'state.json');
  const manifestsDirectory = path.join(outputDir, 'manifests');
  const provider = new JsonRpcProvider(rpc, undefined, {cacheTimeout:-1});
  try {
    assert.equal((await provider.getBlock(0)).hash, genesis);
    if (mode) {
      const target = Number(mode);
      assert(Number.isSafeInteger(target) && target >= 0);
      provider.getBlockNumber = async () => target;
      const start = Date.now();
      const result = await syncIndex({provider, contracts, statePath, manifestsDirectory, startBlock:4673});
      console.log(JSON.stringify({elapsedMs:Date.now()-start, indexedBlocks:result.indexedBlocks, nextBlock:result.state.nextBlock}));
      return;
    }
    assert(!fs.existsSync(outputDir), 'Refusing to overwrite evidence');
    fs.mkdirSync(manifestsDirectory, {recursive:true});
    for (const size of [10,100]) {
      const source = JSON.parse(fs.readFileSync(path.join(trafficDir, `manifest-${size}.json`)));
      const manifest = createManifest(source.leaves);
      assert.equal(manifest.batchRoot, source.root);
      fs.writeFileSync(path.join(manifestsDirectory, `${size}.json`), JSON.stringify(manifest));
    }
    function stage(target) {
      const child = spawnSync(process.execPath, [__filename,rpc,trafficDir,outputDir,genesis,String(target)], {encoding:'utf8',timeout:180000});
      assert.equal(child.status,0,child.stderr || String(child.error));
      return JSON.parse(child.stdout);
    }
    const initial = stage(4677);
    let state = JSON.parse(fs.readFileSync(statePath));
    assert.equal(Object.keys(state.individual).length,3);
    assert.equal(Object.keys(state.batches).length,0);
    const target = await provider.getBlockNumber();
    assert(target >= 4724);
    const recovered = stage(target); // New OS process loads the durable cursor.
    state = JSON.parse(fs.readFileSync(statePath));
    assert.equal(state.nextBlock,target+1);
    assert.equal(Object.keys(state.individual).length,3);
    assert.equal(Object.keys(state.batches).length,2);
    for (const size of [10,100]) {
      const id = keccak256(toUtf8Bytes(`phase4-20260919:batch:${size}:0`));
      assert.equal(lookupReceipt(state,id).mode,'batch');
    }
    const repeated = stage(target);
    assert.equal(repeated.indexedBlocks,0);
    const beforeFailure = fs.readFileSync(statePath,'utf8');
    const failingProvider = {
      getNetwork:()=>provider.getNetwork(),
      getBlock:async()=>{throw Error('injected RPC outage');}
    };
    await assert.rejects(syncIndex({provider:failingProvider,contracts,statePath,manifestsDirectory,startBlock:4673}), /injected RPC outage/);
    assert.equal(fs.readFileSync(statePath,'utf8'), beforeFailure);
    const report = {schema:'aichain.phase4-indexer-recovery',status:'passed',genesisHash:genesis,initial,recovered,repeated,
      targetHeight:target,individuals:3,batches:2,checks:['separate-process-cursor-recovery','batch-inclusion-lookup','idempotent-retry','injected-rpc-error-preserves-state'],
      limitations:['Specific 2026-09-19 synthetic rehearsal fixture','Not a live reorg or node-outage test','No proof-event index coverage','Not sustained capacity']};
    fs.writeFileSync(path.join(outputDir,'report.json'), JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
  } finally { provider.destroy(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
