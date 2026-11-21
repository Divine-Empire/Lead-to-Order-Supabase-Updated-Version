-- =====================================================================
-- 36_fos_weekly_plans.sql
--
-- Field Sales Person weekly visit plan ("Weekly Plan" stage).
--
--   One plan = one person x one week (Monday..Saturday).
--   lto_fos_weekly_plans   the plan (person, financial year, week no., Monday)
--   lto_fos_plan_days      Location for each day
--   lto_fos_plan_meetings  the day's meetings (any number): category, client,
--                          NOB/NOP, visit objective
--
-- Financial year runs 1 April - 31 March. Week 1 is the week (Mon-Sat) whose
-- Saturday is the first Saturday on or after 1 April, so 16-21 Nov 2026 is
-- Week 34 of FY 2026-27 (Week 1 = 30 Mar - 4 Apr 2026). The week number and FY
-- label are computed by the app and stored with the plan.
--
--   lto_fos_plan_save(...)  create / replace a person's plan for a week (one transaction)
--   lto_fos_plan_get(p_names, p_weeks) -> jsonb   plans with their days and meetings
--                           (p_names NULL = everyone)
--   lto_fos_plan_people()   names that have at least one plan
--
-- Visit Objective choices live in lto_dropdown (category fos_visit_objective),
-- managed in Master Data > Dropdowns. NOB/NOP uses the existing
-- fos_nature_of_business category.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lto_fos_weekly_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fos_name    text        NOT NULL,
  fy_label    text        NOT NULL,
  week_no     integer     NOT NULL,
  week_start  date        NOT NULL,
  created_by  text,
  updated_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lto_fos_weekly_plans_monday CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);
-- one plan per person per week (name compared upper-case, extra spaces ignored)
CREATE UNIQUE INDEX IF NOT EXISTS lto_fos_weekly_plans_person_week
  ON public.lto_fos_weekly_plans (public.lto_fos_norm(fos_name), week_start);
CREATE INDEX IF NOT EXISTS lto_fos_weekly_plans_week ON public.lto_fos_weekly_plans (week_start);
CREATE INDEX IF NOT EXISTS lto_fos_weekly_plans_fy   ON public.lto_fos_weekly_plans (fy_label);

CREATE TABLE IF NOT EXISTS public.lto_fos_plan_days (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    uuid NOT NULL REFERENCES public.lto_fos_weekly_plans (id) ON DELETE CASCADE,
  plan_date  date NOT NULL,
  location   text,
  UNIQUE (plan_id, plan_date)
);

CREATE TABLE IF NOT EXISTS public.lto_fos_plan_meetings (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid    NOT NULL REFERENCES public.lto_fos_weekly_plans (id) ON DELETE CASCADE,
  plan_date        date    NOT NULL,
  sort_order       integer NOT NULL DEFAULT 0,
  meeting_type     text    NOT NULL,
  client_name      text,
  client_id        uuid,
  nob_nop          text,
  visit_objective  text,
  CONSTRAINT lto_fos_plan_meetings_type CHECK (meeting_type IN ('Existing', 'MDO / Important Projects', 'Self Identified', 'Referral'))
);
CREATE INDEX IF NOT EXISTS lto_fos_plan_meetings_plan ON public.lto_fos_plan_meetings (plan_id, plan_date, sort_order);

-- Same access model as the other lto_* tables (the app scopes by person).
ALTER TABLE public.lto_fos_weekly_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lto_fos_plan_days     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lto_fos_plan_meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_anon_authenticated ON public.lto_fos_weekly_plans;
DROP POLICY IF EXISTS allow_all_anon_authenticated ON public.lto_fos_plan_days;
DROP POLICY IF EXISTS allow_all_anon_authenticated ON public.lto_fos_plan_meetings;
CREATE POLICY allow_all_anon_authenticated ON public.lto_fos_weekly_plans  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_all_anon_authenticated ON public.lto_fos_plan_days     TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_all_anon_authenticated ON public.lto_fos_plan_meetings TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lto_fos_weekly_plans, public.lto_fos_plan_days, public.lto_fos_plan_meetings TO anon, authenticated;

