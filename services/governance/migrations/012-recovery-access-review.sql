ALTER TABLE governance_recovery_gate DROP CONSTRAINT governance_recovery_gate_state_check;
ALTER TABLE governance_recovery_gate ADD CHECK(state IN('active','review-required','access-reviewed'));
-- Offline operator only. No PUBLIC or runtime-role grants. Preserve the full
-- original/replacement selection for recovery audit, outside customer APIs.
CREATE TABLE governance_recovery_access_reviews(
 restore_id text PRIMARY KEY,
 snapshot_digest text NOT NULL,
 plan jsonb NOT NULL,
 original_memberships jsonb NOT NULL,
 applied_at bigint NOT NULL,
 operator_name text NOT NULL
);
REVOKE ALL ON governance_recovery_access_reviews FROM PUBLIC;
