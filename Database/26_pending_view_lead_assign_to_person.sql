-- =====================================================================
-- 26_pending_view_lead_assign_to_person.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- Enquiry Tracker > Pending > a LEAD: enquiry_pending_view returned NULL for
-- enquiry_assign_to_person, so the Edit modal could not pre-select the person
-- chosen in the Call Tracker. That value is submitted to
-- lto_call_tracker_for_leads.enquiry_assign_to_person (CallTrackerForm.jsx).
--
-- The lead half of the view now returns the lead's most recent non-blank
-- enquiry_assign_to_person from lto_call_tracker_for_leads (same rule
-- lead_to_order_sheet_view uses). Enquiry rows (the second half of the view)
-- keep reading lto_enquiries.enquiry_assign_to_person. Nothing else in the
-- view changes; options, grants and column order are preserved.
-- Uses idx_call_tracker_lead_id.
-- =====================================================================

BEGIN;

DO $do$
DECLARE
  def text := pg_get_viewdef('public.enquiry_pending_view'::regclass, true);
  patched text;
BEGIN
  patched := replace(def,
    '    NULL::text AS enquiry_assign_to_person,',
    '    ( SELECT c.enquiry_assign_to_person
           FROM lto_call_tracker_for_leads c
          WHERE c.lead_id = ct.lead_id
            AND btrim(COALESCE(c.enquiry_assign_to_person, '''')) <> ''''
          ORDER BY c.created_at DESC
         LIMIT 1) AS enquiry_assign_to_person,');
  IF patched = def THEN
    RAISE EXCEPTION 'enquiry_pending_view: NULL::text AS enquiry_assign_to_person not found, nothing patched';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.enquiry_pending_view AS ' || patched;
END
$do$;

COMMIT;
