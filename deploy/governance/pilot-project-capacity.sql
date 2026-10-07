-- Run as the hosted test database administrator while public sign-up is closed.
-- The installer supplies :current_projects from the privileged project catalog.
BEGIN;
SET LOCAL ROLE governance_migrations;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF (SELECT name FROM public.governance_environment WHERE singleton) <> 'test' THEN
    RAISE EXCEPTION 'Pilot capacity requires test database';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.governance_pilot_project_capacity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  used integer NOT NULL CHECK (used >= 0),
  max_projects integer NOT NULL CHECK (max_projects BETWEEN 2 AND 30)
);
REVOKE ALL ON public.governance_pilot_project_capacity FROM PUBLIC;
GRANT SELECT ON public.governance_pilot_project_capacity TO governance_api;
INSERT INTO public.governance_pilot_project_capacity(singleton,used,max_projects)
VALUES (true,:current_projects,5)
ON CONFLICT (singleton) DO UPDATE SET used=EXCLUDED.used,
  max_projects=EXCLUDED.max_projects;
CREATE OR REPLACE FUNCTION public.governance_pilot_project_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.governance_pilot_project_capacity
       SET used=used+1 WHERE singleton AND used < max_projects;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pilot project capacity reached' USING ERRCODE='P0001';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.governance_pilot_project_capacity
       SET used=used-1 WHERE singleton AND used > 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pilot project capacity counter invalid' USING ERRCODE='P0001';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.governance_pilot_project_limit() FROM PUBLIC;
DROP TRIGGER IF EXISTS governance_pilot_project_limit ON public.governance_customer_projects;
CREATE TRIGGER governance_pilot_project_limit
BEFORE INSERT OR DELETE ON public.governance_customer_projects
FOR EACH ROW EXECUTE FUNCTION public.governance_pilot_project_limit();
COMMIT;
