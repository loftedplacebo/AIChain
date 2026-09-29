-- Run after migrations as a database administrator. Provision the LOGIN role
-- governance_app and its credentials outside source control. Never grant it
-- database ownership, superuser, BYPASSRLS, role creation or migration rights.
GRANT USAGE ON SCHEMA public TO governance_app;
GRANT SELECT ON governance_migrations, governance_environment TO governance_app;
GRANT SELECT, INSERT ON governance_events TO governance_app;
GRANT SELECT, INSERT, UPDATE ON governance_outbox, governance_usage TO governance_app;
-- Pilot role: separate evidence-worker grants from API-reader grants before production.
GRANT SELECT, INSERT, UPDATE ON governance_evidence TO governance_app;
GRANT SELECT, INSERT, UPDATE ON governance_agents TO governance_app;
