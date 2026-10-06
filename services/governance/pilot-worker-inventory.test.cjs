'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {projectWorkerRole}=require('./journal-roles.cjs');
const {validatePilotWorkers}=require('./pilot-worker-inventory.cjs');
const tenant='org-831aa048-b268-4fce-98f3-455429034ef8';
const projects=['prj-d9109260-1232-4561-ab4a-ab2e5c8f658f','prj-a9109260-1232-4561-ab4a-ab2e5c8f658f'];
function worker(project,recorder,relayer){const role=projectWorkerRole(tenant,project),instance=role.slice(7);return {tenant,project,role,unit:`aichain-governance-project-worker@${instance}.service`,journal:`/var/lib/aichain-governance-workers/${instance}/worker.sqlite`,state:'paused',recorder,relayer};}
test('project inventory binds independent project, unit, journal and wallets',()=>{
 const workers=[worker(projects[0],'0x'+'1'.repeat(40),'0x'+'2'.repeat(40)),worker(projects[1],'0x'+'3'.repeat(40),'0x'+'4'.repeat(40))];
 assert.deepEqual(validatePilotWorkers({version:1,environment:'test',workers}),workers);
 assert.notEqual(workers[0].role,workers[1].role);
 assert.throws(()=>validatePilotWorkers({version:1,environment:'test',workers:[workers[0],{...workers[1],journal:workers[0].journal}]}),/binding/);
 assert.throws(()=>validatePilotWorkers({version:1,environment:'test',workers:[workers[0],{...workers[1],relayer:workers[0].relayer}]}),/Duplicate/);
 assert.throws(()=>validatePilotWorkers({version:1,environment:'test',workers:[{...workers[0],role:'worker_../../escape'}]}),/binding/);
});
