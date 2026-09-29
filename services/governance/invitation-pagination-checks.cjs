'use strict';
const assert=require('node:assert/strict');
async function checkInvitations(directory){
 const previous=directory.now,start=Date.now();let now=start;directory.now=()=>now;
 const run=fn=>Promise.resolve().then(fn);
 try{
  const user=await directory.verifiedIdentity({provider:'pagination-fixture',subject:'owner',email:'owner-pagination@example.test',emailVerified:true}),other=await directory.verifiedIdentity({provider:'pagination-fixture',subject:'other',email:'other-pagination@example.test',emailVerified:true});
  const {workspaceId}=await directory.createWorkspace(user.id,{actionId:'pagination-workspace',name:'Invitation pages',projectName:'Synthetic'});
  now=start-8*86400000;const expired=await directory.invite(user.id,workspaceId,{actionId:'expired',email:'expired@example.test',role:'reader'});
  now=start;const pending=await directory.invite(user.id,workspaceId,{actionId:'pending',email:'pending@example.test',role:'reader'});
  for(let i=0;i<104;i++){now=start+i+1;const invitation=await directory.invite(user.id,workspaceId,{actionId:'create-'+i,email:'revoked-'+i+'@example.test',role:'reader'});await directory.revokeInvitation(user.id,workspaceId,{actionId:'revoke-'+i,invitationId:invitation.invitationId});}
  const live=await directory.invitationsPage(user.id,workspaceId,{state:'pending'});assert.equal(live.total,1);assert.equal(live.invitations[0].id,pending.invitationId);
  const old=await directory.invitationsPage(user.id,workspaceId,{state:'expired'});assert.equal(old.total,1);assert.equal(old.invitations[0].id,expired.invitationId);
  assert.equal((await directory.invitationsPage(user.id,workspaceId,{state:'revoked'})).total,104);assert.equal((await directory.invitationsPage(user.id,workspaceId,{state:'accepted'})).total,0);
  const ids=[];for(let offset=0;offset<106;offset+=30){const page=await directory.invitationsPage(user.id,workspaceId,{state:'all',limit:30,offset});assert.equal(page.total,106);assert.equal(page.nextOffset,offset+page.invitations.length<106?offset+page.invitations.length:null);ids.push(...page.invitations.map(i=>i.id));for(const row of page.invitations)assert.deepEqual(Object.keys(row).sort(),['acceptedBy','email','expiresAt','id','revokedAt','role'].sort());}
  assert.equal(ids.length,106);assert.equal(new Set(ids).size,106);assert.equal(ids.at(-1),expired.invitationId);
  const empty=await directory.invitationsPage(user.id,workspaceId,{offset:1000});assert.equal(empty.invitations.length,0);assert.equal(empty.nextOffset,null);
  await assert.rejects(run(()=>directory.invitationsPage(other.id,workspaceId,{})),e=>e.status===404);
  const recipient=await directory.verifiedIdentity({provider:'pagination-fixture',subject:'accepted',email:'accepted-pagination@example.test',emailVerified:true}),offer=await directory.invite(user.id,workspaceId,{actionId:'accepted-offer',email:recipient.email,role:'reader'});await directory.acceptInvitation(recipient.id,{actionId:'accept-offer',secret:offer.secret});const accepted=await directory.invitationsPage(user.id,workspaceId,{state:'accepted'});assert.equal(accepted.total,1);assert.equal(accepted.invitations[0].id,offer.invitationId);assert.equal((await directory.invitationsPage(user.id,workspaceId,{state:'pending'})).total,1);
  for(const filters of [{limit:0},{limit:101},{offset:-1},{offset:Number.MAX_SAFE_INTEGER},{state:'unknown'}])await assert.rejects(run(()=>directory.invitationsPage(user.id,workspaceId,filters)),e=>e.status===400);
 }finally{directory.now=previous;}
}
module.exports={checkInvitations};
