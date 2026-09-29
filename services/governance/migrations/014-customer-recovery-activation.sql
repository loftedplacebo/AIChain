ALTER TABLE governance_recovery_gate DROP CONSTRAINT governance_recovery_gate_state_check;
ALTER TABLE governance_recovery_gate ADD CHECK(state IN('active','review-required','access-reviewed','customer-active'));
CREATE TABLE governance_recovery_customer_activations(
 restore_id text PRIMARY KEY, snapshot_digest text NOT NULL, review jsonb NOT NULL,
 applied_at bigint NOT NULL, operator_name text NOT NULL);
-- Offline operator audit, outside all runtime-role grants.
REVOKE ALL ON governance_recovery_customer_activations FROM PUBLIC;
