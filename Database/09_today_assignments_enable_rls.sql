-- =====================================================================
-- 09_today_assignments_enable_rls.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf).
--
-- Enables RLS on lto_call_tracker_today_assignments (per request).
--
-- IMPORTANT CAVEAT: this app does NOT use Supabase Auth -- login is a
-- custom `login` table, and every request (admin or SC) hits Postgres as
-- the same `anon` role via the public anon key. There is no `auth.uid()` or
-- JWT claim to scope a policy by, and no other table in this project uses
-- RLS (everything else relies on plain GRANTs, see every prior migration's
-- GRANT statements). So turning RLS on with no policy at all would silently
-- block ALL access (admin and SC alike) the moment it's enabled -- RLS
-- default-denies.
--
-- These policies are therefore permissive (`USING (true)`/`WITH CHECK
-- (true)`) for anon + authenticated -- functionally identical access to
-- what the plain GRANTs already allowed, just expressed as RLS so the table
-- shows "RLS enabled" (e.g. in Supabase's dashboard security advisor)
-- instead of "RLS disabled". This does NOT add any new access restriction;
-- real access control in this app is still entirely at the application
-- layer (isAdmin()/sc_name scoping in the frontend), same as every other
-- table/view here.
-- =====================================================================

ALTER TABLE public.lto_call_tracker_today_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "today_assignments_select" ON public.lto_call_tracker_today_assignments;
DROP POLICY IF EXISTS "today_assignments_insert" ON public.lto_call_tracker_today_assignments;
DROP POLICY IF EXISTS "today_assignments_update" ON public.lto_call_tracker_today_assignments;
DROP POLICY IF EXISTS "today_assignments_delete" ON public.lto_call_tracker_today_assignments;

CREATE POLICY "today_assignments_select" ON public.lto_call_tracker_today_assignments
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "today_assignments_insert" ON public.lto_call_tracker_today_assignments
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "today_assignments_update" ON public.lto_call_tracker_today_assignments
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "today_assignments_delete" ON public.lto_call_tracker_today_assignments
  FOR DELETE TO anon, authenticated USING (true);
