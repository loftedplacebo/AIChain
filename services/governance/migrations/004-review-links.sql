CREATE INDEX governance_outcome_links ON governance_events(tenant,project,(body->'outcome'->>'forEventId'));
CREATE INDEX governance_review_links ON governance_events(tenant,project,(body->'source'->>'integrationVersion'),(body->'parentEventRefs'->>0));
