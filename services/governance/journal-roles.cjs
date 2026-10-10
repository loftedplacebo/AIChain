'use strict';
const {createHash}=require('node:crypto');

const MAX_JOURNALS=32;
const FIXED_ROLES=new Set(['events','control','rules','worker','indexer','relayer']);
const POSTGRES_ROLES=new Set(['worker','rules','indexer','relayer']);
const PROJECT_WORKER=/^worker_[a-f0-9]{24}$/;

function validRole(role,{postgres=false}={}){
 return typeof role==='string'&&(PROJECT_WORKER.test(role)||(postgres?POSTGRES_ROLES:FIXED_ROLES).has(role));
}
function projectWorkerRole(tenant,project){
 if(typeof tenant!=='string'||!/^org-[a-z0-9-]{36}$/.test(tenant)||typeof project!=='string'||!/^prj-[a-z0-9-]{36}$/.test(project))throw Error('Explicit tenant and project identifiers required');
 return 'worker_'+createHash('sha256').update(tenant+'\0'+project).digest('hex').slice(0,24);
}
module.exports={MAX_JOURNALS,validRole,projectWorkerRole};
