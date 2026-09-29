CREATE TABLE governance_provider_revocations(client_id text NOT NULL,session_id text NOT NULL,subject text NOT NULL,received bigint NOT NULL,PRIMARY KEY(client_id,session_id));
CREATE TABLE governance_identity_events(client_id text NOT NULL,event_id text NOT NULL,digest text NOT NULL,received bigint NOT NULL,PRIMARY KEY(client_id,event_id));
ALTER TABLE governance_provider_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_provider_revocations FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_identity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_identity_events FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_revocation ON governance_provider_revocations USING(client_id=current_setting('governance.revocation_client',true) AND session_id=current_setting('governance.revocation_session',true)) WITH CHECK(client_id=current_setting('governance.revocation_client',true) AND session_id=current_setting('governance.revocation_session',true));
CREATE POLICY identity_event ON governance_identity_events USING(client_id=current_setting('governance.revocation_client',true) AND event_id=current_setting('governance.revocation_event',true)) WITH CHECK(client_id=current_setting('governance.revocation_client',true) AND event_id=current_setting('governance.revocation_event',true));
CREATE POLICY revoked_session ON governance_customer_sessions FOR DELETE USING(
 session_id=current_setting('governance.revocation_session',true)
 AND EXISTS(SELECT 1 FROM governance_customer_identities i WHERE i.id=user_id AND i.provider='workos:'||current_setting('governance.revocation_client',true) AND i.subject=current_setting('governance.identity_subject',true)));
CREATE POLICY revoked_session_read ON governance_customer_sessions FOR SELECT USING(
 session_id=current_setting('governance.revocation_session',true)
 AND EXISTS(SELECT 1 FROM governance_customer_identities i WHERE i.id=user_id AND i.provider='workos:'||current_setting('governance.revocation_client',true) AND i.subject=current_setting('governance.identity_subject',true)));
