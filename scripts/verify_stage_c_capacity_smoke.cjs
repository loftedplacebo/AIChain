'use strict';
// Read-only verification of the two protected Stage C pilot project scopes.
const path = require('node:path');
const root = process.env.PILOT_API_ROOT || path.resolve(__dirname, '..');
const {Pool} = require(path.join(root, 'node_modules/pg'));
const {connectionOptions} = require(path.join(root, 'services/governance/postgres-connection.cjs'));
const {PostgresGovernanceStore} = require(path.join(root, 'services/governance/postgres-store.cjs'));
const {verifyExport} = require(path.join(root, 'services/governance/evidence-export-verifier.cjs'));
const {evidenceProvider} = require(path.join(root, 'services/governance/evidence-provider.cjs'));
const {loadPilotWorkers} = require(path.join(root, 'services/governance/pilot-worker-inventory.cjs'));

const projects = [
  {name:'operator', tenant:'org-831aa048-b268-4fce-98f3-455429034ef8',
    project:'prj-d9109260-1232-4561-ab4a-ab2e5c8f658f'},
  {name:'internal', tenant:'org-61f98eac-1218-439d-9e93-f3717e1dfe37',
    project:'prj-1e8d2ecd-6bbf-4cb6-b49b-fb599ba9626c'},
];
const rpcUrl = 'https://sepolia.base.org';

async function blockTime(hash, provider, cache) {
  if (cache.has(hash)) return cache.get(hash);
  const receipt = await provider.getTransactionReceipt(hash);
  if (!receipt || receipt.status !== 1) return null;
  const response = await fetch(rpcUrl, {method:'POST',
    headers:{'content-type':'application/json', 'user-agent':'orvessian-stage-c-verifier/1.0'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',
      params:['0x'+receipt.blockNumber.toString(16),false]}),
    signal:AbortSignal.timeout(5000),redirect:'error'});
  if (!response.ok) return null;
  const body = await response.json();
  const value = body.result?.timestamp ? Number(BigInt(body.result.timestamp))*1000 : null;
  cache.set(hash, value);
  return value;
}

async function main() {
  if (process.env.GOVERNANCE_ENV !== 'test') throw Error('Expected test runtime');
  const runId = process.argv[2], count = Number(process.argv[3]);
  if (!/^[-a-zA-Z0-9]{1,40}$/.test(runId||'') || !Number.isInteger(count) || count<1 || count>10)
    throw Error('Expected bounded run ID and count 1–10');
  const pool = new Pool({...connectionOptions(process.env.GOVERNANCE_DATABASE_URL,
    {caFile:process.env.GOVERNANCE_DATABASE_CA_FILE}),max:1,connectionTimeoutMillis:5000});
  try {
    const store = new PostgresGovernanceStore(pool,{runtimeProfile:'api'});
    await store.ready('test');
    const workers = loadPilotWorkers();
    const provider = evidenceProvider(rpcUrl), cache = new Map();
    const report = [];
    for (const scope of projects) {
      const signer = workers.find(w=>w.tenant===scope.tenant && w.project===scope.project)?.recorder;
      if (!signer) throw Error('Registered signer missing for '+scope.name);
      const items=[];
      for(let index=0;index<count;index++) {
        const eventId=`stagec-${runId}-${String(index).padStart(2,'0')}`;
        const event=await store.get(scope,eventId);
        const evidence=event ? await store.evidence(scope,eventId) : null;
        const result=event ? await verifyExport({event,evidence},
          {trustedSigners:[signer],provider}) : null;
        const received=event?.receivedAt ? Date.parse(event.receivedAt) : null;
        const signed=evidence?.bundle?.createdAt ? Date.parse(evidence.bundle.createdAt) : null;
        const mined=result?.transactionHash ? await blockTime(result.transactionHash,provider,cache) : null;
        items.push({eventId,verification:result?.exportVerification||'missing',
          signature:result?.signature||null, trustedSigner:result?.trustedSigner??null,
          recordCommitment:result?.recordCommitment??null,
          batchMembership:result?.batchMembership??null,
          confirmations:result?.confirmations??null,
          receiptToSignedSeconds:received!==null&&signed!==null ? Math.max(0,Math.round((signed-received)/1000)) : null,
          receiptToMinedSeconds:received!==null&&mined!==null ? Math.max(0,Math.round((mined-received)/1000)) : null});
      }
      report.push({project:scope.name, projectRef:scope.project,
        verified:items.filter(item=>item.verification==='verified').length,
        maxReceiptToSignedSeconds:Math.max(...items.map(item=>item.receiptToSignedSeconds??-1)),
        maxReceiptToMinedSeconds:Math.max(...items.map(item=>item.receiptToMinedSeconds??-1)),
        items});
    }
    console.log(JSON.stringify({runId,countPerProject:count,projects:report}));
    if (report.some(group=>group.verified!==count || group.items.some(item=>
      item.signature!=='valid'||item.trustedSigner!==true||
      item.recordCommitment!==true||item.batchMembership!==true))) process.exitCode=2;
  } finally {await pool.end();}
}
main().catch(()=>{console.error('Stage C capacity evidence verification failed');process.exitCode=1});
