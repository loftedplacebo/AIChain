CREATE TABLE governance_recovery_gate(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 state text NOT NULL CHECK(state IN('active','review-required')),
 restore_id text,invalidated_at bigint);
INSERT INTO governance_recovery_gate(singleton,state) VALUES(true,'active');
-- Readiness metadata is public to runtime roles; mutation remains owner/operator
-- only. This table contains no credentials or customer information.
GRANT SELECT ON governance_recovery_gate TO PUBLIC;
