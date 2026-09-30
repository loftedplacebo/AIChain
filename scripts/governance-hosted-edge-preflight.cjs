'use strict';
const fs=require('node:fs');
const {resolve}=require('node:path');
const {checkEdge}=require('../services/governance/hosted-edge-preflight.cjs');

async function main(){
 if(process.argv.length!==3)throw Error('Usage: node scripts/governance-hosted-edge-preflight.cjs <non-secret-deployment-plan.json>');
 const file=resolve(process.argv[2]),stat=fs.statSync(file);
 if(!stat.isFile()||stat.size>65536)throw Error('Deployment plan must be a regular file no larger than 64 KiB');
 const plan=JSON.parse(fs.readFileSync(file,'utf8'));
 console.log(JSON.stringify(await checkEdge(plan),null,2));
}
main().catch(error=>{console.error(`Hosted edge preflight failed: ${error.message}`);process.exitCode=1;});
