-- Two reusable windows per verified customer, independent of workspace selection.
CREATE TABLE governance_customer_request_limits(
 actor text NOT NULL REFERENCES governance_customer_identities(id),
 bucket text NOT NULL CHECK(bucket IN('read','write')),
 window_start bigint NOT NULL CHECK(window_start>=0),
 requests integer NOT NULL CHECK(requests>=1),
 quota integer NOT NULL CHECK(quota BETWEEN 1 AND 1000000),
 PRIMARY KEY(actor,bucket));
ALTER TABLE governance_customer_request_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_customer_request_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_request_scope ON governance_customer_request_limits
 USING(actor=current_setting('governance.customer_actor',true))
 WITH CHECK(actor=current_setting('governance.customer_actor',true));
REVOKE ALL ON governance_customer_request_limits FROM PUBLIC;
