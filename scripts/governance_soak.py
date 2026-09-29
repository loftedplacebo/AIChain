"""Fixed 24-hour synthetic API soak: 100 events/hour, at most 2,400 unique IDs.
No key loading or blockchain submission. Worker fee policy remains authoritative.
"""
import json, os, time, sqlite3, urllib.request, urllib.error
from pathlib import Path
ROOT = Path('/var/lib/aichain-governance-worker')
STATE = ROOT / 'soak-24h.json'
def save(state):
    temp = STATE.with_suffix('.tmp')
    with temp.open('w') as f:
        json.dump(state, f, indent=2); f.flush(); os.fsync(f.fileno())
    temp.replace(STATE)
def main():
    state = json.loads(STATE.read_text()) if STATE.exists() else {'start':time.time(), 'next':0, 'accepted':0, 'duplicates':0, 'errors':0, 'maxLatencyMs':0, 'status':'running'}
    save(state)
    access = json.loads((ROOT/'workspace-access.json').read_text())
    fixture = json.loads(Path('/opt/aichain/governance-worker/fixtures/governance/paired-model-comparison-v0.1.0-draft.json').read_text())['events'][0]
    while time.time() < state['start'] + 86400:
        due = min(2400, (int((time.time()-state['start'])//3600)+1)*100)
        if state['next'] >= due:
            with sqlite3.connect(ROOT/'worker.sqlite', timeout=5) as db:
                jobs=[json.loads(row[0]) for row in db.execute('SELECT body FROM jobs')]
            state['workerStates']={name:sum(j['state']==name for j in jobs) for name in sorted({j['state'] for j in jobs})}
            state['checkedAt']=time.time(); save(state)
            if any(j['state']=='blocked' for j in jobs):
                state['status']='stopped-worker-blocked'; save(state); return
            time.sleep(15); continue
        with sqlite3.connect(ROOT/'events.sqlite', timeout=5) as db:
            pending = db.execute("SELECT count(*) FROM outbox WHERE tenant='northstar' AND project='acceptance' AND status='pending'").fetchone()[0]
        if pending >= 1000:
            state['status']='stopped-backlog'; save(state); return
        i=state['next']; event=dict(fixture)
        ident=f"vps-soak-{int(state['start'])}-{i:04d}"
        event.update(tenantRef='northstar',projectRef='acceptance',eventId=ident,streamRef=f"vps-soak-{int(state['start'])}",sequence=str(i+1),runRef=ident+'-run',caseRef=ident+'-case',agentRef='synthetic-24h-soak',occurredAt=time.strftime('%Y-%m-%dT%H:%M:%S',time.gmtime(state['start']+(i//100)*3600))+'.000Z')
        event.pop('receivedAt',None)
        req=urllib.request.Request('http://127.0.0.1:8795/v1/events',data=json.dumps(event).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+access['ingestToken']},method='POST')
        began=time.monotonic()
        try:
            with urllib.request.urlopen(req,timeout=15) as response: result=json.load(response)
            if result.get('status') not in ('accepted','duplicate'): raise ValueError('Unexpected acceptance result')
            state['duplicates' if result['status']=='duplicate' else 'accepted']+=1
            state['next']+=1; state['maxLatencyMs']=max(state['maxLatencyMs'],round((time.monotonic()-began)*1000))
        except (OSError, ValueError):
            state['errors']+=1
            if state['errors']>=20:
                state['status']='stopped-errors'; save(state); return
            save(state); time.sleep(15); continue
        state['updatedAt']=time.time(); save(state)
        time.sleep(0.1)
    state['status']='completed' if state['next']==2400 else 'ended-incomplete'
    state['endedAt']=time.time();save(state)
if __name__ == '__main__': main()
