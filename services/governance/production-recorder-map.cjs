'use strict';

const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const TENANT=new RegExp('^org-'+UUID+'$');
const PROJECT=new RegExp('^prj-'+UUID+'$');
const ADDRESS=/^0x[a-fA-F0-9]{40}$/;
const key=(tenant,project)=>tenant+'\0'+project;

function productionRecorderMap(raw='[]'){
 const rows=JSON.parse(raw);
 if(!Array.isArray(rows)||rows.length>10)throw Error('Bounded Production recorder map required');
 const byProject=new Map(),addresses=new Set();
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||
    Object.keys(row).sort().join(',')!=='project,recorder,tenant'||
    !TENANT.test(row.tenant)||!PROJECT.test(row.project)||
    !ADDRESS.test(row.recorder)||/^0x0{40}$/i.test(row.recorder))
   throw Error('Exact Production recorder binding required');
  const scope=key(row.tenant,row.project),address=row.recorder.toLowerCase();
  if(byProject.has(scope)||addresses.has(address))throw Error('Duplicate Production recorder binding');
  byProject.set(scope,address);addresses.add(address);
 }
 return byProject;
}

function recorderForProject(bindings,tenant,project){
 if(!(bindings instanceof Map)||!TENANT.test(tenant)||!PROJECT.test(project))
  return null;
 return bindings.get(key(tenant,project))||null;
}

module.exports={productionRecorderMap,recorderForProject};
