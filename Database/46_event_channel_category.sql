-- =====================================================================
-- 46_event_channel_category.sql
--
-- Each event belongs to exactly ONE category, decided by lto_notification_events.channels:
--   {whatsapp}          -> "WhatsApp" events
--   {email}             -> "Email" events
--   {whatsapp,email}    -> "WhatsApp + Email" events
-- Settings > user form lists every event once, under its category, and the rule it
-- creates uses that category as its channel. To move an event, change its channels.
--
-- The two live alerts only ever send WhatsApp, so they are WhatsApp events.
-- =====================================================================
BEGIN;

UPDATE public.lto_notification_events
   SET channels = ARRAY['whatsapp']
 WHERE event_key IN ('quotation_reference_changed', 'duplicate_entry');

ALTER TABLE public.lto_notification_events DROP CONSTRAINT IF EXISTS lto_notification_events_channels_chk;
ALTER TABLE public.lto_notification_events ADD CONSTRAINT lto_notification_events_channels_chk
  CHECK (cardinality(channels) BETWEEN 1 AND 2 AND channels <@ ARRAY['whatsapp', 'email']);

-- Rules follow their event's category.
UPDATE public.lto_notification_rules r
   SET channel = CASE
         WHEN e.channels @> ARRAY['whatsapp','email'] THEN 'both'
         ELSE e.channels[1]
       END
  FROM public.lto_notification_events e
 WHERE e.event_key = r.event_key;

COMMIT;
