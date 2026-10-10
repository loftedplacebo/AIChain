'use strict';
// Offline, non-secret SQL preparation. Review output before any provider change.
const fs=require('node:fs');
const path=require('node:path');

const prod={database:'governance_prod',api:'governance_prod_api',worker:'governance_prod_worker',migration:'governance_prod_migrations'};
const pilot={database:'governance_test',api:'governance_api',worker:'governance_evidence_worker',migration:'governance_migrations'};

function renderGrants(filename,from,to){
 const source=fs.readFileSync(path.join(__dirname,filename),'utf8');
 const lines=source.split(/\r?\n/);
 const grants=lines.filter(line=>line.startsWith('GRANT '));
 if(!grants.length||grants.some(line=>!line.endsWith(` TO ${from};`)))throw Error(filename+': unexpected grant template');
 return `-- Reviewed production copy of ${filename}; apply only to ${prod.database}.\n`+
  grants.map(line=>line.slice(0,-from.length-1)+to+';').join('\n')+'\n';
}

function render(){
 const bootstrap=`-- Review and apply as the cluster administrator while connected to ${prod.database}.\n`+
  '-- Create the database and three named production roles separately; do not put passwords in SQL.\n'+
  'BEGIN;\n'+
  `REVOKE ALL ON DATABASE ${prod.database} FROM PUBLIC;\n`+
  `REVOKE ALL ON DATABASE ${prod.database} FROM ${pilot.api}, ${pilot.worker}, ${pilot.migration}, ${prod.api}, ${prod.worker}, ${prod.migration};\n`+
  `REVOKE ALL ON DATABASE ${pilot.database} FROM ${prod.api}, ${prod.worker}, ${prod.migration};\n`+
  `GRANT CONNECT ON DATABASE ${prod.database} TO ${prod.api}, ${prod.worker}, ${prod.migration};\n`+
  'REVOKE ALL ON SCHEMA public FROM PUBLIC;\n'+
  `REVOKE ALL ON SCHEMA public FROM ${pilot.api}, ${pilot.worker}, ${pilot.migration}, ${prod.api}, ${prod.worker}, ${prod.migration};\n`+
  `GRANT USAGE, CREATE ON SCHEMA public TO ${prod.migration};\n`+
  `GRANT USAGE ON SCHEMA public TO ${prod.migration} WITH GRANT OPTION;\n`+
  `GRANT USAGE ON SCHEMA public TO ${prod.api}, ${prod.worker};\n`+
  'COMMIT;\n';
 const verify=`-- Run with psql ON_ERROR_STOP=1 after grants, while connected to ${prod.database}.\n`+
  '-- This fails if runtime identities can CONNECT to the opposite database.\n'+
  'DO $isolation$\nBEGIN\n'+
  `  IF has_database_privilege('${pilot.api}', '${prod.database}', 'CONNECT')\n`+
  `    OR has_database_privilege('${pilot.worker}', '${prod.database}', 'CONNECT')\n`+
  `    OR has_database_privilege('${pilot.migration}', '${prod.database}', 'CONNECT')\n`+
  `    OR has_database_privilege('${prod.api}', '${pilot.database}', 'CONNECT')\n`+
  `    OR has_database_privilege('${prod.worker}', '${pilot.database}', 'CONNECT')\n`+
  `    OR has_database_privilege('${prod.migration}', '${pilot.database}', 'CONNECT') THEN\n`+
  "    RAISE EXCEPTION 'Pilot and production database roles are not isolated';\n"+
  '  END IF;\nEND\n$isolation$;\n';
 return {
  '01-bootstrap.sql':bootstrap,
  '02-api-grants.sql':renderGrants('postgres-api-grants.sql',pilot.api,prod.api),
  '03-worker-grants.sql':renderGrants('postgres-evidence-worker-grants.sql',pilot.worker,prod.worker),
  '04-verify-isolation.sql':verify
 };
}

module.exports={render};
