'use strict';
// Explicit test-stage entry point for a hosted synthetic-data design partner.
// Staging and production retain their separate startup gates.
const {isAbsolute}=require('node:path');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const {workosConfig}=require('../services/governance/workos-auth.cjs');
const localHost=host=>{const value=host.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');return value==='::1'||value==='0.0.0.0'||value==='localhost'||value.endsWith('.localhost')||value==='localhost.localdomain'||/^127\./.test(value);};

function validate(env){
 if(env.GOVERNANCE_ENV!=='test'||env.GOVERNANCE_STORAGE!=='postgres'||env.GOVERNANCE_KEY_STORAGE!=='postgres'||env.GOVERNANCE_CONTROL_STORAGE!=='postgres')throw Error('Hosted synthetic API requires explicit test-stage shared PostgreSQL storage');
 if(env.GOVERNANCE_IDENTITY_PROVIDER!=='workos'||!env.WORKOS_PILOT_ALLOWED_EMAILS||!env.WORKOS_WEBHOOK_SECRET)throw Error('Hosted synthetic API requires WorkOS, named admission and webhook verification');
 if(env.GOVERNANCE_USERS||env.GOVERNANCE_CREDENTIALS||env.GOVERNANCE_SESSION_DB||env.GOVERNANCE_DB||env.GOVERNANCE_RULES_DB||env.GOVERNANCE_ADOPT_UNBOUND_SQLITE||env.GOVERNANCE_RULE_PROCESSING_ENABLED==='true')throw Error('Hosted synthetic API cannot use seeded accounts, SQLite or rule processing');
 if(!env.GOVERNANCE_DATABASE_CA_FILE||!isAbsolute(env.GOVERNANCE_DATABASE_CA_FILE))throw Error('Hosted synthetic API requires an absolute managed database CA file');
 const url=new URL(env.GOVERNANCE_DATABASE_URL||'');
 if(url.searchParams.get('sslmode')!=='verify-full')throw Error('Hosted synthetic API requires verified PostgreSQL TLS');
 const db=connectionOptions(env.GOVERNANCE_DATABASE_URL,{caFile:env.GOVERNANCE_DATABASE_CA_FILE});
 if(localHost(db.host)||db.user==='doadmin'||db.user==='postgres')throw Error('Hosted synthetic API requires a remote restricted database login');
 const auth=workosConfig(env),redirect=new URL(auth.redirectUri);
 if(redirect.protocol!=='https:'||localHost(redirect.hostname))throw Error('Hosted synthetic API requires an HTTPS portal callback');
 if(env.PORT===undefined||!Number.isInteger(Number(env.PORT))||Number(env.PORT)<1||Number(env.PORT)>65535)throw Error('Hosted synthetic API requires an explicit loopback service port');
 return {databaseHost:db.host,portalOrigin:redirect.origin,port:Number(env.PORT)};
}

async function start(env=process.env){
 validate(env);
 return require('../services/governance/start.cjs').start(env);
}
async function preflight(env=process.env){
 validate(env);
 const {Pool}=require('pg');
 const pool=new Pool({...connectionOptions(env.GOVERNANCE_DATABASE_URL,{caFile:env.GOVERNANCE_DATABASE_CA_FILE}),statement_timeout:10000,query_timeout:12000});
 try{
  await new (require('../services/governance/postgres-store.cjs').PostgresGovernanceStore)(pool,{runtimeProfile:'api'}).ready('test');
  const directory=new (require('../services/governance/postgres-customer-directory.cjs').PostgresCustomerDirectory)(pool);
  await new (require('../services/governance/postgres-provider-sessions.cjs').PostgresProviderSessions)(pool,directory).ready('test');
  await new (require('../services/governance/postgres-project-keys.cjs').PostgresProjectKeys)(pool).ready('test');
  return {status:'ready',stage:'test',database:'verified',runtimeProfile:'api',identity:'configured',scope:'Read-only configuration and database checks; no WorkOS policy, HTTPS edge, offsite backup or release proof'};
 }finally{await pool.end();}
}
module.exports={validate,start,preflight};
if(require.main===module){
 const check=process.argv.length===3&&process.argv[2]==='--preflight';
 if(process.argv.length>2&&!check){console.error('Usage: governance-hosted-synthetic-api.cjs [--preflight]');process.exitCode=2;}
 else (check?preflight().then(result=>console.log(JSON.stringify(result))):start()).catch(()=>{console.error(check?'Hosted synthetic API preflight failed; review private configuration and database readiness.':'Hosted synthetic API failed to start; review private configuration and database readiness.');process.exitCode=1;});
}
