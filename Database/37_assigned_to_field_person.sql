-- =====================================================================
-- 37_assigned_to_field_person.sql
--
-- Admin assigns an open enquiry / lead (Enquiry Tracker > Pending) to one or
-- more field persons for a visit. The assignment shows in Field Sales Logs >
-- "Assigned Enquiries" and on the visit calendar.
--
--   lto_assigned_to_field_person   one row per enquiry / lead (re-assigning
--                                  updates the same row)
--   lto_fos_assigned_list(...)     rows for a list of person names (NULL =
--                                  everyone), with search, date range, paging
--
-- Person names are the Consignor "reference_name" values; they are matched to
-- a logged-in user with lto_fos_norm() (upper-case, extra spaces ignored),
-- the same rule the FOS Enquiries stage uses.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lto_assigned_to_field_person (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     text        NOT NULL CHECK (source_type IN ('lead', 'enquiry')),
  record_id       uuid        NOT NULL,
  display_no      text,                       -- En-xxxxx / LD-xxxx
  assigned_to     text[]      NOT NULL,       -- field person names
  company_name    text,
  person_name     text,
  contact_number  text,
  address         text,
  nob             text,
  project_value   numeric,
  meeting_at      timestamp without time zone NOT NULL,   -- as picked by the admin (no timezone shift)
  client_type     text        CHECK (client_type IN ('NBD', 'Existing')),
  assigned_by     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lto_assigned_to_field_person_has_person CHECK (cardinality(assigned_to) > 0),
  CONSTRAINT lto_assigned_to_field_person_record UNIQUE (source_type, record_id)
);
CREATE INDEX IF NOT EXISTS lto_assigned_fp_meeting ON public.lto_assigned_to_field_person (meeting_at DESC);
CREATE INDEX IF NOT EXISTS lto_assigned_fp_people  ON public.lto_assigned_to_field_person USING gin (assigned_to);

ALTER TABLE public.lto_assigned_to_field_person ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_anon_authenticated ON public.lto_assigned_to_field_person;
CREATE POLICY allow_all_anon_authenticated ON public.lto_assigned_to_field_person
  TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lto_assigned_to_field_person TO anon, authenticated;

-- ---------------------------------------------------------------------
-- p_names   person names to restrict to (NULL = everyone)
-- p_search  matches company, person, number, enquiry/lead no, assigned names
-- p_from / p_to  meeting date range, inclusive (NULL = open)
-- returns { total, rows: [ ... ] } newest meeting first
-- ---------------------------------------------------------------------
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
       AND (p_from IS NULL OR a.meeting_at >= p_from)
       AND (p_to   IS NULL OR a.meeting_at <  p_to + 1)
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
