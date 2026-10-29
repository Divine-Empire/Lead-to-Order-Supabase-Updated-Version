-- =====================================================================
-- 29_drop_old_sheet_webhooks.sql
--
-- ALREADY APPLIED to production (nfwtbrmqvsejwwvraanf). Kept as a record.
--
-- Removes the two old Google-Sheet Database Webhooks on the tables whose
-- enquiry_assign_to_person column became a text[] (27_...sql):
--   lto_call_tracker_for_leads."lead-to_order_4"
--   lto_enquiries.enquiry_to_order1
--
-- The lto_mis_* webhooks on the same tables are deliberately KEPT:
--   lto_call_tracker_for_leads.lto_mis_lead_call_tracker
--   lto_enquiries.lto_mis_enquiries
--
-- To bring one back, recreate it in Supabase Dashboard > Database > Webhooks
-- (the webhook URLs carry a secret, so they are not stored in the repo).
-- =====================================================================

BEGIN;

DROP TRIGGER IF EXISTS "lead-to_order_4" ON public.lto_call_tracker_for_leads;
DROP TRIGGER IF EXISTS enquiry_to_order1 ON public.lto_enquiries;

COMMIT;
