// Bounded read-only JSON-RPC. No signing or transaction-broadcast methods.
function evidenceProvider(url){
 const endpoint=new URL(url);if(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['127.0.0.1','localhost'].includes(endpoint.hostname)))throw new Error('HTTPS RPC endpoint required');
 async function rpc(method,params){const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(1500),redirect:'error'});if(!r.ok)throw new Error('RPC unavailable');const body=await r.json();if(body.error||!Object.hasOwn(body,'result'))throw new Error('RPC failed');return body.result;}
 return {getNetwork:async()=>({chainId:BigInt(await rpc('eth_chainId',[]))}),getCode:address=>rpc('eth_getCode',[address,'latest']),getBlockNumber:async()=>Number(BigInt(await rpc('eth_blockNumber',[]))),getBlock:async n=>{const b=await rpc('eth_getBlockByNumber',['0x'+n.toString(16),false]);return b?{number:Number(BigInt(b.number)),hash:b.hash}:null;},getTransactionReceipt:async tx=>{const r=await rpc('eth_getTransactionReceipt',[tx]);return r?{...r,hash:r.transactionHash,blockNumber:Number(BigInt(r.blockNumber)),status:Number(BigInt(r.status))}:null;}};
}
module.exports={evidenceProvider};
