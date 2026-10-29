-- =====================================================================
-- 30_whatsapp_recipients.sql
--
-- Recipients of the "lto_quotation_reference_changed" WhatsApp template
-- (sent by the send-quotation-reference-changed Edge Function when a
-- revision changes the Reference Name). Managed from Master Data >
-- WhatsApp Recipients. Phones are stored as 10-digit Indian mobile numbers;
-- the Edge Function prefixes 91.
--
-- lto_make_quotations.wa_notified_at makes the notification once-per-
-- quotation, so the Edge Function cannot be used to send repeats.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lto_whatsapp_recipients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  phone      text NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone)
);

ALTER TABLE public.lto_whatsapp_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_anon_authenticated ON public.lto_whatsapp_recipients;
CREATE POLICY allow_all_anon_authenticated ON public.lto_whatsapp_recipients
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.lto_make_quotations
  ADD COLUMN IF NOT EXISTS wa_notified_at timestamptz;

INSERT INTO public.lto_whatsapp_recipients (name, phone) VALUES
  ('Neeraj',   '7024225225'),
  ('Subham',   '7024238328'),
  ('Kishan',   '7400748000'),
  ('Prasanna', '9752111114')
ON CONFLICT (phone) DO NOTHING;

COMMIT;
