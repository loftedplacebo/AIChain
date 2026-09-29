// Read-only Base RPC fee sampling. No wallet, keys, signing or broadcasts.
const fs = require('node:fs');
const path = require('node:path');
const { Interface, Transaction, keccak256, toUtf8Bytes, formatEther } = require('C:/AIChain/node_modules/ethers');
const anchor = new Interface(['function anchorBatch(bytes32,uint64,string)']);
const oracle = new Interface(['function getL1Fee(bytes) view returns(uint256)', 'function getL1FeeUpperBound(uint256) view returns(uint256)']);
const endpoint = 'https://mainnet.base.org';
async function rpc(method, params) {
  const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw Error('HTTP '+response.status);
  const result = await response.json();
  if(result.error || result.result == null) throw Error(JSON.stringify(result));
  return result.result;
}
(async()=>{
  const chainId = await rpc('eth_chainId', []);
  if(BigInt(chainId)!==8453n) throw Error('Unexpected network');
  const block = await rpc('eth_getBlockByNumber',['latest',false]);
  const price = BigInt(await rpc('eth_gasPrice', []));
  const data = anchor.encodeFunctionData('anchorBatch',[keccak256(toUtf8Bytes('synthetic-fee-estimate-only')),1000,'0.4.0-alpha']);
  // Synthetic address, not a deployed Orvessian contract; used only for byte-size estimation.
  const tx = Transaction.from({type:2,chainId:8453,to:'0x1111111111111111111111111111111111111111',nonce:100000,gasLimit:120000,maxFeePerGas:price*2n,maxPriorityFeePerGas:0n,data});
  const raw = tx.unsignedSerialized;
  const oracleAddress = '0x420000000000000000000000000000000000000F';
  const l1Fee = BigInt(await rpc('eth_call',[{to:oracleAddress,data:oracle.encodeFunctionData('getL1Fee',[raw])},block.number]));
  const l1Upper = BigInt(await rpc('eth_call',[{to:oracleAddress,data:oracle.encodeFunctionData('getL1FeeUpperBound',[(raw.length-2)/2+65])},block.number]));
  const gas = 92831n; // Historical private-EVM measurement, not Base estimateGas.
  const totals = l1=>({perAnchorETH:formatEther(gas*price+l1),perDayETH:formatEther((gas*price+l1)*100000n),per30DaysETH:formatEther((gas*price+l1)*3000000n)});
  const result = {sampledAt:new Date().toISOString(),endpoint,chainId:Number(BigInt(chainId)),blockNumber:Number(BigInt(block.number)),blockTimestamp:Number(BigInt(block.timestamp)),gasPriceWei:price.toString(),historicalExecutionGas:Number(gas),calldataBytes:(data.length-2)/2,unsignedTransactionBytes:(raw.length-2)/2,l1EstimatedWei:l1Fee.toString(),l1UpperBoundWei:l1Upper.toString(),sampleEstimate:totals(l1Fee),usingL1UpperBound:totals(l1Upper),caveat:'Synthetic unsigned transaction and historical execution gas. No deployed Base anchor, live execution estimate, sustained fee observation or production benchmark. L1 upper bound is current-state only, not a future fee cap.'};
  fs.writeFileSync(path.join(__dirname,'../review/base-anchor-fee-sample.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
