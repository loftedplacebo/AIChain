-- Aggregate capacity fuse per configured WorkOS client, before human identity exists.
CREATE TABLE governance_auth_start_limits(
 provider text PRIMARY KEY,
 window_start bigint NOT NULL CHECK(window_start>=0),
 requests integer NOT NULL CHECK(requests>=1),
 quota integer NOT NULL CHECK(quota BETWEEN 1 AND 1000000));
ALTER TABLE governance_auth_start_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_auth_start_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_start_scope ON governance_auth_start_limits
 USING(provider=current_setting('governance.identity_provider',true))
 WITH CHECK(provider=current_setting('governance.identity_provider',true));
REVOKE ALL ON governance_auth_start_limits FROM PUBLIC;
