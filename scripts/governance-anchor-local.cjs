// Local synthetic acceptance only. No private keys, arbitrary file serving or signing.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {JsonRpcProvider,keccak256}=require('ethers');
const {GovernanceStore}=require('../services/governance/store');
const {inspectEvidence,attachTransaction,CONTRACT,CODE_HASH}=require('../services/governance/evidence.cjs');
const directory=path.resolve(__dirname,'../build/workspace-local');
const principal={tenant:'northstar',project:'acceptance'};
const proposal=JSON.parse(fs.readFileSync(path.join(directory,'northstar-batch-proposal.json'),'utf8'));
const publisher='0xec502b5f4d1925138a7409d9a7b55fba20e13cc3';
const provider=new JsonRpcProvider('https://sepolia.base.org',84532,{staticNetwork:true});
const store=new GovernanceStore(path.join(directory,'events.sqlite'));
const port=8792,origin=`http://127.0.0.1:${port}`;
const resultFile=path.join(directory,'northstar-anchor-result.json');
let preflight=null,submission=fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile,'utf8')):null,busy=false;
async function check(){
 if(Number(await provider.send('eth_chainId',[]))!==84532||keccak256(await provider.getCode(CONTRACT))!==CODE_HASH)throw Error('Unexpected chain or contract');
 const entries=store.batchEvidence(principal,proposal.batchId);
 if(entries.length!==proposal.leafCount)throw Error('Prepared batch count mismatch');
 for(const entry of entries){const v=await inspectEvidence(store.get(principal,entry.id),entry.bundle,{trustedSigners:[entry.bundle.receipt.issuer]});if(!v.recordCommitment||!v.batchMembership||v.signature!=='valid'||entry.bundle.batch.root!==proposal.root||entry.bundle.batch.publisher!==publisher)throw Error('Invalid local batch');}
 if(proposal.transaction.to!==CONTRACT||proposal.transaction.chainId!==84532||proposal.transaction.value!=='0x0')throw Error('Invalid transaction destination');
 const {BATCH_ABI}=require('../sdk/typescript/base-sepolia-batch-adapter');
 if(proposal.transaction.data!==BATCH_ABI.encodeFunctionData('anchorBatch',[proposal.root,entries.length,entries[0].bundle.batch.schemaVersion]))throw Error('Prepared calldata mismatch');
 const tx={from:publisher,to:CONTRACT,data:proposal.transaction.data,value:'0x0'};
 const alreadyLinked=entries.every(e=>e.bundle.transactions.length>0);
 const gas=alreadyLinked?null:await provider.estimateGas(tx),balance=await provider.getBalance(publisher);
 preflight={checkedAt:new Date().toISOString(),records:entries.length,gasEstimate:gas===null?'Already submitted':gas.toString(),balanceWei:balance.toString(),publisher,chainId:84532,contract:CONTRACT};
 console.log(JSON.stringify({preflight},null,2));return preflight;
}
async function reconcile(hash){
 if(!/^0x[0-9a-fA-F]{64}$/.test(hash||''))throw Error('Invalid transaction hash');
 const entry=store.batchEvidence(principal,proposal.batchId)[0];
 const candidate=structuredClone(entry.bundle);candidate.transactions=[hash.toLowerCase()];
 const result=await inspectEvidence(store.get(principal,entry.id),candidate,{trustedSigners:[entry.bundle.receipt.issuer],provider});
 if(!['confirmed','confirming'].includes(result.state))return result;
 await attachTransaction(store,principal,proposal.batchId,hash);
 submission={...result,linkedRecords:proposal.leafCount};
 fs.writeFileSync(path.join(directory,'northstar-anchor-result.json'),JSON.stringify(submission,null,2));
 console.log(JSON.stringify(submission,null,2));return submission;
}
async function main(){
 await check();if(process.argv.includes('--check'))return;
 const html=fs.readFileSync(path.join(__dirname,'governance-anchor-local.html'));
 const server=http.createServer(async(req,res)=>{
  const send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  if(req.headers.host!==`127.0.0.1:${port}`)return send(403,{error:'Local host required'});
  try{
   if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY'});return res.end(html);}
   if(req.method==='GET'&&req.url==='/proposal')return send(200,{...proposal,publisher,preflight,submission});
   if(req.method==='POST'&&req.url==='/submission'){
    if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')return send(403,{error:'Same-origin JSON required'});
    if(busy)return send(409,{error:'Verification already running'});
    let text='';for await(const chunk of req){text+=chunk;if(text.length>256)return send(413,{error:'Too large'});}
    busy=true;try{return send(200,await reconcile(JSON.parse(text).hash));}finally{busy=false;}
   }
   return send(404,{error:'Not found'});
  }catch(e){send(400,{error:e.message});}
 });
 server.listen(port,'127.0.0.1',()=>console.log('Synthetic governance submission page: '+origin));
 process.on('SIGINT',()=>server.close(()=>{store.close();provider.destroy();process.exit(0);}));
}
main().then(()=>{if(process.argv.includes('--check')){store.close();provider.destroy();}}).catch(e=>{console.error(e.message);store.close();provider.destroy();process.exitCode=1;});
