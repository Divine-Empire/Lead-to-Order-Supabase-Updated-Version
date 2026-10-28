-- =====================================================================
-- 25_enquiry_views_rename_assign_to_person.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- enquiry_pending_view and enquiry_history_view exposed lto_enquiries'
-- enquiry_assign_to_person under the name enquiry_assign_to_project, but
-- EnquiryTracker.jsx reads row.enquiry_assign_to_person. So the Edit modal's
-- "Enquiry Assign to Person" always opened blank, and saving wrote that
-- blank back over the real value in lto_enquiries.
--
-- ALTER VIEW ... RENAME COLUMN renames in place: the view definition, its
-- grants and everything else stay as they are. Nothing in the repo or in
-- other views/functions reads the old name (checked); the Google-Sheet
-- views (enquiry_to_order_sheet_view / lead_to_order_sheet_view) use their
-- own "Enquiry Assign to Project" header and are NOT touched.
-- Pending LEADS still return NULL for this column (unchanged).
-- =====================================================================

BEGIN;

ALTER VIEW public.enquiry_pending_view RENAME COLUMN enquiry_assign_to_project TO enquiry_assign_to_person;
ALTER VIEW public.enquiry_history_view RENAME COLUMN enquiry_assign_to_project TO enquiry_assign_to_person;

COMMIT;
