'use strict';
// Offline, non-secret SQL for the reused cluster after pilot retirement.
const fs=require('node:fs');
const path=require('node:path');

const prod={database:'governance_prod',api:'governance_prod_api',worker:'governance_prod_worker',migration:'governance_prod_migrations'};

function renderGrants(filename,from,to){
 const lines=fs.readFileSync(path.join(__dirname,filename),'utf8').split(/\r?\n/);
 const grants=lines.filter(line=>line.startsWith('GRANT '));
 if(!grants.length||grants.some(line=>!line.endsWith(` TO ${from};`)))throw Error(filename+': unexpected grant template');
 return `-- Reviewed production copy of ${filename}; apply after prod migrations.\n`+
  `DO $database$ BEGIN IF current_database()<>'${prod.database}' THEN RAISE EXCEPTION 'Production database required'; END IF; END $database$;\n`+
  grants.map(line=>line.slice(0,-from.length-1)+to+';').join('\n')+'\n';
}

function render(){
 const noPilot=`IF EXISTS (SELECT 1 FROM pg_database WHERE datname='governance_test' OR datname LIKE 'gov_restore_%')
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('governance_api','governance_evidence_worker','governance_migrations')) THEN
    RAISE EXCEPTION 'Retained pilot database or role blocks exclusive production bootstrap';
  END IF;`;
 const create=`-- Apply as doadmin on defaultdb only after the retirement preflight passes and all six retained databases are retired.\n`+
  `DO $exclusive$ BEGIN
  IF current_database()<>'defaultdb' OR current_user<>'doadmin' THEN
    RAISE EXCEPTION 'Managed cluster defaultdb administrator required';
  END IF;
  ${noPilot}
  IF EXISTS (SELECT 1 FROM pg_database WHERE datname='${prod.database}')
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('${prod.api}','${prod.worker}','${prod.migration}')) THEN
    RAISE EXCEPTION 'Production database or role already exists';
  END IF;
END $exclusive$;\n`+
  `CREATE ROLE ${prod.api} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;\n`+
  `CREATE ROLE ${prod.worker} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;\n`+
  `CREATE ROLE ${prod.migration} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;\n`+
  `CREATE DATABASE ${prod.database} OWNER doadmin TEMPLATE template0;\n`;
 const bootstrap=`-- Apply as doadmin while connected to ${prod.database}, after pilot retirement.\n`+
  'BEGIN;\n'+
  `DO $exclusive$ BEGIN
  IF current_database()<>'${prod.database}' OR current_user<>'doadmin' THEN
    RAISE EXCEPTION 'Dedicated production database and administrator required';
  END IF;
  ${noPilot}
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('${prod.api}','${prod.worker}','${prod.migration}')
             AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole))
     OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('${prod.api}','${prod.worker}','${prod.migration}'))<>3
     OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='${prod.database}')<>'doadmin' THEN
    RAISE EXCEPTION 'Unreviewed production role or database owner';
  END IF;
END $exclusive$;\n`+
  `REVOKE ALL ON DATABASE ${prod.database} FROM PUBLIC;\n`+
  `REVOKE ALL ON DATABASE ${prod.database} FROM ${prod.api}, ${prod.worker}, ${prod.migration};\n`+
  `GRANT CONNECT ON DATABASE ${prod.database} TO ${prod.api}, ${prod.worker}, ${prod.migration};\n`+
  'REVOKE ALL ON SCHEMA public FROM PUBLIC;\n'+
  `REVOKE ALL ON SCHEMA public FROM ${prod.api}, ${prod.worker}, ${prod.migration};\n`+
  `GRANT USAGE, CREATE ON SCHEMA public TO ${prod.migration};\n`+
  `GRANT USAGE ON SCHEMA public TO ${prod.api}, ${prod.worker};\n`+
  'COMMIT;\n';
 const verify=`-- Preparation gate before migrations and role login are enabled.\n`+
  `DO $verify$ BEGIN
  IF current_database()<>'${prod.database}' OR current_user<>'doadmin' THEN
    RAISE EXCEPTION 'Production administrator binding mismatch';
  END IF;
  ${noPilot}
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('${prod.api}','${prod.worker}','${prod.migration}')
             AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole))
     OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('${prod.api}','${prod.worker}','${prod.migration}'))<>3 THEN
    RAISE EXCEPTION 'Production roles must exist as restricted NOLOGIN roles';
  END IF;
  IF NOT has_database_privilege('${prod.api}','${prod.database}','CONNECT')
     OR NOT has_database_privilege('${prod.worker}','${prod.database}','CONNECT')
     OR NOT has_database_privilege('${prod.migration}','${prod.database}','CONNECT')
     OR has_database_privilege('${prod.api}','${prod.database}','CREATE')
     OR has_database_privilege('${prod.worker}','${prod.database}','CREATE')
     OR has_schema_privilege('${prod.api}','public','CREATE')
     OR has_schema_privilege('${prod.worker}','public','CREATE')
     OR NOT has_schema_privilege('${prod.migration}','public','CREATE') THEN
    RAISE EXCEPTION 'Production database or schema grants do not match reviewed profile';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_database d,
             LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) acl
             WHERE d.datname='${prod.database}' AND acl.grantee=0) THEN
    RAISE EXCEPTION 'Production database still grants privileges to PUBLIC';
  END IF;
END $verify$;\n`;
 return {
  '00-create-empty.sql':create,
  '01-bootstrap.sql':bootstrap,
  '02-api-grants.sql':renderGrants('postgres-api-grants.sql','governance_api',prod.api),
  '03-worker-grants.sql':renderGrants('postgres-evidence-worker-grants.sql','governance_evidence_worker',prod.worker),
  '04-verify-exclusive.sql':verify,
 };
}

module.exports={render};
