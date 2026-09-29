const {test}=require('node:test'),assert=require('node:assert/strict'),os=require('node:os');
const {dashboardLoad}=require('./governance-postgres-dashboard-load.cjs');
test('long test refuses low-memory setup before touching the database',async t=>{
 t.mock.method(os,'freemem',()=>256*1024**2);
 await assert.rejects(dashboardLoad(null,null,{long:true}),/Preflight stopped: host free RAM/);
});
