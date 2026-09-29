'use strict';
const fs=require('node:fs');
const {validatePlan}=require('../services/governance/deployment-plan.cjs');
if(process.argv.length!==3){console.error('Usage: node scripts/governance-deployment-plan.cjs <non-secret-plan.json>');process.exitCode=2;}
else try{
 const file=fs.openSync(process.argv[2],'r');let plan;
 try{if(fs.fstatSync(file).size>65536)throw Error();plan=JSON.parse(fs.readFileSync(file,'utf8'));}finally{fs.closeSync(file);}
 const result=validatePlan(plan);console.log(JSON.stringify({...result,scope:'Declared topology only; no credential, provider, database, backup or release verification'},null,2));if(!result.valid)process.exitCode=2;
}catch{console.error('Deployment plan could not be validated; input contents are not printed');process.exitCode=2;}
