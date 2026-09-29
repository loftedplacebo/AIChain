'use strict';
// No seeded users, project tokens, SQLite fallback, worker start or broadcast.
const fs=require('node:fs'),path=require('node:path'),{parseEnv}=require('node:util');
const {randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'build/governance/dev/postgres');
async function start(){
 const access=JSON.parse(fs.readFileSync(path.join(directory,'runtime-access.json'),'utf8'));
 const provisioned=JSON.parse(fs.readFileSync(path.join(directory,'provisioned.json'),'utf8'));
 if(access.environment!=='dev'||provisioned.environment!=='dev'||access.database!=='governance_dev'||provisioned.port!==55440)throw Error('Dedicated development database required');
 const u=new URL(access.api);
 if(u.hostname!=='127.0.0.1'||u.port!=='55440'||u.pathname!=='/governance_dev'||u.username!=='governance_dev_api')throw Error('Strict development API role required');
 const identity=parseEnv(fs.readFileSync(path.join(root,'build/governance/dev/workos.env'),'utf8'));
 if(identity.GOVERNANCE_ENV!=='dev'||identity.GOVERNANCE_IDENTITY_PROVIDER!=='workos'||identity.WORKOS_REDIRECT_URI!=='http://localhost:3001/api/auth/callback')throw Error('Reviewed local development WorkOS configuration required');
 const seal=path.join(directory,'identity-seal.key');
 if(!fs.existsSync(seal))fs.writeFileSync(seal,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
 if(fs.lstatSync(seal).isSymbolicLink())throw Error('Regular private identity sealing key required');
 // Reuse only provider connection details; never import SQLite state, credentials or wallets.
 const env={GOVERNANCE_ENV:'dev',GOVERNANCE_STORAGE:'postgres',GOVERNANCE_KEY_STORAGE:'postgres',GOVERNANCE_CONTROL_STORAGE:'postgres',GOVERNANCE_DATABASE_URL:access.api,PORT:'8798',GOVERNANCE_IDENTITY_PROVIDER:'workos',WORKOS_API_KEY:identity.WORKOS_API_KEY,WORKOS_CLIENT_ID:identity.WORKOS_CLIENT_ID,WORKOS_REDIRECT_URI:identity.WORKOS_REDIRECT_URI,GOVERNANCE_IDENTITY_SEAL_KEY:fs.readFileSync(seal,'utf8').trim()};
 return require('../services/governance/start.cjs').start(env);
}
module.exports={start};
if(require.main===module)start().catch(()=>{console.error('Shared development API failed to start; inspect configuration and database readiness privately.');process.exitCode=1;});
