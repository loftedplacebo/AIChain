// Isolated child process used only by the synthetic capacity harness.
const {GovernanceStore}=require('../services/governance/store');
const {createServer}=require('../services/governance/server.cjs');
const store=new GovernanceStore(process.env.SUBMISSION_DB);
const p={tenant:'capacity-test',project:'synthetic',token:process.env.SUBMISSION_TOKEN,scopes:['read','write']};
const original=store.ingest.bind(store), seen=new Set();
store.ingest=(event,principal)=>{
 const n=Number(event.eventId.split('-').at(-1));
 if(process.env.SUBMISSION_FAULTS==='1'&&!seen.has(event.eventId)){
  seen.add(event.eventId);
  if(n%13===0){original(event,principal);throw Object.assign(Error('Synthetic acknowledgement failure'),{status:503});}
  if(n%11===0)throw Object.assign(Error('Synthetic throttling'),{status:429});
  if(n%7===0)throw Object.assign(Error('Synthetic outage'),{status:503});
 }
 return original(event,principal);
};
const server=createServer(store,[p]);
server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
process.on('message',m=>{if(m==='stop')server.close(()=>{store.close();process.exit(0);});});
process.on('disconnect',()=>process.exit(1));
