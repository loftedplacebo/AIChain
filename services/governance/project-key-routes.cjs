async function projectKeyRoutes({req,url,send,principal,user,keys,parseStrictJson,reauthorize}){
 if(url.pathname!=='/v1/keys'&&!url.pathname.startsWith('/v1/keys/'))return false;
 if(!user||!principal.scopes.includes('manage-keys')){send(403,{error:'Workspace administrator permission required'});return true;}
 try{
  if(req.method==='GET'&&url.pathname==='/v1/keys'){
   for(const name of ['state','limit','offset'])if(url.searchParams.getAll(name).length>1)throw Object.assign(Error('Duplicate key list filters'),{status:400});
   const options={state:url.searchParams.get('state')??'all',limit:Number(url.searchParams.get('limit')??50),offset:Number(url.searchParams.get('offset')??0)};
   send(200,await keys.listPage(principal,options));return true;
  }
  if(req.method!=='POST'){send(405,{error:'Method not allowed'});return true;}
  if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']){send(415,{error:'Uncompressed JSON required'});return true;}
  const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>4096){send(413,{error:'Key request exceeds 4 KiB'});return true;}chunks.push(chunk);}
  const input=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  // Body upload is asynchronous: an administrator may lose access, sign out or
  // exceed the recent-sign-in window before the operation reaches storage.
  if(reauthorize)await reauthorize();
  if(url.pathname==='/v1/keys'){const result=await keys.create(principal,input);send(result.status==='created'?201:200,result);return true;}
  const parts=url.pathname.split('/');
  if(parts.length!==5||!['rotate','revoke'].includes(parts[4])){send(404,{error:'Key operation not found'});return true;}
  const id=decodeURIComponent(parts[3]);
  if(parts[4]==='revoke'){
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='actionId')){send(400,{error:'Invalid revoke operation'});return true;}
   send(200,await keys.revoke(principal,id,input));return true;
  }
  const result=await keys.create(principal,input,{rotateId:id});send(result.status==='created'?201:200,result);return true;
 }catch(error){const status=error.status||((error instanceof SyntaxError||error instanceof TypeError)?400:500);send(status,{error:status===500?'Key management unavailable':status===400?'Invalid key operation':error.message,...(status===403&&error.code==='reauthentication-required'?{code:error.code}:{})});return true;}
}
module.exports={projectKeyRoutes};
