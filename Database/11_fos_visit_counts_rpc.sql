-- =====================================================================
-- 11_fos_visit_counts_rpc.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- Reports > FOS Report: visit counts per sales person and visit type,
-- read from public.field_sales_form (previously read from a Google Sheet).
--
-- WHY AN RPC: field_sales_form has RLS enabled and no anon SELECT policy
-- (removed by Field-Sales-Report/supabase/migration_002_hardening.sql, on
-- purpose -- the table holds GPS coordinates and photo URLs). The Report
-- page runs as `anon`, so a plain SELECT would silently return 0 rows. This
-- SECURITY DEFINER function exposes ONLY (person, visit type, count) -- no
-- coordinates, photos or company data -- and nothing else changes.
--
-- Window is on created_at (form submit time), inclusive on both ends.
-- Person names are trimmed + upper-cased so "priya swarnkar " and
-- "PRIYA SWARNKAR" land in one bucket; visit_type is returned trimmed
-- (the frontend buckets New F2F / Existing F2F / MDO F2F case-insensitively).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fos_visit_counts(p_start timestamptz, p_end timestamptz)
RETURNS TABLE (person_name text, visit_type text, visit_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT upper(btrim(f.sales_person_name)) AS person_name,
           btrim(f.visit_type)               AS visit_type,
           count(*)::bigint                  AS visit_count
    FROM public.field_sales_form f
    WHERE f.created_at >= p_start
      AND f.created_at <= p_end
      AND btrim(coalesce(f.sales_person_name, '')) <> ''
    GROUP BY 1, 2
    ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.fos_visit_counts(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fos_visit_counts(timestamptz, timestamptz) TO anon, authenticated;
