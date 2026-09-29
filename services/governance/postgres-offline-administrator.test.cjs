'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assertOfflineAdministrator}=require('./postgres-offline-administrator.cjs');
const client=attributes=>({query:async sql=>{assert.match(sql,/pg_has_role/);return {rows:[attributes]};}});

test('offline administrator accepts a database-owning managed role with complete row visibility',async()=>{
 const managed=client({rolsuper:false,rolbypassrls:true,rolcreatedb:true,database_owner:true});
 assert.deepEqual(await assertOfflineAdministrator(managed),{superuser:false,managedAdministrator:true});
 assert.deepEqual(await assertOfflineAdministrator(managed,{createDatabase:true}),{superuser:false,managedAdministrator:true});
});

test('offline administrator rejects runtime and incomplete operator roles',async()=>{
 for(const attributes of [
  {rolsuper:false,rolbypassrls:false,rolcreatedb:true,database_owner:true},
  {rolsuper:false,rolbypassrls:true,rolcreatedb:true,database_owner:false}
 ])await assert.rejects(assertOfflineAdministrator(client(attributes)),/offline database administrator/);
 await assert.rejects(assertOfflineAdministrator(client({rolsuper:false,rolbypassrls:true,rolcreatedb:false,database_owner:true}),{createDatabase:true}),/offline database administrator/);
});

test('offline administrator retains local superuser recovery support',async()=>{
 assert.deepEqual(await assertOfflineAdministrator(client({rolsuper:true,rolbypassrls:true,rolcreatedb:true,database_owner:false})),{superuser:true,managedAdministrator:false});
});
