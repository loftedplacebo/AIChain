// Loopback-only synthetic customer workspace. No signer is loaded by this process.
const fs=require('node:fs'),{randomBytes}=require('node:crypto');
const {GovernanceStore}=require('../services/governance/store');
const {createServer}=require('../services/governance/server.cjs');
const {passwordHash}=require('../services/governance/auth.cjs');
const dir='/var/lib/aichain-governance-worker',file=dir+'/workspace-access.json';
if(!fs.existsSync(file)){
 const accounts=['northstar','harbour'].map(id=>({id,email:id+'@example.test',password:randomBytes(24).toString('base64url')}));
 const users=accounts.map(a=>({id:a.id,email:a.email,passwordHash:passwordHash(a.password),workspaces:[{id:a.id,name:a.id+' · VPS synthetic test',tenant:a.id,project:'acceptance'}]}));
 fs.writeFileSync(file,JSON.stringify({accounts,users,ingestToken:randomBytes(32).toString('hex')},null,2),{flag:'wx',mode:0o600});
}
const access=JSON.parse(fs.readFileSync(file,'utf8')),store=new GovernanceStore(dir+'/events.sqlite');
const credentials=[{tenant:'northstar',project:'acceptance',token:access.ingestToken,scopes:['write','read']}];
const server=createServer(store,credentials,access.users,store.db,{trustedSigners:['0xb4ab030ba5c5db6442c946d02439d77a7067908f'],provider:require('../services/governance/evidence-provider.cjs').evidenceProvider('https://sepolia.base.org')});
server.listen(8795,'127.0.0.1',()=>console.log('VPS synthetic workspace API ready on loopback:8795'));
for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>server.close(()=>{store.close();process.exit(0);}));
