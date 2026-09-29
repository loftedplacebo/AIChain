// Isolated, synthetic local acceptance environment. No production credentials.
const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {GovernanceStore}=require('../services/governance/store');
const {createServer}=require('../services/governance/server.cjs');
const {passwordHash}=require('../services/governance/auth.cjs');
const directory=path.resolve(__dirname,'../build/workspace-local');fs.mkdirSync(directory,{recursive:true});
const accessFile=path.join(directory,'local-access.json');
if(!fs.existsSync(accessFile)){
 const accounts=['northstar','harbour'].map(name=>({email:name+'@example.test',password:randomBytes(24).toString('base64url'),id:name}));
 fs.writeFileSync(accessFile,JSON.stringify({notice:'Local synthetic accounts only. Do not deploy or reuse these passwords.',accounts},null,2),{flag:'wx',mode:0o600});
}
const {accounts}=JSON.parse(fs.readFileSync(accessFile,'utf8'));
const users=accounts.map(a=>({id:a.id,email:a.email,passwordHash:passwordHash(a.password),workspaces:[{id:a.id,name:a.id+' · synthetic local acceptance',tenant:a.id,project:'acceptance'}]}));
const store=new GovernanceStore(path.join(directory,'events.sqlite'));
const fixture=require('../fixtures/governance/paired-model-comparison-v0.1.0-draft.json');
for(const user of users){if(store.list({tenant:user.id,project:'acceptance'}).total)continue;
 const delta=Date.now()-3*86400000-Date.parse(fixture.events[0].occurredAt);
 const events=user.id==='northstar'?fixture.events:fixture.events.slice(0,10);
 for(const item of events){const event=structuredClone(item);event.tenantRef=user.id;event.projectRef='acceptance';event.occurredAt=new Date(Date.parse(event.occurredAt)+delta).toISOString();store.ingest(event,{tenant:user.id,project:'acceptance'});}
}
async function serve(){
 const {Wallet}=require('ethers');const {prepareBatch}=require('../services/governance/evidence.cjs');
 const keyFile=path.join(directory,'recording-service.key');if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,Wallet.createRandom().privateKey,{flag:'wx',mode:0o600});
 const signer=new Wallet(fs.readFileSync(keyFile,'utf8').trim());
 for(const user of users){const proposal=await prepareBatch(store,{tenant:user.id,project:'acceptance'},signer,{publisher:'0xec502b5f4d1925138a7409d9a7b55fba20e13cc3',limit:1000});if(proposal)fs.writeFileSync(path.join(directory,user.id+'-batch-proposal.json'),JSON.stringify(proposal,null,2));}
 const evidenceOptions={trustedSigners:[signer.address.toLowerCase()],provider:process.env.GOVERNANCE_EVIDENCE_RPC_URL?require('../services/governance/evidence-provider.cjs').evidenceProvider(process.env.GOVERNANCE_EVIDENCE_RPC_URL):null};
 const server=createServer(store,[],users,store.db,evidenceOptions);
 server.listen(Number(process.env.PORT||8790),'127.0.0.1',()=>console.log('Local synthetic workspace API ready; signed batches prepared, no transactions broadcast.'));
 process.on('SIGINT',()=>server.close(()=>{store.close();process.exit(0);}));
}
serve().catch(e=>{console.error(e.message);store.close();process.exitCode=1;});