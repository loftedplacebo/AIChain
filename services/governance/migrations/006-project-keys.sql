-- Shared API-key control state. Identity/membership/session migrations follow;
-- these tables do not make the pilot topology a production identity system.
CREATE TABLE governance_key_scopes (
 tenant text NOT NULL, project text NOT NULL, PRIMARY KEY(tenant,project)
);
CREATE TABLE governance_project_keys (
 id text PRIMARY KEY, tenant text NOT NULL, project text NOT NULL,
 token_hash text UNIQUE NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 label text NOT NULL, scopes jsonb NOT NULL,
 created_at bigint NOT NULL, expires_at bigint NOT NULL,
 revoked_at bigint, last_used_at bigint, actor text NOT NULL,
 UNIQUE(tenant,project,id),
 FOREIGN KEY(tenant,project) REFERENCES governance_key_scopes(tenant,project),
 CHECK(expires_at>created_at), CHECK(jsonb_typeof(scopes)='array'),
 CHECK(scopes <@ '["read","write"]'::jsonb AND jsonb_array_length(scopes) BETWEEN 1 AND 2)
);
CREATE INDEX governance_keys_scope ON governance_project_keys(tenant,project,created_at DESC,id);
CREATE TABLE governance_key_actions (
 tenant text NOT NULL, project text NOT NULL, action_id text NOT NULL,
 body text NOT NULL, key_id text NOT NULL,
 created_at bigint NOT NULL, PRIMARY KEY(tenant,project,action_id),
 FOREIGN KEY(tenant,project,key_id) REFERENCES governance_project_keys(tenant,project,id),
 FOREIGN KEY(tenant,project) REFERENCES governance_key_scopes(tenant,project)
);
ALTER TABLE governance_key_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_key_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_project_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_project_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_key_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_key_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY key_scope_lock ON governance_key_scopes
 USING (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true))
 WITH CHECK (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true));
CREATE POLICY project_key_scope ON governance_project_keys
 USING (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true))
 WITH CHECK (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true));
-- Authentication begins without a caller-supplied tenant. A full SHA-256 proof
-- selects only that key; the backend then sets its recorded project context.
CREATE POLICY project_key_auth_lookup ON governance_project_keys FOR SELECT
 USING (token_hash=current_setting('governance.key_hash',true));
CREATE POLICY project_key_action_scope ON governance_key_actions
 USING (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true))
 WITH CHECK (tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true));
