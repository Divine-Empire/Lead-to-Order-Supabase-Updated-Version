-- =====================================================================
-- 42_login_contact_details.sql
--
-- Phase 1 of the centralised contacts / notifications work: the existing
-- LTO "login" table doubles as the employee list. Adds the contact data the
-- notification rules need, plus can_login so people who only receive
-- WhatsApp / mail (field persons, report recipients ...) can live in the same
-- list without being able to sign in.
--
--   whatsapp_number  10-digit Indian mobile (the edge functions prefix 91)
--   email            plain address
--   position         free label used by notification rules ("Sales Head" ...)
--   department       optional
--   can_login        false = contact only; the app refuses to sign them in
--
-- Only public.login is touched (never Service-Support's sss_login_users).
-- Existing users keep can_login = true, so nothing changes for them.
-- =====================================================================
BEGIN;

ALTER TABLE public.login ADD COLUMN IF NOT EXISTS whatsapp_number text;
ALTER TABLE public.login ADD COLUMN IF NOT EXISTS email           text;
ALTER TABLE public.login ADD COLUMN IF NOT EXISTS position        text;
ALTER TABLE public.login ADD COLUMN IF NOT EXISTS department      text;
ALTER TABLE public.login ADD COLUMN IF NOT EXISTS can_login       boolean NOT NULL DEFAULT true;

ALTER TABLE public.login DROP CONSTRAINT IF EXISTS login_whatsapp_number_chk;
ALTER TABLE public.login ADD CONSTRAINT login_whatsapp_number_chk
  CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^[6-9][0-9]{9}$');

ALTER TABLE public.login DROP CONSTRAINT IF EXISTS login_email_chk;
ALTER TABLE public.login ADD CONSTRAINT login_email_chk
  CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

COMMIT;
