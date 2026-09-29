CREATE TABLE governance_customer_sessions(
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
 user_id text NOT NULL REFERENCES governance_customer_identities(id),version text NOT NULL,
 created bigint NOT NULL,touched bigint NOT NULL,expires bigint,session_id text,
 credential text,claim_owner text,claim_expires bigint,
 CHECK((expires IS NULL)=(session_id IS NULL)),
 CHECK((claim_owner IS NULL)=(claim_expires IS NULL)));
CREATE INDEX governance_customer_sessions_user ON governance_customer_sessions(user_id);
CREATE TABLE governance_customer_auth_flows(
 state_hash text PRIMARY KEY CHECK(state_hash ~ '^[a-f0-9]{64}$'),browser_hash text NOT NULL CHECK(browser_hash ~ '^[a-f0-9]{64}$'),verifier text NOT NULL,expires bigint NOT NULL,previous_hash text);
ALTER TABLE governance_customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_auth_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_auth_flows FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_session ON governance_customer_sessions USING(
 hash=current_setting('governance.session_hash',true) OR user_id=current_setting('governance.customer_actor',true))
 WITH CHECK(hash=current_setting('governance.session_hash',true) AND user_id=current_setting('governance.customer_actor',true));
CREATE POLICY customer_auth_flow ON governance_customer_auth_flows USING(
 current_setting('governance.flow_capacity',true)='true'
 OR (state_hash=current_setting('governance.flow_state',true) AND browser_hash=current_setting('governance.flow_browser',true)))
 WITH CHECK(state_hash=current_setting('governance.flow_state',true) AND browser_hash=current_setting('governance.flow_browser',true));
