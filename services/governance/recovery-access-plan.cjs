'use strict';
const {createHash}=require('node:crypto');
const roles=new Set(['owner','workspace-admin','governance-admin','reviewer','reader']);
function exact(value,fields){if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).sort().join(',')!==[...fields].sort().join(','))throw Error('Recovery review fields are invalid');}
function reference(v){return typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(v);}
function digest(snapshot){return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');}
// Trusted offline operator input, never a customer API or an activation token.
function compile(snapshot,input){
 exact(input,['snapshotDigest','reviewReference','providerReviewReference','ownershipReviewReference','memberships']);
 if(input.snapshotDigest!==digest(snapshot))throw Error('Recovery access review is stale or targets another restore');
 for(const field of ['reviewReference','providerReviewReference','ownershipReviewReference'])if(!reference(input[field]))throw Error('Independent review references are required');
 if(!Array.isArray(input.memberships)||input.memberships.length===0||input.memberships.length>10000)throw Error('Explicit bounded reviewed memberships required');
 const identities=new Map(snapshot.identities.map(i=>[i.id,i])),workspaces=new Set(snapshot.workspaces.map(w=>w.id));
 const selected=[],seen=new Set(),owners=new Set(),users=new Set();
 for(const m of input.memberships){
  exact(m,['workspace','userId','role']);
  if(!workspaces.has(m.workspace)||!identities.has(m.userId)||!roles.has(m.role))throw Error('Unknown reviewed workspace, identity or role');
  const pair=JSON.stringify([m.workspace,m.userId]);if(seen.has(pair))throw Error('Duplicate reviewed membership');seen.add(pair);
  users.add(m.userId);if(m.role==='owner')owners.add(m.workspace);
  selected.push({workspace:m.workspace,userId:m.userId,role:m.role});
 }
 // A workspace can stay wholly suspended. Any reopened workspace needs an
 // explicitly selected owner; backed-up owner assignments supply no approval.
 if(selected.some(m=>!owners.has(m.workspace)))throw Error('Every selected workspace requires a reviewed owner');
 selected.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return {version:1,kind:'recovery-access-review',environment:snapshot.environment,database:snapshot.database,restoreId:snapshot.restoreId,snapshotDigest:input.snapshotDigest,reviewReference:input.reviewReference,providerReviewReference:input.providerReviewReference,ownershipReviewReference:input.ownershipReviewReference,memberships:selected,summary:{selectedIdentities:users.size,selectedWorkspaces:owners.size,suspendedWorkspaces:workspaces.size-owners.size,replacementMemberships:selected.length,discardedSnapshotMemberships:snapshot.memberships.filter(m=>!selected.some(s=>s.workspace===m.workspace&&s.userId===m.user_id&&s.role===m.role)).length},activation:'review-required',credentials:'remain-revoked',interpretation:'Review references are operator assertions, not proof of provider, ownership, evidence or network reconciliation'};
}
module.exports={compile,digest};
