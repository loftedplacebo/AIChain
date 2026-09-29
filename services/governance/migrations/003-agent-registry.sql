CREATE TABLE governance_agents (
 tenant text NOT NULL, project text NOT NULL, agent text NOT NULL,
 environment text NOT NULL, deployment text NOT NULL, body text NOT NULL,
 created text NOT NULL, heartbeat_seq bigint NOT NULL DEFAULT -1,
 heartbeat_at text, PRIMARY KEY(tenant,project,agent,environment,deployment)
);
ALTER TABLE governance_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_agents FORCE ROW LEVEL SECURITY;
CREATE POLICY agents_scope ON governance_agents
 USING (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true))
 WITH CHECK (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true));
CREATE INDEX governance_events_agent_received ON governance_events(tenant,project,(body->>'agentRef'),(body->>'environment'),(body->'model'->>'deploymentRef'),(body->>'receivedAt'));
