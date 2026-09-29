CREATE TABLE governance_events (
 tenant text NOT NULL, project text NOT NULL, id text NOT NULL,
 stream text NOT NULL, sequence text NOT NULL, digest text NOT NULL,
 occurred text NOT NULL, received timestamptz NOT NULL, body jsonb NOT NULL,
 bytes integer NOT NULL CHECK(bytes>0), PRIMARY KEY(tenant,project,id),
 UNIQUE(tenant,project,stream,sequence),
 CHECK(body->>'tenantRef'=tenant AND body->>'projectRef'=project AND body->>'eventId'=id)
);
CREATE TABLE governance_outbox (
 tenant text NOT NULL, project text NOT NULL, id text NOT NULL,
 status text NOT NULL DEFAULT 'pending', PRIMARY KEY(tenant,project,id),
 FOREIGN KEY(tenant,project,id) REFERENCES governance_events(tenant,project,id)
);
CREATE TABLE governance_usage (
 tenant text NOT NULL, project text NOT NULL, event_count bigint NOT NULL DEFAULT 0,
 stored_bytes bigint NOT NULL DEFAULT 0, day text NOT NULL, daily_count bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant,project)
);
CREATE INDEX governance_event_time ON governance_events(tenant,project,occurred DESC,id);
CREATE INDEX governance_event_outcome ON governance_events(tenant,project,(body->'outcome'->>'forEventId'));
CREATE INDEX governance_event_deployment ON governance_events(tenant,project,(body->'model'->>'deploymentRef'),occurred);
ALTER TABLE governance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_events FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY event_scope ON governance_events USING (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true)) WITH CHECK (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true));
CREATE POLICY outbox_scope ON governance_outbox USING (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true)) WITH CHECK (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true));
CREATE POLICY usage_scope ON governance_usage USING (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true)) WITH CHECK (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true));
