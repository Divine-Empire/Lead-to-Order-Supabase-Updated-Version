-- =====================================================================
-- 27_enquiry_assign_to_person_array.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- "Enquiry Assign to Person" becomes multi-select: the column is now a
-- text[] (one element per selected person) on
--   lto_enquiries.enquiry_assign_to_person
--   lto_call_tracker_for_leads.enquiry_assign_to_person
-- Existing single values become a one-element array; blank / NULL become
-- NULL.
--
-- Five views read this column, and Postgres will not change a column's type
-- while a view uses it, so they are dropped and recreated from their live
-- definitions with only the lines below changed (columns, order, grants
-- unchanged):
--   enquiry_pending_view      lead half: "latest non-blank" test is now
--                             cardinality(...) > 0 (column is text[])
--   enquiry_history_view      lead half: NULL::text -> NULL::text[]
--                             (UNION ALL needs the same type on both halves)
--   vw_enquiry_master         exposed as comma-joined text, as before
--   enquiry_to_order_sheet_view / lead_to_order_sheet_view
--                             the "Enquiry Assign to Project" Google-Sheet
--                             column is comma-joined text ("A, B")
-- enquiry_pending_view / enquiry_history_view return text[] to the app.
--
-- Google-Sheet webhook triggers on both tables are NOT touched here.
-- One transaction: any failure rolls everything back.
-- =====================================================================

BEGIN;

-- Replace exactly one occurrence, or fail loudly.
CREATE FUNCTION pg_temp.patch(def text, old text, new text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  n := (length(def) - length(replace(def, old, ''))) / length(old);
  IF n <> 1 THEN
    RAISE EXCEPTION 'view patch: expected exactly 1 occurrence of "%", found %', old, n;
  END IF;
  RETURN replace(def, old, new);
END
$$;

DO $do$
DECLARE
  d_pending text := pg_get_viewdef('public.enquiry_pending_view'::regclass, true);
  d_history text := pg_get_viewdef('public.enquiry_history_view'::regclass, true);
  d_master  text := pg_get_viewdef('public.vw_enquiry_master'::regclass, true);
  d_esheet  text := pg_get_viewdef('public.enquiry_to_order_sheet_view'::regclass, true);
  d_lsheet  text := pg_get_viewdef('public.lead_to_order_sheet_view'::regclass, true);
BEGIN
  d_pending := pg_temp.patch(d_pending,
    $$btrim(COALESCE(c.enquiry_assign_to_person, ''::text)) <> ''::text$$,
    $$cardinality(c.enquiry_assign_to_person) > 0$$);
  d_history := pg_temp.patch(d_history,
    $$    NULL::text AS enquiry_assign_to_person,$$,
    $$    NULL::text[] AS enquiry_assign_to_person,$$);
  d_master := pg_temp.patch(d_master,
    $$    e.enquiry_assign_to_person,$$,
    $$    array_to_string(e.enquiry_assign_to_person, ', ') AS enquiry_assign_to_person,$$);
  d_esheet := pg_temp.patch(d_esheet,
    $$e.enquiry_assign_to_person AS "Enquiry Assign to Project"$$,
    $$array_to_string(e.enquiry_assign_to_person, ', ') AS "Enquiry Assign to Project"$$);
  d_lsheet := pg_temp.patch(d_lsheet,
    $$(array_agg(c.enquiry_assign_to_person ORDER BY c.created_at DESC) FILTER (WHERE c.enquiry_assign_to_person IS NOT NULL))[1] AS enquiry_assign_to_person$$,
    $$(array_agg(array_to_string(c.enquiry_assign_to_person, ', ') ORDER BY c.created_at DESC) FILTER (WHERE cardinality(c.enquiry_assign_to_person) > 0))[1] AS enquiry_assign_to_person$$);

  DROP VIEW public.enquiry_pending_view;
  DROP VIEW public.enquiry_history_view;
  DROP VIEW public.vw_enquiry_master;
  DROP VIEW public.enquiry_to_order_sheet_view;
  DROP VIEW public.lead_to_order_sheet_view;

  ALTER TABLE public.lto_enquiries
    ALTER COLUMN enquiry_assign_to_person TYPE text[]
    USING CASE WHEN nullif(btrim(enquiry_assign_to_person), '') IS NULL
               THEN NULL ELSE ARRAY[btrim(enquiry_assign_to_person)] END;
  ALTER TABLE public.lto_call_tracker_for_leads
    ALTER COLUMN enquiry_assign_to_person TYPE text[]
    USING CASE WHEN nullif(btrim(enquiry_assign_to_person), '') IS NULL
               THEN NULL ELSE ARRAY[btrim(enquiry_assign_to_person)] END;

  EXECUTE 'CREATE VIEW public.enquiry_pending_view AS ' || d_pending;
  EXECUTE 'CREATE VIEW public.enquiry_history_view AS ' || d_history;
  EXECUTE 'CREATE VIEW public.vw_enquiry_master AS ' || d_master;
  EXECUTE 'CREATE VIEW public.enquiry_to_order_sheet_view AS ' || d_esheet;
  EXECUTE 'CREATE VIEW public.lead_to_order_sheet_view AS ' || d_lsheet;
END
$do$;

-- Grants exactly as they were before the drop.
GRANT ALL ON public.enquiry_pending_view, public.enquiry_history_view,
             public.vw_enquiry_master, public.enquiry_to_order_sheet_view
  TO anon, authenticated, service_role;
-- (new views get Supabase's default ALL for anon/authenticated; this one was
-- SELECT-only for them, so strip first)
REVOKE ALL ON public.lead_to_order_sheet_view FROM anon, authenticated;
GRANT ALL ON public.lead_to_order_sheet_view TO service_role;
GRANT SELECT ON public.lead_to_order_sheet_view TO anon, authenticated;

COMMIT;
