CREATE TABLE governance_customer_identities(
 id text PRIMARY KEY,provider text NOT NULL,subject text NOT NULL,email text NOT NULL,
 disabled boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),UNIQUE(provider,subject));
CREATE TABLE governance_customer_workspaces(id text PRIMARY KEY,name text NOT NULL,created bigint NOT NULL);
CREATE TABLE governance_customer_projects(id text PRIMARY KEY,workspace text NOT NULL REFERENCES governance_customer_workspaces(id),name text NOT NULL,created bigint NOT NULL);
CREATE TABLE governance_customer_memberships(workspace text NOT NULL REFERENCES governance_customer_workspaces(id),user_id text NOT NULL REFERENCES governance_customer_identities(id),role text NOT NULL CHECK(role IN('owner','workspace-admin','governance-admin','reviewer','reader')),PRIMARY KEY(workspace,user_id));
CREATE TABLE governance_customer_actions(actor text NOT NULL REFERENCES governance_customer_identities(id),action_id text NOT NULL,body text NOT NULL,result jsonb NOT NULL,created bigint NOT NULL,PRIMARY KEY(actor,action_id));
CREATE TABLE governance_customer_invitations(id text PRIMARY KEY,workspace text NOT NULL REFERENCES governance_customer_workspaces(id),email text NOT NULL,role text NOT NULL CHECK(role IN('workspace-admin','governance-admin','reviewer','reader')),token_hash text UNIQUE NOT NULL,expires bigint NOT NULL,revoked bigint,accepted_by text REFERENCES governance_customer_identities(id),created bigint NOT NULL);
CREATE INDEX governance_customer_projects_workspace ON governance_customer_projects(workspace);
CREATE INDEX governance_customer_memberships_user ON governance_customer_memberships(user_id);
ALTER TABLE governance_customer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_projects FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_invitations FORCE ROW LEVEL SECURITY;
-- Context is set only by the trusted repository inside a transaction. Workspace
-- context is established after locking and checking the actor's membership.
CREATE POLICY customer_identity ON governance_customer_identities USING(
 id=current_setting('governance.customer_actor',true)
 OR (provider=current_setting('governance.identity_provider',true) AND subject=current_setting('governance.identity_subject',true))
 OR EXISTS(SELECT 1 FROM governance_customer_memberships m WHERE m.user_id=id AND m.workspace=current_setting('governance.customer_workspace',true)))
 WITH CHECK(id=current_setting('governance.customer_actor',true)
 OR (provider=current_setting('governance.identity_provider',true) AND subject=current_setting('governance.identity_subject',true)));
CREATE POLICY customer_workspace ON governance_customer_workspaces USING(
 id=current_setting('governance.customer_workspace',true)
 OR EXISTS(SELECT 1 FROM governance_customer_memberships m WHERE m.workspace=id AND m.user_id=current_setting('governance.customer_actor',true)))
 WITH CHECK(id=current_setting('governance.customer_workspace',true));
CREATE POLICY customer_project ON governance_customer_projects USING(
 workspace=current_setting('governance.customer_workspace',true)
 OR EXISTS(SELECT 1 FROM governance_customer_memberships m WHERE m.workspace=governance_customer_projects.workspace AND m.user_id=current_setting('governance.customer_actor',true)))
 WITH CHECK(workspace=current_setting('governance.customer_workspace',true));
CREATE POLICY customer_membership ON governance_customer_memberships USING(
 user_id=current_setting('governance.customer_actor',true) OR workspace=current_setting('governance.customer_workspace',true))
 WITH CHECK(workspace=current_setting('governance.customer_workspace',true));
CREATE POLICY customer_action ON governance_customer_actions USING(actor=current_setting('governance.customer_actor',true)) WITH CHECK(actor=current_setting('governance.customer_actor',true));
CREATE POLICY customer_invitation ON governance_customer_invitations USING(
 workspace=current_setting('governance.customer_workspace',true) OR token_hash=current_setting('governance.invitation_hash',true))
 WITH CHECK(workspace=current_setting('governance.customer_workspace',true));
