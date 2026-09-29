import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const source=await readFile(new URL('../app/workspace/tool-activity.tsx',import.meta.url),'utf8');
const compiled=await transformWithEsbuild(source,'tool-activity.tsx',{loader:'tsx',jsx:'automatic'});
const code=compiled.code.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')));
const {default:Panel}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('absence of tool observations does not imply inactivity or complete coverage',()=>{
 for(const activity of [undefined,{}, {toolCalls:[]}]){
  const html=renderToStaticMarkup(React.createElement(Panel,{activity}));
  assert.match(html,/does not establish that no tools ran/);
  assert.match(html,/not complete activity coverage/);
  assert.doesNotMatch(html,/<table/);
 }
});
test('tool outcomes and permission declarations remain distinct and text is escaped',()=>{
 const html=renderToStaticMarkup(React.createElement(Panel,{activity:{toolCalls:[
  {toolRef:'lookup',version:'v1',resultCode:'completed'},
  {toolRef:'write',version:'v2',resultCode:'failed',allowed:false},
  {toolRef:'<script>alert(1)</script>',version:'v3',resultCode:'pending',allowed:true}
 ]}}));
 for(const text of ['3 tool observations','completed','failed','pending','Not supplied','Customer reports not allowed','Customer reports allowed','does not prove a tool was permitted']) assert.ok(html.includes(text));
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 assert.match(html,/individual tool timestamps and durations are not supplied/);
});
