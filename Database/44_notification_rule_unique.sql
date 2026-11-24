-- =====================================================================
-- 44_notification_rule_unique.sql
--
-- Settings > user form now allots events per user: one rule row per
-- (event, user). A real UNIQUE constraint (not a partial index) is what lets the
-- form upsert with onConflict "event_key,login_id". Position rules have a NULL
-- login_id, which a unique constraint treats as distinct, so they are unaffected.
-- =====================================================================
BEGIN;

-- Keep the newest row if a user was ever given the same event twice.
DELETE FROM public.lto_notification_rules a
USING public.lto_notification_rules b
WHERE a.login_id IS NOT NULL
  AND a.event_key = b.event_key AND a.login_id = b.login_id
  AND (a.created_at, a.id) < (b.created_at, b.id);

ALTER TABLE public.lto_notification_rules DROP CONSTRAINT IF EXISTS lto_notification_rules_event_login_uq;
ALTER TABLE public.lto_notification_rules
  ADD CONSTRAINT lto_notification_rules_event_login_uq UNIQUE (event_key, login_id);

COMMIT;
