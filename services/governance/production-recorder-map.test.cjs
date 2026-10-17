'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Wallet,keccak256}=require('ethers');
const {GovernanceStore}=require('./store');
const {createServer}=require('./server.cjs');
const {prepareBatch}=require('./evidence.cjs');
const {productionRecorderMap,recorderForProject}=require('./production-recorder-map.cjs');
const fixture=require('../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');

const a={tenant:'org-11111111-1111-4111-8111-111111111111',project:'prj-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
const b={tenant:'org-22222222-2222-4222-8222-222222222222',project:'prj-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
const anchor={chainId:8453,contract:'0x'+'11'.repeat(20),codeHash:keccak256('0x6001')};

function fixtureEvent(principal){
 const store=new GovernanceStore(':memory:');
 const input={...fixture.events[0],tenantRef:principal.tenant,projectRef:principal.project,environment:'prod'};
 try{store.ingest(input,principal);return store.get(principal,input.eventId);}
 finally{store.close();}
}

async function signed(event,principal,signer){
 let bundle;
 await prepareBatch({pendingEvidence:async()=>[event],commitEvidence:async(_p,entries)=>{bundle=entries[0].bundle;}},principal,signer,{publisher:signer.address,anchor});
 return bundle;
}

test('Production recorder map rejects duplicate, malformed and cross-project bindings',()=>{
 const signer=Wallet.createRandom().address;
 const rows=[{...a,recorder:signer}];
 const map=productionRecorderMap(JSON.stringify(rows));
 assert.equal(recorderForProject(map,a.tenant,a.project),signer.toLowerCase());
 assert.equal(recorderForProject(map,b.tenant,b.project),null);
 assert.throws(()=>productionRecorderMap(JSON.stringify([...rows,...rows])),/Duplicate/);
 assert.throws(()=>productionRecorderMap(JSON.stringify([{...b,recorder:signer},...rows])),/Duplicate/);
 assert.throws(()=>productionRecorderMap(JSON.stringify([{...a,recorder:signer,unexpected:true}])),/Exact/);
 assert.throws(()=>productionRecorderMap(JSON.stringify([{...a,recorder:'0x'+'00'.repeat(20)}])),/Exact/);
});

test('Production evidence route trusts only the recorder bound to its project',async()=>{
 const signerA=Wallet.createRandom(),signerB=Wallet.createRandom();
 const map=productionRecorderMap(JSON.stringify([
  {...a,recorder:signerA.address},{...b,recorder:signerB.address},
 ]));
 const eventA=fixtureEvent(a),eventB=fixtureEvent(b);
 const records=new Map([
  [a.project,{event:eventA,bundle:await signed(eventA,a,signerA)}],
  [b.project,{event:eventB,bundle:await signed(eventB,b,signerA)}],
 ]);
 const dbStore=new GovernanceStore(':memory:');
 const store={db:dbStore.db,get:async p=>records.get(p.project)?.event||null,
  evidence:async p=>({bundle:records.get(p.project)?.bundle})};
 const tokenA='a'.repeat(40),tokenB='b'.repeat(40);
 const server=createServer(store,[
  {...a,token:tokenA,scopes:['read']},{...b,token:tokenB,scopes:['read']},
 ],[],dbStore.db,{anchor,trustedSigners:[signerA.address]},
 {environment:'prod',productionRecorders:map});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port+'/v1/evidence/'+eventA.eventId;
  const read=async token=>(await fetch(base,{headers:{authorization:'Bearer '+token}})).json();
  assert.equal((await read(tokenA)).verification.state,'batched');
  assert.equal((await read(tokenB)).verification.state,'untrusted-signer');
 }finally{await new Promise(resolve=>server.close(resolve));dbStore.close();}
});
