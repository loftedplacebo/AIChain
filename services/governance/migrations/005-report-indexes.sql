-- Stored projections allow indexed joins under RLS without marking JSON
-- extraction functions leakproof or weakening tenant policies.
ALTER TABLE governance_events
 ADD COLUMN event_kind text GENERATED ALWAYS AS (body->>'eventType') STORED,
 ADD COLUMN outcome_ref text GENERATED ALWAYS AS (body->'outcome'->>'forEventId') STORED,
 ADD COLUMN review_parent text GENERATED ALWAYS AS (body->'parentEventRefs'->>0) STORED,
 ADD COLUMN review_integration text GENERATED ALWAYS AS (body->'source'->>'integrationVersion') STORED;
CREATE INDEX governance_event_kind_time ON governance_events(tenant,project,event_kind,occurred,id);
CREATE INDEX governance_outcome_ref ON governance_events(tenant,project,outcome_ref);
CREATE INDEX governance_review_parent ON governance_events(tenant,project,review_integration,review_parent);
