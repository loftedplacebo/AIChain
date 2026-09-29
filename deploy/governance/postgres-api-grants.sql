-- Fresh non-owner runtime role only; provision its credentials separately.
-- Run after reviewed migrations. No role creation, service activation or wallet access.
GRANT USAGE ON SCHEMA public TO governance_api;
GRANT SELECT ON governance_migrations TO governance_api;
GRANT SELECT ON governance_environment TO governance_api;
GRANT SELECT ON governance_recovery_gate TO governance_api;
GRANT SELECT, INSERT ON governance_events TO governance_api;
GRANT SELECT, INSERT ON governance_outbox TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_usage TO governance_api;
GRANT SELECT ON governance_evidence TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_agents TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_project_request_limits TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_customer_request_limits TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_auth_start_limits TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_key_scopes TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_project_keys TO governance_api;
GRANT SELECT, INSERT ON governance_key_actions TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_customer_identities TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_customer_workspaces TO governance_api;
GRANT SELECT, INSERT ON governance_customer_projects TO governance_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON governance_customer_memberships TO governance_api;
GRANT SELECT, INSERT ON governance_customer_actions TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_customer_invitations TO governance_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON governance_customer_sessions TO governance_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON governance_customer_auth_flows TO governance_api;
GRANT SELECT, INSERT ON governance_provider_revocations TO governance_api;
GRANT SELECT, INSERT ON governance_identity_events TO governance_api;
GRANT SELECT, INSERT, UPDATE ON governance_provider_replay_progress TO governance_api;
