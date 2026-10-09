-- =====================================================================
-- 03_client_master_newly_converted_status.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf).
--
-- New "Status" column for Client Master: is_newly_converted flags a client
-- whose MOST RECENT order conversion has had no follow-up lead/enquiry
-- created since. already_in_tracker alone can't answer this -- it's
-- overwritten to "Order Received (En-X)" on every conversion regardless of
-- whether this is the client's 1st or 5th order, so there's no way to tell
-- "just converted, never re-engaged" from "converts regularly" just by
-- reading that string.
--
-- Set to TRUE every time syncClientOnOrderConversion runs (src/utils/
-- orderConversionClientSync.js) -- i.e. on every order conversion, not just
-- the first. Set back to FALSE the moment a new lead or enquiry is created
-- for that company (DirectEnquiryForm.jsx, Leads.jsx single-lead path, and
-- Leads.jsx bulk import), regardless of what that new lead/enquiry's own
-- status later becomes -- matching "dusri baar lead/enquiry open ho ya
-- closed ho, 'new' tag hat jayega".
-- =====================================================================

ALTER TABLE public.lto_client_master
  ADD COLUMN IF NOT EXISTS is_newly_converted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lto_client_master_is_newly_converted
  ON public.lto_client_master (is_newly_converted);
