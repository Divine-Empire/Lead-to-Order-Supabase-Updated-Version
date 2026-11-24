-- =====================================================================
-- 43_notification_rules.sql
--
-- Phase 2 of centralised contacts / notifications. Contacts live in public.login
-- (whatsapp_number, email, position -- see 42_*.sql). This adds:
--
--   lto_notification_events  what can be sent: channels, WhatsApp template + the
--                            ordered payload keys that fill {{1}}..{{n}}, email
--                            subject/body ({{key}} placeholders), and which payload
--                            fields rules may filter on.
--   lto_notification_rules   who gets an event: one login user OR everyone with a
--                            position, on whatsapp / email / both, optionally only
--                            when the payload matches `conditions`
--                            ({"stage": ["Make Quotation"], "nob": ["Hospital"]}).
--   lto_notification_log     every attempt (sent / failed / skipped) with the
--                            address, error and provider id; also what makes a send
--                            once-only per dedupe key.
--
-- The `notify` edge function (and supabase/functions/_shared/notify.ts) read these.
-- Existing recipients of lto_whatsapp_recipients are copied in as user rules so the
-- two live WhatsApp alerts keep reaching the same people.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.lto_notification_events (
  event_key        text PRIMARY KEY,
  label            text NOT NULL,
  description      text,
  channels         text[] NOT NULL DEFAULT ARRAY['whatsapp'],
  wa_template      text,
  wa_params        text[] NOT NULL DEFAULT '{}',   -- payload keys in {{1}}..{{n}} order; "recipient_name" = the receiver
  email_subject    text,
  email_body       text,
  condition_fields text[] NOT NULL DEFAULT '{}',   -- payload fields a rule may filter on
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lto_notification_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key   text NOT NULL REFERENCES public.lto_notification_events(event_key) ON UPDATE CASCADE ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('user', 'position')),
  login_id    uuid REFERENCES public.login(id) ON DELETE CASCADE,
  position    text,
  channel     text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email', 'both')),
  conditions  jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lto_notification_rules_target_chk CHECK (
    (target_type = 'user' AND login_id IS NOT NULL) OR
    (target_type = 'position' AND btrim(coalesce(position, '')) <> '')
  )
);
CREATE INDEX IF NOT EXISTS lto_notification_rules_event_idx ON public.lto_notification_rules (event_key) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.lto_notification_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key      text NOT NULL,
  dedupe_key     text,
  login_id       uuid,
  recipient_name text,
  channel        text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  address        text,
  status         text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error          text,
  provider_id    text,
  payload        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lto_notification_log_created_idx ON public.lto_notification_log (created_at DESC);
-- A dedupe key is delivered at most once per person and channel.
CREATE UNIQUE INDEX IF NOT EXISTS lto_notification_log_once_uq
  ON public.lto_notification_log (event_key, dedupe_key, login_id, channel)
  WHERE status = 'sent' AND dedupe_key IS NOT NULL AND login_id IS NOT NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lto_notification_events', 'lto_notification_rules', 'lto_notification_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS allow_all_anon_authenticated ON public.%I', t);
    EXECUTE format('CREATE POLICY allow_all_anon_authenticated ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

INSERT INTO public.lto_notification_events
  (event_key, label, description, channels, wa_template, wa_params, email_subject, email_body, condition_fields)
VALUES
  ('quotation_reference_changed',
   'Quotation reference changed',
   'A quotation revision was saved with a different Reference Name.',
   ARRAY['whatsapp', 'email'],
   'lto_quotation_reference_changed',
   ARRAY['recipient_name', 'company_name', 'old_reference', 'new_reference', 'pdf_url'],
   'Reference Name changed for {{company_name}}',
   E'Hi {{recipient_name}},\nThe Reference Name for {{company_name}} has been changed from {{old_reference}} to {{new_reference}}.\nUpdated quotation: {{pdf_url}}',
   ARRAY['company_name']),
  ('duplicate_entry',
   'Duplicate entry found',
   'A duplicate enquiry / lead log was created.',
   ARRAY['whatsapp', 'email'],
   'lto_duplicate_entries',
   ARRAY['recipient_name'],
   'Duplicate entries found',
   E'Hi {{recipient_name}},\nDuplicate entries were found. Open the details here: https://new-lead-to-order-supabase.vercel.app/duplicate-logs',
   ARRAY[]::text[])
ON CONFLICT (event_key) DO NOTHING;

-- Carry the current WhatsApp recipients over as rules (first name -> login user).
INSERT INTO public.lto_notification_rules (event_key, target_type, login_id, channel, is_active)
SELECT e.event_key, 'user', l.id, 'whatsapp', w.is_active
FROM public.lto_whatsapp_recipients w
JOIN public.login l
  ON l.usertype = 'admin' AND upper(split_part(btrim(l.full_name), ' ', 1)) = upper(w.name)
CROSS JOIN public.lto_notification_events e
WHERE e.event_key IN ('quotation_reference_changed', 'duplicate_entry')
  AND NOT EXISTS (
    SELECT 1 FROM public.lto_notification_rules r
    WHERE r.event_key = e.event_key AND r.login_id = l.id AND r.channel = 'whatsapp'
  );

COMMIT;
