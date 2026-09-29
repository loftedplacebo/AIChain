CREATE TABLE governance_provider_replay_progress(
 client_id text PRIMARY KEY,
 start_at bigint NOT NULL CHECK(start_at>=0),
 covered_until bigint NOT NULL CHECK(covered_until>=start_at),
 lease_owner text,
 lease_until bigint NOT NULL DEFAULT 0 CHECK(lease_until>=0),
 last_success bigint,
 last_failure bigint,
 CHECK((lease_owner IS NULL AND lease_until=0) OR (lease_owner IS NOT NULL AND lease_until>0))
);
ALTER TABLE governance_provider_replay_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_provider_replay_progress FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_replay_progress ON governance_provider_replay_progress
 USING(client_id=current_setting('governance.replay_client',true))
 WITH CHECK(client_id=current_setting('governance.replay_client',true));
