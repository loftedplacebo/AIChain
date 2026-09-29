'use strict';
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {validateBinding,policyDigest,sameBinding}=require('./publisher-release-binding.cjs');
// Read metadata only. This never approves a journal or contacts a provider.
function loadWorkerBinding({journal,environment,storage,principal,publisher,recorder,policy,codeHash}){
 if(!['dev','test'].includes(environment))throw Error('Worker environment is not enabled');
 if(!fs.existsSync(journal))return null;
 const stat=fs.lstatSync(journal);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Regular worker journal required');
 const db=new DatabaseSync(journal,{readOnly:true});
 try{
  db.exec('PRAGMA busy_timeout=5000');
  const table=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  if(table('governance_environment')){const rows=db.prepare('SELECT name FROM governance_environment LIMIT 2').all();if(rows.length!==1||rows[0].name!==environment)throw Error('Worker journal environment mismatch');}
  const restored=table('governance_recovery_gate'),released=table('governance_publisher_release');
  require('./environment.cjs').assertRecoveryApproved(db);
  if(!restored&&!released)return null;
  if(!restored||!released||storage!=='postgres')throw Error('Restored publisher requires PostgreSQL and a reviewed journal binding');
  const sizes=db.prepare('SELECT length(CAST(body AS BLOB)) AS bytes FROM governance_publisher_release LIMIT 2').all();
  if(sizes.length!==1||sizes[0].bytes<1||sizes[0].bytes>4096)throw Error('Bounded reviewed journal binding required');
  const binding=validateBinding(JSON.parse(db.prepare('SELECT body FROM governance_publisher_release LIMIT 1').get().body));
  const actual={...principal,releaseId:binding.releaseId,publisher,recorder,policyDigest:policyDigest(policy),codeHash};
  if(!sameBinding(binding,actual))throw Error('Worker configuration differs from reviewed journal binding');
  return binding;
 }finally{db.close();}
}
module.exports={loadWorkerBinding};
