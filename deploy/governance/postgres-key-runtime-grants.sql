-- Explicit optional dev/test shared-key grants. Run as migration owner after
-- reviewed migrations, alongside the event-runtime grants. This does not grant
-- customers SQL access or enable hosted startup. Keep ownership and migration
-- rights separate; do not grant owner-role membership, even with NOINHERIT.
GRANT SELECT, INSERT, UPDATE ON governance_key_scopes,
 governance_project_keys, governance_key_actions TO governance_app;
