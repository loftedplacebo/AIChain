async function workosRoutes({req,url,send,provider,parseStrictJson,sessionToken}){
 if(!url.pathname.startsWith('/v1/auth/'))return false;
 if(url.pathname==='/v1/auth/status'&&req.method==='GET'){send(200,{provider:provider?'workos':'configured',enabled:!!provider});return true;}
 if(!provider){send(503,{error:'Hosted sign-in is not configured'});return true;}
 if(req.method!=='POST'||!['/v1/auth/start','/v1/auth/callback'].includes(url.pathname)){send(405,{error:'Method not allowed'});return true;}
 if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']){send(415,{error:'Uncompressed JSON required'});return true;}
 let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>4096){send(413,{error:'Sign-in request exceeds 4 KiB'});return true;}chunks.push(chunk);}
 const input=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 const fields=url.pathname.endsWith('/start')?['browser','screen','reauthenticate']:['state','browser','code'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k))){send(400,{error:'Invalid sign-in request'});return true;}
 send(200,url.pathname.endsWith('/start')?await provider.start(input,sessionToken):await provider.callback(input));return true;
}
module.exports={workosRoutes};
