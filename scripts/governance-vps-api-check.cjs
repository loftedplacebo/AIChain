const fs=require('node:fs'),assert=require('node:assert/strict');
async function main(){
 const dir='/var/lib/aichain-governance-worker',access=JSON.parse(fs.readFileSync(dir+'/workspace-access.json','utf8'));
 fs.writeFileSync(dir+'/workspace-login-export.json',JSON.stringify({notice:'VPS synthetic accounts only',accounts:access.accounts},null,2),{mode:0o600});
 const results=[];
 for(const a of access.accounts){
  const auth=await(await fetch('http://127.0.0.1:8795/v1/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:a.email,password:a.password})})).json();assert.ok(auth.token);
  const headers={'x-workspace-session':auth.token,'x-workspace-id':a.id};
  const report=await fetch('http://127.0.0.1:8795/v1/report',{headers});assert.equal(report.status,200);
  const evidence=await fetch('http://127.0.0.1:8795/v1/evidence/vps-worker-acceptance-001',{headers});assert.equal(evidence.status,a.id==='northstar'?200:404);
  if(a.id==='northstar')assert.equal((await evidence.json()).verification.state,'confirmed');
  results.push({workspace:a.id,login:true,report:true,scopeIsolation:true});
 }
 console.log(JSON.stringify(results));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
