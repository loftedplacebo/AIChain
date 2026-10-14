'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {keccak256}=require('ethers');
const {prepare}=require('./prepare-base-mainnet-deploy.cjs');
test('mainnet deployment manifest is reviewable and never embeds a signer',()=>{
 const artifact=Buffer.from(JSON.stringify({contractName:'ReceiptBatchAnchor',compiler:'0.8.24+commit.e11b9ed9.Emscripten.clang',evmVersion:'paris',optimizer:{enabled:true,runs:200},sourceName:'contracts/avr-anchor/src/ReceiptBatchAnchor.sol',bytecode:'0x6001',deployedBytecode:'0x6002'}));
 const manifest=prepare(artifact);
 assert.equal(manifest.network.chainId,8453);
 assert.equal(manifest.creation.to,null);
 assert.equal(manifest.creation.value,'0x0');
 assert.equal(manifest.expectedRuntimeCodeHash,keccak256('0x6002'));
 assert.equal(JSON.stringify(manifest).includes('privateKey'),false);
 assert.throws(()=>prepare(Buffer.from(JSON.stringify({...JSON.parse(artifact),optimizer:{enabled:false,runs:200}}))),/Reviewed/);
});
