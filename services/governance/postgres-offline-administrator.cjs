'use strict';

// Recovery tools run only offline against an explicitly selected dev/test DB.
// Managed PostgreSQL often reserves SUPERUSER for the provider. A customer
// administrator with BYPASSRLS may do the same complete-snapshot work when it
// owns the target database; creating a restore target also needs CREATEDB.
async function assertOfflineAdministrator(client,{createDatabase=false,requireDatabaseOwner=true}={}){
 const row=(await client.query(`SELECT r.rolsuper,r.rolbypassrls,r.rolcreatedb,
   pg_has_role(current_user,d.datdba,'MEMBER') database_owner
   FROM pg_roles r JOIN pg_database d ON d.datname=current_database()
   WHERE r.rolname=current_user`)).rows[0];
 if(!row||(createDatabase&&!row.rolsuper&&!row.rolcreatedb)||
    !row.rolsuper&&(!row.rolbypassrls||requireDatabaseOwner&&!row.database_owner))
  throw Error('offline database administrator with full row visibility and database ownership required');
 return {superuser:row.rolsuper===true,managedAdministrator:row.rolsuper!==true};
}

module.exports={assertOfflineAdministrator};
