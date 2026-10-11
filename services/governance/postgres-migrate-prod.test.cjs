'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {migrate}=require('./postgres-migrate.cjs');

function bindingPool(database,role){
 const statements=[];
 const client={
  async query(sql){
   statements.push(sql);
   if(sql.startsWith('SELECT current_database()'))return {rows:[{database,role}]};
   return {rows:[]};
  },
  release(){}
 };
 return {statements,connect:async()=>client};
}

test('production migration rejects the wrong database before schema changes',async()=>{
 const pool=bindingPool('governance_test','governance_prod_migrations');
 await assert.rejects(migrate(pool,{environment:'prod'}),/dedicated database and migration role/);
 assert.deepEqual(pool.statements,['BEGIN','SELECT current_database() AS database, current_user AS role','ROLLBACK']);
});

test('production migration rejects a non-migration identity before schema changes',async()=>{
 const pool=bindingPool('governance_prod','doadmin');
 await assert.rejects(migrate(pool,{environment:'prod'}),/dedicated database and migration role/);
 assert.deepEqual(pool.statements,['BEGIN','SELECT current_database() AS database, current_user AS role','ROLLBACK']);
});

test('production migration requires an explicit prod environment',async()=>{
 const pool=bindingPool('governance_prod','governance_prod_migrations');
 await assert.rejects(migrate(pool,{environment:'production'}),/Explicit dev, test or prod/);
 assert.deepEqual(pool.statements,[]);
});
