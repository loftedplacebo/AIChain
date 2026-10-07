#!/usr/bin/env node
'use strict';
// Base Sepolia pilot only. Never prints the private key or replaces an existing wallet.
const fs=require('node:fs');
const {Wallet}=require('/opt/aichain/governance-pilot-worker/node_modules/ethers');
const path='/etc/aichain/pilot-self-service-funder.key';
if(process.platform!=='linux'||process.getuid()!==0)throw Error('Root on pilot VPS required');
let key;
if(fs.existsSync(path)){
 const info=fs.lstatSync(path);
 if(!info.isFile()||info.isSymbolicLink()||info.uid!==0||(info.mode&0o777)!==0o600||info.size!==67)throw Error('Protected funding wallet required');
 key=fs.readFileSync(path,'utf8').trim();
}else{
 key=Wallet.createRandom().privateKey;
 const fd=fs.openSync(path,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,key+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
if(!/^0x[a-f0-9]{64}$/.test(key))throw Error('Invalid funding wallet');
console.log(JSON.stringify({network:'Base Sepolia',address:new Wallet(key).address,keyProtected:true}));
