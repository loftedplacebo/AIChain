'use strict';
const https=require('node:https');
const {FetchRequest,JsonRpcProvider}=require('ethers');
const methods=new Set(['eth_chainId','eth_getCode','eth_getTransactionReceipt','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getTransactionCount']);
function boundedRpcTransport(value,{request=https.request}={}){
 const target=new URL(value);if(target.protocol!=='https:'||target.username||target.password||target.hash)throw Error('Explicit HTTPS read-only RPC required');
 return async(req,signal)=>{
  if(req.url!==target.href||req.method!=='POST'||!req.body||req.body.length>32768)throw Error('Read-only RPC request refused');
  const body=JSON.parse(Buffer.from(req.body).toString('utf8'));if(Array.isArray(body)||body?.jsonrpc!=='2.0'||!methods.has(body.method))throw Error('Read-only RPC method refused');
  signal?.checkSignal();
  return new Promise((resolve,reject)=>{
   const client=request(target,{method:'POST',headers:req.headers,rejectUnauthorized:true},response=>{
    if(response.statusCode!==200){response.resume();client.destroy();reject(Error('Read-only RPC HTTP response refused'));return;}
    let bytes=0;const chunks=[];response.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576){response.destroy();client.destroy();reject(Error('Read-only RPC response limit exceeded'));}else chunks.push(chunk);});
    response.on('error',()=>reject(Error('Read-only RPC response failed')));response.on('end',()=>resolve({statusCode:200,statusMessage:'OK',headers:response.headers,body:Buffer.concat(chunks)}));
   });
   client.on('error',()=>reject(Error('Read-only RPC transport failed')));client.setTimeout(5000,()=>{client.destroy();reject(Error('Read-only RPC transport timeout'));});signal?.addListener(()=>{client.destroy();reject(Error('Read-only RPC cancelled'));});client.end(Buffer.from(req.body));
  });
 };
}
function createPublisherReviewProvider(url,transportOptions={}){
 const request=new FetchRequest(new URL(url).href);request.timeout=5000;request.allowGzip=false;request.setThrottleParams({maxAttempts:1});request.getUrlFunc=boundedRpcTransport(url,transportOptions);
 // Disable SDK startup network-detection retries; the exposed getNetwork
 // performs an explicit live eth_chainId read instead of trusting the cache.
 const provider=new JsonRpcProvider(request,84532,{staticNetwork:true,cacheTimeout:0,batchMaxCount:1});
 return Object.fromEntries([...['getCode','getTransactionReceipt','getBlockNumber','getBlock','getTransactionCount'].map(name=>[name,provider[name].bind(provider)]),['getNetwork',async()=>({chainId:BigInt(await provider.send('eth_chainId',[]))})],['destroy',provider.destroy.bind(provider)]]);
}
module.exports={boundedRpcTransport,createPublisherReviewProvider};