-- ---------------------------------------------------------------------
-- Save: replaces the person's plan for that week (days + meetings) atomically.
--   p_days      [ { plan_date, location } ]
--   p_meetings  [ { plan_date, meeting_type, client_name, client_id, nob_nop, visit_objective } ]
--               (array order = order within the day)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lto_fos_plan_save(
  p_fos_name   text,
  p_week_start date,
  p_fy_label   text,
  p_week_no    integer,
  p_user       text,
  p_days       jsonb,
  p_meetings   jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF btrim(coalesce(p_fos_name, '')) = '' THEN
    RAISE EXCEPTION 'PERSON_REQUIRED';
  END IF;
  IF EXTRACT(ISODOW FROM p_week_start) <> 1 THEN
    RAISE EXCEPTION 'WEEK_START_NOT_MONDAY';
  END IF;

  INSERT INTO lto_fos_weekly_plans AS p (fos_name, fy_label, week_no, week_start, created_by, updated_by)
  VALUES (btrim(p_fos_name), p_fy_label, p_week_no, p_week_start, p_user, p_user)
  ON CONFLICT (lto_fos_norm(fos_name), week_start)
  DO UPDATE SET fy_label = EXCLUDED.fy_label, week_no = EXCLUDED.week_no,
                updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING p.id INTO v_id;

  DELETE FROM lto_fos_plan_days     WHERE plan_id = v_id;
  DELETE FROM lto_fos_plan_meetings WHERE plan_id = v_id;

  INSERT INTO lto_fos_plan_days (plan_id, plan_date, location)
  SELECT v_id, d.plan_date, NULLIF(btrim(d.location), '')
    FROM jsonb_to_recordset(COALESCE(p_days, '[]'::jsonb)) AS d(plan_date date, location text)
   WHERE d.plan_date BETWEEN p_week_start AND p_week_start + 5
     AND NULLIF(btrim(d.location), '') IS NOT NULL;

  INSERT INTO lto_fos_plan_meetings (plan_id, plan_date, sort_order, meeting_type, client_name, client_id, nob_nop, visit_objective)
  SELECT v_id, m.plan_date, (e.ord)::integer, m.meeting_type, NULLIF(btrim(m.client_name), ''), m.client_id,
         NULLIF(btrim(m.nob_nop), ''), NULLIF(btrim(m.visit_objective), '')
    FROM jsonb_array_elements(COALESCE(p_meetings, '[]'::jsonb)) WITH ORDINALITY AS e(obj, ord)
   CROSS JOIN LATERAL jsonb_to_record(e.obj)
         AS m(plan_date date, meeting_type text, client_name text, client_id uuid, nob_nop text, visit_objective text)
   WHERE m.plan_date BETWEEN p_week_start AND p_week_start + 5;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.lto_fos_plan_get(p_names text[], p_weeks date[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'fos_name', p.fos_name, 'week_start', p.week_start, 'week_no', p.week_no,
           'fy_label', p.fy_label, 'updated_by', p.updated_by, 'updated_at', p.updated_at,
           'days', COALESCE((SELECT jsonb_agg(jsonb_build_object('plan_date', d.plan_date, 'location', d.location) ORDER BY d.plan_date)
                               FROM lto_fos_plan_days d WHERE d.plan_id = p.id), '[]'::jsonb),
           'meetings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                   'plan_date', m.plan_date, 'meeting_type', m.meeting_type, 'client_name', m.client_name,
                                   'client_id', m.client_id, 'nob_nop', m.nob_nop, 'visit_objective', m.visit_objective)
                                 ORDER BY m.plan_date, m.sort_order)
                                  FROM lto_fos_plan_meetings m WHERE m.plan_id = p.id), '[]'::jsonb)
         ) ORDER BY p.fos_name, p.week_start), '[]'::jsonb)
    FROM lto_fos_weekly_plans p
   WHERE p.week_start = ANY (p_weeks)
     AND (p_names IS NULL OR lto_fos_norm(p.fos_name) = ANY (SELECT lto_fos_norm(n) FROM unnest(p_names) n));
$$;

CREATE OR REPLACE FUNCTION public.lto_fos_plan_people()
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(n ORDER BY n), ARRAY[]::text[])
    FROM (SELECT DISTINCT lto_fos_norm(fos_name) AS n FROM lto_fos_weekly_plans) d;
$$;

GRANT EXECUTE ON FUNCTION public.lto_fos_plan_save(text, date, text, integer, text, jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lto_fos_plan_get(text[], date[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lto_fos_plan_people() TO anon, authenticated;

-- Starting Visit Objective choices (editable in Master Data > Dropdowns)
INSERT INTO public.lto_dropdown (category, value)
SELECT 'fos_visit_objective', v
  FROM unnest(ARRAY['New Enquiry', 'Follow-up', 'Lab', 'TS', 'Drilling']) AS v
 WHERE NOT EXISTS (SELECT 1 FROM public.lto_dropdown d WHERE d.category = 'fos_visit_objective' AND d.value = v);

COMMIT;
