'use strict';
// Only an exact known prefix is eligible. Missing middle migrations, modified
// checksums and caller-supplied SQL are never interpreted as recovery upgrades.
function plan(expected,applied,approved=[]){
 if(!Array.isArray(applied)||!Array.isArray(approved))throw Error('Explicit restored migration history and approvals required');
 const rows=[...applied].sort((a,b)=>a.name.localeCompare(b.name));
 if(rows.length<9||rows.length>expected.length||rows.some((row,i)=>row.name!==expected[i].name||row.checksum!==expected[i].checksum))throw Error('Restore requires a known contiguous migration prefix including recovery gates');
 const pending=expected.slice(rows.length);
 if(approved.length!==pending.length||approved.some((a,i)=>!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).sort().join(',')!=='checksum,name'||a.name!==pending[i].name||a.checksum!==pending[i].checksum))throw Error('Exact reviewed restore migration names and checksums required');
 return pending;
}
module.exports={plan};
