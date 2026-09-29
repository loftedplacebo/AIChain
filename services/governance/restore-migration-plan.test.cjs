'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{plan}=require('./restore-migration-plan.cjs'),{migrations}=require('./postgres-migrate.cjs');
const expected=migrations(),history=n=>expected.slice(0,n).map(({name,checksum})=>({name,checksum})),approval=()=>expected.slice(11).map(({name,checksum})=>({name,checksum}));
test('known restore prefixes need exactly approved shipped migrations',()=>{
 assert.deepEqual(plan(expected,history(expected.length)),[]);assert.deepEqual(plan(expected,history(11),approval()),expected.slice(11));assert.deepEqual(plan(expected,history(11).reverse(),approval()),expected.slice(11));assert.throws(()=>plan(expected,history(11)),/reviewed/);
});
test('restore upgrades reject altered, incomplete or extra histories and unreviewed SQL',()=>{
 const altered=history(11);altered[0].checksum='changed';
 for(const rows of [altered,history(11).slice(1),history(8),[...history(11),history(11)[0]],[...history(11),{name:'999-unknown.sql',checksum:'bad'}]])assert.throws(()=>plan(expected,rows,approval()),/prefix/);
 for(const approvals of [[{...approval()[0],checksum:'bad'}],[{...approval()[0],sql:'SELECT 1'}],[...approval(),...approval()],[],[{name:'other',checksum:approval()[0].checksum}]])assert.throws(()=>plan(expected,history(11),approvals),/reviewed/);
});
