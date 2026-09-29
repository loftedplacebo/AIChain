const {DatabaseSync}=require('node:sqlite');
const {GovernanceStore}=require('./store');
const {PostgresGovernanceStore}=require('./postgres-store.cjs');
const {createServer}=require('./server.cjs');
async function start(env=process.env){
 const {environmentConfig,bindSqlite}=require('./environment.cjs');
 const config=environmentConfig(env),{stage,driver}=config;
 const projectRequestPolicy=config.controlDriver==='postgres'?require('./postgres-request-limits.cjs').requestPolicy({readRequests:Number(env.GOVERNANCE_PROJECT_READ_REQUESTS_PER_MINUTE??600),writeRequests:Number(env.GOVERNANCE_PROJECT_WRITE_REQUESTS_PER_MINUTE??6000)}):null;
 const customerRequestPolicy=config.controlDriver==='postgres'?require('./postgres-customer-request-limits.cjs').customerRequestPolicy({readRequests:Number(env.GOVERNANCE_CUSTOMER_READ_REQUESTS_PER_MINUTE??300),writeRequests:Number(env.GOVERNANCE_CUSTOMER_WRITE_REQUESTS_PER_MINUTE??60)}):null;
 const authStartPolicy=config.controlDriver==='postgres'?require('./postgres-auth-start-limits.cjs').authStartPolicy(Number(env.GOVERNANCE_AUTH_START_REQUESTS_PER_MINUTE??120)):null;
 const workosConfig=require('./workos-auth.cjs').workosConfig(env);
 if(config.controlDriver==='postgres'&&(!workosConfig||env.GOVERNANCE_SESSION_DB||JSON.parse(env.GOVERNANCE_USERS||'[]').length))throw new Error('Shared customer control storage requires WorkOS and no configured accounts or SQLite session path');
 if(env.GOVERNANCE_RULES_DB&&driver!=='sqlite')throw new Error('Rules journal integration currently requires SQLite');
 if(env.GOVERNANCE_RULE_PROCESSING_ENABLED&&!['true','false'].includes(env.GOVERNANCE_RULE_PROCESSING_ENABLED))throw new Error('Invalid rule processing flag');
 const processingEnabled=env.GOVERNANCE_RULE_PROCESSING_ENABLED==='true';
 if(processingEnabled&&!env.GOVERNANCE_RULES_DB)throw new Error('Rule processing requires a rules journal');
 const ruleProjects=processingEnabled?require('./rule-processing.cjs').validateProjects(JSON.parse(env.GOVERNANCE_RULE_PROJECTS||'[]')):[];
 const ruleInterval=Number(env.GOVERNANCE_RULE_INTERVAL_MS||5000);
 if(processingEnabled&&(!Number.isInteger(ruleInterval)||ruleInterval<1000||ruleInterval>60000))throw new Error('Invalid rule interval');
 const notificationDestinations=env.GOVERNANCE_RULES_DB?JSON.parse(env.GOVERNANCE_NOTIFICATION_DESTINATIONS||'{}'):{};
 const credentials=JSON.parse(env.GOVERNANCE_CREDENTIALS||'[]'),users=JSON.parse(env.GOVERNANCE_USERS||'[]');
 if(credentials.some(c=>typeof c.token!=='string'||c.token.length<32||!c.tenant||!c.project||!Array.isArray(c.scopes)))throw new Error('Invalid project credentials');
 if(driver==='postgres'&&!env.GOVERNANCE_DATABASE_URL)throw new Error('PostgreSQL URL required');
 // Check all local state before serving or constructing journals/session tables.
 for(const path of [...new Set([driver==='sqlite'?config.eventPath:config.controlDriver==='sqlite'?config.sessionPath:null,config.rulesPath].filter(Boolean))])bindSqlite(path,stage,{adopt:config.adopt});
 let store,sessionDb;
 if(driver==='postgres'){
  const {Pool}=require('pg');
  const pool=new Pool(require('./postgres-connection.cjs').connectionOptions(env.GOVERNANCE_DATABASE_URL,{caFile:env.GOVERNANCE_DATABASE_CA_FILE}));
  pool.on('error',()=>console.error('Idle governance database connection failed'));
  store=new PostgresGovernanceStore(pool,{runtimeProfile:config.controlDriver==='postgres'?'api':'pilot',maxEvents:Number(env.GOVERNANCE_MAX_EVENTS||100000),maxBytes:Number(env.GOVERNANCE_MAX_BYTES||268435456),maxDailyEvents:Number(env.GOVERNANCE_MAX_DAILY_EVENTS||50000)});
  try{await store.ready(stage);}catch(e){await pool.end();throw e;}
  sessionDb=config.controlDriver==='sqlite'?new DatabaseSync(config.sessionPath):null;
 }else{store=new GovernanceStore(config.eventPath);sessionDb=store.db;}
 const evidenceOptions={trustedSigners:JSON.parse(env.GOVERNANCE_RECEIPT_SIGNERS||'[]'),provider:env.GOVERNANCE_EVIDENCE_RPC_URL?require('./evidence-provider.cjs').evidenceProvider(env.GOVERNANCE_EVIDENCE_RPC_URL):null};
 let ruleJournal,services={};
 if(config.controlDriver==='postgres'){
  const directory=new (require('./postgres-customer-directory.cjs').PostgresCustomerDirectory)(store.pool);
  const sessions=new (require('./postgres-provider-sessions.cjs').PostgresProviderSessions)(store.pool,directory);
  try{await sessions.ready(stage);}catch(e){await store.close();throw e;}
  services={directory,auth:new (require('./postgres-workspace-auth.cjs').PostgresWorkspaceAuth)(sessions,directory),workosOptions:{sessions,startRequestLimits:new (require('./postgres-auth-start-limits.cjs').PostgresAuthStartLimits)(directory,{requests:authStartPolicy})},customerRequestLimits:new (require('./postgres-customer-request-limits.cjs').PostgresCustomerRequestLimits)(directory,{readRequests:customerRequestPolicy.read,writeRequests:customerRequestPolicy.write})};
 }
 if(config.keyDriver==='postgres'){
  const projectKeys=new (require('./postgres-project-keys.cjs').PostgresProjectKeys)(store.pool,{authorize:services.directory?(c,p)=>services.directory.authorizeKeys(c,p):null,authorizeSession:services.directory?(c,p,options)=>services.auth.authorizeKeySession(c,p,options):null});
  try{await projectKeys.ready(stage);}catch(e){sessionDb?.close();await store.close();throw e;}
  services.projectKeys=projectKeys;
 }
 if(projectRequestPolicy)services.projectRequestLimits=new (require('./postgres-request-limits.cjs').PostgresRequestLimits)(store,{readRequests:projectRequestPolicy.read,writeRequests:projectRequestPolicy.write});
 if(env.GOVERNANCE_RULES_DB){
  ruleJournal=new (require('./webhook-delivery.cjs').DeliveryJournal)(config.rulesPath);
  services={...services,ruleEngine:new (require('./governance-rules.cjs').RuleEngine)(ruleJournal),notificationDestinations};
 }
 const readiness=require('./readiness.cjs').createReadiness({environment:stage,pool:store.pool,runtimeProfile:store.runtimeProfile||'pilot',sqlite:[store.db,sessionDb,ruleJournal?.db]});
 const server=createServer(store,credentials,users,sessionDb,evidenceOptions,{...services,workosConfig,readiness,environment:stage});
 const ruleProcessor=processingEnabled?new (require('./rule-processing.cjs').RuleProcessor)({engine:services.ruleEngine,store,projects:ruleProjects,intervalMs:ruleInterval}):null;
 server.listen(config.port,'127.0.0.1',()=>console.log(`Governance ${stage} service ready (${driver}); loopback only`));
 ruleProcessor?.start();
 let stopping;
 const stop=()=>stopping||(stopping=(async()=>{readiness.drain();await ruleProcessor?.stop();await new Promise(resolve=>server.close(resolve));ruleJournal?.close();if(sessionDb!==store.db)sessionDb?.close();await store.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);})());
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 return {server,store,...services,readiness,ruleProcessor,stop};
}
module.exports={start};
