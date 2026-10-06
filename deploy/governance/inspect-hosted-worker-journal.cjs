'use strict';
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('/var/lib/aichain-governance-pilot-worker/worker.sqlite',{readOnly:true});
try{
 const environment=db.prepare('SELECT name FROM governance_environment').get()?.name;
 const rows=db.prepare('SELECT body FROM jobs').all().map(r=>JSON.parse(r.body));
 console.log(JSON.stringify({environment,jobs:rows.map(j=>({batchId:j.id,state:j.state,transactionHash:j.hash??null,verification:j.verification??null,attempts:j.attempts??0}))}));
}finally{db.close();}
