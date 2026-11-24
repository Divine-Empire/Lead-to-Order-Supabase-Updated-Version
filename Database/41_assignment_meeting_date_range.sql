-- =====================================================================
-- 41_assignment_meeting_date_range.sql
--
-- The visit window of an assignment is now a date range (From .. To) instead of
-- one date + time. meeting_at stays as the FROM date (midnight; older rows keep
-- their time), meeting_to is the TO date (same day = single-day visit).
-- lto_fos_assigned_list's date filter now means "the visit overlaps the range".
-- =====================================================================
BEGIN;

ALTER TABLE public.lto_assigned_to_field_person ADD COLUMN IF NOT EXISTS meeting_to date;
UPDATE public.lto_assigned_to_field_person SET meeting_to = meeting_at::date WHERE meeting_to IS NULL;
ALTER TABLE public.lto_assigned_to_field_person DROP CONSTRAINT IF EXISTS lto_assigned_fp_meeting_range;
ALTER TABLE public.lto_assigned_to_field_person
  ADD CONSTRAINT lto_assigned_fp_meeting_range CHECK (meeting_to IS NULL OR meeting_to >= meeting_at::date);

CREATE OR REPLACE FUNCTION public.lto_fos_assigned_list(
  p_names  text[],
  p_search text,
  p_from   date,
  p_to     date,
  p_limit  integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH f AS (
    SELECT a.*
      FROM lto_assigned_to_field_person a
     WHERE (p_names IS NULL OR EXISTS (
              SELECT 1 FROM unnest(a.assigned_to) n
               WHERE lto_fos_norm(n) = ANY (SELECT lto_fos_norm(x) FROM unnest(p_names) x)))
       AND (p_from IS NULL OR COALESCE(a.meeting_to, a.meeting_at::date) >= p_from)
       AND (p_to   IS NULL OR a.meeting_at::date <= p_to)
       AND (NULLIF(btrim(p_search), '') IS NULL OR
            lower(concat_ws(' ', a.display_no, a.company_name, a.person_name, a.contact_number,
                            a.address, a.nob, array_to_string(a.assigned_to, ' ')))
              LIKE '%' || lower(btrim(p_search)) || '%')
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.meeting_at DESC, r.created_at DESC)
        FROM (SELECT * FROM f ORDER BY meeting_at DESC, created_at DESC
               LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0)) r
    ), '[]'::jsonb));
$$;

GRANT EXECUTE ON FUNCTION public.lto_fos_assigned_list(text[], text, date, date, integer, integer) TO anon, authenticated;

COMMIT;
