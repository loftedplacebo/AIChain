#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{Pool}=require('pg');
const {parseStrictJson}=require('../services/governance/server.cjs');
const release=require('../services/governance/publisher-recovery-release.cjs');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const {recoveryFiles}=require('../services/governance/recovery.cjs');
function privateJson(file,max=8192){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Absolute private file required');const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>max||process.platform!=='win32'&&(stat.mode&0o077))throw Error('Bounded private regular file required');return parseStrictJson(fs.readFileSync(file,'utf8'));
}
function exact(value,required,optional=[]){if(!value||typeof value!=='object'||Array.isArray(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))throw Error('Exact operator configuration required');}
function poolFrom(file){const value=privateJson(file,12288);exact(value,['url'],['caFile']);if(value.caFile&&(!path.isAbsolute(value.caFile)||typeof value.caFile!=='string'))throw Error('Absolute certificate path required');return new Pool({...connectionOptions(value.url,{caFile:value.caFile}),max:5,statement_timeout:30000,lock_timeout:5000});}
async function runPublisherCommand(argv,{providerFactory=require('../services/governance/publisher-review-rpc.cjs').createPublisherReviewProvider}={}){
 const [operation,file,...extra]=argv;if(!['prepare','activate','revoke'].includes(operation)||!file||extra.length)throw Error('Usage: governance-publisher-recovery.cjs prepare|activate|revoke absolute-private-config.json');
 const config=privateJson(file);if(!['dev','test'].includes(config.environment))throw Error('Hosted publisher release is not enabled');
 const common=['environment','connectionFile'],review=['runtimeConnectionFile','rpcFile','journal','restoreId','expected','policy','codeHash'];
 exact(config,operation==='revoke'?[...common,'restoreId','releaseId','tenant','project','reviewReference']:[...common,...review,operation==='prepare'?'outputRoot':'reviewFile'],operation==='revoke'?[]:['maxJobs','maxRecords','minimumConfirmations']);
 let pool,runtimePool,provider;
 try{
  pool=poolFrom(config.connectionFile);
  if(operation==='revoke'){const {connectionFile,...input}=config;return {operation,...await release.revokePublisherRelease(pool,input)};}
  if(typeof config.journal!=='string'||!path.isAbsolute(config.journal)||operation==='prepare'&&(typeof config.outputRoot!=='string'||!path.isAbsolute(config.outputRoot)))throw Error('Absolute journal/output paths required');
  runtimePool=poolFrom(config.runtimeConnectionFile);const rpc=privateJson(config.rpcFile,12288);exact(rpc,['url']);
  // Validate transport even when tests supply an in-process synthetic provider.
  require('../services/governance/publisher-review-rpc.cjs').boundedRpcTransport(rpc.url);provider=providerFactory(rpc.url);
  const options={environment:config.environment,restoreId:config.restoreId,file:config.journal,expected:config.expected,policy:config.policy,codeHash:config.codeHash,runtimePool,provider};for(const k of ['maxJobs','maxRecords','minimumConfirmations'])if(Object.hasOwn(config,k))options[k]=config[k];
  if(operation==='activate'){const input=privateJson(config.reviewFile,16384);return {operation,...await release.activatePublisherRelease(pool,options,input)};}
  const plan=await release.preparePublisherRelease(pool,options),destination=recoveryFiles.freshDirectory(config.outputRoot,'publisher-review-');let complete=false;
  try{const planFile=path.join(destination.directory,'plan.json');fs.writeFileSync(planFile,JSON.stringify(plan,null,2),{flag:'wx',mode:0o600});recoveryFiles.durable(planFile);complete=true;return {operation,environment:plan.environment,restoreId:plan.restoreId,releaseId:plan.binding.releaseId,planFile,activation:'review-required'};}finally{if(!complete)recoveryFiles.clean(destination);}
 }finally{try{provider?.destroy?.();}finally{await Promise.allSettled([pool?.end(),runtimePool?.end()]);}}
}
if(require.main===module)runPublisherCommand(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
 console.error(JSON.stringify({status:'failed',manualReconciliationRequired:/owner lock retained for manual reconciliation/.test(error?.message||''),message:'Publisher recovery failed. Inspect private configuration and both stores; never reclaim owner locks by age. No credentials or raw RPC errors are logged.'}));process.exitCode=1;
});
module.exports={runPublisherCommand};
