async function customerRoutes({req,url,send,user,directory,parseStrictJson,reauthorize,authorizeTransaction}){
 if(url.pathname!=='/v1/invitations/accept'&&url.pathname!=='/v1/workspaces'&&!url.pathname.startsWith('/v1/workspaces/'))return false;
 if(!user?.customer){send(403,{error:'Verified customer sign-in required'});return true;}
 try{
  const parts=url.pathname.split('/'),workspace=parts.length>=4?decodeURIComponent(parts[3]):null;
  const options={authorizeSession:authorizeTransaction?(c,actor)=>authorizeTransaction(c,actor,{write:req.method!=='GET'}):null};
  if(req.method==='GET'&&parts.length===5&&parts[4]==='members'){send(200,{members:await directory.members(user.id,workspace,options)});return true;}
  if(req.method==='GET'&&parts.length===5&&parts[4]==='invitations'){
   for(const key of ['state','limit','offset'])if(url.searchParams.getAll(key).length>1)throw Object.assign(Error('Duplicate invitation list filters'),{status:400});
   const filters={};for(const key of ['state','limit','offset'])if(url.searchParams.has(key))filters[key]=key==='state'?url.searchParams.get(key):Number(url.searchParams.get(key));
   send(200,await directory.invitationsPage(user.id,workspace,filters,options));return true;
  }
  if(req.method!=='POST'){send(405,{error:'Method not allowed'});return true;}
  if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']){send(415,{error:'Uncompressed JSON required'});return true;}
  let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>4096){send(413,{error:'Customer request exceeds 4 KiB'});return true;}chunks.push(chunk);}
  const input=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  if(reauthorize)await reauthorize();
  let result;
  if(url.pathname==='/v1/invitations/accept')result=await directory.acceptInvitation(user.id,input,options);
  else if(parts.length===3)result=await directory.createWorkspace(user.id,input,options);
  else if(parts.length===5&&parts[4]==='projects')result=await directory.createProject(user.id,workspace,input,options);
  else if(parts.length===5&&parts[4]==='members')result=await directory.changeMember(user.id,workspace,input,options);
  else if(parts.length===5&&parts[4]==='invitations')result=await directory.invite(user.id,workspace,input,options);
  else if(parts.length===6&&parts[4]==='invitations'&&parts[5]==='revoke')result=await directory.revokeInvitation(user.id,workspace,input,options);
  else{send(404,{error:'Customer operation not found'});return true;}
  send(result.status==='created'?201:200,result);return true;
 }catch(e){const status=e.status||(e instanceof TypeError||e instanceof SyntaxError?400:500);send(status,{error:status===500?'Customer administration unavailable':status===400?'Invalid customer operation':e.message,...(status===403&&e.code==='reauthentication-required'?{code:e.code}:{})});return true;}
}
module.exports={customerRoutes};
