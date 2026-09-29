CREATE TABLE governance_evidence (
 tenant text NOT NULL, project text NOT NULL, id text NOT NULL,
 batch_id text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 bundle jsonb NOT NULL, PRIMARY KEY(tenant,project,id),
 FOREIGN KEY(tenant,project,id) REFERENCES governance_events(tenant,project,id)
);
CREATE INDEX governance_evidence_batch ON governance_evidence(tenant,project,batch_id);
ALTER TABLE governance_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_scope ON governance_evidence
 USING (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true))
 WITH CHECK (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true));
