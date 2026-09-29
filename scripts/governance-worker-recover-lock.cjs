// systemd invokes this only after the previous service process has exited.
const fs=require('node:fs');const journal=process.env.GOVERNANCE_WORKER_JOURNAL;
if(!journal)throw Error('Journal path required');const lock=journal+'.lock';
if(fs.existsSync(lock)){
 const info=JSON.parse(fs.readFileSync(lock,'utf8'));if(!Number.isSafeInteger(info.pid)||info.pid<1)throw Error('Invalid lock owner; inspect manually');
 let alive=true;try{process.kill(info.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
 if(alive)throw Error('Lock owner is still alive; refusing recovery');
 fs.unlinkSync(lock);console.log('Recovered journal lock after verifying owner exited');
}
