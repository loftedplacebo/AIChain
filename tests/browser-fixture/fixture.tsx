import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Workspace from '../../app/workspace/workspace';
import '../../app/globals.css';
import '../../app/portal/portal.css';
import '../../app/workspace/customer-controls.css';
// Browser-only synthetic responses. Never calls a provider, persists credentials,
// writes customer records or connects to the real API. Not a production route.
const attempts:Record<string,number>={};let notify=()=>{},invitationOutage=false;
const sample={email:'synthetic@example.test',canCreateWorkspace:true,workspaces:[{id:'prj-fixture',workspaceId:'org-fixture',name:'Synthetic workspace / Governance',role:'owner',canManageMembers:true,canManageKeys:true,canManageGovernance:true,canReview:true}]};
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
 if(url.origin!==location.origin)throw Error('External requests forbidden in fixture');
 if(url.pathname==='/api/auth/status')return Response.json({enabled:true,provider:'workos'});
 if(url.pathname!=='/api/workspace')return Response.json({error:'Unsupported synthetic request'},{status:503});
 const action=url.searchParams.get('action')||'session';
 if(init?.method==='POST'){
  attempts[action]=(attempts[action]||0)+1;notify();
  return Response.json({error:'Sign in again to manage keys and workspace access',code:'reauthentication-required'},{status:403});
 }
 if(action==='session')return Response.json(sample);
 if(action==='account-sessions')return Response.json({scope:'Synthetic app sessions only',sessions:[{ref:'ab'.repeat(32),current:true,createdAt:Date.now()-60000,lastSeenAt:Date.now(),absoluteExpiresAt:Date.now()+28740000,renewalRequired:false},{ref:'cd'.repeat(32),current:false,createdAt:Date.now()-3600000,lastSeenAt:Date.now()-600000,absoluteExpiresAt:Date.now()+25200000,renewalRequired:true}]});
 if(action==='keys'){
  const state=url.searchParams.get('state')||'all',offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||50);
  const rows=Array.from({length:56},(_,i)=>({id:'key-fixture-'+i,label:i===55?'Older active recorder':'Synthetic recorder '+i,scopes:['write'],createdAt:'2026-09-29T00:00:00.000Z',expiresAt:'2026-10-29T00:00:00.000Z',revokedAt:i<55?'2026-09-29T01:00:00.000Z':null,lastUsedAt:null,status:i<55?'revoked':'active'})).filter(key=>state==='all'||key.status===state);
  return Response.json({keys:rows.slice(offset,offset+limit),state,offset,limit,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null});
 }
 if(action==='members')return Response.json({members:[{id:'usr-fixture',email:sample.email,role:'owner'}]});
 if(action==='invitations'){
  if(invitationOutage)return Response.json({error:'Synthetic invitation list outage'},{status:503});
  const state=url.searchParams.get('state')||'all',offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||50);
  const rows=Array.from({length:107},(_,i)=>({id:'inv-fixture-'+i,email:i===104?'older-pending@example.test':i===105?'accepted@example.test':i===106?'expired@example.test':'revoked-'+i+'@example.test',role:'reader',expiresAt:i===106?Date.now()-86400000:Date.now()+86400000,revokedAt:i<104?Date.now()-1000:null,acceptedBy:i===105?'usr-accepted':null})).filter(row=>state==='all'||state==='revoked'&&row.revokedAt!==null||state==='accepted'&&row.acceptedBy!==null||state==='pending'&&row.revokedAt===null&&row.acceptedBy===null&&row.expiresAt>Date.now()||state==='expired'&&row.revokedAt===null&&row.acceptedBy===null&&row.expiresAt<=Date.now());
  return Response.json({invitations:rows.slice(offset,offset+limit),total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null});
 }
 if(action==='events')return Response.json({events:[],total:0,nextOffset:null});
 if(action==='evidence-status')return Response.json({asOf:new Date().toISOString(),total:8,counts:{pending:2,batched:1,submitted:5,other:0},awaitingSubmission:3,oldestAwaitingAcceptedAt:new Date(Date.now()-120000).toISOString(),oldestAwaitingAgeSeconds:120});
 if(action==='report')return Response.json({asOf:new Date().toISOString(),eventCount:0,kpis:{},models:[],trends:[],alerts:[]});
 return Response.json({error:'Unsupported synthetic request'},{status:503});
};
function Fixture(){const [,redraw]=useState(0);notify=()=>redraw(n=>n+1);return <><section aria-label="Fixture diagnostics" style={{padding:16,background:'#fff4c5'}}><strong>Isolated browser fixture · Synthetic data only · No real credentials</strong><p>Attempted writes: {Object.entries(attempts).map(([action,n])=>`${action}=${n}`).join(', ')||'none'}</p><button onClick={()=>{invitationOutage=!invitationOutage;notify();}}>{invitationOutage?'Restore invitation list':'Simulate invitation list outage'}</button><p>Use workspace Refresh after changing the simulated availability.</p></section><Workspace/></>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
