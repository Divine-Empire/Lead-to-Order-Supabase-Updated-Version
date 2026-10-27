-- =====================================================================
-- 24_field_sales_visit_datetime_timestamptz.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- 1. field_sales_form.visit_datetime: TEXT ('DD/MM/YYYY HH24:MI:SS', the
--    device's local time as typed by Field-Sales-Report) -> timestamptz.
--    Existing rows are read as India time (Asia/Kolkata); checked against
--    created_at, which is 1.5-5.5 s after each visit_datetime.
-- 2. submit_field_sales_report keeps accepting the same text from the form
--    (the form app is NOT changed): it now parses it with
--    fos_parse_visit_datetime(). Without this the RPC would fail, because a
--    text expression cannot be inserted into a timestamptz column.
-- 3. field_sales_visit_types(): distinct visit types present in the records,
--    for the Field Sales Logs filter (PostgREST has no SELECT DISTINCT).
--
-- All in one transaction: any failure rolls everything back.
-- =====================================================================

BEGIN;

-- Text from the form -> timestamptz. Accepts 'DD/MM/YYYY HH24:MI[:SS]'
-- (read as India time) or any ISO-8601 timestamp; blank = now().
CREATE OR REPLACE FUNCTION public.fos_parse_visit_datetime(p text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN
    RETURN now();
  END IF;
  IF btrim(p) ~ '^\d{1,2}/\d{1,2}/\d{4} \d{1,2}:\d{2}:\d{2}$' THEN
    RETURN to_timestamp(btrim(p), 'DD/MM/YYYY HH24:MI:SS')::timestamp AT TIME ZONE 'Asia/Kolkata';
  END IF;
  IF btrim(p) ~ '^\d{1,2}/\d{1,2}/\d{4} \d{1,2}:\d{2}$' THEN
    RETURN to_timestamp(btrim(p), 'DD/MM/YYYY HH24:MI')::timestamp AT TIME ZONE 'Asia/Kolkata';
  END IF;
  RETURN btrim(p)::timestamptz;
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'Invalid visit_datetime: %', p;
END;
$$;

ALTER TABLE public.field_sales_form
  ALTER COLUMN visit_datetime TYPE timestamptz
  USING public.fos_parse_visit_datetime(visit_datetime);

-- Re-point the submit RPC at the parser (everything else is unchanged).
DO $do$
DECLARE
  def text := pg_get_functiondef('public.submit_field_sales_report(jsonb,jsonb,jsonb)'::regprocedure);
  patched text;
BEGIN
  patched := replace(def,
    $$    form_payload->>'visit_datetime',$$,
    $$    public.fos_parse_visit_datetime(form_payload->>'visit_datetime'),$$);
  IF patched = def THEN
    RAISE EXCEPTION 'submit_field_sales_report: visit_datetime line not found, nothing patched';
  END IF;
  EXECUTE patched;
END
$do$;

CREATE OR REPLACE FUNCTION public.field_sales_visit_types()
RETURNS SETOF text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT btrim(visit_type)
  FROM public.field_sales_form
  WHERE btrim(coalesce(visit_type, '')) <> ''
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.field_sales_visit_types() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.field_sales_visit_types() TO anon, authenticated;

-- Date-range filter on created_at is covered by idx_field_sales_created_at.

COMMIT;
