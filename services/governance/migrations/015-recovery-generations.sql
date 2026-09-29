-- Offline recovery lineage. Runtime roles receive no access.
CREATE TABLE governance_recovery_generations(
 restore_id text PRIMARY KEY,
 previous_restore_id text,
 previous_state text NOT NULL CHECK(previous_state IN('active','customer-active')),
 previous_invalidated_at bigint,
 invalidated_at bigint NOT NULL,
 operator_name text NOT NULL,
 CHECK((previous_state='active' AND previous_restore_id IS NULL AND previous_invalidated_at IS NULL)
 OR (previous_state='customer-active' AND previous_restore_id IS NOT NULL AND previous_invalidated_at>0)));
REVOKE ALL ON governance_recovery_generations FROM PUBLIC;
