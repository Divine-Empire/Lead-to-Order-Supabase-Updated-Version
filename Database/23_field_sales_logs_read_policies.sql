-- =====================================================================
-- 23_field_sales_logs_read_policies.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- Field Sales Logs (sidebar stage) reads field_sales_form and its child
-- tables fos_contact_persons / fos_projects directly. The page runs as
-- `anon`, and these tables have RLS enabled with no SELECT policy
-- (Field-Sales-Report/supabase/migration_002_hardening.sql removed it), so
-- without these policies every read silently returns 0 rows.
--
-- SECURITY NOTE: this makes contact names + mobile numbers, GPS
-- coordinates and meeting-photo URLs readable with the public anon key.
-- Chosen on purpose. INSERT stays closed (submissions still go through the
-- submit_field_sales_report RPC); only SELECT is opened here.
-- Safe to re-run.
-- =====================================================================

DROP POLICY IF EXISTS "Allow anon select on field_sales_form" ON public.field_sales_form;
CREATE POLICY "Allow anon select on field_sales_form"
  ON public.field_sales_form FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon select on fos_contact_persons" ON public.fos_contact_persons;
CREATE POLICY "Allow anon select on fos_contact_persons"
  ON public.fos_contact_persons FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon select on fos_projects" ON public.fos_projects;
CREATE POLICY "Allow anon select on fos_projects"
  ON public.fos_projects FOR SELECT TO anon, authenticated USING (true);

-- Search is by serial_code / sales_person_name (ILIKE) and the list is
-- ordered by created_at DESC; form_id indexes already exist on the children.
CREATE INDEX IF NOT EXISTS idx_field_sales_visit_type ON public.field_sales_form(visit_type);
