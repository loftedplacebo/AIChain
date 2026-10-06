'use strict';
const fs=require('node:fs');
const {projectWorkerRole}=require('./journal-roles.cjs');
const ADDRESS=/^0x[a-fA-F0-9]{40}$/;
const LEGACY={unit:'aichain-governance-pilot-evidence-worker.service',journal:'/var/lib/aichain-governance-pilot-worker/worker.sqlite'};

function validatePilotWorkers(document){
 if(!document||typeof document!=='object'||Array.isArray(document)||JSON.stringify(Object.keys(document).sort())!==JSON.stringify(['environment','version','workers'])||document.version!==1||document.environment!=='test'||!Array.isArray(document.workers)||document.workers.length<1||document.workers.length>30)throw Error('Invalid pilot worker registry');
 const seen=new Set();
 for(const worker of document.workers){
  if(!worker||typeof worker!=='object'||Array.isArray(worker)||JSON.stringify(Object.keys(worker).sort())!==JSON.stringify(['journal','project','recorder','relayer','role','state','tenant','unit']))throw Error('Invalid pilot worker entry');
  const role=projectWorkerRole(worker.tenant,worker.project),instance=role.slice(7),legacy=worker.role==='worker';
  const unit=legacy?LEGACY.unit:`aichain-governance-project-worker@${instance}.service`,journal=legacy?LEGACY.journal:`/var/lib/aichain-governance-workers/${instance}/worker.sqlite`;
  if(worker.role!==(legacy?'worker':role)||worker.unit!==unit||worker.journal!==journal||!['active','paused'].includes(worker.state)||!ADDRESS.test(worker.recorder)||!ADDRESS.test(worker.relayer)||/^0x0{40}$/i.test(worker.recorder)||/^0x0{40}$/i.test(worker.relayer))throw Error('Pilot worker binding mismatch');
  for(const value of [worker.tenant+'\0'+worker.project,worker.role,worker.unit,worker.journal,worker.recorder.toLowerCase(),worker.relayer.toLowerCase()]){if(seen.has(value))throw Error('Duplicate pilot worker binding');seen.add(value);}
 }
 return document.workers;
}
function loadPilotWorkers(file='/etc/aichain/pilot-workers.json'){
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>32768||process.platform!=='win32'&&(stat.uid!==0||(stat.mode&0o077)))throw Error('Protected pilot worker registry required');
 return validatePilotWorkers(JSON.parse(fs.readFileSync(file,'utf8')));
}
module.exports={validatePilotWorkers,loadPilotWorkers};
