'use strict';
const metadata=['governance_migrations','governance_environment','governance_recovery_gate'];
const api=Object.fromEntries(metadata.map(table=>[table,['SELECT']]));
Object.assign(api,{
 governance_events:['SELECT','INSERT'],governance_outbox:['SELECT','INSERT'],governance_usage:['SELECT','INSERT','UPDATE'],governance_evidence:['SELECT'],governance_agents:['SELECT','INSERT','UPDATE'],governance_project_request_limits:['SELECT','INSERT','UPDATE'],governance_customer_request_limits:['SELECT','INSERT','UPDATE'],governance_auth_start_limits:['SELECT','INSERT','UPDATE'],
 governance_key_scopes:['SELECT','INSERT','UPDATE'],governance_project_keys:['SELECT','INSERT','UPDATE'],governance_key_actions:['SELECT','INSERT'],
 governance_customer_identities:['SELECT','INSERT','UPDATE'],governance_customer_workspaces:['SELECT','INSERT','UPDATE'],governance_customer_projects:['SELECT','INSERT'],governance_customer_memberships:['SELECT','INSERT','UPDATE','DELETE'],governance_customer_actions:['SELECT','INSERT'],governance_customer_invitations:['SELECT','INSERT','UPDATE'],
 governance_customer_sessions:['SELECT','INSERT','UPDATE','DELETE'],governance_customer_auth_flows:['SELECT','INSERT','UPDATE','DELETE'],governance_provider_revocations:['SELECT','INSERT'],governance_identity_events:['SELECT','INSERT'],governance_provider_replay_progress:['SELECT','INSERT','UPDATE']
});
const worker=Object.fromEntries(metadata.map(table=>[table,['SELECT']]));
Object.assign(worker,{governance_events:['SELECT'],governance_outbox:['SELECT','UPDATE'],governance_evidence:['SELECT','INSERT','UPDATE'],governance_recovery_publisher_releases:['SELECT']});
const profiles={api,'evidence-worker':worker},operations=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
function grantSql(profile,role){
 const allowed=profiles[profile];if(!allowed||typeof role!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw Error('Explicit runtime profile and role required');
 return '-- Fresh non-owner runtime role only; provision its credentials separately.\n-- Run after reviewed migrations. No role creation, service activation or wallet access.\nGRANT USAGE ON SCHEMA public TO '+role+';\n'+Object.entries(allowed).map(([table,permissions])=>'GRANT '+permissions.join(', ')+' ON '+table+' TO '+role+';').join('\n')+'\n';
}
async function verifyProfile(pool,profile){
 const allowed=profiles[profile];if(!allowed)throw Error('Unknown database runtime profile');
 const role=(await pool.query(`SELECT r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
 pg_has_role(current_user,d.datdba,'MEMBER') database_owner,
 EXISTS(SELECT 1 FROM pg_roles other WHERE other.rolname<>current_user AND pg_has_role(current_user,other.oid,'MEMBER')) role_membership,
 has_schema_privilege(current_user,'public','CREATE') schema_create,
 has_database_privilege(current_user,current_database(),'CREATE') database_create
 FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`)).rows[0];
 if(!role||Object.values(role).some(Boolean))throw Error('Runtime profile forbids ownership, persistent DDL or privileged roles');
 const rows=(await pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_has_role(current_user,c.relowner,'MEMBER') owner_access,
 ARRAY(SELECT privilege FROM unnest($1::text[]) privilege WHERE has_table_privilege(current_user,c.oid,privilege)
 OR CASE WHEN privilege IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN has_any_column_privilege(current_user,c.oid,privilege) ELSE false END) privileges,
 ARRAY(SELECT privilege FROM unnest($1::text[]) privilege WHERE has_table_privilege(current_user,c.oid,privilege)) table_privileges
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')`,[operations])).rows;
 for(const table of new Set([...Object.keys(api),...Object.keys(worker)]))if(!rows.some(row=>row.relname===table))throw Error('Runtime profile tables are incomplete');
 for(const row of rows){const expected=allowed[row.relname]||[];
  if(row.owner_access||expected.some(privilege=>!row.table_privileges.includes(privilege))||row.privileges.some(privilege=>!expected.includes(privilege))||(Object.hasOwn(api,row.relname)||Object.hasOwn(worker,row.relname))&&!metadata.includes(row.relname)&&(!row.relrowsecurity||!row.relforcerowsecurity))throw Error('Runtime profile privileges or forced row security are invalid');
 }
 return {profile,validated:true};
}
module.exports={grantSql,verifyProfile};
