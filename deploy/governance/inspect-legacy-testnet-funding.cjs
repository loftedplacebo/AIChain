'use strict';
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {Wallet,JsonRpcProvider}=require('ethers');
async function main(){
 const wallet=new Wallet(fs.readFileSync('/var/lib/aichain-governance-worker/keys/relayer.key','utf8').trim());
 const db=new DatabaseSync('/var/lib/aichain-governance-worker/worker.sqlite',{readOnly:true});
 let jobs;
 try{jobs=db.prepare('SELECT body FROM jobs').all().map(r=>JSON.parse(r.body)).map(j=>({state:j.state,nonce:j.nonce??null}));}
 finally{db.close();}
 const provider=new JsonRpcProvider('https://sepolia.base.org',84532,{staticNetwork:false,cacheTimeout:0});
 try{
  console.log(JSON.stringify({address:wallet.address,balanceWei:String(await provider.getBalance(wallet.address)),
   nonceLatest:await provider.getTransactionCount(wallet.address,'latest'),
   noncePending:await provider.getTransactionCount(wallet.address,'pending'),jobs}));
 }finally{provider.destroy();}
}
main().catch(()=>{console.error('Testnet funding inspection failed; no key printed.');process.exitCode=1;});
