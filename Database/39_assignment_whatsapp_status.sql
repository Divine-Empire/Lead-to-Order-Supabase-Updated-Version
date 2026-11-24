-- =====================================================================
-- 39_assignment_whatsapp_status.sql
--
-- WhatsApp audit for field-person assignments, kept on the assignment row
-- itself (no separate log table). Written by the
-- send-field-assignment-whatsapp Edge Function.
--
--   wa_status    'sent' (every person reached) | 'partial' | 'failed' | NULL (not tried)
--   wa_sent_at   when Meta last accepted a message for this assignment
--   wa_error     last error text (for failed / partial)
--   wa_results   one entry per person, newest attempt:
--                [ { person, phone, status: 'sent'|'failed', wamid, at, error } ]
-- =====================================================================
BEGIN;
ALTER TABLE public.lto_assigned_to_field_person
  ADD COLUMN IF NOT EXISTS wa_status  text,
  ADD COLUMN IF NOT EXISTS wa_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_error   text,
  ADD COLUMN IF NOT EXISTS wa_results jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.lto_assigned_to_field_person DROP CONSTRAINT IF EXISTS lto_assigned_fp_wa_status_check;
ALTER TABLE public.lto_assigned_to_field_person
  ADD CONSTRAINT lto_assigned_fp_wa_status_check CHECK (wa_status IS NULL OR wa_status IN ('sent', 'partial', 'failed'));
COMMIT;
