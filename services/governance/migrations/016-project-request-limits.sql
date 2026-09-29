CREATE TABLE governance_project_request_limits(
 tenant text NOT NULL, project text NOT NULL,
 bucket text NOT NULL CHECK(bucket IN('read','write')),
 window_start bigint NOT NULL CHECK(window_start>=0),
 requests bigint NOT NULL CHECK(requests>=1),
 quota integer NOT NULL CHECK(quota BETWEEN 1 AND 1000000),
 PRIMARY KEY(tenant,project,bucket));
ALTER TABLE governance_project_request_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_project_request_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY project_request_scope ON governance_project_request_limits
 USING(tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true))
 WITH CHECK(tenant=current_setting('governance.tenant',true) AND project=current_setting('governance.project',true));
