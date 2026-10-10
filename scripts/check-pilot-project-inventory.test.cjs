'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareProjects}=require('./check-pilot-project-inventory.cjs');
test('project inventory detects newly created projects and orphan worker entries',()=>{
 const projects=[{tenant:'org-a',project:'prj-a'},{tenant:'org-b',project:'prj-b'}];
 const workers=[{tenant:'org-a',project:'prj-a',role:'worker_a'}];
 assert.deepEqual(compareProjects(projects,workers).missingProjects,[projects[1]]);
 assert.equal(compareProjects(projects,workers).healthy,false);
 const covered=compareProjects(projects,[...workers,{tenant:'org-b',project:'prj-b',role:'worker_b'}]);
 assert.equal(covered.healthy,true);
 assert.deepEqual(compareProjects(projects,[...workers,{tenant:'org-c',project:'prj-c',role:'worker_c'}]).staleWorkers,['worker_c']);
});

test('four internal and ten partner projects require complete worker coverage',()=>{
 const projects=Array.from({length:14},(_,index)=>({tenant:'org-'+index,project:'prj-'+index}));
 const workers=projects.map(({tenant,project},index)=>({tenant,project,role:'worker_'+index}));
 assert.equal(compareProjects(projects,workers).healthy,true);
 assert.equal(compareProjects(projects,workers.slice(0,-1)).healthy,false);
 assert.deepEqual(compareProjects(projects,workers.slice(0,-1)).missingProjects,[projects[13]]);
});
