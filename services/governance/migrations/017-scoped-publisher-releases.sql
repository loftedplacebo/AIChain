-- Runtime-visible binding only; approval and audit writes are offline operations.
CREATE TABLE governance_recovery_publisher_releases(
 tenant text NOT NULL, project text NOT NULL, release_id text PRIMARY KEY,
 restore_id text NOT NULL, publisher text NOT NULL, recorder text NOT NULL,
 worker_role text NOT NULL, policy_digest text NOT NULL, code_hash text NOT NULL,
 state text NOT NULL CHECK(state IN('prepared','active','revoked')),
 reviewed_at bigint NOT NULL, changed_at bigint NOT NULL);
CREATE UNIQUE INDEX recovery_publisher_active_wallet ON governance_recovery_publisher_releases(publisher) WHERE state='active';
CREATE UNIQUE INDEX recovery_publisher_active_project ON governance_recovery_publisher_releases(tenant,project) WHERE state='active';
ALTER TABLE governance_recovery_publisher_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_recovery_publisher_releases FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped_publisher_release ON governance_recovery_publisher_releases
 USING(tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true))
 WITH CHECK(tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true));
CREATE TABLE governance_recovery_publisher_reviews(
 release_id text PRIMARY KEY, restore_id text NOT NULL, review jsonb NOT NULL,
 operator_name text NOT NULL, reviewed_at bigint NOT NULL,
 UNIQUE(release_id,restore_id));
ALTER TABLE governance_recovery_publisher_releases ADD FOREIGN KEY(release_id,restore_id)
 REFERENCES governance_recovery_publisher_reviews(release_id,restore_id);
REVOKE ALL ON governance_recovery_publisher_releases,governance_recovery_publisher_reviews FROM PUBLIC;
