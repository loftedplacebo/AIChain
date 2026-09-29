'use strict';
const assert=require('node:assert/strict');
async function checkMembershipAudit(directory){
 const identity=subject=>directory.verifiedIdentity({provider:'audit-fixture',subject,email:subject+'-audit@example.test',emailVerified:true});
 const owner=await identity('owner'),member=await identity('member'),foreign=await identity('foreign');
 const {workspaceId}=await directory.createWorkspace(owner.id,{actionId:'audit-workspace',name:'Audit fixture',projectName:'Synthetic'});
 const offer=await directory.invite(owner.id,workspaceId,{actionId:'audit-invite',email:member.email,role:'reader'}),accept={actionId:'audit-accept',secret:offer.secret};
 const accepted=await directory.acceptInvitation(member.id,accept);assert.equal(accepted.invitationId,offer.invitationId);assert.equal(accepted.role,'reader');assert.equal(JSON.stringify(accepted).includes(offer.secret),false);
 const first={actionId:'audit-promote',userId:member.id,role:'reviewer'};const changed=await directory.changeMember(owner.id,workspaceId,first);assert.equal(changed.previousRole,'reader');assert.equal(changed.role,'reviewer');
 const reversed=await directory.changeMember(owner.id,workspaceId,{actionId:'audit-demote',userId:member.id,role:'reader'});assert.equal(reversed.previousRole,'reviewer');
 const replay=await directory.changeMember(owner.id,workspaceId,first);assert.equal(replay.status,'duplicate');assert.equal(replay.previousRole,'reader');assert.equal(replay.role,'reviewer');assert.equal((await directory.member(member.id,workspaceId)).role,'reader');
 const acceptedReplay=await directory.acceptInvitation(member.id,accept);assert.equal(acceptedReplay.invitationId,offer.invitationId);assert.equal(acceptedReplay.role,'reader');
 const removed=await directory.changeMember(owner.id,workspaceId,{actionId:'audit-remove',userId:member.id,role:null});assert.equal(removed.previousRole,'reader');assert.equal(removed.role,null);
 await assert.rejects(Promise.resolve().then(()=>directory.changeMember(foreign.id,workspaceId,first)),error=>error.status===404);assert.equal((await directory.member(owner.id,workspaceId)).role,'owner');
}
module.exports={checkMembershipAudit};
