-- Fresh non-owner runtime role only; provision its credentials separately.
-- Run after reviewed migrations. No role creation, service activation or wallet access.
GRANT USAGE ON SCHEMA public TO governance_evidence_worker;
GRANT SELECT ON governance_migrations TO governance_evidence_worker;
GRANT SELECT ON governance_environment TO governance_evidence_worker;
GRANT SELECT ON governance_recovery_gate TO governance_evidence_worker;
GRANT SELECT ON governance_events TO governance_evidence_worker;
GRANT SELECT, UPDATE ON governance_outbox TO governance_evidence_worker;
GRANT SELECT, INSERT, UPDATE ON governance_evidence TO governance_evidence_worker;
GRANT SELECT ON governance_recovery_publisher_releases TO governance_evidence_worker;
