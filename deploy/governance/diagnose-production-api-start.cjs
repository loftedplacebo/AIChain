'use strict';
// One-time private startup diagnostic. It never prints environment values or
// exception messages, which may contain database or provider details.
const entry=require('/opt/aichain/orvessian-production-api/scripts/governance-production-api.cjs');

entry.start(process.env).then(async result=>{
  await new Promise(resolve=>result.server.listening?resolve():result.server.once('listening',resolve));
  await result.stop();
  console.log(JSON.stringify({productionApiStart:'passed'}));
}).catch(error=>{
  const frames=String(error?.stack||'').split('\n').slice(1,6).map(line=>line.trim());
  console.log(JSON.stringify({productionApiStart:'failed',name:String(error?.name||'Error').slice(0,40),code:String(error?.code||'').slice(0,20),frames}));
  process.exitCode=1;
});
