'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {checkRemoteBackup}=require('./backup-object-monitor.cjs');
const policy={environment:'test',bucket:'synthetic-backups',keyPrefix:'pilot/test/archive',key:Buffer.alloc(32),client:{send:async()=>{throw Error('offline');}}};
test('remote monitor rejects invalid policy and reports an unavailable exact set as not ready',async()=>{
 await assert.rejects(checkRemoteBackup({...policy,maxAgeHours:0}),/Invalid remote backup monitoring policy/);
 await assert.rejects(checkRemoteBackup({...policy,keyPrefix:'../other'}),/Explicit bounded object-storage transfer/);
 assert.deepEqual(await checkRemoteBackup(policy),{environment:'test',status:'not-ready',reason:'remote-verification-failed',scope:'Exact remote backup set only; no restore or retention proof'});
});
