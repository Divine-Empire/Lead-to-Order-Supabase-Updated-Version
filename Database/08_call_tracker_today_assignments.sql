-- =====================================================================
-- 08_call_tracker_today_assignments.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf).
--
-- Feature: admin-only bulk "assign pending leads for today" on the Call
-- Tracker Pending tab. A lead is always assigned to ITS OWN existing
-- assigned_to/sc_name (no SC-picker, no cross-SC reassignment) -- so no
-- RBAC change is needed anywhere, this is purely a same-day overlay tag.
--
-- No history is kept: the whole table is truncated every night via
-- pg_cron, so a row existing in this table always means "assigned for
-- today" by definition -- no assigned_date column needed.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lto_call_tracker_today_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL UNIQUE REFERENCES public.lto_leads(id) ON DELETE CASCADE,
  assigned_to text NOT NULL,
  assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lto_call_tracker_today_assignments TO anon, authenticated;

-- Nightly auto-clear so every day starts fresh. DB server runs in UTC;
-- business day boundary is IST (UTC+5:30), so 00:00 IST = 18:30 UTC the
-- previous day.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'clear-today-assignments';

SELECT cron.schedule(
  'clear-today-assignments',
  '30 18 * * *',
  'TRUNCATE TABLE public.lto_call_tracker_today_assignments'
);
