-- =====================================================================
-- 35_fos_enquiries.sql
--
-- "FOS Enquiries" stage: the open leads / enquiries a person was put on as
-- Enquiry Receiver or Enquiry Assigned Person, newest first.
--
--   login.fos_alternate_access   text[]   extra names a user (e.g. a HOD) may
--                                         see in FOS Enquiries, set in Settings.
--                                         Only this stage reads it; the older
--                                         login.alternate_access is untouched.
--
--   lto_fos_enquiries(p_names, p_search, p_limit, p_offset) -> jsonb
--       { total, rows: [ ... ] }
--       p_names NULL = everyone (admin). Otherwise a record is returned when
--       its receiver name, or any name in its assigned-person list, equals one
--       of p_names (upper-case, extra spaces ignored).
--       "Open" is enquiry_pending_view (same rule as Enquiry Tracker > Pending).
--       p_search also matches the receiver name and assigned-person names.
--       Newest first by the lead's / enquiry's own created_at.
--       Per row: latest quotation (number, value without tax, copy link) and
--       the latest Enquiry Tracker follow-up (date, remark); only the page's
--       rows are enriched.
--
--   lto_fos_person_names() -> text[]
--       Every name that appears as receiver / assigned person on any
--       enquiry or lead (for the Settings picker).
-- =====================================================================

BEGIN;

ALTER TABLE public.login ADD COLUMN IF NOT EXISTS fos_alternate_access text[];

CREATE OR REPLACE FUNCTION public.lto_fos_norm(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT upper(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')) $$;

CREATE OR REPLACE FUNCTION public.lto_fos_enquiries(
  p_names  text[],
  p_search text DEFAULT NULL,
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_names  text[];
  v_like   text;
  v_total  bigint;
  v_rows   jsonb;
BEGIN
  IF p_names IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT lto_fos_norm(n)) FILTER (WHERE lto_fos_norm(n) <> ''), ARRAY[]::text[])
      INTO v_names FROM unnest(p_names) n;
  END IF;
  v_like := CASE WHEN btrim(coalesce(p_search, '')) = '' THEN NULL
                 ELSE '%' || replace(replace(replace(lower(btrim(p_search)), '\', '\\'), '%', '\%'), '_', '\_') || '%' END;

  -- The pending view is the expensive part: read it once, count and page from that.
  CREATE TEMP TABLE _fos_base ON COMMIT DROP AS
    SELECT v.source_type, v.record_id, v.display_no, v.company_name, v.phone_number, v.lead_source,
           v.enquiry_receiver_name, v.enquiry_assign_to_person,
           COALESCE(e.created_at, l.created_at, v.created_at) AS created_ts
      FROM enquiry_pending_view v
      LEFT JOIN lto_enquiries e ON v.source_type = 'enquiry' AND e.id = v.record_id
      LEFT JOIN lto_leads     l ON v.source_type = 'lead'    AND l.id = v.record_id
     WHERE (v_names IS NULL
            OR lto_fos_norm(v.enquiry_receiver_name) = ANY (v_names)
            OR EXISTS (SELECT 1 FROM unnest(v.enquiry_assign_to_person) a WHERE lto_fos_norm(a) = ANY (v_names)))
       AND (v_like IS NULL
            OR v.search_text LIKE v_like
            OR lower(v.enquiry_receiver_name) LIKE v_like
            OR EXISTS (SELECT 1 FROM unnest(v.enquiry_assign_to_person) a WHERE lower(a) LIKE v_like));

  SELECT count(*) INTO v_total FROM _fos_base;

  WITH base AS (
    SELECT * FROM _fos_base
     ORDER BY created_ts DESC, record_id
     LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'source_type', b.source_type,
           'record_id', b.record_id,
           'display_no', b.display_no,
           'created_at', b.created_ts,
           'lead_source', b.lead_source,
           'company_name', b.company_name,
           'phone_number', b.phone_number,
           'receiver', b.enquiry_receiver_name,
           'assigned', b.enquiry_assign_to_person,
           'quotation_number', q.quotation_number,
           'quotation_value', q.value_without_tax,
           'quotation_copy', COALESCE(NULLIF(mq.pdf_url, ''), NULLIF(q.upload, '')),
           'last_followup_at', f.created_at,
           'last_followup_remark', f.remark
         ) ORDER BY b.created_ts DESC, b.record_id), '[]'::jsonb)
    INTO v_rows
    FROM base b
    LEFT JOIN LATERAL (
      SELECT x.quotation_number, x.quotation_value_without_tax AS value_without_tax, x.quotation_upload AS upload
        FROM (
          SELECT t.quotation_number, t.quotation_value_without_tax, t.quotation_upload, t.created_at
            FROM lto_enquiry_tracker t
           WHERE b.source_type = 'enquiry' AND t.enquiry_id = b.record_id
             AND t.quotation_number IS NOT NULL AND t.quotation_number <> ''
          UNION ALL
          SELECT t.quotation_number, t.quotation_value_without_tax, t.quotation_upload, t.created_at
            FROM lto_enquiry_tracker_for_leads t
           WHERE b.source_type = 'lead' AND t.lead_id = b.record_id
             AND t.quotation_number IS NOT NULL AND t.quotation_number <> ''
        ) x
       ORDER BY x.created_at DESC
       LIMIT 1
    ) q ON true
    LEFT JOIN LATERAL (
      SELECT m.pdf_url FROM lto_make_quotations m
       WHERE q.quotation_number IS NOT NULL AND m.quotation_no = q.quotation_number
       LIMIT 1
    ) mq ON true
    LEFT JOIN LATERAL (
      SELECT x.created_at, x.remark
        FROM (
          SELECT t.created_at, COALESCE(NULLIF(t.remark, ''), NULLIF(t.what_did_customer_say, ''), NULLIF(t.customer_feedback, '')) AS remark
            FROM lto_enquiry_tracker t
           WHERE b.source_type = 'enquiry' AND t.enquiry_id = b.record_id
          UNION ALL
          SELECT t.created_at, COALESCE(NULLIF(t.remark, ''), NULLIF(t.what_did_customer_say, ''))
            FROM lto_enquiry_tracker_for_leads t
           WHERE b.source_type = 'lead' AND t.lead_id = b.record_id
        ) x
       ORDER BY x.created_at DESC
       LIMIT 1
    ) f ON true;

  DROP TABLE IF EXISTS _fos_base;
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.lto_fos_person_names()
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(n ORDER BY n), ARRAY[]::text[])
    FROM (
      SELECT DISTINCT lto_fos_norm(x) AS n
        FROM (
          SELECT enquiry_receiver_name AS x FROM lto_enquiries
          UNION ALL SELECT unnest(enquiry_assign_to_person) FROM lto_enquiries
          UNION ALL SELECT lead_receiver_name FROM lto_leads
          UNION ALL SELECT unnest(enquiry_assign_to_person) FROM lto_call_tracker_for_leads
        ) s
       WHERE lto_fos_norm(x) <> ''
    ) d;
$$;

GRANT EXECUTE ON FUNCTION public.lto_fos_norm(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lto_fos_enquiries(text[], text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lto_fos_person_names() TO anon, authenticated;

COMMIT;
