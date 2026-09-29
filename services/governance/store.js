const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');
const { validateGovernanceEvent } = require('../../sdk/typescript/governance-event');
const { buildReport } = require('./report');
function canonical(value) { return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value; }
function error(status, message) { return Object.assign(new Error(message), { status }); }
class GovernanceStore {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS events (tenant TEXT NOT NULL, project TEXT NOT NULL, id TEXT NOT NULL, stream TEXT NOT NULL, sequence TEXT NOT NULL, digest TEXT NOT NULL, occurred TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(tenant,project,id), UNIQUE(tenant,project,stream,sequence));
      CREATE TABLE IF NOT EXISTS outbox (tenant TEXT NOT NULL, project TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY(tenant,project,id), FOREIGN KEY(tenant,project,id) REFERENCES events(tenant,project,id));
      CREATE INDEX IF NOT EXISTS event_time ON events(tenant,project,occurred);`);
    this.db.exec("CREATE INDEX IF NOT EXISTS governance_outcome_links ON events(tenant,project,json_extract(body,'$.outcome.forEventId'));");
    this.db.exec("CREATE INDEX IF NOT EXISTS governance_review_links ON events(tenant,project,json_extract(body,'$.source.integrationVersion'),json_extract(body,'$.parentEventRefs[0]')); CREATE INDEX IF NOT EXISTS governance_event_kind_time ON events(tenant,project,json_extract(body,'$.eventType'),occurred,id);");
    this.db.exec(`CREATE TABLE IF NOT EXISTS governance_evidence(tenant TEXT NOT NULL,project TEXT NOT NULL,id TEXT NOT NULL,batch_id TEXT NOT NULL,revision INTEGER NOT NULL,bundle TEXT NOT NULL,PRIMARY KEY(tenant,project,id),FOREIGN KEY(tenant,project,id) REFERENCES events(tenant,project,id)); CREATE INDEX IF NOT EXISTS governance_evidence_batch ON governance_evidence(tenant,project,batch_id);`);
  }
  ingest(input, principal) {
    if (input.tenantRef !== principal.tenant || input.projectRef !== principal.project) throw error(403, 'Event scope does not match credential');
    const submitted = { ...input }; delete submitted.receivedAt;
    const digest = createHash('sha256').update(JSON.stringify(canonical(submitted))).digest('hex');
    const event = { ...submitted, receivedAt: new Date().toISOString() };
    validateGovernanceEvent(event);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const old = this.db.prepare('SELECT digest FROM events WHERE tenant=? AND project=? AND id=?').get(principal.tenant, principal.project, event.eventId);
      if (old) { if (old.digest !== digest) throw error(409, 'Event ID already exists with different data'); const anchorStatus=this.db.prepare('SELECT status FROM outbox WHERE tenant=? AND project=? AND id=?').get(principal.tenant,principal.project,event.eventId).status; this.db.exec('COMMIT'); return { eventId: event.eventId, status: 'duplicate', anchorStatus }; }
      this.db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?)').run(principal.tenant, principal.project, event.eventId, event.streamRef, event.sequence, digest, event.occurredAt, JSON.stringify(event));
      this.db.prepare('INSERT INTO outbox(tenant,project,id) VALUES (?,?,?)').run(principal.tenant, principal.project, event.eventId);
      this.db.exec('COMMIT'); return { eventId: event.eventId, status: 'accepted', anchorStatus: 'pending', receivedAt: event.receivedAt };
    } catch(e) { this.db.exec('ROLLBACK'); if (String(e.message).includes('UNIQUE constraint')) throw error(409,'Stream sequence already exists'); throw e; }
  }
  list(principal, { from = '', to = '9999', deployment = '', q = '', limit = 100, offset = 0 } = {}) {
    const where='tenant=? AND project=? AND occurred>=? AND occurred<?'+(deployment?' AND json_extract(body,\'$.model.deploymentRef\')=?':'')+(q?" AND instr(lower(id || ' ' || coalesce(json_extract(body,'$.agentRef'),'') || ' ' || coalesce(json_extract(body,'$.caseRef'),'') || ' ' || json_extract(body,'$.eventType')),?)>0":'');
    const params=[principal.tenant,principal.project,from,to,...(deployment?[deployment]:[]),...(q?[q.toLowerCase()]:[])];
    const total=this.db.prepare(`SELECT count(*) n FROM events WHERE ${where}`).get(...params).n;
    const rows=this.db.prepare(`SELECT body FROM events WHERE ${where} ORDER BY occurred DESC,id LIMIT ? OFFSET ?`).all(...params,limit,offset).map(r=>JSON.parse(r.body));
    return {total,events:rows,nextOffset:offset+limit<total?offset+limit:null};
  }
  get(principal,id) { const row=this.db.prepare('SELECT body FROM events WHERE tenant=? AND project=? AND id=?').get(principal.tenant,principal.project,id); return row ? JSON.parse(row.body) : null; }
  report(principal, range = {}) { return require('./aggregate-report.cjs').sqliteReport(this.db,principal,range); }
  evidenceStatus(p){const rows=this.db.prepare("SELECT o.status,count(*) count,min(json_extract(e.body,'$.receivedAt')) oldestAcceptedAt FROM events e LEFT JOIN outbox o ON e.tenant=o.tenant AND e.project=o.project AND e.id=o.id WHERE e.tenant=? AND e.project=? GROUP BY o.status").all(p.tenant,p.project);return require('./evidence-status.cjs').summarize(rows);}
  pendingEvidence(p,limit=100){return this.db.prepare('SELECT e.body FROM events e LEFT JOIN governance_evidence g ON g.tenant=e.tenant AND g.project=e.project AND g.id=e.id WHERE e.tenant=? AND e.project=? AND g.id IS NULL ORDER BY e.occurred,e.id LIMIT ?').all(p.tenant,p.project,limit).map(r=>JSON.parse(r.body));}
  evidenceBatchIds(p){return this.db.prepare('SELECT DISTINCT batch_id FROM governance_evidence WHERE tenant=? AND project=? ORDER BY batch_id').all(p.tenant,p.project).map(r=>r.batch_id);}
  evidence(p,id){const row=this.db.prepare('SELECT revision,bundle FROM governance_evidence WHERE tenant=? AND project=? AND id=?').get(p.tenant,p.project,id);return row?{revision:row.revision,bundle:JSON.parse(row.bundle)}:null;}
  batchEvidence(p,batchId){return this.db.prepare('SELECT id,revision,bundle FROM governance_evidence WHERE tenant=? AND project=? AND batch_id=? ORDER BY id').all(p.tenant,p.project,batchId).map(r=>({id:r.id,expectedRevision:r.revision,bundle:JSON.parse(r.bundle)}));}
  commitEvidence(p,entries){this.db.exec('BEGIN IMMEDIATE');try{for(const e of entries){const previous=this.evidence(p,e.id);if((previous?.revision||0)!==e.expectedRevision)throw error(409,'Evidence changed; retry the worker operation');if(previous&&canonical(previous.bundle.receipt).issuer!==e.bundle.receipt.issuer)throw error(409,'Cannot replace signed receipt');if(previous&&JSON.stringify(canonical({...previous.bundle,transactions:[]}))!==JSON.stringify(canonical({...e.bundle,transactions:[]})))throw error(409,'Signed evidence is immutable');this.db.prepare('INSERT INTO governance_evidence VALUES(?,?,?,?,?,?) ON CONFLICT(tenant,project,id) DO UPDATE SET revision=excluded.revision,bundle=excluded.bundle').run(p.tenant,p.project,e.id,e.bundle.batch.id,e.expectedRevision+1,JSON.stringify(e.bundle));this.db.prepare("UPDATE outbox SET status=? WHERE tenant=? AND project=? AND id=?").run(e.bundle.transactions.length?'submitted':'batched',p.tenant,p.project,e.id);}this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  close() { this.db.close(); }
}
module.exports = { GovernanceStore };
