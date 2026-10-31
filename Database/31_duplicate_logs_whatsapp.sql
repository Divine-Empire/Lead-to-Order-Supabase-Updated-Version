-- =====================================================================
-- 31_duplicate_logs_whatsapp.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- Adds wa_notified_at column to lto_duplicate_enquiry_logs to track
-- WhatsApp notifications sent to Master > WhatsApp Recipients (Admins)
-- via the send-duplicate-entry-notification Edge Function.
-- =====================================================================

BEGIN;

ALTER TABLE public.lto_duplicate_enquiry_logs
  ADD COLUMN IF NOT EXISTS wa_notified_at timestamptz;

COMMIT;

