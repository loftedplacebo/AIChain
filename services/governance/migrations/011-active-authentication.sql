ALTER TABLE governance_customer_sessions ADD COLUMN authenticated_at bigint;
ALTER TABLE governance_customer_auth_flows ADD COLUMN reauth_user_id text REFERENCES governance_customer_identities(id);
