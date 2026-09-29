'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{compile,digest}=require('./recovery-access-plan.cjs');
const snapshot={version:1,environment:'test',database:{name:'gov_restore_synthetic',oid:42},restoreId:'synthetic',invalidatedAt:'100',identities:[{id:'a',provider:'synthetic',subject:'a',email:'a@example.test',disabled:true,version:2},{id:'b',provider:'synthetic',subject:'b',email:'b@example.test',disabled:true,version:2}],workspaces:[{id:'w'},{id:'suspended'}],memberships:[{workspace:'w',user_id:'a',role:'owner'},{workspace:'w',user_id:'b',role:'workspace-admin'}]};
const input=()=>({snapshotDigest:digest(snapshot),reviewReference:'review-1',providerReviewReference:'provider-review-1',ownershipReviewReference:'owner-review-1',memberships:[{workspace:'w',userId:'a',role:'owner'}]});
test('selective review excludes unselected access and holds activation/credentials',()=>{
 const before=JSON.stringify(snapshot),plan=compile(snapshot,input());assert.equal(plan.summary.selectedIdentities,1);assert.equal(plan.summary.suspendedWorkspaces,1);assert.equal(plan.summary.discardedSnapshotMemberships,1);assert.equal(plan.activation,'review-required');assert.equal(plan.credentials,'remain-revoked');assert.equal(JSON.stringify(snapshot),before);assert.ok(!JSON.stringify(plan).includes('@example.test'));
});
test('review rejects foreign/stale state, role escalation input mistakes and implicit owners',()=>{
 for(const mutate of [i=>i.snapshotDigest='0'.repeat(64),i=>i.memberships[0].workspace='foreign',i=>i.memberships[0].userId='foreign',i=>i.memberships[0].role='superuser',i=>i.memberships[0].role='reader',i=>i.memberships.push({...i.memberships[0]}),i=>i.memberships=[],i=>i.providerReviewReference='',i=>i.activate=true,i=>i.memberships[0].secret='bad']){const i=input();mutate(i);assert.throws(()=>compile(snapshot,i));}
 for(const changed of [{...snapshot,restoreId:'other'},{...snapshot,database:{...snapshot.database,oid:43}},{...snapshot,identities:snapshot.identities.map(i=>({...i,version:3}))},{...snapshot,memberships:[]}])assert.throws(()=>compile(changed,input()),/stale/);
});
test('reviewed replacement can explicitly change ownership without inheriting snapshot roles',()=>{
 const i=input();i.memberships=[{workspace:'w',userId:'b',role:'owner'},{workspace:'w',userId:'a',role:'reader'}];const plan=compile(snapshot,i);assert.equal(plan.summary.discardedSnapshotMemberships,2);assert.deepEqual(plan.memberships.map(m=>m.role).sort(),['owner','reader']);
});
