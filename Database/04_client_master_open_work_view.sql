-- =====================================================================
-- 04_client_master_open_work_view.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf).
--
-- Client Master's 3 tabs:
--   Converted   -- client_code IS NOT NULL (an order was received at least
--                  once, or the row was imported with a code already set)
--   Unconverted -- no client_code, but a genuinely OPEN lead/enquiry exists
--                  (still being worked)
--   New         -- no client_code, and nothing currently open -- safe to
--                  re-contact later without stepping on an active enquiry
--
-- "Open" uses the exact same rule as the sidebar's own pending counts
-- (src/utils/pendingStatus.js): an enquiry with planned_at set and no
-- tracker row that ever recorded is_order_received_status, or a lead with a
-- Call-Tracker row (planned_at set) and no Enquiry-Tracker-for-leads row
-- that ever recorded is_order_received_status.
--
-- This is exposed as a VIEW (not a stored column) so it's always live --
-- no trigger needs to recompute it as enquiries/leads/tracker rows change
-- elsewhere. ClientMaster.jsx reads from this view; every write (insert/
-- update/delete) still goes straight to lto_client_master as before.
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_lto_enquiries_company_name_lower
  ON public.lto_enquiries (lower(company_name));
CREATE INDEX IF NOT EXISTS idx_lto_leads_company_name_lower
  ON public.lto_leads (lower(company_name));

CREATE OR REPLACE VIEW public.lto_client_master_with_status AS
SELECT
  cm.*,
  (oe.has_open IS NOT NULL OR ol.has_open IS NOT NULL) AS has_open_work
FROM public.lto_client_master cm
LEFT JOIN LATERAL (
  SELECT true AS has_open
  FROM public.lto_enquiries e
  WHERE lower(e.company_name) = lower(cm.company_name)
    AND e.planned_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lto_enquiry_tracker t
       WHERE t.enquiry_id = e.id
         AND t.is_order_received_status IN ('yes', 'no')
    )
  LIMIT 1
) oe ON true
LEFT JOIN LATERAL (
  SELECT true AS has_open
  FROM public.lto_leads l
  JOIN public.lto_call_tracker_for_leads ct
    ON ct.lead_id = l.id AND ct.planned_at IS NOT NULL
  WHERE lower(l.company_name) = lower(cm.company_name)
    AND NOT EXISTS (
      SELECT 1 FROM public.lto_enquiry_tracker_for_leads t2
       WHERE t2.lead_id = l.id
         AND t2.is_order_received_status IN ('yes', 'no')
    )
  LIMIT 1
) ol ON true;

GRANT SELECT ON public.lto_client_master_with_status TO anon, authenticated;
