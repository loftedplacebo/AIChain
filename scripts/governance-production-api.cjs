'use strict';
// Private, loopback-only production API entry point for the initial Contabo host.
// The public edge stays closed until separate production release acceptance.
const {isAbsolute}=require('node:path');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const {workosConfig}=require('../services/governance/workos-auth.cjs');

const DATABASE_HOST='orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com';

function validate(env){
 if(env.GOVERNANCE_ENV!=='prod'||env.GOVERNANCE_PRODUCTION_HOST!=='contabo-shared'||
    env.GOVERNANCE_STORAGE!=='postgres'||env.GOVERNANCE_KEY_STORAGE!=='postgres'||
    env.GOVERNANCE_CONTROL_STORAGE!=='postgres')throw Error('Production requires the reviewed Contabo and PostgreSQL runtime profile');
 if(env.GOVERNANCE_IDENTITY_PROVIDER!=='workos'||env.WORKOS_ADMISSION_MODE!=='production-list'||
    !env.WORKOS_WEBHOOK_SECRET||!env.WORKOS_PRODUCTION_ALLOWED_EMAILS)throw Error('Production requires closed WorkOS admission and signed revocations');
 if(env.GOVERNANCE_USERS||env.GOVERNANCE_CREDENTIALS||env.GOVERNANCE_SESSION_DB||
    env.GOVERNANCE_DB||env.GOVERNANCE_RULES_DB||env.GOVERNANCE_ADOPT_UNBOUND_SQLITE||
    env.GOVERNANCE_RULE_PROCESSING_ENABLED==='true'||env.WORKOS_PILOT_ALLOWED_EMAILS!==undefined)throw Error('Production cannot reuse seeded, pilot or SQLite state');
 if(!env.GOVERNANCE_DATABASE_CA_FILE||!isAbsolute(env.GOVERNANCE_DATABASE_CA_FILE))throw Error('Production requires an absolute managed database CA path');
 const url=new URL(env.GOVERNANCE_DATABASE_URL||'');
 if(url.hostname!==DATABASE_HOST||url.port!=='25060'||url.pathname!=='/governance_prod'||
    url.searchParams.get('sslmode')!=='verify-full')throw Error('Production requires the exclusive managed database over verified TLS');
 const db=connectionOptions(env.GOVERNANCE_DATABASE_URL,{caFile:env.GOVERNANCE_DATABASE_CA_FILE});
 if(db.user!=='governance_prod_api')throw Error('Production API requires its restricted database role');
 const auth=workosConfig(env);
 if(new URL(auth.redirectUri).origin!=='https://prod.orvessian.com')throw Error('Production callback origin mismatch');
 if(env.PORT!=='8791')throw Error('Production requires its reviewed loopback port');
 return {stage:'prod',databaseHost:db.host,portalOrigin:'https://prod.orvessian.com',port:Number(env.PORT)};
}

async function preflight(env=process.env){
 validate(env);
 const {Pool}=require('pg');
 const pool=new Pool({...connectionOptions(env.GOVERNANCE_DATABASE_URL,{caFile:env.GOVERNANCE_DATABASE_CA_FILE}),statement_timeout:10000,query_timeout:12000});
 try{
  await new (require('../services/governance/postgres-store.cjs').PostgresGovernanceStore)(pool,{runtimeProfile:'api'}).ready('prod');
  const directory=new (require('../services/governance/postgres-customer-directory.cjs').PostgresCustomerDirectory)(pool);
  await new (require('../services/governance/postgres-provider-sessions.cjs').PostgresProviderSessions)(pool,directory).ready('prod');
  await new (require('../services/governance/postgres-project-keys.cjs').PostgresProjectKeys)(pool).ready('prod');
  return {status:'ready',stage:'prod',database:'verified',runtimeProfile:'api',identity:'configured',scope:'Read-only private preflight; no public edge, backup, evidence chain or release approval'};
 }finally{await pool.end();}
}

async function start(env=process.env){
 validate(env);
 return require('../services/governance/start.cjs').start(env);
}

module.exports={validate,preflight,start};
if(require.main===module){
 const check=process.argv.length===3&&process.argv[2]==='--preflight';
 if(process.argv.length>2&&!check){console.error('Usage: governance-production-api.cjs [--preflight]');process.exitCode=2;}
 else (check?preflight():start()).then(result=>{if(check)console.log(JSON.stringify(result));}).catch(()=>{console.error('Production API stopped; review private configuration and release prerequisites.');process.exitCode=1;});
}
