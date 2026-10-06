-- Run once as doadmin while connected to the isolated governance_test database.
-- This grants only schema creation to the reviewed migration role. Runtime roles
-- receive connection and schema usage, then table rights from the separate
-- postgres-api-grants.sql and postgres-evidence-worker-grants.sql files.
-- Do not apply this file to any other environment.
BEGIN;

REVOKE ALL ON DATABASE governance_test FROM PUBLIC;
REVOKE ALL ON DATABASE governance_test FROM governance_api, governance_evidence_worker, governance_migrations;
GRANT CONNECT ON DATABASE governance_test TO governance_api, governance_evidence_worker, governance_migrations;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM governance_api, governance_evidence_worker, governance_migrations;
GRANT USAGE, CREATE ON SCHEMA public TO governance_migrations;
-- The existing runtime grant files include GRANT USAGE ON SCHEMA public.
-- Permit the migration role, which will own the new tables, to apply those files.
GRANT USAGE ON SCHEMA public TO governance_migrations WITH GRANT OPTION;
GRANT USAGE ON SCHEMA public TO governance_api, governance_evidence_worker;

COMMIT;
