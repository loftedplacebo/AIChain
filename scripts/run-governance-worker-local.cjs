// Synthetic local workspace only. Creates a separate unfunded gas wallet once.
const fs=require('node:fs'),path=require('node:path'),{Wallet}=require('ethers');
const directory=path.resolve(__dirname,'../build/workspace-local');
if(fs.existsSync(path.join(directory,'worker-host.json')))throw Error('Worker ownership has moved to the VPS. Do not run this wallet locally; see worker-host.json.');
if(!fs.existsSync(path.join(directory,'recording-service.key')))throw Error('Start the local workspace first');
const keyFile=path.join(directory,'relayer.key');
if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,Wallet.createRandom().privateKey,{flag:'wx',mode:0o600});
const signer=new Wallet(fs.readFileSync(keyFile,'utf8').trim());
fs.writeFileSync(path.join(directory,'relayer-public.json'),JSON.stringify({address:signer.address,chainId:84532,notice:'Dedicated local governance testnet gas wallet; never fund with mainnet assets.'},null,2));
Object.assign(process.env,{GOVERNANCE_ENV:'dev',GOVERNANCE_TENANT:'northstar',GOVERNANCE_PROJECT:'acceptance',GOVERNANCE_DB:path.join(directory,'events.sqlite'),GOVERNANCE_RECEIPT_KEY_FILE:path.join(directory,'recording-service.key'),GOVERNANCE_RELAYER_KEY_FILE:keyFile,GOVERNANCE_WORKER_JOURNAL:path.join(directory,'worker.sqlite'),GOVERNANCE_EVIDENCE_RPC_URL:'https://sepolia.base.org'});
require('./governance-worker.cjs');
