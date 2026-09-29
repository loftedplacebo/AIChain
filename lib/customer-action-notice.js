const roleNames={owner:'Owner','workspace-admin':'Workspace administrator','governance-admin':'Governance administrator',reviewer:'Reviewer',reader:'Read-only'};
export function customerActionNotice(action,result){
 if(result.secretAvailable===false)return 'The invitation was already created. Its secret cannot be recovered; revoke it and create another if you did not save it.';
 if(action==='invitation-create')return 'Invitation created. Share the token securely with the intended person.';
 if(action==='member-change'&&roleNames[result.previousRole]&&(result.role===null||roleNames[result.role])){
  const change=roleNames[result.previousRole]+' → '+(result.role===null?'Removed from workspace':roleNames[result.role]);
  return result.status==='duplicate'?'This action was already saved. Original access change: '+change+'. Refresh shows current access.':'Access changed: '+change+'.';
 }
 return result.status==='duplicate'?'This action was already saved. Refresh shows the current settings.':'Change saved.';
}
