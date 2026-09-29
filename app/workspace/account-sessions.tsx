'use client';
import {useEffect,useRef,useState} from 'react';
import {readWorkspaceResponse,mutationErrorMessage} from '../../lib/workspace-response.js';
type Session={ref:string;current:boolean;createdAt:number;lastSeenAt:number;absoluteExpiresAt:number;renewalRequired:boolean};
export default function AccountSessions({onReauthenticationRequired}:{onReauthenticationRequired?:()=>void}){
 const [sessions,setSessions]=useState<Session[]|null>(null),[selected,setSelected]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const alive=useRef(true),pending=useRef(false),controller=useRef<AbortController|null>(null);
 const requireSignIn=()=>{if(alive.current){setSelected('');onReauthenticationRequired?.();}};
 async function reload(signal?:AbortSignal){const response=await fetch('/api/workspace?action=account-sessions',{cache:'no-store',signal}),data=await readWorkspaceResponse(response,{signal,onReauthenticationRequired:requireSignIn});if(alive.current&&!signal?.aborted)setSessions(data.sessions);}
 useEffect(()=>{alive.current=true;const abort=new AbortController();controller.current=abort;reload(abort.signal).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>{alive.current=false;controller.current?.abort();};},[]);
 async function revoke(){
  if(!selected||pending.current)return;pending.current=true;setBusy(true);setError('');setNotice('');controller.current?.abort();const abort=new AbortController();controller.current=abort;
  try{const response=await fetch('/api/workspace?action=session-revoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ref:selected}),signal:abort.signal});await readWorkspaceResponse(response,{signal:abort.signal,onReauthenticationRequired:requireSignIn});if(!alive.current)return;setSelected('');setNotice('App session ended. Provider sign-in and API keys are managed separately.');try{await reload(abort.signal);}catch{if(alive.current)setError('Session ended, but the list could not refresh. Use Refresh before another change.');}}
  catch(e){if(alive.current&&!abort.signal.aborted)setError(mutationErrorMessage(e,' Refresh the list before retrying.'));}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 function refresh(){if(pending.current)return;controller.current?.abort();const abort=new AbortController();controller.current=abort;setError('');setSelected('');void reload(abort.signal).catch(e=>{if(alive.current&&!abort.signal.aborted)setError(e.message);});}
 return <section className="gp-panel gp-customer-controls"><h2>Your app sessions</h2><p>See recent access to your account and end another app session. This does not revoke provider sign-in or project API keys. We show session times; device names and locations are not collected.</p><button type="button" className="gp-button" onClick={refresh} disabled={busy}>Refresh sessions</button>
 {error&&<p role="alert" className="gp-alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {sessions===null?<p role="status">Loading app sessions…</p>:<ul>{sessions.map(s=><li key={s.ref}><strong>{s.current?'This browser':'Other app session'}</strong><p>Started {new Date(s.createdAt).toLocaleString()} · Last seen {new Date(s.lastSeenAt).toLocaleString()}{s.renewalRequired?' · Renewal pending':''}</p>{!s.current&&<button type="button" className="gp-button" disabled={busy} onClick={()=>{setSelected(s.ref);setNotice('');}}>End app session</button>}</li>)}</ul>}
 {selected&&<div role="group" aria-label="Confirm ending app session"><p>End the selected app session? Its saved renewal credential will be removed. Your current browser stays signed in.</p><button type="button" className="gp-button" disabled={busy} onClick={()=>void revoke()}>{busy?'Ending…':'Confirm end session'}</button><button type="button" className="gp-button" disabled={busy} onClick={()=>setSelected('')}>Cancel</button></div>}
 </section>;
}
