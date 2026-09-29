import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const source=await readFile(new URL('../app/workspace/keys-panel.tsx',import.meta.url),'utf8');
const compiled=await transformWithEsbuild(source,'keys-panel.tsx',{loader:'tsx',jsx:'automatic'});
const childSource=await readFile(new URL('../app/workspace/first-submission.tsx',import.meta.url),'utf8');
const childCompiled=await transformWithEsbuild(childSource,'first-submission.tsx',{loader:'tsx',jsx:'automatic'});
const childCode=childCompiled.code.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll('"react"',JSON.stringify(import.meta.resolve('react'))).replaceAll('"../../lib/first-submission.js"',JSON.stringify(new URL('../lib/first-submission.js',import.meta.url).href));
const childUrl='data:text/javascript;base64,'+Buffer.from(childCode).toString('base64');
const code=compiled.code.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll('"react"',JSON.stringify(import.meta.resolve('react'))).replaceAll('"../../lib/workspace-response.js"',JSON.stringify(new URL('../lib/workspace-response.js',import.meta.url).href)).replaceAll('"./first-submission"',JSON.stringify(childUrl));
const {default:Panel}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('non-administrator key view exposes no credential-management form',()=>{
 const html=renderToStaticMarkup(React.createElement(Panel,{workspace:'w',revision:0,canManage:false}));assert.match(html,/workspace administrator/);assert.doesNotMatch(html,/<form|<input|Create API key/);
});
test('administrator key view presents least-privilege access and bounded expiry',()=>{
 const html=renderToStaticMarkup(React.createElement(Panel,{workspace:'w',revision:0,canManage:true}));for(const text of ['Project API keys','grant only the access it needs','Submit events and register agents','Read records and evidence','Create API key'])assert.ok(html.includes(text));assert.match(html,/min="1" max="365"/);assert.match(html,/value="write" selected/);assert.doesNotMatch(html,/ovk_[a-f0-9]{64}/);
});
test('administrator key list defaults to active credentials with history filters',()=>{
 const html=renderToStaticMarkup(React.createElement(Panel,{workspace:'w',revision:0,canManage:true}));assert.match(html,/Key status/);assert.match(html,/value="active" selected/);for(const label of ['All history','Expired','Revoked'])assert.ok(html.includes(label));
});
test('customer onboarding shows authenticated scope and a secret-free first-submission example',()=>{
 const html=renderToStaticMarkup(React.createElement(Panel,{workspace:'synthetic-project',tenantRef:'synthetic-tenant',revision:0,canManage:true}));
 for(const text of ['Connect this project','synthetic-project','synthetic-tenant','ORVESSIAN_API_KEY','ORVESSIAN_API_URL','one synthetic record','Copy Python example','open Decisions','acceptance does not mean'])assert.ok(html.includes(text));assert.doesNotMatch(html,/ovk_[a-f0-9]{64}/);
});
