'use strict';
const defaults=Object.freeze({uploadTimeoutMs:30000,headersTimeoutMs:10000,idleTimeoutMs:60000,maxInFlight:128,maxConnections:256,maxHeaderSize:8192});
function limits(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!Object.hasOwn(defaults,k)))throw Error('Invalid HTTP limits');
 const result={...defaults,...options};
 for(const [key,value] of Object.entries(result))if(!Number.isSafeInteger(value)||value<1||value>defaults[key])throw Error('HTTP limits can only be reduced');
 return result;
}
function requestGuard(options={}){
 const config=limits(options);let inFlight=0;
 return {config,accept(req,res){
  const hasBody=Number(req.headers['content-length']||0)>0||!!req.headers['transfer-encoding'];
  // Denied/oversized/unfinished bodies must not occupy a reusable socket.
  const socket=req.socket;
  res.once('finish',()=>{if(hasBody&&!req.complete&&socket&&!socket.destroyed){socket.end();const close=setTimeout(()=>socket.destroy(),100);close.unref();socket.once('close',()=>clearTimeout(close));}});
  const reject=(status,message)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','connection':'close',...(status===503?{'retry-after':'1'}:{})});res.end(JSON.stringify({error:message}));};
  if(inFlight>=config.maxInFlight){reject(503,'Service busy; retry with the same operation identity');return false;}
  inFlight++;let released=false,timer;
  const clear=()=>clearTimeout(timer);
  const release=()=>{if(released)return;released=true;inFlight--;clear();req.removeListener('end',clear);req.removeListener('aborted',clear);res.removeListener('finish',clear);res.removeListener('close',clear);};
  res.once('finish',clear);res.once('close',clear);
  if(hasBody&&!req.complete){timer=setTimeout(()=>{if(!req.complete)reject(408,'Request body upload timed out');},config.uploadTimeoutMs);timer.unref();req.once('end',clear);req.once('aborted',clear);}
  return release;
 }};
}
module.exports={defaults,limits,requestGuard};
