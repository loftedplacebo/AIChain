#!/usr/bin/env node
'use strict';
// Prepare reviewable contract-creation bytes. No wallet or network is used.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {keccak256}=require('ethers');

function prepare(artifactBytes){
 const artifact=JSON.parse(artifactBytes.toString('utf8'));
 if(artifact.contractName!=='ReceiptBatchAnchor'||artifact.compiler!=='0.8.24+commit.e11b9ed9.Emscripten.clang'||artifact.evmVersion!=='paris'||artifact.optimizer?.enabled!==true||artifact.optimizer.runs!==200||!/^0x[0-9a-fA-F]+$/.test(artifact.bytecode)||!/^0x[0-9a-fA-F]+$/.test(artifact.deployedBytecode))throw Error('Reviewed mainnet contract artifact required');
 return {network:{name:'Base mainnet',chainId:8453},contract:{name:artifact.contractName,source:artifact.sourceName,compiler:artifact.compiler,evmVersion:artifact.evmVersion,optimizer:artifact.optimizer},creation:{to:null,value:'0x0',data:artifact.bytecode,dataKeccak256:keccak256(artifact.bytecode),sourceArtifactSha256:crypto.createHash('sha256').update(artifactBytes).digest('hex')},expectedRuntimeCodeHash:keccak256(artifact.deployedBytecode),status:'prepared-only; independent approval and wallet transaction required'};
}
function main(){
 const directory=path.resolve(__dirname,'../build/base-mainnet');
 const manifest=prepare(fs.readFileSync(path.join(directory,'ReceiptBatchAnchor.json')));
 const file=path.join(directory,'deployment-manifest.json');fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({manifestFile:file,chainId:manifest.network.chainId,creationDataKeccak256:manifest.creation.dataKeccak256,expectedRuntimeCodeHash:manifest.expectedRuntimeCodeHash,status:manifest.status},null,2));
}
if(require.main===module)main();
module.exports={prepare};
